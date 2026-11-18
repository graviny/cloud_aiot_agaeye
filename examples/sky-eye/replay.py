"""Replay one synthetic camera observation offline, on Windows or Raspberry Pi."""
import json
from pathlib import Path
import sys
import tempfile

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "edge" / "sky-eye" / "src"))
from sky_edge.export import Exporter


def main():
    source = HERE / "logs"
    sample = json.loads((source / "20261101-120000/status.json").read_text())
    with tempfile.TemporaryDirectory() as folder:
        output = Path(folder)
        worker = Exporter(source, output)
        status = worker.tick(now=sample["wall_time_unix"])
        events = [json.loads(line) for line in (output / "events.jsonl").read_text().splitlines()]
        print(json.dumps({"status": status, "events": events}, indent=2))


if __name__ == "__main__":
    main()
