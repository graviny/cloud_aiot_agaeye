#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
test -x .venv/bin/python || { echo 'Run deploy/pi/install.sh first.' >&2; exit 1; }
python3 - <<'PY'
from pathlib import Path
import subprocess

root = Path.cwd()
units = Path.home() / ".config/systemd/user"
units.mkdir(exist_ok=True, parents=True)
# Produce service paths compatible with the sender's profile-backup checks.
def quote(value):
    return '"' + str(value).replace('\\', '\\\\').replace('"', '\\"').replace('%', '%%') + '"'

def unit(name, command):
    return f"""[Unit]
Description=Sky Eye {name}

[Service]
Type=simple
WorkingDirectory={str(root).replace('%','%%')}
Environment={quote('PYTHONPATH=' + str(root / 'src'))}
ExecStart={command}
Restart=on-failure
RestartSec=5
UMask=0077

[Install]
WantedBy=default.target
"""

definitions = {
    "sky-eye": unit("camera", "/bin/bash " + quote(root / "deploy/pi/edge.sh") + " run"),
    "sky-eye-export": unit("camera observations", quote(root / ".venv/bin/python") + " -m sky_edge.export"),
}
for name in definitions:
    result = subprocess.run(["systemctl", "--user", "show", name + ".service",
                             "-p", "LoadState", "-p", "WorkingDirectory"],
                            text=True, stdout=subprocess.PIPE)
    info = dict(row.split("=", 1) for row in result.stdout.splitlines() if "=" in row)
    if info.get("LoadState") == "not-found":
        continue
    result.check_returncode()
    current = info.get("WorkingDirectory")
    if not current or Path(current).resolve() != root:
        raise SystemExit(f"{name} is configured for {current}. Use that installation or a separate Pi user.")
for name, content in definitions.items():
    (units / (name + ".service")).write_text(content, encoding="utf-8")
PY
systemctl --user daemon-reload
echo 'Camera services installed. Start them with the agaeye sender.'
