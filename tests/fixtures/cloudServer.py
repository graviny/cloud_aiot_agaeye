"""Loopback-only browser test fixture. Never used by the production entry point."""
import base64
import sys
import time
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tests"))
from cloud.app import create_app
from cloud_api_test import FakeStore, SETTINGS, OWNER

store = FakeStore()
now = time.time()
photo_path = f"{OWNER}/crib-01/risk-1.jpg"
event = {"event_id": "risk-1", "device_id": "crib-01", "risk_type": "prone", "started_at": now - 5,
         "confirmed_at": now, "ended_at": None, "acked": False, "acked_at": None, "acked_by": None,
         "status": "active", "escalated": False, "received_at": now}
store.tables["agaeye_events"] = {"risk-1": {"event_id": "risk-1", "device_id": "crib-01", "owner_id": OWNER,
                                              "data": event, "received_at": now, "snapshot_path": photo_path}}
store.photos[photo_path] = (ROOT / "tests" / "fixtures" / "cloud-test.jpg").read_bytes()
store.tables["agaeye_devices"] = {"crib-01": {"device_id": "crib-01", "data": {
    "device_id": "crib-01", "last_seen": now, "ts": now, "online": True, "status": "risk",
    "reason": "prone", "posture": "prone", "airway": "airway_visible", "active_event_id": "risk-1"}}}
app = create_app(SETTINGS, store, background=False)
