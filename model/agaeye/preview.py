"""알림 사진용 최신 프레임 서버 (127.0.0.1에서만 열림).

브리지는 서버가 사진을 요청하면 /api/status로 프레임 시각을 확인하고 /frame.jpg를 받아 올려요.
"""
from __future__ import annotations

import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Optional

import numpy as np


class PreviewServer:
    def __init__(self, port: int = 8765, quality: int = 80, max_width: int = 640):
        self.quality, self.max_width = quality, max_width
        self._lock = threading.Lock()
        self._jpeg: Optional[bytes] = None
        self._at: Optional[float] = None
        owner = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                with owner._lock:
                    jpeg, at = owner._jpeg, owner._at
                if at is None:
                    self.send_error(503)
                    return
                if self.path == "/api/status":
                    now = time.time()
                    body = json.dumps({"wall_time_unix": now, "preview_age_s": max(0.0, now - at)}).encode()
                    ctype = "application/json"
                elif self.path == "/frame.jpg":
                    body, ctype = jpeg, "image/jpeg"
                else:
                    self.send_error(404)
                    return
                self.send_response(200)
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *args):
                pass

        self._server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
        self.port = self._server.server_address[1]
        threading.Thread(target=self._server.serve_forever, daemon=True).start()

    def update(self, frame_bgr: np.ndarray, wall_time: float) -> None:
        import cv2

        h, w = frame_bgr.shape[:2]
        if w > self.max_width:
            frame_bgr = cv2.resize(frame_bgr, (self.max_width, round(h * self.max_width / w)))
        ok, buf = cv2.imencode(".jpg", frame_bgr, [cv2.IMWRITE_JPEG_QUALITY, self.quality])
        if ok:
            with self._lock:
                self._jpeg, self._at = buf.tobytes(), wall_time

    def close(self) -> None:
        self._server.shutdown()
        self._server.server_close()
