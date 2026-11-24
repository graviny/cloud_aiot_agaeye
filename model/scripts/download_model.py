"""릴리즈에서 배포 모델(ONNX)을 받아 SHA256을 확인해요.

python scripts/download_model.py
결과: models/agaeye_A_original_320_aug.onnx (이미 있고 해시가 맞으면 건너뜀)
"""
from __future__ import annotations

import argparse
import hashlib
import os
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NAME = "agaeye_A_original_320_aug.onnx"
URL = f"https://github.com/graviny/cloud_aiot_agaeye/releases/download/model-v1/{NAME}"
SHA256 = "e2546caef8500e8aaa80b0edec071d77f3b0975daccf560416dc64e8ddc73352"


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default=str(ROOT / "models" / NAME))
    ap.add_argument("--force", action="store_true", help="있어도 다시 받기")
    args = ap.parse_args(argv)

    dst = Path(args.out)
    if dst.exists() and not args.force and sha256(dst) == SHA256:
        print(f"이미 있어요: {dst}")
        return 0
    dst.parent.mkdir(parents=True, exist_ok=True)
    tmp = dst.with_name(dst.name + ".part")
    print(f"받는 중: {URL}")
    urllib.request.urlretrieve(URL, tmp)
    got = sha256(tmp)
    if got != SHA256:
        tmp.unlink()
        print(f"SHA256이 달라요: {got}", file=sys.stderr)
        return 1
    os.replace(tmp, dst)
    print(f"완료: {dst} (SHA256 확인)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
