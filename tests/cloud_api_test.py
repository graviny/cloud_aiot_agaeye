"""Offline API integration tests. Supabase is replaced by a durable test double."""
import base64
import copy
import time
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from cloud.app import create_app
from cloud.config import Settings
from cloud.store import StoreError

OWNER = "11111111-1111-4111-8111-111111111111"
OTHER = "22222222-2222-4222-8222-222222222222"
TOKEN = "test-device-secret-not-a-real-key-123456789"
SETTINGS = Settings("https://test-project.supabase.co", "test-service-key", OWNER, TOKEN)
AUTH = {"Authorization": "Bearer test-guardian-session"}
DEVICE = {"Authorization": "Bearer " + TOKEN}
JPEG = b"\xff\xd8\xff\xe0test-only\xff\xd9"


class FakeStore:
    def __init__(self):
        self.tables = {}
        self.photos = {}
        self.fail = False

    async def check(self):
        if self.fail:
            raise StoreError("test-only failure")

    async def close(self):
        pass

    async def user(self, token):
        if token == "test-guardian-session":
            return {"id": OWNER}
        if token == "test-other-session":
            return {"id": OTHER}
        return None

    async def load(self, table, *, limit=200, active=False):
        rows = list(self.tables.get(table, {}).values())
        if active:
            rows = [row for row in rows if row["data"].get("status") == "active"]
        return copy.deepcopy(sorted(rows, key=lambda row: row.get("received_at", 0), reverse=True)[:limit])

    async def save(self, table, key, value, *, snapshot_path=None):
        await self.check()
        row = {key: value[key], "device_id": SETTINGS.device_id, "owner_id": OWNER,
               "received_at": value.get("received_at", value.get("ts", 0)), "data": copy.deepcopy(value),
               "snapshot_path": snapshot_path}
        self.tables.setdefault(table, {})[value[key]] = row

    async def get_event(self, event_id):
        await self.check()
        return copy.deepcopy(self.tables.get("agaeye_events", {}).get(event_id))

    async def put_photo(self, path, data):
        await self.check()
        self.photos[path] = data

    async def photo(self, path):
        return self.photos[path]


def sample_heartbeat(**patches):
    return {"ts": time.time(), "status": "risk", "reason": "prone", "posture": "prone",
            "airway": "airway_visible", "active_event_id": "risk-1", **patches}


def sample_event(**patches):
    now = time.time()
    return {"event_id": "risk-1", "kind": "risk_started", "risk_type": "prone",
            "started_at": now - 5, "confirmed_at": now,
            "snapshot_jpeg_b64": base64.b64encode(JPEG).decode(), **patches}


class CloudApiTests(unittest.TestCase):
    def setUp(self):
        self.store = FakeStore()
        self.app = create_app(SETTINGS, self.store, background=False)
        self.client = TestClient(self.app)
        self.client.__enter__()

    def tearDown(self):
        self.client.__exit__(None, None, None)

    def seed(self):
        response = self.client.post("/devices/crib-01/heartbeat", json=sample_heartbeat(), headers=DEVICE)
        self.assertEqual(response.status_code, 200, response.text)
        response = self.client.post("/devices/crib-01/events", json=sample_event(), headers=DEVICE)
        self.assertEqual(response.status_code, 200, response.text)

    def test_private_routes_require_guardian_and_device_scopes(self):
        self.seed()
        for path in ("/devices", "/devices/crib-01/status", "/events", "/events/risk-1/snapshot", "/alerts", "/stream", "/readyz"):
            self.assertEqual(self.client.get(path).status_code, 401, path)
            self.assertEqual(self.client.get(path, headers=DEVICE).status_code, 401, path)
            self.assertEqual(self.client.get(path, headers={"Authorization": "Bearer test-other-session"}).status_code, 403, path)
        self.assertEqual(self.client.post("/devices/crib-01/heartbeat", json={}, headers=AUTH).status_code, 401)
        self.assertEqual(self.client.post("/devices/other/heartbeat", json={}, headers=DEVICE).status_code, 404)
        self.assertEqual(self.client.get("/devices/other/status", headers=AUTH).status_code, 404)
        self.assertEqual(self.client.post("/events/risk-1/ack", headers=DEVICE).status_code, 401)
        self.assertEqual(self.client.get("/healthz").status_code, 200)

    def test_durable_photo_confirmation_and_restart(self):
        self.seed()
        photo = self.client.get("/events/risk-1/snapshot", headers=AUTH)
        self.assertEqual(photo.content, JPEG)
        self.assertEqual(photo.headers["cache-control"], "no-store")
        acknowledged = self.client.post("/events/risk-1/ack", json={"guardian": "spoofed-name"}, headers=AUTH).json()
        self.assertEqual(acknowledged["acked_by"], OWNER)
        self.assertEqual(acknowledged["status"], "active")
        with TestClient(create_app(SETTINGS, self.store, background=False)) as restarted:
            events = restarted.get("/events", headers=AUTH).json()
            self.assertEqual(len(events), 1)
            self.assertTrue(events[0]["acked"])
            self.assertTrue(events[0]["has_snapshot"])
            self.assertNotIn("snapshot_path", events[0])
            self.assertEqual(restarted.get("/events/risk-1/snapshot", headers=AUTH).content, JPEG)

    def test_retry_never_reopens_or_unacks_risk(self):
        self.seed()
        self.client.post("/events/risk-1/ack", headers=AUTH)
        self.client.post("/devices/crib-01/events", json={"event_id": "risk-1", "kind": "risk_ended", "ended_at": time.time()}, headers=DEVICE)
        retry = self.client.post("/devices/crib-01/events", json=sample_event(), headers=DEVICE)
        self.assertTrue(retry.json()["duplicate"])
        events = self.client.get("/events", headers=AUTH).json()
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["status"], "ended")
        self.assertTrue(events[0]["acked"])

    def test_end_before_start_preserves_real_timestamps_and_closed_state(self):
        self.client.post("/devices/crib-01/heartbeat", json=sample_heartbeat(), headers=DEVICE)
        payload = sample_event()
        self.client.post("/devices/crib-01/events", json={"event_id": "risk-1", "kind": "risk_ended", "ended_at": time.time()}, headers=DEVICE)
        self.assertFalse(self.client.get("/events", headers=AUTH).json()[0]["metadata_complete"])
        self.client.post("/devices/crib-01/events", json=payload, headers=DEVICE)
        event = self.client.get("/events", headers=AUTH).json()[0]
        self.assertTrue(event["metadata_complete"])
        self.assertEqual(event["status"], "ended")
        self.assertEqual(event["confirmed_at"], payload["confirmed_at"])

    def test_invalid_images_times_limits_and_future_frames(self):
        self.seed()
        for payload in (sample_event(snapshot_jpeg_b64="not base64!"),
                        sample_event(snapshot_jpeg_b64=base64.b64encode(b"not jpeg").decode()),
                        sample_event(confirmed_at=None), sample_event(event_id="../bad")):
            self.assertEqual(self.client.post("/devices/crib-01/events", json=payload, headers=DEVICE).status_code, 422)
        self.assertEqual(self.client.post("/devices/crib-01/heartbeat", json=sample_heartbeat(ts=time.time() + 1000), headers=DEVICE).status_code, 422)
        self.assertEqual(self.client.post("/devices/crib-01/events", content=b"x" * 2_800_001, headers=DEVICE).status_code, 413)
        self.assertEqual(self.client.get("/events?limit=100000", headers=AUTH).status_code, 422)

    def test_older_frame_is_not_a_fresh_normal_result(self):
        self.seed()
        result = self.client.post("/devices/crib-01/heartbeat", json=sample_heartbeat(ts=time.time() - 100, status="normal"), headers=DEVICE)
        self.assertEqual(result.json()["ignored"], "older_frame")
        self.assertEqual(self.client.get("/devices/crib-01/status", headers=AUTH).json()["status"], "risk")

    def test_storage_failure_is_not_a_successful_acknowledgement(self):
        self.seed()
        self.store.fail = True
        result = self.client.post("/events/risk-1/ack", headers=AUTH)
        self.assertEqual(result.status_code, 503)
        self.assertNotIn("test-service-key", result.text)
        self.store.fail = False
        self.assertFalse(self.client.get("/events", headers=AUTH).json()[0]["acked"])

    def test_cors_accepts_only_the_configured_web_origin(self):
        allowed = self.client.options("/events", headers={"Origin": "http://127.0.0.1:5176", "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "authorization"})
        self.assertEqual(allowed.headers.get("access-control-allow-origin"), "http://127.0.0.1:5176")
        denied = self.client.options("/events", headers={"Origin": "https://other.example", "Access-Control-Request-Method": "GET"})
        self.assertEqual(denied.status_code, 400)

    def test_watchdog_recovers_pending_risks_and_does_not_escalate_stale_evidence(self):
        self.seed()
        with patch("cloud.app.time.time", return_value=time.time() + 16):
            self.client.portal.call(self.app.state.tick)
        self.assertFalse(self.client.get("/events", headers=AUTH).json()[0]["escalated"])
        self.client.put("/devices/crib-01/risk-settings", json={"escalation_s": 0.1}, headers=AUTH)
        time.sleep(0.12)
        self.client.portal.call(self.app.state.tick)
        self.assertTrue(self.client.get("/events", headers=AUTH).json()[0]["escalated"])
        with patch("cloud.app.time.time", return_value=time.time() + 30):
            self.client.portal.call(self.app.state.tick)
            self.assertFalse(self.client.get("/devices/crib-01/status", headers=AUTH).json()["online"])


if __name__ == "__main__":
    unittest.main()
