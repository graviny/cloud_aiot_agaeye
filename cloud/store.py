"""Supabase REST/Storage adapter. Secrets never leave this server."""
from urllib.parse import quote
import httpx

from .config import Settings


class StoreError(Exception):
    pass


class SupabaseStore:
    def __init__(self, settings: Settings):
        self.settings = settings
        headers = {"apikey": settings.service_key}
        # Legacy service_role JWTs and current sb_secret_ keys are both supported.
        if settings.service_key.startswith("eyJ"):
            headers["Authorization"] = "Bearer " + settings.service_key
        self.client = httpx.AsyncClient(base_url=settings.supabase_url, headers=headers,
                                        timeout=15.0, follow_redirects=False)

    async def close(self):
        await self.client.aclose()

    async def _request(self, method, path, **kwargs):
        try:
            response = await self.client.request(method, path, **kwargs)
        except httpx.HTTPError:
            raise StoreError("Supabase connection failed") from None
        if response.status_code >= 400:
            # Never return provider response bodies, URLs containing tokens, or keys to clients/logs.
            raise StoreError(f"Supabase operation failed ({response.status_code})")
        return response

    async def user(self, token):
        try:
            response = await self.client.get("/auth/v1/user", headers={"Authorization": "Bearer " + token})
        except httpx.HTTPError:
            raise StoreError("Authentication service unavailable") from None
        if response.status_code in (401, 403):
            return None
        if response.status_code != 200:
            raise StoreError("Authentication service unavailable")
        value = response.json()
        return value if isinstance(value, dict) and value.get("id") else None

    async def load(self, table, *, limit=200, active=False):
        params = {"owner_id": "eq." + self.settings.owner_id, "device_id": "eq." + self.settings.device_id,
                  "select": "*", "limit": str(limit)}
        if table in ("agaeye_events", "agaeye_alerts"):
            params["order"] = "received_at.desc"
        if active:
            params["data->>status"] = "eq.active"
        response = await self._request("GET", "/rest/v1/" + table, params=params)
        return response.json()

    async def get_event(self, event_id):
        response = await self._request("GET", "/rest/v1/agaeye_events", params={
            "event_id": "eq." + event_id, "owner_id": "eq." + self.settings.owner_id,
            "device_id": "eq." + self.settings.device_id, "select": "*", "limit": "1"})
        rows = response.json()
        return rows[0] if rows else None

    async def save(self, table, key, value, *, snapshot_path=None):
        row = {key: value[key], "device_id": self.settings.device_id,
               "owner_id": self.settings.owner_id, "data": value}
        if table == "agaeye_events":
            row.update(received_at=value["received_at"], snapshot_path=snapshot_path)
        elif table == "agaeye_alerts":
            row["received_at"] = value["ts"]
        await self._request("POST", "/rest/v1/" + table,
                            params={"on_conflict": key}, json=row,
                            headers={"Prefer": "resolution=merge-duplicates,return=minimal"})

    async def put_photo(self, path, content):
        await self._request("POST", f"/storage/v1/object/{self.settings.bucket}/{quote(path, safe='/')}",
                            content=content, headers={"Content-Type": "image/jpeg", "x-upsert": "true"})

    async def photo(self, path):
        response = await self._request("GET", f"/storage/v1/object/authenticated/{self.settings.bucket}/{quote(path, safe='/')}")
        return response.content

    async def check(self):
        # Check actual tables and the private bucket, not just API process liveness.
        for table in ("agaeye_devices", "agaeye_events", "agaeye_settings", "agaeye_alerts"):
            await self.load(table, limit=1)
        response = await self._request("GET", "/storage/v1/bucket/" + self.settings.bucket)
        if response.json().get("public") is not False:
            raise StoreError("Snapshot bucket must be private")
