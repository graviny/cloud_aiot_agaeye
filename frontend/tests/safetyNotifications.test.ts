import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceSafetyNotices as advance, currentSafetyNotices, type SafetyNotice } from '../src/safetyNotifications.ts';
import type { SkyDevice } from '../src/skyEye.ts';

const notice = (level: SafetyNotice['level'], field: SafetyNotice['field'] = 'posture'): SafetyNotice => ({key: field, deviceName: 'agaeye', field, level});
const device = (): SkyDevice => ({
  deviceId: 'pi', name: 'agaeye', connected: true, reportState: 'receiving',
  status: {observedAt: '', video: {available: true, observedAt: '', posture: 'prone', airway: 'covered', state: 'ready', geometryValid: true, fallState: null, fps: 2}},
  safety: {posture: 'immediate', face: 'immediate', objects: 'stable', edge: 'stable'}, events: [],
});

test('current posture and face risks announce together without risk events', () => {
  const result = advance({}, currentSafetyNotices([device()]), 0);
  assert.deepEqual(result.notices.map(item => item.field), ['posture', 'face']);
  assert.equal(advance(result.state, currentSafetyNotices([device()]), 30000).notices.length, 0);
});
test('unknown needs ten seconds, normal never announces', () => {
  let result = advance({}, [notice('unknown'), notice('stable', 'face')], 0);
  assert.equal(result.notices.length, 0);
  result = advance(result.state, [notice('unknown')], 9999);
  assert.equal(result.notices.length, 0);
  result = advance(result.state, [notice('unknown')], 10000);
  assert.equal(result.notices.length, 1);
  assert.equal(advance(result.state, [notice('unknown')], 60000).notices.length, 0);
});
test('escalation announces but lower or equal severity does not repeat', () => {
  let result = advance({}, [notice('caution')], 0);
  assert.equal(result.notices.length, 1);
  result = advance(result.state, [notice('immediate')], 1);
  assert.equal(result.notices.length, 1);
  result = advance(result.state, [notice('caution')], 2);
  assert.equal(result.notices.length, 0);
  result = advance(result.state, [notice('unknown')], 3);
  assert.equal(advance(result.state, [notice('unknown')], 20000).notices.length, 0);
});
test('brief normal flicker does not rearm; ten seconds normal does', () => {
  let result = advance({}, [notice('immediate')], 0);
  result = advance(result.state, [notice('stable')], 1000);
  result = advance(result.state, [notice('stable')], 10000);
  result = advance(result.state, [notice('immediate')], 10001);
  assert.equal(result.notices.length, 0);
  result = advance(result.state, [notice('stable')], 11000);
  result = advance(result.state, [notice('stable')], 21000);
  assert.equal(advance(result.state, [notice('immediate')], 21001).notices.length, 1);
});
test('disconnection breaks both timers without forgetting announced conditions', () => {
  let result = advance({}, [notice('unknown')], 0);
  result = advance(result.state, [], 5000);
  result = advance(result.state, [notice('unknown')], 60000);
  assert.equal(result.notices.length, 0);
  result = advance(result.state, [notice('immediate')], 60001);
  result = advance(result.state, [notice('stable')], 60002);
  result = advance(result.state, [], 60003);
  result = advance(result.state, [notice('stable')], 90000);
  assert.equal(advance(result.state, [notice('immediate')], 90001).notices.length, 0);
});
test('offline and waiting devices are excluded, stale video is unknown', () => {
  for (const reportState of ['awaiting_sender', 'awaiting_model', 'offline'] as const) {
    assert.deepEqual(currentSafetyNotices([{...device(), reportState}]), []);
  }
  assert.deepEqual(currentSafetyNotices([{...device(), connected: false}]), []);
  const pi = device(); pi.status.video.available = false;
  assert.deepEqual(currentSafetyNotices([pi]).map(item => item.level), ['unknown', 'unknown']);
});
test('different devices retain independent suppression', () => {
  const first = device(), second = {...device(), deviceId: 'pi-2'};
  const result = advance({}, currentSafetyNotices([first]), 0);
  assert.equal(advance(result.state, currentSafetyNotices([first, second]), 1).notices.length, 2);
});
