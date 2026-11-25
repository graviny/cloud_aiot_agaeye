package com.agaeye.monitoring;

import com.agaeye.common.ApiException;
import com.agaeye.common.Db;
import com.agaeye.device.PairingService;
import com.agaeye.security.Policy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Set;
import java.util.UUID;

import static com.agaeye.common.Db.*;

@Service
public class PeriodicCaptures {
    public record Capture(Instant capturedAt, String state, String posture, String airway, byte[] jpeg) {}

    private final Db db;
    private final PairingService pairing;
    private final Policy policy;

    public PeriodicCaptures(Db db, PairingService pairing, Policy policy) {
        this.db = db;
        this.pairing = pairing;
        this.policy = policy;
    }

    @Transactional public Object upload(String token, Capture capture) {
        UUID device = id(pairing.authorize(token), "id");
        Instant now = Instant.now();
        Instant capturedAt = capture.capturedAt().truncatedTo(ChronoUnit.MICROS);
        if (capturedAt.isBefore(now.minusSeconds(30)) || capturedAt.isAfter(now.plusSeconds(5))) {
            throw ApiException.invalid("INVALID_FRAME_TIME");
        }
        validateAnalysis(capture);
        AlertPhotos.validateJpeg(capture.jpeg());
        int stored = db.update("""
            INSERT INTO sky_eye_latest_captures(device_id,captured_at,state,posture,airway,jpeg)
            VALUES(:device,:at,:state,:posture,:airway,:jpeg)
            ON CONFLICT(device_id) DO UPDATE SET captured_at=excluded.captured_at, state=excluded.state,
                posture=excluded.posture, airway=excluded.airway, jpeg=excluded.jpeg
            WHERE sky_eye_latest_captures.captured_at < excluded.captured_at
            """, p("device",device,"at",capturedAt,"state",capture.state(),"posture",capture.posture(),
                   "airway",capture.airway(),"jpeg",capture.jpeg()));
        return p("accepted",true,"stored",stored == 1);
    }

    @Transactional public Capture read(Policy.Actor actor, UUID child, UUID device) {
        policy.require(actor,child,"monitor:live");
        policy.require(actor,child,"detection:read");
        var row = db.required("""
            SELECT c.captured_at,c.state,c.posture,c.airway,c.jpeg
            FROM devices d LEFT JOIN sky_eye_latest_captures c ON c.device_id=d.id
            WHERE d.id=:device AND d.child_id=:child AND d.workspace_id=:ws
              AND d.revoked_at IS NULL AND d.identity_id IS NOT NULL
            FOR SHARE OF d
            """, p("device",device,"child",child,"ws",actor.workspaceId()), "DEVICE_NOT_ACCESSIBLE");
        var jpeg = (byte[]) row.get("jpeg");
        return jpeg == null ? null : new Capture(instant(row,"captured_at"),text(row,"state"),
                text(row,"posture"),text(row,"airway"),jpeg);
    }

    private static void validateAnalysis(Capture capture) {
        String state = capture.state();
        String posture = capture.posture();
        String airway = capture.airway();
        if (!Set.of("normal","caution","risk","unavailable").contains(state) ||
            (posture != null && !Set.of("supine","side","prone").contains(posture)) ||
            (airway != null && !Set.of("airway_visible","airway_covered").contains(airway)) ||
            (state.equals("unavailable") && (posture != null || airway != null))) {
            throw ApiException.invalid("INVALID_FRAME_ANALYSIS");
        }
    }
}
