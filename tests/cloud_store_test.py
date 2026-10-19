import asyncio
import json
import unittest
import httpx
from cloud.config import Settings
from cloud.store import StoreError, SupabaseStore


class SupabaseAdapterTests(unittest.IsolatedAsyncioTestCase):
    async def test_scoped_rest_storage_and_user_token_requests(self):
        settings = Settings("https://test-project.supabase.co", "sb_secret_test_only", "owner-test", "device-test-secret")
        store = SupabaseStore(settings)
        await store.client.aclose()
        requests = []
        async def handler(request):
            requests.append(request)
            if request.url.path == "/auth/v1/user":
                return httpx.Response(200, json={"id": "owner-test"})
            if request.method == "GET" and request.url.path.startswith("/storage/v1/object/"):
                return httpx.Response(200, content=b"private-photo")
            if request.url.path.startswith("/storage/v1/bucket/"):
                return httpx.Response(200, json={"public": False})
            return httpx.Response(200, json=[])
        store.client = httpx.AsyncClient(base_url=settings.supabase_url,
                                        headers={"apikey": settings.service_key}, transport=httpx.MockTransport(handler))
        try:
            await store.load("agaeye_events", limit=10, active=True)
            self.assertEqual(requests[-1].url.params["owner_id"], "eq.owner-test")
            self.assertEqual(requests[-1].url.params["device_id"], "eq.crib-01")
            self.assertEqual(requests[-1].url.params["data->>status"], "eq.active")
            await store.save("agaeye_events", "event_id", {"event_id": "e1", "received_at": 123}, snapshot_path="owner/e1.jpg")
            row = json.loads(requests[-1].content)
            self.assertEqual(row["owner_id"], "owner-test")
            self.assertEqual(row["snapshot_path"], "owner/e1.jpg")
            self.assertEqual(requests[-1].headers["prefer"], "resolution=merge-duplicates,return=minimal")
            await store.put_photo("owner/e1.jpg", b"photo")
            self.assertEqual(requests[-1].headers["content-type"], "image/jpeg")
            self.assertEqual(await store.photo("owner/e1.jpg"), b"private-photo")
            await store.user("guardian-test-session")
            self.assertEqual(requests[-1].headers["authorization"], "Bearer guardian-test-session")
            self.assertEqual(requests[-1].headers["apikey"], "sb_secret_test_only")
            await store.check()
        finally:
            await store.close()

    async def test_provider_errors_do_not_expose_keys_or_details(self):
        store = SupabaseStore(Settings("https://test-project.supabase.co", "test-secret", "owner", "device"))
        await store.client.aclose()
        store.client = httpx.AsyncClient(base_url="https://test-project.supabase.co", transport=httpx.MockTransport(
            lambda _: httpx.Response(500, json={"secret": "must-never-leak"})))
        try:
            with self.assertRaises(StoreError) as error:
                await store.load("agaeye_events")
            self.assertNotIn("must-never-leak", str(error.exception))
        finally:
            await store.close()


if __name__ == "__main__":
    unittest.main()
