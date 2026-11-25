"""Read JPEG captures from the loopback Sky Eye preview."""
from datetime import datetime, timezone
import json
import math
import uuid
import time
from urllib.error import URLError
from urllib.request import build_opener
from agaeye_device import ApiError, NoRedirect, parse_time

MAX_FRAME = 524288
FRAME_HEADERS = ('X-Frame-Captured-At', 'X-Frame-State', 'X-Frame-Posture', 'X-Frame-Airway')


def validate_jpeg(jpeg):
    if not jpeg.startswith(b'\xff\xd8') or not jpeg.endswith(b'\xff\xd9'):
        raise ValueError('Invalid preview JPEG')


def frame_time(status, now):
    at, age = status.get('wall_time_unix'), status.get('preview_age_s')
    if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in (at, age)):
        raise ValueError('Preview has no fresh timestamp')
    if not 0 <= age <= 2 or not -5 <= now - at <= 3:
        raise ValueError('Preview is stale')
    return at - age


class AlertCamera:
    def __init__(self, agent, port=8765):
        if not 1 <= port <= 65535:
            raise ValueError('Invalid local preview port')
        self.agent, self.origin = agent, 'http://127.0.0.1:%d' % port
        self.pending = {}

    def read(self, path, limit):
        return self.read_response(path, limit)[0]

    def read_response(self, path, limit):
        # Device/user tokens are never sent to the preview server, even on redirects.
        with build_opener(NoRedirect()).open(self.origin + path, timeout=1) as response:
            data = response.read(limit + 1)
            if len(data) > limit:
                raise ValueError('Preview response exceeds size limit')
            return data, response.headers

    def capture_latest(self):
        jpeg, headers = self.read_response('/frame.jpg', MAX_FRAME)
        validate_jpeg(jpeg)
        metadata = {name: headers[name] for name in FRAME_HEADERS if headers.get(name)}
        if not all(name in metadata for name in FRAME_HEADERS[:2]):
            raise ValueError('Preview is missing capture time or analysis. Update the Sky Eye runtime.')
        if not -5 <= time.time() - parse_time(metadata['X-Frame-Captured-At']) <= 3:
            raise ValueError('Preview capture is stale')
        self.agent.send_capture(metadata, jpeg)

    def fulfill(self, requests):
        now = time.time()
        # Retain the original capture briefly if an upload acknowledgment was lost.
        self.pending = {key: item for key, item in self.pending.items() if now - item[0] <= 30}
        for request in requests:
            alert = str(uuid.UUID(request['id']))
            observed = parse_time(request['observedAt'])
            if not -5 <= now - observed <= 6:
                continue
            try:
                if alert not in self.pending:
                    status = json.loads(self.read('/api/status', MAX_FRAME))
                    captured = frame_time(status, time.time())
                    if abs(captured - observed) > 5:
                        continue
                    jpeg = self.read('/frame.jpg', MAX_FRAME)
                    validate_jpeg(jpeg)
                    frame_time(status, time.time())
                    self.pending[alert] = (captured, jpeg)
                captured, jpeg = self.pending[alert]
                self.agent.send_photo(alert, datetime.fromtimestamp(captured, timezone.utc).isoformat(), jpeg)
                del self.pending[alert]
            except (URLError, OSError, ValueError, ApiError) as error:
                print('Alert photo unavailable: %s' % type(error).__name__, flush=True)
