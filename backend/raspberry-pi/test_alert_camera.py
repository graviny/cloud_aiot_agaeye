import json
import time
import unittest
import uuid
from datetime import datetime, timezone
from unittest.mock import Mock, patch
from urllib.error import URLError
from alert_camera import AlertCamera, frame_time


class AlertCameraTests(unittest.TestCase):
    def setUp(self):
        self.agent = Mock()
        self.camera = AlertCamera(self.agent)
        self.now = time.time()
        self.alert = {'id': str(uuid.uuid4()), 'observedAt': datetime.fromtimestamp(self.now, timezone.utc).isoformat()}
        self.status = json.dumps({'wall_time_unix': self.now, 'preview_age_s': .1}).encode()
        self.jpeg = b'\xff\xd8fixture\xff\xd9'

    def test_quiet_and_replayed_alerts_never_open_the_camera(self):
        old = dict(self.alert, observedAt='2020-01-01T00:00:00Z')
        with patch.object(self.camera, 'read') as read:
            self.camera.fulfill([])
            self.camera.fulfill([old])
            read.assert_not_called()
        self.agent.send_photo.assert_not_called()

    def test_network_retry_uses_the_original_photo(self):
        self.agent.send_photo.side_effect = [URLError('offline'), {}]
        with patch.object(self.camera, 'read', side_effect=[self.status, self.jpeg]) as read:
            self.camera.fulfill([self.alert])
            self.camera.fulfill([self.alert])
            self.assertEqual([call.args[0] for call in read.call_args_list], ['/api/status', '/frame.jpg'])
        attempts = self.agent.send_photo.call_args_list
        self.assertEqual(len(attempts), 2)
        self.assertEqual(attempts[0], attempts[1])
        self.assertEqual(attempts[0].args[0], self.alert['id'])

    def test_unavailable_camera_leaves_alert_without_an_image(self):
        with patch.object(self.camera, 'read', side_effect=OSError('no frame')):
            self.camera.fulfill([self.alert])
        self.agent.send_photo.assert_not_called()
        with self.assertRaises(ValueError):
            frame_time({'wall_time_unix': self.now, 'preview_age_s': 10}, self.now)

    def test_periodic_upload_uses_metadata_from_the_jpeg_response(self):
        headers = {'X-Frame-Captured-At': self.alert['observedAt'], 'X-Frame-State': 'risk',
                   'X-Frame-Posture': 'prone', 'Unrelated': 'ignored'}
        with patch.object(self.camera, 'read_response', return_value=(self.jpeg, headers)) as read:
            self.camera.capture_latest()
        read.assert_called_once_with('/frame.jpg', 524288)
        del headers['Unrelated']
        self.agent.send_capture.assert_called_once_with(headers, self.jpeg)

    def test_periodic_upload_skips_missing_metadata_or_an_old_frame(self):
        for headers in ({}, {'X-Frame-Captured-At': '2020-01-01T00:00:00Z', 'X-Frame-State': 'normal'}):
            with patch.object(self.camera, 'read_response', return_value=(self.jpeg, headers)):
                with self.assertRaises(ValueError):
                    self.camera.capture_latest()
        self.agent.send_capture.assert_not_called()
