package com.agaeye.monitoring;

import com.agaeye.common.ApiException;
import com.agaeye.common.Db;
import com.agaeye.device.PairingService;
import com.agaeye.security.Policy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.imageio.ImageIO;
import javax.imageio.stream.MemoryCacheImageInputStream;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import static com.agaeye.common.Db.*;

@Service
public class AlertPhotos {
    public static final int MAX_BYTES = 524288;
    /** A second alert follows an unacknowledged immediate alert after this many seconds. */
    public static final int SECOND_ALERT_SECONDS = 15;
    private final Db db;
    private final PairingService pairing;
    private final Policy policy;

    public AlertPhotos(Db db, PairingService pairing, Policy policy) {
        this.db = db;
        this.pairing = pairing;
        this.policy = policy;
    }

    // The caller holds the paired device row lock throughout the transaction.
    public void observe(UUID device, String field, String level, Instant at) {
        at = at.truncatedTo(java.time.temporal.ChronoUnit.MICROS);
        var args = p("device",device,"field",field,"at",at);
        var previous = db.one("SELECT * FROM sky_eye_notice_state WHERE device_id=:device AND field=:field",args);
        if (previous.isPresent() && at.isBefore(instant(previous.get(),"last_seen"))) return;
        var state = previous.orElse(Map.of());
        boolean continuous = previous.isPresent() && !instant(state,"last_seen").isBefore(at.minusSeconds(10));
        int highest = continuous ? (int)state.get("highest") : -1;
        Instant stable = continuous ? instant(state,"stable_since") : null;
        Instant unknown = continuous ? instant(state,"unknown_since") : null;
        int rank = switch (level) { case "immediate" -> 2; case "caution" -> 1; case "unknown" -> 0; default -> -1; };
        stable = rank < 0 ? (stable == null ? at : stable) : null;
        unknown = rank == 0 ? (unknown == null ? at : unknown) : null;
        if (stable != null && !stable.isAfter(at.minusSeconds(10))) highest = -1;
        if (rank > highest && (rank > 0 || !unknown.isAfter(at.minusSeconds(10)))) {
            create(device,field,level,at);
            highest = rank;
        }
        args.putAll(p("highest",highest,"stable",stable,"unknown",unknown));
        db.update("""
            INSERT INTO sky_eye_notice_state(device_id,field,highest,stable_since,unknown_since,last_seen)
            VALUES(:device,:field,:highest,:stable,:unknown,:at)
            ON CONFLICT(device_id,field) DO UPDATE SET highest=:highest,stable_since=:stable,unknown_since=:unknown,last_seen=:at
            """,args);
    }

    public void create(UUID device, String field, String level, Instant at) {
        db.update("INSERT INTO sky_eye_alerts(id,device_id,field,level,observed_at) VALUES(:id,:device,:field,:level,:at)",
                p("id",UUID.randomUUID(),"device",device,"field",field,"level",level,"at",at));
    }

    public List<Map<String,Object>> awaitingCapture(UUID device) {
        return db.list("""
            SELECT id, observed_at AS "observedAt" FROM sky_eye_alerts
            WHERE device_id=:device AND jpeg IS NULL AND observed_at >= now() - interval '5 seconds'
            ORDER BY observed_at, id
            """,p("device",device));
    }

    /** Marks the open alert for this condition as ended when the Pi reports that the risk cleared. */
    public void end(UUID device, String field, Instant at) {
        db.update("""
            UPDATE sky_eye_alerts SET ended_at=:at
            WHERE device_id=:device AND field=:field AND level='immediate' AND ended_at IS NULL AND observed_at<=:at
            """,p("device",device,"field",field,"at",at.truncatedTo(java.time.temporal.ChronoUnit.MICROS)));
    }

    // secondAlertAt is derived from stored times: an immediate alert that was neither acknowledged
    // nor ended within SECOND_ALERT_SECONDS gets a second alert at that moment.
    public List<Map<String,Object>> recentAlerts(UUID device) {
        return db.list("""
            SELECT id, field, level, observed_at AS "observedAt", captured_at AS "capturedAt",
                   acknowledged_at AS "acknowledgedAt", ended_at AS "endedAt",
                   CASE WHEN level='immediate' AND now() >= observed_at + make_interval(secs => :delay)
                             AND (acknowledged_at IS NULL OR acknowledged_at > observed_at + make_interval(secs => :delay))
                             AND (ended_at IS NULL OR ended_at > observed_at + make_interval(secs => :delay))
                        THEN observed_at + make_interval(secs => :delay) END AS "secondAlertAt"
            FROM sky_eye_alerts WHERE device_id=:device ORDER BY observed_at DESC,id LIMIT 30
            """,p("device",device,"delay",SECOND_ALERT_SECONDS));
    }

    @Transactional public Object acknowledge(Policy.Actor actor, UUID child, UUID device, UUID alert) {
        policy.require(actor,child,"detection:ack");
        var args = p("alert",alert,"device",device,"child",child,"ws",actor.workspaceId(),"member",actor.membershipId());
        var row = db.required("""
            SELECT a.acknowledged_at FROM sky_eye_alerts a JOIN devices d ON d.id=a.device_id
            WHERE a.id=:alert AND d.id=:device AND d.child_id=:child AND d.workspace_id=:ws
              AND d.revoked_at IS NULL FOR UPDATE OF a
            """,args,"ALERT_NOT_FOUND");
        if (row.get("acknowledged_at") == null)
            db.update("UPDATE sky_eye_alerts SET acknowledged_at=now(), acknowledged_by=:member WHERE id=:alert",args);
        var saved = db.required("SELECT acknowledged_at FROM sky_eye_alerts WHERE id=:alert",args,"ALERT_NOT_FOUND");
        return p("id",alert,"acknowledgedAt",saved.get("acknowledged_at"),"duplicate",row.get("acknowledged_at") != null);
    }

    @Transactional public Object upload(String token, UUID alert, Instant captured, byte[] jpeg) {
        var device = pairing.authorize(token);
        var args = p("device",device.get("id"),"alert",alert);
        var row = db.required("SELECT observed_at,captured_at FROM sky_eye_alerts WHERE id=:alert AND device_id=:device FOR UPDATE",args,"ALERT_NOT_FOUND");
        if (row.get("captured_at") != null) return p("accepted",true,"duplicate",true);
        if (captured.isAfter(Instant.now().plusSeconds(5)) ||
                Duration.between(instant(row,"observed_at"),captured).abs().compareTo(Duration.ofSeconds(5)) > 0)
            throw ApiException.invalid("PHOTO_OUTSIDE_ALERT_WINDOW");
        validateJpeg(jpeg);
        args.putAll(p("captured",captured,"jpeg",jpeg));
        db.update("UPDATE sky_eye_alerts SET captured_at=:captured,jpeg=:jpeg WHERE id=:alert AND device_id=:device",args);
        return p("accepted",true);
    }

    static void validateJpeg(byte[] jpeg) {
        if (jpeg.length > MAX_BYTES) throw new ApiException(413,"PHOTO_TOO_LARGE","사진 크기 제한을 초과했어요.");
        if (jpeg.length<4 || jpeg[0]!=(byte)0xff || jpeg[1]!=(byte)0xd8 || jpeg[jpeg.length-2]!=(byte)0xff || jpeg[jpeg.length-1]!=(byte)0xd9)
            throw ApiException.invalid("INVALID_JPEG");
        var reader=ImageIO.getImageReadersByFormatName("JPEG").next();
        try (var input=new MemoryCacheImageInputStream(new ByteArrayInputStream(jpeg))) {
            reader.setInput(input);
            if (reader.getWidth(0)>1920 || reader.getHeight(0)>1080) throw ApiException.invalid("PHOTO_DIMENSIONS_EXCEEDED");
            reader.read(0);
        } catch (IOException e) { throw ApiException.invalid("INVALID_JPEG"); }
        finally { reader.dispose(); }
    }

    @Transactional public byte[] read(Policy.Actor actor, UUID child, UUID device, UUID alert) {
        policy.require(actor,child,"monitor:live");
        policy.require(actor,child,"detection:read");
        var row = db.required("""
            SELECT a.jpeg FROM sky_eye_alerts a JOIN devices d ON d.id=a.device_id
            WHERE a.id=:alert AND d.id=:device AND d.child_id=:child AND d.workspace_id=:ws
              AND d.revoked_at IS NULL FOR SHARE OF d
            """,p("alert",alert,"device",device,"child",child,"ws",actor.workspaceId()),"ALERT_NOT_FOUND");
        return (byte[])row.get("jpeg");
    }
}
