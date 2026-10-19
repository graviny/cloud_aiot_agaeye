"""Export a trained aga-eye checkpoint on CPU; this does not train a new model."""
from __future__ import annotations

import argparse
import os
from pathlib import Path

os.environ["CUDA_VISIBLE_DEVICES"] = "-1"
os.environ.setdefault("OMP_NUM_THREADS", "2")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--weights", required=True)
    ap.add_argument("--formats", nargs="+", choices=["onnx", "ncnn"], default=["onnx"])
    ap.add_argument("--imgsz", type=int, default=320)
    args = ap.parse_args()
    weights = Path(args.weights).expanduser().resolve()
    if not weights.is_file() or weights.suffix.lower() != ".pt":
        ap.error("Existing trained best.pt is required; an untrained base model is not a replacement.")
    if args.imgsz < 32 or args.imgsz % 32:
        ap.error("imgsz must be a positive multiple of 32")
    try:
        import torch
        from ultralytics import YOLO
    except ImportError:
        ap.error("Run in the model team's Ultralytics export environment. The laptop ONNX runtime intentionally excludes PyTorch.")
    torch.set_num_threads(2)
    model = YOLO(str(weights))
    expected = {"supine", "side", "prone", "airway_visible", "airway_covered"}
    if set(model.names.values()) != expected:
        ap.error("Checkpoint does not contain the five aga-eye classes.")
    for fmt in args.formats:
        options = dict(format=fmt, imgsz=args.imgsz, device="cpu", batch=1)
        if fmt == "onnx":
            options.update(dynamic=False, nms=False)
        output = model.export(**options)
        print(f"Export complete: {output}")


if __name__ == "__main__":
    main()
