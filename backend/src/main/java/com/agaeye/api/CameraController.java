package com.agaeye.api;

import com.agaeye.common.ApiException;
import com.agaeye.monitoring.AlertPhotos;
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
    public CameraController(AlertPhotos relay,Policy policy){this.relay=relay;this.policy=policy;}
    @PostMapping(value="/device/alerts/{alert}/photo",consumes="image/jpeg")
    Object upload(@RequestHeader(value="X-Device-Token",defaultValue="")String token,@PathVariable UUID alert,@RequestHeader("X-Frame-Captured-At")String at,HttpServletRequest request)throws IOException {
        if(request.getContentLengthLong()>AlertPhotos.MAX_BYTES)throw new ApiException(413,"FRAME_TOO_LARGE","알림 사진이 너무 커요.");
        Instant captured;try{captured=Instant.parse(at);}catch(DateTimeParseException e){throw ApiException.invalid("INVALID_FRAME_TIME");}
        return relay.upload(token,alert,captured,request.getInputStream().readNBytes(AlertPhotos.MAX_BYTES+1));
    }
    @GetMapping("/children/{child}/devices/{device}/alerts/{alert}/photo")
    ResponseEntity<byte[]> frame(@AuthenticationPrincipal Jwt jwt,@RequestHeader("X-Workspace-Id")UUID workspace,@PathVariable UUID child,@PathVariable UUID device,@PathVariable UUID alert) {
        var frame=relay.read(policy.actor(jwt,workspace),child,device,alert);
        if(frame==null)return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
        return ResponseEntity.ok().contentType(MediaType.IMAGE_JPEG).cacheControl(CacheControl.noStore()).header("X-Content-Type-Options","nosniff").body(frame);
    }
}
