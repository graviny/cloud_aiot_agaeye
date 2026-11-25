import test from 'node:test';
import assert from 'node:assert/strict';
import { captureSummary, connectionLabel, currentSnapshot, listAlerts, eventLabel, pendingSecondAlerts, riskProgress, type SkySnapshot } from '../src/skyEye.ts';

function fixture(): SkySnapshot {
  const at = '2026-11-01T00:00:00Z';
  return { childId: 'child-a', serverTime: at, items: [{ deviceId: 'pi-a', name: '아가아이', connected: true,
    status: { observedAt: at, video: { available: true, observedAt: at, posture: 'supine', airway: 'airway_visible', state: 'normal', geometryValid: false, fallState: 'unavailable', fps: 4 } },
    safety: { posture: 'stable', face: 'stable', objects: 'unknown', edge: 'unknown' }, events: [{ recent: true, event: { id: 'event-a', episodeKey: 'source-a:episode-a', kind: 'risk_ended', riskType: 'prone', observedAt: at, episodeUid: null, endReason: null } }] }] };
}
test('fresh observations survive a skewed client clock but expire without a response', () => {
  const snapshot = fixture(); const received = 100;
  assert.equal(currentSnapshot(snapshot, received, 1100)?.items[0].safety.posture, 'stable');
  const expired = currentSnapshot(snapshot, received, 9100)!.items[0];
  assert.equal(expired.safety.posture, 'unknown'); assert.equal(expired.status.video.available, false);
  assert.equal(currentSnapshot(snapshot, received, 16100)?.items[0].connected, false);
  assert.equal(snapshot.items[0].safety.posture, 'stable');
});
test('old events stop appearing as recent and model end is not caregiver resolution', () => {
  const snapshot = fixture();
  assert.equal(currentSnapshot(snapshot, 0, 31000)?.items[0].events[0].recent, false);
  assert.match(eventLabel(snapshot.items[0].events[0].event), /모델 위험 구간 종료/);
  assert.equal(currentSnapshot(null, 0, 0), null);
});
test('alerts retain their own photo and capture time after inference expires', () => {
  const snapshot = fixture();
  assert.match(connectionLabel({ connected: false, reportState: 'awaiting_sender' }), /파이 실행 대기/);
  snapshot.items[0].alerts = [
    { id: 'older', field: 'posture', level: 'immediate', observedAt: snapshot.serverTime, capturedAt: snapshot.serverTime },
    { id: 'newer', field: 'face', level: 'unknown', observedAt: '2026-11-01T00:01:00Z', capturedAt: null }
  ];
  const results = listAlerts(currentSnapshot(snapshot, 0, 60000));
  assert.deepEqual(results.map(({ alert }) => [alert.id, alert.capturedAt]), [['newer', null], ['older', snapshot.serverTime]]);
});
test('periodic capture results describe that frame and unknown states are not reported as normal', () => {
  assert.deepEqual(captureSummary({ state: 'risk', posture: 'prone', airway: 'airway_covered' }), { label: '위험 의심', tone: 'red', details: '엎드림 · 코·입 가림' });
  assert.deepEqual(captureSummary({ state: 'normal', posture: 'supine', airway: null }), { label: '관측 정상', tone: 'green', details: '바로 누움' });
  assert.deepEqual(captureSummary({ state: 'unexpected', posture: null, airway: null }), { label: '판정 불가', tone: 'gray', details: '' });
});
test('risk progress shows the longest lasting condition only while the camera can see', () => {
  const device = fixture().items[0];
  device.status.video.riskElapsed = { prone: 3.7, faceCovered: 1.2 };
  assert.deepEqual(riskProgress(device), { label: '엎드림', seconds: 3, text: '엎드림 3초째 · 5초가 이어지면 알림' });
  device.status.video.riskElapsed = { prone: 0.4, faceCovered: 6.2 };
  assert.equal(riskProgress(device)?.text, '얼굴 가림 6초째 이어지는 중');
  device.status.video.riskElapsed = { prone: 0.4, faceCovered: null };
  assert.equal(riskProgress(device), null);
  device.status.video.riskElapsed = { prone: 3, faceCovered: 0 };
  device.status.video.available = false;
  assert.equal(riskProgress(device), null);
});
test('posture changes name both postures and second alerts wait for acknowledgement', () => {
  const change = { id: 'event-b', episodeKey: 'b', kind: 'posture_changed', riskType: null, observedAt: '2026-11-01T00:00:00Z', episodeUid: null, endReason: null };
  assert.equal(eventLabel({ ...change, previousPosture: 'supine', currentPosture: 'side' }), '바로 누움 → 옆으로 누움 · 자세 변경');
  assert.equal(eventLabel(change), '관측 · 자세 변경');
  const snapshot = fixture();
  const at = snapshot.serverTime;
  snapshot.items[0].alerts = [
    { id: 'due', field: 'posture', level: 'immediate', observedAt: at, capturedAt: null, secondAlertAt: '2026-11-01T00:00:15Z', acknowledgedAt: null },
    { id: 'answered', field: 'face', level: 'immediate', observedAt: at, capturedAt: null, secondAlertAt: '2026-11-01T00:00:15Z', acknowledgedAt: '2026-11-01T00:00:20Z' },
    { id: 'recent', field: 'posture', level: 'immediate', observedAt: at, capturedAt: null, secondAlertAt: null },
  ];
  assert.deepEqual(pendingSecondAlerts(snapshot).map(({ alert }) => alert.id), ['due']);
});
