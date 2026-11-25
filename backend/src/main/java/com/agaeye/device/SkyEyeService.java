package com.agaeye.device;

import com.agaeye.common.*;
import com.agaeye.monitoring.MonitoringService;
import com.agaeye.monitoring.AlertPhotos;
import com.agaeye.security.Policy;
import com.agaeye.security.Policy.Actor;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.*;
import static com.agaeye.common.Db.*;

/** Allowlisted summaries only: no raw audio, images, embeddings or device paths. */
@Service
public class SkyEyeService {
    public record Camera(boolean available, Instant observedAt,
        @Pattern(regexp="supine|side|prone") String posture,
        @Pattern(regexp="airway_visible|airway_covered") String airway,
        @NotNull @Pattern(regexp="normal|caution|risk|unavailable") String state,
        @DecimalMin("0") @DecimalMax("1") Double bodyConfidence,
        @DecimalMin("0") @DecimalMax("1") Double faceConfidence,
        boolean geometryValid, @Pattern(regexp="monitoring|edge_approach|edge_departure_warning|unavailable") String fallState,
        @DecimalMin("0") @DecimalMax("1000") Double fps) {}
    public record Status(@NotNull Instant observedAt,@NotNull @Valid Camera video) {}
    public record Event(@NotBlank @Pattern(regexp="[a-f0-9]{64}") String id,
        @NotBlank @Size(max=128) String episodeKey,
        @NotNull @Pattern(regexp="risk_started|risk_ended|risk_interrupted|status_changed|posture_changed") String kind,
        @Pattern(regexp="prone|face_covered|edge_departure_warning") String riskType,
        @NotNull Instant observedAt,Instant startedAt,Instant endedAt,UUID episodeUid,
        @Pattern(regexp="quiet|input_gap|segment_limit|service_stopped|interrupted") String endReason) {}
    private final Db db; private final PairingService pairing; private final Policy policy;
    private final MonitoringService monitoring; private final ObjectMapper mapper; private final AlertPhotos camera; private final int offlineAfter;
    public SkyEyeService(Db db,PairingService pairing,Policy policy,MonitoringService monitoring,ObjectMapper mapper,AlertPhotos camera,@Value("${app.offline-after-seconds:7}")int offlineAfter) {
        this.offlineAfter=offlineAfter;
        this.db=db;this.pairing=pairing;this.policy=policy;this.monitoring=monitoring;this.mapper=mapper;this.camera=camera;
    }
    private static boolean fresh(Instant at,Instant now,int seconds) {
        return at!=null&&!at.isBefore(now.minusSeconds(seconds))&&!at.isAfter(now.plusSeconds(5));
    }
    private static boolean confident(Double score){return score!=null&&Double.isFinite(score)&&score>=0.6;}
    private static void validTime(Instant time){if(time!=null&&(time.isBefore(Instant.parse("2020-01-01T00:00:00Z"))||time.isAfter(Instant.now().plusSeconds(5))))throw ApiException.invalid("INVALID_MODEL_TIME");}
    private Status effective(Status source,Instant now) {
        var v=source.video();
        boolean video=fresh(source.observedAt(),now,8)&&v.available()&&fresh(v.observedAt(),now,5)&&!v.state().equals("unavailable");
        return new Status(source.observedAt(),new Camera(video,v.observedAt(),video?v.posture():null,video?v.airway():null,video?v.state():"unavailable",video?v.bodyConfidence():null,video?v.faceConfidence():null,video&&v.geometryValid(),video&&v.geometryValid()?v.fallState():"unavailable",video?v.fps():null));
    }
    private Map<String,String> safety(Status status) {
        var safety=MonitoringService.unknownSafety();var v=status.video();
        if(v.available()) {
            if(confident(v.bodyConfidence())&&v.posture()!=null)safety.put("posture",switch(v.posture()){case "prone"->"immediate";case "side"->"caution";default->"stable";});
            if(confident(v.faceConfidence())&&v.airway()!=null)safety.put("face",v.airway().equals("airway_covered")?"immediate":"stable");
            // No calibrated confidence/object policy is exported for these branches.
            if(v.geometryValid()&&"edge_departure_warning".equals(v.fallState()))safety.put("edge","caution");
        }
        return safety;
    }
    @Transactional public Object status(String token,Status body) {
        var device=pairing.authorize(token);UUID deviceId=id(device,"id");
        validTime(body.observedAt());validTime(body.video().observedAt());
        var previous=db.one("SELECT observed_at FROM sky_eye_status WHERE device_id=:id",p("id",deviceId));
        Instant observedAt=body.observedAt().truncatedTo(java.time.temporal.ChronoUnit.MICROS);
        if(previous.isPresent()&&observedAt.isBefore(instant(previous.get(),"observed_at")))throw ApiException.conflict("STALE_MODEL_STATUS");
        var current=effective(body,Instant.now());
        db.update("INSERT INTO sky_eye_status(device_id,observed_at,body) VALUES(:id,:at,cast(:body as jsonb)) ON CONFLICT(device_id) DO UPDATE SET observed_at=:at,body=cast(:body as jsonb),received_at=now()",p("id",deviceId,"at",observedAt,"body",db.json(current)));
        // Connection/analysis freshness never creates a playable video stream.
        var safety=safety(current);var v=current.video();
        Double confidence=confident(v.bodyConfidence())?v.bodyConfidence():confident(v.faceConfidence())?v.faceConfidence():null;
        monitoring.heartbeat(deviceId,new MonitoringService.Heartbeat(Instant.now(),confidence==null?"unverifiable":"live",safety,confidence,v.observedAt()));
        Instant at = v.available() ? v.observedAt() : current.observedAt();
        if (fresh(at,Instant.now(),8)) {
            for (String field : List.of("posture","face")) camera.observe(deviceId,field,safety.get(field),at);
            if (v.available() && v.geometryValid())
                camera.observe(deviceId,"edge",safety.get("edge").equals("caution") ? "caution" : "stable",at);
        }
        return p("accepted",true,"captures",camera.awaitingCapture(deviceId));
    }
    @Transactional public Object event(String token,Event body) {
        var device=pairing.authorize(token);validTime(body.observedAt());validTime(body.startedAt());validTime(body.endedAt());
        if(body.startedAt()!=null&&body.endedAt()!=null&&body.endedAt().isBefore(body.startedAt()))throw ApiException.invalid("INVALID_EPISODE_TIME");
        var args=p("device",device.get("id"),"event",body.id(),"at",body.observedAt(),"body",db.json(body));
        var existing=db.one("SELECT body FROM sky_eye_events WHERE device_id=:device AND event_id=:event",args);
        if(existing.isPresent()) {
            if(!mapper.valueToTree(existing.get().get("body")).equals(mapper.valueToTree(body)))throw ApiException.conflict("MODEL_EVENT_CONFLICT");
        } else db.update("INSERT INTO sky_eye_events(device_id,event_id,observed_at,body) VALUES(:device,:event,:at,cast(:body as jsonb))",args);
        UUID deviceId = id(device,"id");
        if (existing.isEmpty() && "risk_started".equals(body.kind()) && fresh(body.observedAt(),Instant.now(),30)) {
            String field = switch (Objects.toString(body.riskType(),"")) {
                case "prone" -> "posture";
                case "face_covered" -> "face";
                case "edge_departure_warning" -> "edge";
                default -> "observation";
            };
            if ("observation".equals(field)) camera.create(deviceId,field,"caution",body.observedAt());
            else camera.observe(deviceId,field,field.equals("edge") ? "caution" : "immediate",body.observedAt());
        }
        return p("accepted",true,"duplicate",existing.isPresent(),"captures",camera.awaitingCapture(deviceId));
    }
    public Object snapshot(Actor actor,UUID child) {
        policy.require(actor,child,"monitor:live");policy.require(actor,child,"detection:read");
        var devices=db.list("SELECT d.id AS device_id,d.display_name,d.last_seen_at,d.created_at,s.body,s.received_at FROM devices d LEFT JOIN sky_eye_status s ON d.id=s.device_id WHERE d.workspace_id=:ws AND d.child_id=:child AND d.revoked_at IS NULL AND d.identity_id IS NOT NULL ORDER BY s.received_at DESC NULLS LAST,d.created_at DESC LIMIT 10",p("ws",actor.workspaceId(),"child",child));
        var items=new ArrayList<Map<String,Object>>();Instant now=Instant.now();
        for(var row:devices) {
            UUID device=id(row,"device_id");
            var status=row.get("body")!=null?effective(mapper.convertValue(row.get("body"),Status.class),now):new Status(instant(row,"created_at"),new Camera(false,null,null,null,"unavailable",null,null,false,"unavailable",null));
            boolean connected=fresh(instant(row,"last_seen_at"),now,offlineAfter);
            String reportState=row.get("received_at")==null?(connected?"awaiting_model":"awaiting_sender"):!connected?"offline":!status.video().available()?"input_unavailable":"receiving";
            var events=db.list("SELECT body,received_at FROM sky_eye_events WHERE device_id=:device ORDER BY observed_at DESC,event_id LIMIT 30",p("device",device));
            var eventViews=events.stream().map(e->{var event=mapper.convertValue(e.get("body"),Event.class);return p("event",event,"recent",fresh(event.observedAt(),now,30)&&fresh(instant(e,"received_at"),now,30));}).toList();
            items.add(p("deviceId",device,"name",row.get("display_name"),"connected",connected,"reportState",reportState,"lastReportAt",row.get("received_at"),"alerts",camera.recentAlerts(device),"status",status,"safety",safety(status),"events",eventViews));
        }
        return p("childId",child,"items",items,"serverTime",now);
    }
}
