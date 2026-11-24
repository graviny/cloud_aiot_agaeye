import json
import re
import uuid

from agaeye.bridge_output import EVENT_SCHEMA, STATUS_SCHEMA, BridgeFileNotifier


def test_status_file(tmp_path):
    n = BridgeFileNotifier(tmp_path)
    n.update_status({"ts": 1_800_000_000.0, "status": "caution", "posture": "prone",
                     "airway": None, "body_conf": 0.81, "face_conf": None, "fps": 3.0})
    n.close()
    s = json.loads((tmp_path / "output" / "status.json").read_text(encoding="utf-8"))
    assert s["schema_version"] == STATUS_SCHEMA
    v = s["video"]["data"]
    assert s["video"]["available"] is True
    assert v["posture_state"] == "caution"
    assert v["posture"]["valid"] is True and v["posture"]["posture"] == "prone"
    assert v["posture"]["body"]["conf"] == 0.81
    assert v["processing_fps"] == 3.0


def test_unavailable_status_is_not_valid(tmp_path):
    n = BridgeFileNotifier(tmp_path)
    n.update_status({"ts": 1_800_000_000.0, "status": "unavailable"})
    n.close()
    s = json.loads((tmp_path / "output" / "status.json").read_text(encoding="utf-8"))
    assert s["video"]["data"]["posture"]["valid"] is False


def test_events_append_with_stable_ids(tmp_path):
    event_id = uuid.uuid4().hex
    n = BridgeFileNotifier(tmp_path)
    n.send_event({"event_id": event_id, "kind": "risk_started", "risk_type": "prone",
                  "started_at": 1_800_000_000.0, "confirmed_at": 1_800_000_005.0})
    n.send_event({"event_id": event_id, "kind": "risk_ended", "risk_type": "prone",
                  "started_at": 1_800_000_000.0, "ended_at": 1_800_000_012.0})
    n.close()
    lines = [json.loads(x) for x in (tmp_path / "output" / "events.jsonl").read_text(encoding="utf-8").splitlines()]
    assert [e["kind"] for e in lines] == ["risk_started", "risk_ended"]
    started, ended = lines
    assert all(e["schema_version"] == EVENT_SCHEMA for e in lines)
    assert all(re.fullmatch("[a-f0-9]{64}", e["id"]) for e in lines)
    assert started["id"] != ended["id"]
    assert started["payload"]["episode_uid"] == ended["payload"]["episode_uid"] == str(uuid.UUID(event_id))
    assert started["wall_time_unix"] == 1_800_000_005.0
    assert ended["wall_time_unix"] == 1_800_000_012.0
    assert ended["payload"]["ts"] == ended["wall_time_unix"]
