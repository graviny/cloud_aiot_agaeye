import test from 'node:test';
import assert from 'node:assert/strict';
import { DeviceClient, ApiError } from '../src/api/deviceClient.ts';
import { applySavedCare, careChanges, legacyCareChanges, loadCareRecords, routineFromServer, routineToServer } from '../src/careHistory.ts';
import { demoData, emptyData, type AppData, type Routine } from '../src/domain.ts';
const child = '6d592c46-0739-426c-9de9-8199c6dc395e';
const routine: Routine = { id: 'e7e25ee8-bebe-4848-91ca-204e91aa57d5', childId: child, type: 'sleep', title: '밤잠 계획', date: '2026-10-31', time: '23:00', endTime: '06:00', status: 'todo' };
const data = (): AppData => ({ ...emptyData(), child: { id: child, name: '테스트', birthDate: '2026-01-01' } });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

test('night routines preserve Seoul dates through UTC storage and versioned edits', () => {
  const body = routineToServer(routine);
  assert.equal(body.scheduledAt, '2026-10-31T14:00:00.000Z'); assert.equal(body.endedAt, '2026-10-31T21:00:00.000Z');
  const restored = routineFromServer({ ...body, childId: child, version: 3 });
  assert.equal(restored.date, '2026-10-31'); assert.equal(restored.endDate, '2026-11-01');
  assert.equal(restored.time, '23:00'); assert.equal(restored.endTime, '06:00');
  assert.deepEqual(routineToServer(restored), { ...body, version: 3 });
  assert.throws(() => routineToServer({ ...routine, time: '' }), /시간/);
});
test('history loads all sleep pages and never requests removed cry collections', async context => {
  const kinds: string[] = [];
  context.mock.method(globalThis, 'fetch', async (url: string) => {
    const query = new URL(url, 'http://localhost').searchParams; const kind = query.get('kind')!; kinds.push(kind);
    if (kind === 'routines') return json({ items: [], nextCursor: null });
    const second = query.has('cursor');
    return json({ items: [{ id: second ? 'older' : 'latest', childId: child, startedAt: '2026-10-31T23:00:00Z', endedAt: '2026-11-01T00:00:00Z' }], nextCursor: second ? null : 'page-two' });
  });
  const records = await loadCareRecords(new DeviceClient(), 'workspace', child);
  assert.equal(records.sleepRecords.length, 2); assert.deepEqual([...new Set(kinds)].sort(), ['routines', 'sleepRecords']);
});

test('partial failure and stale account responses cannot replace the saved snapshot', async context => {
  context.mock.method(globalThis, 'fetch', async (url: string) => url.includes('kind=sleepRecords') ? json({ error: { code: 'OFFLINE' } }, 503) : json({ items: [], nextCursor: null }));
  await assert.rejects(loadCareRecords(new DeviceClient(), 'workspace', child));
  await assert.rejects(loadCareRecords(new DeviceClient(), 'workspace', child, () => false), /취소/);
});
test('write changes contain only this child, carry versions, and isolate child records', () => {
  const previous = { ...data(), routines: [{ ...routine, version: 3 }] };
  const next = { ...previous, routines: [{ ...routine, version: 3, status: 'done' as const }] };
  const changes = careChanges(previous, next); assert.equal(changes.routines[0].version, 3);
  assert.deepEqual(careChanges(previous, { ...previous, routines: [] }).deletedRoutines, [{ id: routine.id, version: 3 }]);
  assert.throws(() => careChanges(previous, { ...next, routines: [{ ...routine, version: 2 }] }), /바뀌었/);
  assert.throws(() => careChanges(previous, { ...next, routines: [{ ...routine, version: 3, childId: 'other' }] }), /다른 아이/);
  const saved = applySavedCare(next, { routines: [{ ...changes.routines[0], childId: child, version: 4 }], sleepRecords: [] });
  assert.equal(saved.routines[0].version, 4);
});
test('legacy migration excludes demos, another child, server records and confirmed deletions', () => {
  const previous = { ...data(), routines: [routine, { ...routine, id: 'r1' }, { ...routine, id: crypto.randomUUID(), childId: 'other' }, { ...routine, id: crypto.randomUUID(), version: 1 }] };
  const records = { routines: [], sleepRecords: [] };
  assert.deepEqual(legacyCareChanges(previous, records).routines.map(r => r.id), [routine.id]);
  assert.equal(legacyCareChanges(previous, { ...records, routines: [{ ...routine, version: 1 }] }).routines.length, 0);
  assert.throws(() => legacyCareChanges(demoData(), records));
});
test('save request is scoped and repeatable after network uncertainty', async context => {
  const requests: RequestInit[] = [];
  context.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.equal(url, `/api/v1/children/${child}/care-history`); requests.push(init);
    if (requests.length === 1) throw new TypeError('Network unavailable');
    return json({ routines: [], sleepRecords: [] });
  });
  const client = new DeviceClient(), changes = careChanges(data(), { ...data(), routines: [routine] });
  await assert.rejects(client.saveCareHistory('workspace', child, changes, 'same-key'));
  await client.saveCareHistory('workspace', child, changes, 'same-key');
  assert.deepEqual(requests[0].body, requests[1].body);
  assert.equal(new Headers(requests[1].headers).get('Idempotency-Key'), 'same-key');
  assert.equal(new Headers(requests[1].headers).get('X-Workspace-Id'), 'workspace');
});
test('late unauthorized response from the old session cannot expire the new login', async context => {
  let finish!: (value: Response) => void;
  context.mock.method(globalThis, 'fetch', async (url: string) => url.endsWith('/auth/login') ? json({ accessToken: 'new', refreshToken: 'r' }) : new Promise<Response>(resolve => { finish = resolve; }));
  const client = new DeviceClient(); let expired = false; client.onSessionExpired = () => { expired = true; };
  const pending = client.careHistory('workspace', child, 'sleepRecords');
  await client.authenticate('login', 'test@example.test', 'test'); finish(json({}, 401));
  await assert.rejects(pending, (e: unknown) => e instanceof ApiError && e.code === 'SESSION_CHANGED');
  assert.equal(expired, false);
});
