package com.agaeye.monitoring;

import com.agaeye.common.*;
import com.agaeye.security.*;
import com.agaeye.security.Policy.Actor;
import jakarta.validation.constraints.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.util.*;
import static com.agaeye.common.Db.*;

@Service
public class MonitoringService {
    public record Device(@NotNull UUID workspaceId,@NotNull UUID childId,@NotBlank @Pattern(regexp="camera|sensor") String type) {}
    public record Heartbeat(@NotNull Instant observedAt,@NotBlank @Pattern(regexp="live|offline|unverifiable") String status,
        Map<String,String> safety,@DecimalMin("0") @DecimalMax("1") Double confidence,Instant analysisObservedAt) {}
    public record Sensor(@NotBlank @Pattern(regexp="temperature|humidity|noise") String type,@NotNull Double value,@NotNull Instant observedAt) {}
    private final Db db; private final Policy policy;
    private final int staleSeconds; private final double confidenceThreshold;
    public MonitoringService(Db db,Policy policy,@Value("${app.monitoring-stale-seconds:30}")int staleSeconds,@Value("${app.confidence-threshold:0.6}")double threshold) {
        this.db=db;this.policy=policy;this.staleSeconds=staleSeconds;this.confidenceThreshold=threshold;
    }
    @Transactional public Object createDevice(Device body) {
        var link=db.required("SELECT wc.id FROM workspace_children wc JOIN workspaces w ON w.id=wc.workspace_id WHERE wc.workspace_id=:ws AND wc.child_id=:child AND wc.link_status='active' AND w.status='active' AND (wc.share_grant_id IS NULL OR EXISTS(SELECT 1 FROM data_share_grants s WHERE s.id=wc.share_grant_id AND s.revoked_at IS NULL AND s.expires_at>now()))",p("ws",body.workspaceId(),"child",body.childId()),"CHILD_NOT_ACCESSIBLE");
        UUID id=UUID.randomUUID();db.update("INSERT INTO devices(id,workspace_id,workspace_child_id,child_id,device_type) VALUES(:id,:ws,:wc,:child,:type)",p("id",id,"ws",body.workspaceId(),"wc",link.get("id"),"child",body.childId(),"type",body.type()));
        return p("id",id,"workspaceId",body.workspaceId(),"childId",body.childId(),"type",body.type());
    }
    private Map<String,Object> device(UUID id) {
        return db.required("SELECT d.* FROM devices d JOIN workspace_children wc ON wc.id=d.workspace_child_id JOIN workspaces w ON w.id=d.workspace_id WHERE d.id=:id AND d.revoked_at IS NULL AND wc.link_status='active' AND w.status='active' AND (wc.share_grant_id IS NULL OR EXISTS(SELECT 1 FROM data_share_grants s WHERE s.id=wc.share_grant_id AND s.revoked_at IS NULL AND s.expires_at>now())) FOR UPDATE OF d",p("id",id),"DEVICE_NOT_ACCESSIBLE");
    }
    private void validateTime(Instant at){if(at.isAfter(Instant.now().plusSeconds(30)))throw ApiException.invalid("FUTURE_OBSERVATION");}
    @Transactional public Object heartbeat(UUID id,Heartbeat body) {
        validateTime(body.observedAt());if(body.analysisObservedAt()!=null)validateTime(body.analysisObservedAt());
        var device=device(id);Instant previous=instant(device,"last_seen_at");
        if(previous!=null&&body.observedAt().isBefore(previous))throw ApiException.conflict("STALE_HEARTBEAT");
        var safety=unknownSafety();
        boolean inferenceFresh=body.confidence()!=null&&body.confidence()>=confidenceThreshold&&body.analysisObservedAt()!=null&&!body.analysisObservedAt().isBefore(body.observedAt().minusSeconds(staleSeconds))&&!body.analysisObservedAt().isAfter(body.observedAt().plusSeconds(5));
        String status=body.status().equals("live")&&!inferenceFresh?"unverifiable":body.status();
        if(body.safety()!=null){
            if(!safety.keySet().containsAll(body.safety().keySet())||!body.safety().values().stream().allMatch(v->Set.of("stable","caution","immediate","unknown").contains(v)))throw ApiException.invalid("INVALID_SAFETY_STATE");
            if(status.equals("live"))safety.putAll(body.safety());
        }
        db.update("UPDATE devices SET last_seen_at=:at,state=:status WHERE id=:id",p("at",body.observedAt(),"status",status,"id",id));
        if(!"camera".equals(device.get("device_type")))return p("id",id,"status",status);
        var last=db.one("SELECT * FROM monitoring_sessions WHERE source_id=:id AND ended_at IS NULL ORDER BY last_updated_at DESC LIMIT 1 FOR UPDATE",p("id",id));
        boolean continuous=last.isPresent()&&Objects.equals(last.get().get("status"),status)&&!instant(last.get(),"last_updated_at").isBefore(body.observedAt().minusSeconds(staleSeconds));
        if(continuous)db.update("UPDATE monitoring_sessions SET last_updated_at=:at,safety=cast(:safety as jsonb) WHERE id=:id",p("at",body.observedAt(),"safety",db.json(safety),"id",last.get().get("id")));
        else {
            last.ifPresent(row->db.update("UPDATE monitoring_sessions SET ended_at=last_updated_at WHERE id=:id",p("id",row.get("id"))));
            db.update("INSERT INTO monitoring_sessions(id,workspace_id,child_id,source_id,status,safety,started_at,last_updated_at) VALUES(:id,:ws,:child,:source,:status,cast(:safety as jsonb),:at,:at)",p("id",UUID.randomUUID(),"ws",device.get("workspace_id"),"child",device.get("child_id"),"source",id,"status",status,"safety",db.json(safety),"at",body.observedAt()));
        }
        return p("id",id,"status",status,"observedAt",body.observedAt());
    }
    @Transactional public Object sensor(UUID id,Sensor body) {
        validateTime(body.observedAt());device(id);
        if(!Double.isFinite(body.value())||body.type().equals("humidity")&&(body.value()<0||body.value()>100)||body.type().equals("temperature")&&(body.value()<-80||body.value()>100)||body.type().equals("noise")&&(body.value()<0||body.value()>200))throw ApiException.invalid("INVALID_SENSOR_VALUE");
        UUID reading=UUID.randomUUID();db.update("INSERT INTO sensor_readings(id,device_id,metric,value,unit,observed_at) VALUES(:id,:device,:metric,:value,:unit,:at)",p("id",reading,"device",id,"metric",body.type(),"value",body.value(),"unit",unit(body.type()),"at",body.observedAt()));
        return p("id",reading);
    }
    public static Map<String,String> unknownSafety(){var map=new LinkedHashMap<String,String>();for(String key:List.of("posture","face","edge","objects"))map.put(key,"unknown");return map;}
    private static String unit(String type){return switch(type){case "temperature"->"°C";case "humidity"->"%";default->"dB";};}
    public Map<String,Object> state(Actor actor,UUID child){policy.require(actor,child,"monitor:live");return snapshot(actor.workspaceId(),child);}
    public Map<String,Object> snapshot(UUID workspace,UUID child) {
        var latest=db.one("SELECT * FROM monitoring_sessions WHERE workspace_id=:ws AND child_id=:child AND ended_at IS NULL ORDER BY last_updated_at DESC LIMIT 1",p("ws",workspace,"child",child));
        String status="offline";Object safety=unknownSafety();Instant updated=null;
        if(latest.isPresent()){var row=latest.get();updated=instant(row,"last_updated_at");if(updated.isAfter(Instant.now().minusSeconds(staleSeconds))){status=text(row,"status");if(status.equals("live"))safety=row.get("safety");}}
        var sensors=new ArrayList<Map<String,Object>>();
        for(String type:List.of("temperature","humidity","noise")) {
            var reading=db.one("SELECT r.* FROM sensor_readings r JOIN devices d ON d.id=r.device_id WHERE d.workspace_id=:ws AND d.child_id=:child AND d.revoked_at IS NULL AND r.metric=:metric ORDER BY r.observed_at DESC LIMIT 1",p("ws",workspace,"child",child,"metric",type));
            boolean connected=reading.isPresent()&&instant(reading.get(),"observed_at").isAfter(Instant.now().minusSeconds(120));
            sensors.add(p("type",type,"connected",connected,"unit",unit(type),"value",connected?reading.get().get("value"):null,"observedAt",connected?reading.get().get("observed_at"):null));
        }
        return p("childId",child,"streamStatus",status,"streamUrl",null,"safety",safety,"sensors",sensors,"lastUpdatedAt",updated);
    }
}
