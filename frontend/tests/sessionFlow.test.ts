import test from 'node:test';
import assert from 'node:assert/strict';
import { authContinuation, authModeRoute, deviceLoginRoute, previewAccount, routeRedirect, withServerChild } from '../src/sessionFlow.ts';
import { demoData, emptyData } from '../src/domain.ts';

test('guests and preview sessions must log in before opening device connections', () => {
  assert.equal(routeRedirect('/devices', null, false, emptyData()), '/login?next=/devices');
  assert.equal(routeRedirect('/devices', 'demo', false, demoData()), '/login?next=/devices');
  assert.equal(routeRedirect('/devices', 'parent@example.test', true, emptyData()), null);
  assert.equal(previewAccount('parent@example.test'), null);
  assert.equal(previewAccount('demo'), 'demo');
});
test('QR code and destination survive login, signup switching and a reload of the auth URL', () => {
  const login = new URL(deviceLoginRoute('#code=abcd2345'), 'https://agaeye.example');
  assert.equal(login.pathname, '/login');
  const signup = new URL(authModeRoute('signup', login.search, login.hash), login.origin);
  assert.equal(authContinuation(signup.search, signup.hash), '/devices#code=ABCD-2345');
  assert.equal(routeRedirect('/login', 'parent@example.test', true, emptyData(), login.search, login.hash), '/devices#code=ABCD-2345');
});
test('auth continuation cannot become an external redirect or carry arbitrary fragment secrets', () => {
  for (const next of ['https://other.example', '//other.example', '/devices/../other', '/devices?token=x']) assert.equal(authContinuation('?next=' + encodeURIComponent(next), '#code=ABCD2345'), null);
  assert.equal(authContinuation('?next=/devices', '#accessToken=secret'), '/devices');
  assert.equal(authContinuation('?next=/devices', '#code=INVALID'), '/devices');
});
test('regular onboarding stays available and existing users can return to the app', () => {
  const data = emptyData();
  assert.equal(routeRedirect('/home', 'parent@example.test', true, data), '/onboarding/child');
  assert.equal(routeRedirect('/onboarding/child', 'parent@example.test', true, data), null);
  assert.equal(routeRedirect('/login', 'demo', false, demoData()), null);
  assert.equal(routeRedirect('/login', 'parent@example.test', true, demoData()), '/home');
  assert.equal(routeRedirect('/more', null, false, data), '/welcome');
});
test('server child selection never transfers demo records or another child history', () => {
  const serverChild = { id: 'real-child', displayName: '실제 아이', birthDate: '2026-01-01', capabilities: ['child:read'] };
  const data = withServerChild(demoData(), serverChild);
  assert.equal(data.child?.id, 'real-child'); assert.equal(data.child?.name, '실제 아이'); assert.equal(data.demo, false);
  assert.equal(data.sleepRecords.length, 0); assert.equal(data.routines.length, 0); assert.equal(data.alert, null);
  data.child!.photoUrl = 'local-photo';
  assert.equal(withServerChild(data, { ...serverChild, displayName: '수정한 이름' }).child?.photoUrl, 'local-photo');
  assert.equal(withServerChild(data, null).child, null);
});
