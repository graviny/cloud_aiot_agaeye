"""팀 백엔드 연결용 파일 출력.

파이의 브리지(backend/raspberry-pi/sky_eye_bridge.py)는 <dir>/output/의 두 파일을 2초마다 읽어 서버로 보내요.
- status.json: 현재 상태 (매 판정마다 덮어씀)
- events.jsonl: 위험 시작·종료 (한 줄에 하나씩 추가)
BridgeFileNotifier는 HttpNotifier와 같은 인터페이스라 run_edge.py에서 바꿔 끼울 수 있어요.
"""
from __future__ import annotations

import hashlib
import json
import os
import time
import uuid
from pathlib import Path
from typing import Any, Dict, Optional

STATUS_SCHEMA = "sky-eye.status.v1"   # 브리지가 확인하는 형식 이름
EVENT_SCHEMA = "sky-eye.event.v1"


def _write_atomic(path: Path, text: str) -> None:
    """브리지가 쓰다 만 파일을 읽지 않도록 임시 파일에 쓴 뒤 바꿔치기해요."""
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    os.replace(tmp, path)


def status_record(p: Dict[str, Any], now: float) -> Dict[str, Any]:
    state = p.get("status", "unavailable")
    data = {
        "wall_time_unix": p.get("ts", now),
        "posture_state": state,                      # normal / caution / risk / unavailable
        "posture": {"valid": state != "unavailable",
                    "posture": p.get("posture"), "airway": p.get("airway"),
                    "body": {"conf": p.get("body_conf")}, "face": {"conf": p.get("face_conf")}},
        "geometry_valid": False,                     # 낙상 판정은 이 모델에 없음
        "fall": {"observation_valid": False, "state": "unavailable"},
        "processing_fps": p.get("fps"),
    }
    return {"schema_version": STATUS_SCHEMA, "wall_time_unix": now,
            "video": {"available": True, "data": data}}


def event_record(p: Dict[str, Any], source: str, now: float) -> Dict[str, Any]:
    kind = p["kind"]
    at = p.get("ended_at" if kind == "risk_ended" else "confirmed_at") or now
    payload = {"risk_type": p.get("risk_type"),
               "episode_uid": str(uuid.UUID(p["event_id"])),
               "ts": at}                             # started_at·ended_at과 같은 실제 시각 기준
    for key in ("started_at", "ended_at"):
        if p.get(key) is not None:
            payload[key] = p[key]
    return {"schema_version": EVENT_SCHEMA,
            "id": hashlib.sha256(f"{p['event_id']}:{kind}".encode()).hexdigest(),
            "kind": kind, "wall_time_unix": at, "source": source,
            "source_event_id": p["event_id"], "payload": payload}


class BridgeFileNotifier:
    settings: Optional[Dict[str, Any]] = None
    dropped = 0

    def __init__(self, root: str, source: str = "agaeye-edge"):
        self.output = Path(root).expanduser() / "output"
        self.output.mkdir(parents=True, exist_ok=True)
        self.source = source
        self._events = (self.output / "events.jsonl").open("a", encoding="utf-8")

    def update_status(self, payload: Dict[str, Any]) -> None:
        _write_atomic(self.output / "status.json", json.dumps(status_record(payload, time.time())))

    def send_event(self, payload: Dict[str, Any]) -> None:
        self._events.write(json.dumps(event_record(payload, self.source, time.time())) + "\n")
        self._events.flush()

    def close(self) -> None:
        self._events.close()
