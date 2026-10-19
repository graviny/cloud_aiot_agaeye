"""Laptop-only CPU runner using the pinned aga-eye inference and risk code."""
from __future__ import annotations

import argparse
import ast
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VENDOR = ROOT / "vendor" / "aga-eye"
sys.path.insert(0, str(VENDOR))
os.environ.setdefault("OMP_NUM_THREADS", "2")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "2")
os.environ["CUDA_VISIBLE_DEVICES"] = "-1"


def inspect_model(path: Path):
    if not path.is_file() or path.suffix.lower() != ".onnx":
        raise ValueError("학습된 아가 아이 .onnx 파일이 필요합니다. models/ 또는 파일 경로를 확인하세요.")
    import onnxruntime as ort
    from agaeye.classes import CLASSES

    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    options.inter_op_num_threads = 1
    session = ort.InferenceSession(str(path), sess_options=options, providers=["CPUExecutionProvider"])
    metadata = session.get_modelmeta().custom_metadata_map
    names = ast.literal_eval(metadata.get("names", "{}"))
    actual = set(names.values()) if isinstance(names, dict) else set(names)
    if actual != set(CLASSES):
        raise ValueError(f"아가 아이의 5개 클래스 모델이 아닙니다. 현재 클래스: {sorted(actual)}")
    model_input = session.get_inputs()[0]
    print(f"모델 확인: {path.name}; 입력 {model_input.shape}; CPUExecutionProvider", flush=True)
    return session


def run():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--model", required=True)
    ap.add_argument("--source", default="0", help="Webcam index or local video path")
    ap.add_argument("--server", default="http://127.0.0.1:8000")
    ap.add_argument("--preview", help="Write the latest annotated frame for the local demo web")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--no-show", action="store_true")
    args = ap.parse_args()
    model = Path(args.model).expanduser().resolve()
    session = inspect_model(model)
    del session
    if args.check:
        return
    if not args.source.isdigit() and not Path(args.source).is_file():
        raise ValueError("웹캠 번호 또는 존재하는 로컬 영상 파일을 지정하세요.")

    import cv2
    import requests
    import agaeye.sources as sources
    from edge.run_edge import main

    from agaeye.notify import HttpNotifier
    original_update = HttpNotifier.update_status

    def update_with_camera(self, payload):
        original_update(self, dict(payload, camera_status="ok"))

    HttpNotifier.update_status = update_with_camera
    cv2.setNumThreads(2)
    original_open = sources.open_source
    if args.preview:
        import agaeye.imaging as imaging
        original_draw = imaging.draw
        preview = Path(args.preview).resolve()
        preview.parent.mkdir(parents=True, exist_ok=True)

        def draw_preview(*draw_args, **draw_kwargs):
            image = original_draw(*draw_args, **draw_kwargs)
            ok, encoded = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, 78])
            if ok:
                temporary = preview.with_suffix(".tmp.jpg")
                temporary.write_bytes(encoded.tobytes())
                try:
                    temporary.replace(preview)
                except PermissionError:
                    pass
            return image

        imaging.draw = draw_preview
        # Keep upstream's draw timing without opening a native window.
        cv2.imshow = lambda *_: None
        cv2.waitKey = lambda *_: -1
        cv2.destroyAllWindows = lambda: None

    class PacedVideo:
        """Keep file timestamps aligned with wall time for a visible laptop demonstration."""
        def __init__(self, source):
            self.source = source
            self.origin = None

        def read(self):
            item = self.source.read()
            if item is None:
                return None
            frame, ts = item
            if self.origin is None:
                self.origin = time.monotonic() - ts
            delay = self.origin + ts - time.monotonic()
            if delay > 0:
                time.sleep(delay)
            return frame, ts

        def close(self):
            self.source.close()

    def open_input(spec, size=(640, 480)):
        source = original_open(spec, size)
        return source if spec.isdigit() else PacedVideo(source)

    sources.open_source = open_input
    argv = ["--config", str(ROOT / "configs" / "laptop-demo.yaml"),
            "--model", str(model), "--source", args.source,
            "--server", args.server, "--device-id", "laptop-demo"]
    if args.preview or not args.no_show:
        argv.append("--show")
    try:
        main(argv)
    finally:
        # Ending a file or closing the preview is not a new normal inference result.
        try:
            url = args.server.rstrip("/") + "/devices/laptop-demo"
            response = requests.get(url + "/status", timeout=2)
            if response.ok:
                last = response.json()
                payload = {key: last[key] for key in ("ts", "posture", "airway", "active_event_id") if key in last}
                payload.update(status="unavailable", reason="input_stopped")
                requests.post(url + "/heartbeat", json=payload, timeout=2).raise_for_status()
        except requests.RequestException:
            pass


if __name__ == "__main__":
    try:
        run()
    except Exception as error:
        print(f"분석을 시작할 수 없습니다: {error}", file=sys.stderr, flush=True)
        raise SystemExit(1)
