package com.agaeye.api;

import com.agaeye.common.ApiException;
import com.agaeye.monitoring.AlertPhotos;
import com.agaeye.monitoring.PeriodicCaptures;
import com.agaeye.security.Policy;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import java.io.IOException;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.UUID;

@RestController @RequestMapping("/api/v1")
public class CameraController {
    private final AlertPhotos relay;private final Policy policy;
    private final PeriodicCaptures captures;
    public CameraController(AlertPhotos relay, Policy policy, PeriodicCaptures captures) {
        this.relay=relay;this.policy=policy;this.captures=captures;
    }
    @PostMapping(value="/device/alerts/{alert}/photo",consumes="image/jpeg")
    Object upload(@RequestHeader(value="X-Device-Token",defaultValue="")String token,@PathVariable UUID alert,@RequestHeader("X-Frame-Captured-At")String at,HttpServletRequest request)throws IOException {
        return relay.upload(token,alert,captureTime(at),readJpeg(request));
    }
    @GetMapping("/children/{child}/devices/{device}/alerts/{alert}/photo")
    ResponseEntity<byte[]> frame(@AuthenticationPrincipal Jwt jwt,@RequestHeader("X-Workspace-Id")UUID workspace,@PathVariable UUID child,@PathVariable UUID device,@PathVariable UUID alert) {
        var frame=relay.read(policy.actor(jwt,workspace),child,device,alert);
        if(frame==null)return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
        return jpegResponse().body(frame);
    }

    @PostMapping(value="/device/sky-eye/capture",consumes="image/jpeg")
    Object uploadCapture(@RequestHeader(value="X-Device-Token",defaultValue="") String token,
                         @RequestHeader("X-Frame-Captured-At") String at,
                         @RequestHeader("X-Frame-State") String state,
                         @RequestHeader(value="X-Frame-Posture",required=false) String posture,
                         @RequestHeader(value="X-Frame-Airway",required=false) String airway,
                         HttpServletRequest request) throws IOException {
        return captures.upload(token,new PeriodicCaptures.Capture(captureTime(at),state,posture,airway,readJpeg(request)));
    }

    @GetMapping("/children/{child}/devices/{device}/capture")
    ResponseEntity<byte[]> latestCapture(@AuthenticationPrincipal Jwt jwt,
                                        @RequestHeader("X-Workspace-Id") UUID workspace,
                                        @PathVariable UUID child, @PathVariable UUID device) {
        var capture = captures.read(policy.actor(jwt,workspace),child,device);
        if (capture == null) return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
        var response = jpegResponse().header("X-Frame-Captured-At",capture.capturedAt().toString())
                .header("X-Frame-State",capture.state());
        if (capture.posture() != null) response.header("X-Frame-Posture",capture.posture());
        if (capture.airway() != null) response.header("X-Frame-Airway",capture.airway());
        return response.body(capture.jpeg());
    }

    private static Instant captureTime(String at) {
        try { return Instant.parse(at); }
        catch (DateTimeParseException e) { throw ApiException.invalid("INVALID_FRAME_TIME"); }
    }

    private static byte[] readJpeg(HttpServletRequest request) throws IOException {
        if (request.getContentLengthLong() > AlertPhotos.MAX_BYTES) {
            throw new ApiException(413,"FRAME_TOO_LARGE","사진이 너무 커요.");
        }
        return request.getInputStream().readNBytes(AlertPhotos.MAX_BYTES+1);
    }

    private static ResponseEntity.BodyBuilder jpegResponse() {
        return ResponseEntity.ok().contentType(MediaType.IMAGE_JPEG).cacheControl(CacheControl.noStore())
                .header("X-Content-Type-Options","nosniff");
    }
}
