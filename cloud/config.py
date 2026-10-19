from dataclasses import dataclass
import os
import re
from uuid import UUID


@dataclass(frozen=True)
class Settings:
    supabase_url: str
    service_key: str
    owner_id: str
    device_token: str
    device_id: str = "crib-01"
    origins: tuple[str, ...] = ("http://127.0.0.1:5176",)
    bucket: str = "agaeye-snapshots"
    offline_s: float = 20.0

    @classmethod
    def from_env(cls):
        names = ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GUARDIAN_USER_ID", "DEVICE_TOKEN", "CORS_ORIGINS")
        missing = [name for name in names if not os.environ.get(name, "").strip()]
        if missing:
            raise RuntimeError("Missing cloud settings: " + ", ".join(missing))
        url = os.environ["SUPABASE_URL"].rstrip("/")
        if not re.fullmatch(r"https://[a-z0-9-]+\.supabase\.co", url):
            raise RuntimeError("SUPABASE_URL must be the HTTPS project URL (*.supabase.co)")
        owner = str(UUID(os.environ["GUARDIAN_USER_ID"]))
        token = os.environ["DEVICE_TOKEN"].strip()
        if len(token) < 32:
            raise RuntimeError("DEVICE_TOKEN must have at least 32 characters")
        device = os.environ.get("DEVICE_ID", "crib-01")
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,96}", device):
            raise RuntimeError("Invalid DEVICE_ID")
        origins = tuple(value.strip().rstrip("/") for value in os.environ["CORS_ORIGINS"].split(","))
        if not origins or any(not re.fullmatch(r"https://[A-Za-z0-9.-]+(?::\d+)?|http://(?:localhost|127\.0\.0\.1):\d+", value) for value in origins):
            raise RuntimeError("CORS_ORIGINS requires exact HTTPS web origins (or localhost ports)")
        return cls(url, os.environ["SUPABASE_SERVICE_ROLE_KEY"].strip(), owner, token, device, origins)
