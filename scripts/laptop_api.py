"""Local laptop demo controls around the pinned aga-eye FastAPI server."""
from __future__ import annotations

import asyncio
import os
import subprocess
import sys
import threading
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "vendor" / "aga-eye"))
from fastapi import HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from server.app import app, state, publish, device_view

RUNTIME = ROOT / "runtime"
RUNTIME.mkdir(exist_ok=True)
MODEL = Path(os.environ.get("AGAEYE_MODEL", str(ROOT / "models" / "agaeye_A_original_320_aug.onnx"))).resolve()
SERVER_URL = os.environ.get("AGAEYE_SERVER_URL", "http://127.0.0.1:8000")
FRAME = RUNTIME / "current.jpg"
LOG = RUNTIME / "analysis.log"


class StartInput(BaseModel):
    source: str = "camera"
    camera_index: int = Field(0, ge=0, le=4)
    video_id: str | None = None


class Controller:
    def __init__(self):
        self.process = None
        self.source_label = None
        self.error = None
        self.finished = False
        self.lock = threading.RLock()
        self.videos = {}
        self.loop = None

    def unavailable(self):
        def update():
            device = state.devices.get("laptop-demo")
            if device:
                device.update(status="unavailable", reason="input_stopped", camera_status="unknown")
                publish({"type": "device", "device": device_view(device)})
        if self.loop and self.loop.is_running():
            self.loop.call_soon_threadsafe(update)

    def info(self):
        with self.lock:
            running = self.process is not None and self.process.poll() is None
            if self.process is not None and not running and not self.finished:
                self.finished = True
                self.unavailable()
                if self.process.returncode:
                    tail = LOG.read_text(encoding="utf-8", errors="replace")[-700:] if LOG.exists() else ""
                    self.error = "분석 프로그램이 종료됐습니다. 입력과 모델을 확인하세요.\n" + tail
            return {"modelReady": MODEL.is_file(), "modelName": MODEL.name, "running": running,
                    "sourceLabel": self.source_label, "error": self.error,
                    "frameVersion": FRAME.stat().st_mtime_ns if FRAME.exists() else None,
                    "provider": "CPUExecutionProvider"}

    def start(self, body):
        with self.lock:
            if self.process is not None and self.process.poll() is None:
                raise HTTPException(409, "분석 중입니다. 먼저 분석을 중지하세요.")
            if not MODEL.is_file():
                raise HTTPException(400, "학습된 ONNX 파일이 없습니다. models 폴더를 확인하세요.")
            if body.source == "camera":
                source = str(body.camera_index)
                label = f"웹캠 {body.camera_index}"
            elif body.source == "video" and body.video_id in self.videos:
                source, label = self.videos[body.video_id]
            else:
                raise HTTPException(400, "웹캠 또는 업로드한 영상을 선택하세요.")
            if FRAME.exists():
                FRAME.unlink()
            self.error = None
            self.finished = False
            self.source_label = label
            argv = [sys.executable, "-u", str(ROOT / "scripts" / "laptop_edge.py"),
                    "--model", str(MODEL), "--source", source, "--server", SERVER_URL,
                    "--preview", str(FRAME), "--no-show"]
            env = dict(os.environ, PYTHONIOENCODING="utf-8", OMP_NUM_THREADS="2", CUDA_VISIBLE_DEVICES="-1")
            with LOG.open("w", encoding="utf-8") as output:
                self.process = subprocess.Popen(argv, cwd=str(ROOT), stdout=output, stderr=subprocess.STDOUT,
                                                env=env, creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
            return self.info()

    def stop(self):
        with self.lock:
            if self.process is not None and self.process.poll() is None:
                self.process.terminate()
                try:
                    self.process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    self.process.kill()
                    self.process.wait(timeout=2)
            self.finished = True
            self.error = None
            self.unavailable()
            return self.info()


control = Controller()
original_lifespan = app.router.lifespan_context


@asynccontextmanager
async def lifespan(instance):
    control.loop = asyncio.get_running_loop()
    async with original_lifespan(instance):
        try:
            yield
        finally:
            await asyncio.to_thread(control.stop)


app.router.lifespan_context = lifespan


@app.get("/demo/info")
def demo_info():
    return control.info()


@app.post("/demo/start")
def demo_start(body: StartInput):
    return control.start(body)


@app.post("/demo/stop")
def demo_stop():
    return control.stop()


@app.put("/demo/video")
async def upload_video(request: Request, name: str = "video.mp4"):
    if control.info()["running"]:
        raise HTTPException(409, "분석을 중지한 뒤 다른 영상을 선택하세요.")
    suffix = Path(name).suffix.lower()
    if suffix not in {".mp4", ".avi", ".mov", ".mkv", ".webm"}:
        raise HTTPException(400, "MP4·AVI·MOV·MKV·WEBM 영상을 선택하세요.")
    video_id = uuid.uuid4().hex
    folder = RUNTIME / "videos"
    folder.mkdir(exist_ok=True)
    target = folder / (video_id + suffix)
    total = 0
    try:
        with target.open("wb") as output:
            async for chunk in request.stream():
                total += len(chunk)
                if total > 512 * 1024 * 1024:
                    raise HTTPException(413, "데모 영상은 512MB 이하로 선택하세요.")
                output.write(chunk)
        if not total:
            raise HTTPException(400, "빈 영상 파일입니다.")
    except BaseException:
        target.unlink(missing_ok=True)
        raise
    control.videos[video_id] = (str(target), Path(name).name)
    return {"videoId": video_id, "name": Path(name).name, "size": total}


@app.get("/demo/frame")
def demo_frame():
    if not FRAME.exists():
        raise HTTPException(404, "첫 분석 프레임을 기다리고 있습니다.")
    return FileResponse(FRAME, media_type="image/jpeg", headers={"Cache-Control": "no-store"})
