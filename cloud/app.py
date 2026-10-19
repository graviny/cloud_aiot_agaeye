"""Authenticated, single-worker Render API with durable Supabase records."""
from __future__ import annotations

import asyncio
import base64
import binascii
import copy
import hmac
import json
import logging
import time
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import Body, Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict, Field, model_validator

from .config import Settings
from .store import StoreError, SupabaseStore

log = logging.getLogger("agaeye.cloud")
bearer = HTTPBearer(auto_error=False)
MAX_PHOTO = 2_000_000
NAMES = {"prone": "엎드림", "face_covered": "얼굴 가림"}


class Heartbeat(BaseModel):
    model_config = ConfigDict(extra="ignore", allow_inf_nan=False)
    ts: float | None = Field(None, gt=0)
    status: Literal["normal", "caution", "risk", "unavailable"] = "unavailable"
    reason: str = Field("starting", max_length=100)
    posture: Literal["supine", "side", "prone"] | None = None
    airway: Literal["airway_visible", "airway_covered"] | None = None
    camera_status: Literal["ok", "error", "disconnected", "unknown"] | None = None
    active_event_id: str | None = Field(None, max_length=96)
    settings_version: int | None = Field(None, ge=0)
    model: str | None = Field(None, max_length=200)
    infer_ms: float | None = Field(None, ge=0)
    fps: float | None = Field(None, ge=0)
    dropped_events: int = Field(0, ge=0)


class RiskSettings(BaseModel):
    risk_threshold_s: float = Field(5.0, ge=1, le=60)
    escalation_s: float = Field(15.0, ge=0.1, le=600)


class EventIn(BaseModel):
    model_config = ConfigDict(extra="ignore", allow_inf_nan=False)
    event_id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,96}$")
    kind: Literal["risk_started", "risk_ended"]
    risk_type: Literal["prone", "face_covered"] | None = None
    started_at: float | None = Field(None, gt=0)
    confirmed_at: float | None = Field(None, gt=0)
    ended_at: float | None = Field(None, gt=0)
    posture: str | None = Field(None, max_length=50)
    airway: str | None = Field(None, max_length=50)
    confidence: float | None = Field(None, ge=0, le=1)
    settings_version: int | None = Field(None, ge=0)
    model: str | None = Field(None, max_length=200)
    snapshot_jpeg_b64: str | None = Field(None, max_length=2_666_672)

    @model_validator(mode="after")
    def timestamps(self):
        if self.kind == "risk_started":
            if not self.risk_type or not self.started_at or not self.confirmed_at:
                raise ValueError("위험 시작에는 유형·시작·확정 시각이 필요합니다")
            if self.confirmed_at < self.started_at:
                raise ValueError("확정 시각은 시작 시각보다 빠를 수 없습니다")
        elif not self.ended_at:
            raise ValueError("위험 종료 시각이 필요합니다")
        return self


class AckIn(BaseModel):
    guardian: str = Field("보호자", max_length=100)


def create_app(settings: Settings | None = None, store=None, *, background=True):
    settings = settings or Settings.from_env()
    store = store or SupabaseStore(settings)
    devices: dict[str, dict] = {}
    events: dict[str, dict] = {}
    risk_settings = {"device_id": settings.device_id, "version": 1, **RiskSettings().model_dump()}
    subscribers: set[asyncio.Queue] = set()
    lock = asyncio.Lock()

    def publish(value):
        for queue in tuple(subscribers):
            try:
                queue.put_nowait(value)
            except asyncio.QueueFull:
                # Force reconnect/REST catch-up instead of silently dropping a risk event.
                while not queue.empty():
                    queue.get_nowait()
                queue.put_nowait({"type": "resync"})

    def event_view(event):
        return {key: value for key, value in event.items() if key != "snapshot_path"} | {
            "has_snapshot": bool(event.get("snapshot_path")),
            "metadata_complete": bool(event.get("started_at") and event.get("confirmed_at") and event.get("risk_type"))}

    def device_view(device):
        # Even after a restart, stale persisted records can never claim the device is online.
        return dict(device, online=bool(device.get("online") and time.time() - device["last_seen"] <= settings.offline_s),
                    age_s=round(max(0, time.time() - device["last_seen"]), 1),
                    settings_applied=device.get("settings_version") == risk_settings["version"],
                    settings=risk_settings)

    async def save_event(event):
        data = {key: value for key, value in event.items() if key != "snapshot_path"}
        await store.save("agaeye_events", "event_id", data, snapshot_path=event.get("snapshot_path"))
        events[event["event_id"]] = event
        publish({"type": "event", "event": event_view(event)})

    async def read_event(event_id):
        row = await store.get_event(event_id)
        return dict(row["data"], snapshot_path=row.get("snapshot_path")) if row else None

    async def alert(kind, level, message, event=None):
        identifier = kind + "-" + (event["event_id"] if event else settings.device_id + "-" + str(int(time.time())))
        value = {"alert_id": identifier, "device_id": settings.device_id, "kind": kind,
                 "level": level, "message": message, "ts": time.time(),
                 "event_id": event["event_id"] if event else None,
                 "risk_type": event.get("risk_type") if event else None,
                 "targets": "all" if level == 2 else "primary"}
        await store.save("agaeye_alerts", "alert_id", value)
        publish({"type": "alert", "alert": value})

    async def tick():
        async with lock:
            now = time.time()
            for device_id, device in list(devices.items()):
                if device.get("online") and now - device["last_seen"] > settings.offline_s:
                    updated = dict(device, online=False)
                    await store.save("agaeye_devices", "device_id", updated)
                    devices[device_id] = updated
                    await alert("connection_lost", 1, "라즈베리파이 연결이 끊겼어요")
                    publish({"type": "device", "device": device_view(updated)})
            for event in list(events.values()):
                if event["status"] != "active" or event["acked"] or event.get("escalated"):
                    continue
                device = devices.get(settings.device_id)
                # Escalation requires fresh device evidence that this risk is still active.
                fresh = device and device_view(device)["online"] and device.get("ts") and now - device["ts"] <= 12
                if not fresh or device.get("status") != "risk" or device.get("active_event_id") != event["event_id"]:
                    continue
                if now - event["received_at"] >= risk_settings["escalation_s"]:
                    await alert("risk_escalated", 2, "위험이 계속되고 있어요. 아기를 확인해 주세요.", event)
                    await save_event(dict(event, escalated=True))

    async def watchdog():
        while True:
            try:
                await tick()
            except StoreError:
                log.warning("Cloud persistence unavailable; pending transitions will be retried")
                publish({"type": "storage_unavailable"})
            await asyncio.sleep(1)

    @asynccontextmanager
    async def lifespan(_):
        task = None
        try:
            await store.check()
            for row in await store.load("agaeye_devices"):
                devices[row["device_id"]] = row["data"]
            for row in await store.load("agaeye_settings"):
                risk_settings.update(row["data"])
            for row in await store.load("agaeye_events", limit=1000, active=True):
                events[row["event_id"]] = dict(row["data"], snapshot_path=row.get("snapshot_path"))
            if background:
                task = asyncio.create_task(watchdog())
            yield
        finally:
            if task:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
            await store.close()

    app = FastAPI(title="아가 아이 클라우드 API", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    app.state.tick = tick
    app.add_middleware(CORSMiddleware, allow_origins=list(settings.origins), allow_credentials=False,
                       allow_methods=["GET", "POST", "PUT", "OPTIONS"], allow_headers=["Authorization", "Content-Type"])

    @app.middleware("http")
    async def size_and_privacy(request, call_next):
        # Streaming limit also covers chunked requests without Content-Length.
        if request.method in ("POST", "PUT"):
            total = 0
            chunks = []
            async for chunk in request.stream():
                total += len(chunk)
                if total > 2_800_000:
                    return JSONResponse({"detail": "요청 크기가 제한을 초과했습니다"}, status_code=413)
                chunks.append(chunk)
            # BaseHTTPMiddleware's wrapped receive replays a cached body to downstream validation.
            request._body = b"".join(chunks)
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    @app.exception_handler(StoreError)
    async def store_error(_request, _error):
        return JSONResponse({"detail": "클라우드 저장소 연결을 확인해 주세요. 저장은 완료되지 않았습니다."}, status_code=503)

    async def guardian(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)):
        if not credentials:
            raise HTTPException(401, "로그인이 필요합니다")
        user = await store.user(credentials.credentials)
        if not user:
            raise HTTPException(401, "로그인이 만료되었습니다")
        if user["id"] != settings.owner_id:
            raise HTTPException(403, "이 기기에 접근할 권한이 없습니다")
        return user

    async def device_auth(device_id: str, credentials: HTTPAuthorizationCredentials | None = Depends(bearer)):
        if device_id != settings.device_id:
            raise HTTPException(404, "등록되지 않은 기기입니다")
        token = credentials.credentials if credentials else ""
        if not hmac.compare_digest(token.encode(), settings.device_token.encode()):
            raise HTTPException(401, "기기 인증에 실패했습니다")

    def check_device(device_id):
        if device_id != settings.device_id:
            raise HTTPException(404, "등록되지 않은 기기입니다")

    @app.get("/healthz")
    async def health():
        return {"ok": True, "service": "agaeye-cloud"}

    @app.get("/readyz", dependencies=[Depends(guardian)])
    async def ready():
        await store.check()
        return {"ok": True, "storage": "connected"}

    @app.post("/devices/{device_id}/heartbeat", dependencies=[Depends(device_auth)])
    async def heartbeat(device_id: str, body: Heartbeat):
        async with lock:
            previous = devices.get(device_id)
            if body.ts and previous and previous.get("ts") and body.ts < previous["ts"]:
                return {"ok": True, "ignored": "older_frame", "settings": risk_settings}
            if body.ts and body.ts > time.time() + 30:
                raise HTTPException(422, "기기의 시계와 시간 동기화를 확인해 주세요")
            value = {**body.model_dump(exclude_none=True), "device_id": device_id, "last_seen": time.time(), "online": True}
            await store.save("agaeye_devices", "device_id", value)
            devices[device_id] = value
            publish({"type": "device", "device": device_view(value)})
        return {"ok": True, "settings": risk_settings}

    @app.get("/devices", dependencies=[Depends(guardian)])
    async def list_devices():
        return [device_view(device) for device in devices.values()]

    @app.get("/devices/{device_id}/status", dependencies=[Depends(guardian)])
    async def status(device_id: str):
        check_device(device_id)
        if device_id not in devices:
            raise HTTPException(404, "아직 기기가 연결되지 않았습니다")
        return device_view(devices[device_id])

    @app.get("/devices/{device_id}/risk-settings", dependencies=[Depends(guardian)])
    async def read_settings(device_id: str):
        check_device(device_id)
        return risk_settings

    @app.put("/devices/{device_id}/risk-settings", dependencies=[Depends(guardian)])
    async def write_settings(device_id: str, body: RiskSettings):
        check_device(device_id)
        async with lock:
            value = {"device_id": device_id, "version": risk_settings["version"] + 1, **body.model_dump()}
            await store.save("agaeye_settings", "device_id", value)
            risk_settings.update(value)
            publish({"type": "settings", "device_id": device_id, "settings": risk_settings})
        return risk_settings

    @app.post("/devices/{device_id}/events", dependencies=[Depends(device_auth)])
    async def post_event(device_id: str, body: EventIn):
        photo = None
        if body.snapshot_jpeg_b64:
            try:
                photo = base64.b64decode(body.snapshot_jpeg_b64, validate=True)
            except (binascii.Error, ValueError):
                raise HTTPException(422, "올바른 JPEG base64가 아닙니다") from None
            if len(photo) > MAX_PHOTO:
                raise HTTPException(413, "사진은 2MB 이하여야 합니다")
            if not photo.startswith(b"\xff\xd8\xff") or not photo.endswith(b"\xff\xd9"):
                raise HTTPException(422, "JPEG 사진만 저장할 수 있습니다")
        async with lock:
            existing = await read_event(body.event_id)
            duplicate = bool(existing)
            if body.kind == "risk_started" and existing and existing.get("confirmed_at"):
                # Retry must never reopen an ended event or undo guardian acknowledgement.
                if existing["status"] == "active":
                    await alert("risk", 1, NAMES[existing["risk_type"]] + " 위험 감지", existing)
                publish({"type": "event", "event": event_view(existing)})
                return {"ok": True, "duplicate": True}
            record = existing or {"event_id": body.event_id, "device_id": device_id, "status": "active",
                                  "acked": False, "acked_at": None, "acked_by": None, "escalated": False,
                                  "received_at": time.time(), "snapshot_path": None}
            record = copy.deepcopy(record)
            if body.kind == "risk_started":
                record.update(body.model_dump(exclude={"kind", "snapshot_jpeg_b64", "ended_at"}, exclude_none=True))
                if photo:
                    path = f"{settings.owner_id}/{device_id}/{body.event_id}.jpg"
                    await store.put_photo(path, photo)
                    record["snapshot_path"] = path
            else:
                if record.get("confirmed_at") and body.ended_at < record["confirmed_at"]:
                    raise HTTPException(422, "종료 시각이 확정 시각보다 빠릅니다")
                record.update(status="ended", ended_at=record.get("ended_at") or body.ended_at)
                for key in ("risk_type", "started_at", "confirmed_at"):
                    if not record.get(key) and getattr(body, key):
                        record[key] = getattr(body, key)
            await save_event(record)
            if body.kind == "risk_started" and record["status"] == "active":
                await alert("risk", 1, NAMES[record["risk_type"]] + " 위험 감지", record)
            elif body.kind == "risk_ended":
                await alert("risk_ended", 0, "위험 종료 기록을 받았어요", record)
        return {"ok": True, "duplicate": duplicate}

    @app.get("/events", dependencies=[Depends(guardian)])
    async def history(limit: int = Query(50, ge=1, le=200)):
        return [event_view(dict(row["data"], snapshot_path=row.get("snapshot_path")))
                for row in await store.load("agaeye_events", limit=limit)]

    @app.get("/events/{event_id}/snapshot", dependencies=[Depends(guardian)])
    async def snapshot(event_id: str):
        event = await read_event(event_id)
        if not event or not event.get("snapshot_path"):
            raise HTTPException(404, "저장된 사진이 없습니다")
        return Response(await store.photo(event["snapshot_path"]), media_type="image/jpeg")

    @app.post("/events/{event_id}/ack")
    async def acknowledge(event_id: str, _body: AckIn | None = Body(None), user=Depends(guardian)):
        async with lock:
            event = await read_event(event_id)
            if not event:
                raise HTTPException(404, "없는 이벤트입니다")
            if not event["acked"]:
                event.update(acked=True, acked_at=time.time(), acked_by=user["id"])
                await save_event(event)
            return event_view(event)

    @app.get("/alerts", dependencies=[Depends(guardian)])
    async def alerts(limit: int = Query(50, ge=1, le=200)):
        return [row["data"] for row in await store.load("agaeye_alerts", limit=limit)]

    @app.get("/stream", dependencies=[Depends(guardian)])
    async def stream(request: Request):
        async def generate():
            queue = asyncio.Queue(maxsize=100)
            subscribers.add(queue)
            deadline = time.monotonic() + 55
            try:
                yield "retry: 1000\n\n"
                while time.monotonic() < deadline and not await request.is_disconnected():
                    try:
                        value = await asyncio.wait_for(queue.get(), timeout=5)
                        yield "data: " + json.dumps(value, ensure_ascii=False) + "\n\n"
                    except asyncio.TimeoutError:
                        yield ": keep-alive\n\n"
            finally:
                subscribers.discard(queue)
        # Short sessions re-check refreshed/revoked Supabase credentials on reconnect.
        return StreamingResponse(generate(), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})

    return app


def production_app():
    return create_app()
