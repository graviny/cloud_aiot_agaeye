import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, DeviceClient, normalizeApiBaseUrl, normalizePairingCode } from '../src/api/deviceClient.ts';
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

test('login and signup send only username and password', async context => {
  const requests: { url: string; body: unknown }[] = [];
  context.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    requests.push({ url, body: JSON.parse(init.body as string) });
    return response({ accessToken: 'test', refreshToken: 'refresh', username: 'agaeye.parent', email: 'contact@example.test', userId: 'same-account', emailVerified: true });
  });
  const client = new DeviceClient();
  const session = await client.authenticate('login', ' Agaeye.Parent ', 'test-password');
  assert.deepEqual(requests[0], { url: '/api/v1/auth/login', body: { username: 'agaeye.parent', password: 'test-password' } });
  assert.equal(session.username, 'agaeye.parent'); assert.equal(session.email, 'contact@example.test');
  await client.authenticate('signup', ' Agaeye.Parent ', 'test-password');
  assert.deepEqual(requests[1], { url: '/api/v1/auth/signup', body: { username: 'agaeye.parent', password: 'test-password' } });
});
test('old email login and duplicate ID feedback remain usable', async context => {
  const fetch = context.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
    assert.deepEqual(JSON.parse(init.body as string), { username: 'old@example.test', password: 'test-password' });
    return response({ accessToken: 'a', refreshToken: 'r', username: 'old', email: 'old@example.test' });
  });
  const client = new DeviceClient();
  assert.equal((await client.authenticate('login', 'OLD@example.test', 'test-password')).username, 'old');
  fetch.mock.mockImplementation(async () => response({ error: { code: 'USERNAME_UNAVAILABLE' } }, 409));
  await assert.rejects(client.authenticate('signup', 'old', 'test-password'), /이미 사용 중인 아이디/);
});

test('alert photos use user authentication and workspace scope, including refresh', async context => {
  let frames = 0;
  context.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    if (url.endsWith('/auth/login')) return response({ accessToken: 'old', refreshToken: 'r' });
    if (url.endsWith('/auth/refresh')) return response({ accessToken: 'new', refreshToken: 'r2' });
    const headers = new Headers(init.headers);
    assert.equal(headers.get('X-Workspace-Id'), 'space-a');
    assert.equal(headers.has('X-Device-Token'), false);
    assert.equal(url, '/api/v1/children/child-a/devices/device-a/alerts/alert-a/photo');
    assert.equal(headers.get('Accept'), 'image/jpeg');
    if (++frames === 1) return response({}, 401);
    assert.equal(headers.get('Authorization'), 'Bearer new');
    return new Response(new Uint8Array([255,216,255,217]), { headers: { 'Content-Type': 'image/jpeg' } });
  });
  const client = new DeviceClient(); await client.authenticate('login', 'test@example.test', 'password');
  const frame = await client.alertPhoto('space-a', 'child-a', 'device-a', 'alert-a');
  assert.equal(frame?.size, 4); assert.equal(frame?.type, 'image/jpeg');
});
test('missing photos stay empty and HTML is rejected', async context => {
  const fetch = context.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 204 }));
  const client = new DeviceClient();
  assert.equal(await client.alertPhoto('space', 'child', 'device', 'alert-a'), null);
  fetch.mock.mockImplementation(async () => new Response('<html>login</html>', { headers: { 'Content-Type': 'text/html' } }));
  await assert.rejects(client.alertPhoto('space', 'child', 'device', 'alert-a'), /사진 형식/);
});

test('latest capture returns the frame with its own analysis headers', async context => {
  const fetch = context.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    const headers = new Headers(init.headers);
    assert.equal(url, '/api/v1/children/child-a/devices/device-a/capture');
    assert.equal(headers.get('X-Workspace-Id'), 'space-a'); assert.equal(headers.get('Accept'), 'image/jpeg');
    return new Response(new Uint8Array([255,216,255,217]), { headers: { 'Content-Type': 'image/jpeg',
      'X-Frame-Captured-At': '2026-11-24T12:00:00Z', 'X-Frame-State': 'risk', 'X-Frame-Posture': 'prone' } });
  });
  const client = new DeviceClient();
  const capture = await client.latestCapture('space-a', 'child-a', 'device-a');
  assert.equal(capture?.image.size, 4);
  assert.deepEqual({ ...capture, image: undefined }, { image: undefined, capturedAt: '2026-11-24T12:00:00Z', state: 'risk', posture: 'prone', airway: null });
  fetch.mock.mockImplementation(async () => new Response(null, { status: 204 }));
  assert.equal(await client.latestCapture('space-a', 'child-a', 'device-a'), null);
  fetch.mock.mockImplementation(async () => new Response(new Uint8Array([255,216,255,217]), { headers: { 'Content-Type': 'image/jpeg', 'X-Frame-State': 'normal' } }));
  await assert.rejects(client.latestCapture('space-a', 'child-a', 'device-a'), /촬영 시각/);
  fetch.mock.mockImplementation(async () => response({ error: { code: 'NOT_FOUND' } }, 404));
  await assert.rejects(client.latestCapture('space-a', 'child-a', 'device-a'), (error: unknown) => error instanceof ApiError && error.status === 404);
});
test('login accepts origin or API base without duplicating /api/v1', async context => {
  const urls: string[] = [];
  context.mock.method(globalThis, 'fetch', async (url: string) => { urls.push(url); return response({ accessToken: 'a', refreshToken: 'r' }); });
  for (const base of ['https://api.example', 'https://api.example/', ' https://api.example/api/v1/ ', 'https://api.example/api']) await new DeviceClient(base).authenticate('login', 'test@example.test', 'password');
  assert.deepEqual(urls, Array(4).fill('https://api.example/api/v1/auth/login'));
  assert.equal(normalizeApiBaseUrl('/api/v1'), '');
  assert.equal(normalizeApiBaseUrl('https://api.example/service/api/v1'), 'https://api.example/service');
});
test('missing login route is identified as a server configuration error', async context => {
  context.mock.method(globalThis, 'fetch', async () => new Response('Not Found', { status: 404 }));
  await assert.rejects(new DeviceClient().authenticate('login', 'test@example.test', 'password'), (error: unknown) => error instanceof ApiError && error.code === 'API_ROUTE_NOT_FOUND');
});
test('failed refresh expires the shared account once, without affecting ordinary login errors', async context => {
  let expired = 0;
  context.mock.method(globalThis, 'fetch', async (url: string) => url.endsWith('/auth/login') ? response({ accessToken: 'a', refreshToken: 'r' }) : response({}, 401));
  const client = new DeviceClient(); client.onSessionExpired = () => expired++;
  await client.authenticate('login', 'test@example.test', 'password');
  await assert.rejects(client.children('workspace'), ApiError); assert.equal(expired, 1);
  await assert.rejects(client.authenticate('signup', 'test@example.test', 'password'), ApiError); assert.equal(expired, 1);
});

test('pairing codes normalize pasted links codes but reject ambiguous or malformed values', () => {
  assert.equal(normalizePairingCode(' abcd 2345 '), 'ABCD-2345');
  for (const invalid of ['ABCD-1234', 'ABCD-I234', 'ABCD-O234', '', 'ABCD-23456']) assert.throws(() => normalizePairingCode(invalid));
});
test('approval keeps child scope and idempotency key; never calls a device credential endpoint', async context => {
  const requests: { url: string; init: RequestInit }[] = [];
  context.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => { requests.push({ url, init }); return response({ status: 'approved' }); });
  const client = new DeviceClient('https://api.example/');
  await client.approve('workspace-a', 'child-b', 'abcd2345', 'Camera', 'stable-key');
  const { url, init } = requests[0];
  assert.equal(url, 'https://api.example/api/v1/device-pairings/approve');
  assert.equal(new Headers(init.headers).get('X-Workspace-Id'), 'workspace-a');
  assert.equal(new Headers(init.headers).get('Idempotency-Key'), 'stable-key');
  assert.equal(new Headers(init.headers).has('X-Device-Token'), false);
  assert.deepEqual(JSON.parse(String(init.body)), { code: 'ABCD-2345', childId: 'child-b', name: 'Camera' });
  assert.equal(init.credentials, 'omit');
});
test('concurrent expired requests share refresh and retain their original workspace', async context => {
  let refreshes = 0;
  const scopes: string[] = [];
  context.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    if (url.endsWith('/auth/login')) return response({ accessToken: 'old', refreshToken: 'refresh' });
    if (url.endsWith('/auth/refresh')) { refreshes++; await new Promise(resolve => setTimeout(resolve, 5)); return response({ accessToken: 'new', refreshToken: 'rotated' }); }
    const headers = new Headers(init.headers);
    if (headers.get('Authorization') === 'Bearer old') return response({}, 401);
    assert.equal(headers.get('Authorization'), 'Bearer new'); scopes.push(headers.get('X-Workspace-Id')!);
    return response({ items: [] });
  });
  const client = new DeviceClient(); await client.authenticate('login', 'synthetic@example.test', 'test-password');
  await Promise.all([client.children('first'), client.children('second')]);
  assert.equal(refreshes, 1); assert.deepEqual(scopes.sort(), ['first', 'second']);
});
test('failed refresh clears credentials and does not retry a mutation', async context => {
  let approvals = 0;
  context.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    if (url.endsWith('/auth/login')) return response({ accessToken: 'old', refreshToken: 'refresh' });
    if (url.endsWith('/auth/refresh')) return response({ error: { code: 'INVALID_REFRESH_TOKEN' } }, 401);
    if (url.endsWith('/approve')) { approvals++; return response({}, 401); }
    assert.equal(new Headers(init.headers).has('Authorization'), false); return response({ items: [] });
  });
  const client = new DeviceClient(); await client.authenticate('login', 'synthetic@example.test', 'test-password');
  await assert.rejects(client.approve('ws', 'child', 'ABCD2345', 'Camera', 'key'), ApiError);
  assert.equal(approvals, 1); await client.workspaces();
});
test('API errors, offline requests and non-API HTML cannot become a successful pairing', async context => {
  const mock = context.mock.method(globalThis, 'fetch', async () => response({ error: { code: 'PAIRING_EXPIRED' } }, 409));
  const client = new DeviceClient();
  await assert.rejects(client.inspect('ws', 'ABCD2345'), (error: unknown) => error instanceof ApiError && error.code === 'PAIRING_EXPIRED');
  mock.mock.mockImplementation(async () => { throw new TypeError('offline'); });
  await assert.rejects(client.inspect('ws', 'ABCD2345'), /서버에 연결하지/);
  mock.mock.mockImplementation(async () => new Response('<html>SPA fallback</html>'));
  await assert.rejects(client.inspect('ws', 'ABCD2345'), /API 주소/);
});
test('unlink uses the selected workspace and an encoded device path', async context => {
  context.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => { assert.equal(url, '/api/v1/devices/device%2Fid'); assert.equal(init.method, 'DELETE'); assert.equal(new Headers(init.headers).get('X-Workspace-Id'), 'ws'); return response({ unlinked: true }); });
  await new DeviceClient().unlink('ws', 'device/id');
});
test('late refresh cannot restore a cleared login session', async context => {
  let finishRefresh!: (response: Response) => void;
  let started!: () => void;
  const refreshing = new Promise<void>(resolve => { started = resolve; });
  context.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    if (url.endsWith('/auth/login')) return response({ accessToken: 'old', refreshToken: 'refresh' });
    if (url.endsWith('/auth/refresh')) { started(); return new Promise<Response>(resolve => { finishRefresh = resolve; }); }
    const auth = new Headers(init.headers).get('Authorization');
    if (auth === 'Bearer old') return response({}, 401);
    assert.equal(auth, null); return response({ items: [] });
  });
  const client = new DeviceClient(); await client.authenticate('login', 'synthetic@example.test', 'test-password');
  const pending = client.children('ws'); const rejected = assert.rejects(pending, ApiError);
  await refreshing; client.clear(); finishRefresh(response({ accessToken: 'late', refreshToken: 'late-refresh' }));
  await rejected; await client.workspaces();
});
test('alert acknowledgement is saved for the signed-in caregiver in the workspace', async context => {
  const calls: { url: string; method?: string; workspace: string | null; auth: string | null }[] = [];
  context.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    if (url.endsWith('/auth/login')) return response({ accessToken: 'token', refreshToken: 'r' });
    const headers = new Headers(init.headers);
    calls.push({ url, method: init.method, workspace: headers.get('X-Workspace-Id'), auth: headers.get('Authorization') });
    return response({ id: 'alert-a', acknowledgedAt: '2026-11-25T00:00:10Z', duplicate: false });
  });
  const client = new DeviceClient(); await client.authenticate('login', 'test@example.test', 'password');
  const saved = await client.acknowledgeAlert('space-a', 'child-a', 'device-a', 'alert-a');
  assert.deepEqual(calls, [{ url: '/api/v1/children/child-a/devices/device-a/alerts/alert-a/acknowledgement', method: 'POST', workspace: 'space-a', auth: 'Bearer token' }]);
  assert.equal(saved.acknowledgedAt, '2026-11-25T00:00:10Z');
});
