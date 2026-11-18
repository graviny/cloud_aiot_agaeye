"""Loopback snapshot interface for the agaeye alert-photo sender."""
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import cv2


class PreviewServer:
    def __init__(self, port, config):
        self.lock = threading.Lock()
        self.frame = None
        self.updated = None
        camera = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_GET(self):
                with camera.lock:
                    frame = camera.frame
                    updated = camera.updated
                if self.path not in ("/api/status", "/frame.jpg"):
                    self.send_error(404)
                    return
                if updated is None or time.monotonic() - updated > 2:
                    self.send_error(503, "Waiting for a fresh frame")
                    return
                if self.path == "/api/status":
                    # The sender subtracts preview_age_s from the status clock.
                    # Report the time of this status response.
                    body = json.dumps({"wall_time_unix": time.time(),
                                       "preview_age_s": time.monotonic() - updated}).encode()
                    content_type = "application/json"
                else:
                    ok, jpeg = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
                    if not ok:
                        self.send_error(503, "JPEG encoding failed")
                        return
                    body = jpeg.tobytes()
                    content_type = "image/jpeg"
                self.send_response(200)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(body)

        self.server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def publish(self, frame, state, events=()):
        with self.lock:
            self.frame = frame
            self.updated = time.monotonic()

    def close(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
