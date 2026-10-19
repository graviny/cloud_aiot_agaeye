"""Create a source-only team archive; exclude credentials, camera data and model weights."""
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
ROOT_FILES = {"package.json", "package-lock.json", "index.html", "README.md", "tsconfig.json",
              "vite.config.ts", "playwright.config.ts", "playwright.agaeye.config.ts", "playwright.cloud.config.ts",
              "Dockerfile", ".dockerignore", "render.yaml", ".gitignore", ".env.example", ".env.agaeye.example",
              ".env.cloud.example", ".env.cloud-server.example", ".env.pi.example",
              "start-local.cmd", "start-ai-demo.cmd", "setup-ai-demo.cmd",
              "requirements-laptop-demo.txt", "requirements-laptop-demo.lock.txt"}
FOLDERS = {"src", "public", "scripts", "configs", "cloud", "supabase", "docs", "tests", "vendor", "models"}
SKIP_PARTS = {"__pycache__", "node_modules", ".git", ".venv-ai", ".venv-cloud", "runtime", "weights"}
out = ROOT / "aga-eye-cloud-team.zip"
members = []
for file in ROOT.rglob("*"):
    relative = file.relative_to(ROOT)
    if any(part in SKIP_PARTS for part in relative.parts):
        continue
    if not file.is_file() or (len(relative.parts) == 1 and relative.name not in ROOT_FILES):
        continue
    if len(relative.parts) > 1 and relative.parts[0] not in FOLDERS:
        continue
    if (relative.name.startswith(".env") and not relative.name.endswith(".example")) or file.suffix in {".pt", ".onnx", ".pyc", ".zip", ".avi", ".mp4", ".mov", ".mkv"}:
        continue
    members.append((file, relative.as_posix()))
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as archive:
    for file, name in sorted(members):
        archive.write(file, name)
with zipfile.ZipFile(out) as archive:
    assert archive.testzip() is None
print(f"Source archive: {out.name}; {len(members)} files; {out.stat().st_size:,} bytes. No environment secrets, runtime footage or model weights.")
