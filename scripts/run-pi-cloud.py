"""Pi camera -> existing CPU ONNX inference -> authenticated cloud API.

Run from any directory. Put AGAEYE_* settings in .env.pi.local or the environment.
This wrapper does not modify the vendored model team's source.
"""
from __future__ import annotations
import argparse
import os
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "vendor" / "aga-eye"))


def main():
    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env.pi.local")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", default="picamera2", help="picamera2 / USB webcam index / video file")
    parser.add_argument("--config", default=str(ROOT / "configs" / "pi-cloud.yaml"))
    parser.add_argument("--model")
    parser.add_argument("--show", action="store_true")
    parser.add_argument("--max-seconds", type=float)
    parser.add_argument("--check", action="store_true", help="Verify settings, connectivity and device authentication without using a camera")
    args = parser.parse_args()
    server = os.environ.get("AGAEYE_SERVER_URL", "").rstrip("/")
    token = os.environ.get("AGAEYE_DEVICE_TOKEN", "")
    device = os.environ.get("AGAEYE_DEVICE_ID", "crib-01")
    parsed = urlparse(server)
    local = parsed.hostname in ("localhost", "127.0.0.1") and parsed.scheme == "http"
    if (parsed.scheme != "https" and not local) or parsed.username or parsed.password or parsed.query or parsed.fragment:
        parser.error("AGAEYE_SERVER_URL must be an HTTPS API origin (localhost HTTP is allowed for testing)")
    if len(token) < 32:
        parser.error("AGAEYE_DEVICE_TOKEN must be configured; never put it in the web build")
    if not device or any(char not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-" for char in device) or len(device) > 96:
        parser.error("Invalid AGAEYE_DEVICE_ID")
    os.environ.setdefault("OMP_NUM_THREADS", "2")
    os.environ.setdefault("OPENBLAS_NUM_THREADS", "2")
    os.environ["CUDA_VISIBLE_DEVICES"] = "-1"
    import requests
    if args.check:
        response = requests.post(f"{server}/devices/{device}/heartbeat",
                                 headers={"Authorization": "Bearer " + token},
                                 json={"status": "unavailable", "reason": "starting", "camera_status": "unknown"}, timeout=90)
        if response.status_code != 200:
            parser.error(f"Device connection failed (HTTP {response.status_code}). Check API URL, device ID and token.")
        print("기기 인증 성공. 카메라·모델 분석은 아직 시작하지 않았습니다.")
        return
    import agaeye.notify as notify
    import agaeye.config as config
    from edge.run_edge import main as edge_main
    original = notify.HttpNotifier
    active = []

    class CloudNotifier(original):
        def __init__(self, *values, **kwargs):
            kwargs["timeout"] = 15.0
            super().__init__(*values, **kwargs)
            active.append(self)

        def _run(self):
            # Install auth before the parent thread sends its very first heartbeat.
            self._http.headers.update({"Authorization": "Bearer " + token})
            super()._run()

        def update_status(self, payload):
            # A processed frame proves camera input; no video is uploaded.
            super().update_status(dict(payload, camera_status="ok"))

    notify.HttpNotifier = CloudNotifier
    config.ROOT = ROOT
    argv = ["--config", str(Path(args.config).resolve()), "--source", args.source,
            "--server", server, "--device-id", device]
    if args.model:
        argv += ["--model", str(Path(args.model).resolve())]
    if args.show:
        argv += ["--show"]
    if args.max_seconds:
        argv += ["--max-seconds", str(args.max_seconds)]
    try:
        edge_main(argv)
    finally:
        for notifier in active:
            with notifier._lock:
                notifier._status.update(status="unavailable", reason="stopped", camera_status="unknown")
            # close() already ran on a clean EOF. Explicit final status must still be sent.
            try:
                requests.post(f"{server}/devices/{device}/heartbeat",
                              headers={"Authorization": "Bearer " + token},
                              json=notifier._status, timeout=15)
            except requests.RequestException:
                pass
            notifier.close(flush_timeout=20)


if __name__ == "__main__":
    main()
