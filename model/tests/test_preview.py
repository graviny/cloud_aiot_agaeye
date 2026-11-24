import json
import time
import urllib.error
import urllib.request

import numpy as np
import pytest

from agaeye.preview import PreviewServer


def get(port, path):
    with urllib.request.urlopen(f"http://127.0.0.1:{port}{path}", timeout=2) as r:
        return r.read()


def test_serves_latest_frame():
    server = PreviewServer(port=0, max_width=320)
    try:
        with pytest.raises(urllib.error.HTTPError):
            get(server.port, "/frame.jpg")      # 아직 프레임 없음
        captured = time.time()
        server.update(np.zeros((480, 640, 3), np.uint8), captured)
        status = json.loads(get(server.port, "/api/status"))
        assert 0 <= status["preview_age_s"] < 2
        assert abs(status["wall_time_unix"] - status["preview_age_s"] - captured) < 0.5
        jpeg = get(server.port, "/frame.jpg")
        assert jpeg.startswith(b"\xff\xd8") and jpeg.endswith(b"\xff\xd9")
    finally:
        server.close()
