import copy
import hashlib
import json
from pathlib import Path
import tempfile
import time
import unittest
import uuid
from unittest.mock import Mock, patch
from urllib.error import URLError
from agaeye_device import Agent, AgentLock
from sky_eye_bridge import Bridge, map_status, map_event, timestamp


def status(now):
    return {'schema_version': 'sky-eye.status.v1', 'wall_time_unix': now,
        'video': {'available': True, 'data': {'wall_time_unix': now, 'posture_state': 'normal',
            'posture': {'valid': True, 'posture': 'supine', 'airway': 'airway_visible', 'body': {'conf': .9}, 'face': {'conf': .8}},
            'geometry_valid': False, 'fall': {'state': 'monitoring', 'observation_valid': True}, 'temperature_c': 75}},
        'audio': {'available': True, 'data': {'wall_time_unix': now, 'running': True, 'cry_detected': True, 'baby_cry_score': .4}},
        'personalization': {'simulation': False, 'state': 'ready', 'n_feedback': 10, 'required_feedback': 10,
            'cry_windows': 10, 'required_cry_windows': 10, 'sound_on': False,
            'recommendations': [{'action': 'hold', 'score': .6}], 'recent_episodes': []}}


def event(now, key='1'):
    return {'schema_version': 'sky-eye.event.v1', 'id': hashlib.sha256(key.encode()).hexdigest(),
        'source': '20261101-010000/events.jsonl', 'source_event_id': 'episode-1', 'kind': 'risk_started',
        'wall_time_unix': now, 'payload': {'branch': 'posture', 'risk_type': 'prone', 'ts': 105, 'started_at': 100}}


class MappingTests(unittest.TestCase):
    def test_freshness_validity_and_no_cpu_temperature_as_room_sensor(self):
        now = time.time(); source = status(now)
        result = map_status(source, now)
        self.assertTrue(result['video']['available'])
        self.assertFalse(result['video']['geometryValid'])
        self.assertNotIn('temperature', json.dumps(result))
        self.assertFalse(map_status(source, now + 10)['video']['available'])
        self.assertNotIn('personalization', map_status(source, now + 10))
        source['video']['data']['posture']['valid'] = False
        self.assertFalse(map_status(source, now)['video']['available'])
        self.assertNotIn('audio', map_status(source, now))


    def test_risk_elapsed_time_is_forwarded_only_for_a_fresh_observation(self):
        now = time.time(); source = status(now)
        source['video']['data']['risk_elapsed_s'] = {'prone': 3.2, 'face_covered': 0.0}
        self.assertEqual(map_status(source, now)['video']['riskElapsed'], {'prone': 3.2, 'faceCovered': 0.0})
        source['video']['data']['risk_elapsed_s'] = {'prone': -1, 'face_covered': 'x'}
        self.assertEqual(map_status(source, now)['video']['riskElapsed'], {'prone': None, 'faceCovered': None})
        self.assertIsNone(map_status(source, now + 10)['video']['riskElapsed'])

    def test_posture_change_carries_both_postures_and_other_events_keep_their_shape(self):
        now = time.time(); source = event(now)
        self.assertNotIn('previousPosture', map_event(source))
        source['kind'] = 'posture_changed'
        source['payload'] = {'branch': 'posture', 'ts': 105, 'previous': 'supine', 'current': 'side'}
        change = map_event(source)
        self.assertEqual((change['previousPosture'], change['currentPosture']), ('supine', 'side'))
        source['payload']['current'] = 'upside_down'
        self.assertIsNone(map_event(source)['currentPosture'])

    def test_cry_events_are_ignored_even_from_legacy_model_output(self):
        source = event(time.time())
        for kind in ('cry_started', 'cry_ended', 'cry_candidate_started', 'cry_episode_ended'):
            source['kind'] = kind
            self.assertIsNone(map_event(source))
        source['kind'] = 'risk_started'; source['payload']['risk_type'] = 'cry'
        self.assertIsNone(map_event(source))

    def test_monotonic_times_and_episode_keys(self):
        now = time.time(); source = event(now)
        start = map_event(source)
        self.assertEqual(start['startedAt'], timestamp(now - 5))
        source['kind'] = 'risk_ended'; source['id'] = '2' * 64; source['payload']['ended_at'] = 104
        end = map_event(source)
        self.assertEqual(end['episodeKey'], start['episodeKey'])
        self.assertEqual(end['endedAt'], timestamp(now - 1))
        source['payload']['simulation'] = True
        self.assertIsNone(map_event(source))


class DeliveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / 'model'; (self.root / 'output').mkdir(parents=True)
        self.agent = Agent('https://api.example.test', Path(self.temp.name) / 'state')
        self.agent.credential = {'deviceId': 'device-a', 'accessToken': 'fixture'}
        self.bridge = Bridge(self.agent, self.root)

    def test_network_failure_does_not_advance_cursor_and_partial_line_waits(self):
        first = json.dumps(event(time.time())).encode() + b'\n'
        path = self.root / 'output/events.jsonl'; path.write_bytes(first + b'{')
        with patch.object(self.agent, 'request', side_effect=URLError('offline')):
            with self.assertRaises(URLError): self.bridge.events()
        self.assertIsNone(self.agent.read('bridge-cursor.json'))
        with patch.object(self.agent, 'request', return_value={}) as call:
            self.bridge.events(); self.bridge.events()
        self.assertEqual(call.call_count, 1)
        self.assertEqual(self.agent.read('bridge-cursor.json')['offset'], len(first))
        # Replacing/truncating a file resets the cursor; server IDs deduplicate old lines.
        path.write_bytes(json.dumps(event(time.time(), '2')).encode() + b'\n')
        with patch.object(self.agent, 'request', return_value={}) as call:
            Bridge(self.agent, self.root).events()
        self.assertEqual(call.call_count, 1)


    def test_single_owner_prevents_token_rotation_race(self):
        with AgentLock(self.agent.state_dir):
            with self.assertRaises(ValueError):
                with AgentLock(self.agent.state_dir): pass

    def test_reassignment_does_not_upload_previous_child_profile_or_logs(self):
        self.bridge.bind()
        self.agent.credential['deviceId'] = 'new-child-binding'
        with self.assertRaises(ValueError): self.bridge.bind()

    def test_periodic_worker_continues_after_network_failure_without_replaying_a_frame(self):
        stop = Mock()
        stop.is_set.side_effect = [False, False, True]
        self.bridge.camera = Mock()
        self.bridge.camera.capture_latest.side_effect = [URLError('offline'), None]
        with patch('sky_eye_bridge.time.monotonic', side_effect=[0, 1, 4, 9]):
            self.bridge.upload_captures(4, stop)
        self.assertEqual(self.bridge.camera.capture_latest.call_count, 2)
        self.assertEqual([call.args for call in stop.wait.call_args_list], [(3,), (0,)])


if __name__ == '__main__': unittest.main()
