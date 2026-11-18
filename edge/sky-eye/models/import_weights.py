"""Install only the three verified camera weights from the team's deployment ZIP."""
import argparse
import hashlib
import json
from pathlib import Path
import tarfile
import tempfile
import zipfile


RELEASE = "sky-eye-integrated-20261101"
DEST = Path(__file__).resolve().parent / "infant"


def install(bundle):
    model = json.loads((DEST / "model_meta.json").read_text(encoding="utf-8"))
    conversion = json.loads((DEST / "ncnn_meta.json").read_text(encoding="utf-8"))
    expected = {"model.onnx": model["sha256"], **conversion["files"]}
    members = {f"{RELEASE}/models/infant/{name}": name for name in expected}
    with tempfile.TemporaryDirectory(dir=DEST) as staging:
        staged = Path(staging)
        with zipfile.ZipFile(bundle) as archive, archive.open(RELEASE + ".tar.gz") as stream:
            with tarfile.open(fileobj=stream, mode="r|gz") as payload:
                for entry in payload:
                    if entry.name not in members or not entry.isfile():
                        continue
                    name = members.pop(entry.name)
                    data = payload.extractfile(entry).read()
                    if hashlib.sha256(data).hexdigest() != expected[name]:
                        raise ValueError(f"Unexpected SHA-256 for {name}")
                    (staged / name).write_bytes(data)
        if members:
            raise ValueError(f"Missing camera weights: {', '.join(members.values())}")
        for name in expected:
            (staged / name).replace(DEST / name)
    print(f"Verified and installed {len(expected)} camera weight files in {DEST}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("bundle", type=Path)
    install(parser.parse_args().bundle)
