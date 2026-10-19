// Protocol fixture only: no model, camera, Python dependencies, or real baby images.
import { createServer } from 'node:http';

const port = Number(process.env.AGAEYE_FIXTURE_PORT || 8011);
const clients = new Set();
let status = null;
let events = [];
let rejectAck = false;
const now = () => Date.now() / 1000;
const json = (res, value, code = 200) => {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(value));
};
const publish = value => clients.forEach(client => client.write(`data: ${JSON.stringify(value)}\n\n`));
const makeStatus = patch => ({
  device_id: 'crib-01', online: true, last_seen: now(), ts: now(),
  status: 'normal', reason: '', posture: 'supine', airway: 'airway_visible', active_event_id: null, ...patch,
});
const makeEvent = (id, secondsAgo) => ({
  event_id: id, device_id: 'crib-01', risk_type: 'prone', started_at: now() - secondsAgo - 5,
  confirmed_at: now() - secondsAgo, ended_at: null, acked: false, acked_at: null,
  status: 'active', has_snapshot: true,
});
const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  if (url.pathname === '/_test/reset') {
    status = null; events = []; rejectAck = false; return json(res, { ok: true });
  }
  if (url.pathname === '/_test/scenario') {
    const name = url.searchParams.get('name');
    if (name === 'normal') status = makeStatus({});
    if (name === 'danger') {
      status = makeStatus({ status: 'risk', reason: 'prone', posture: 'prone', active_event_id: 'current-risk' });
      // Put another unresolved event first: the UI must use active_event_id, not array order.
      events = [makeEvent('unrelated-pending', 0), makeEvent('current-risk', 10)];
      events.forEach(event => publish({ type: 'event', event }));
    }
    if (name === 'stale') status = makeStatus({ ts: now() - 60 });
    if (name === 'end') {
      events = events.map(event => ({ ...event, status: 'ended', ended_at: now() }));
      events.forEach(event => publish({ type: 'event', event }));
      status = makeStatus({});
    }
    if (name === 'reject-ack') rejectAck = true;
    if (status) publish({ type: 'device', device: status });
    return json(res, { ok: true });
  }
  if (url.pathname === '/health') return json(res, { fixture: true });
  if (url.pathname === '/devices/crib-01/status') return status ? json(res, status) : json(res, {}, 404);
  if (url.pathname === '/events') return json(res, events);
  if (url.pathname.endsWith('/snapshot')) {
    // A plain one-pixel PNG exercises image loading; it is not a camera snapshot.
    res.writeHead(200, { 'Content-Type': 'image/png' });
    return res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1ioAAAAASUVORK5CYII=', 'base64'));
  }
  if (url.pathname.endsWith('/ack') && req.method === 'POST') {
    if (rejectAck) return json(res, {}, 500);
    const id = decodeURIComponent(url.pathname.split('/')[2]);
    const event = events.find(item => item.event_id === id);
    if (!event) return json(res, {}, 404);
    Object.assign(event, { acked: true, acked_at: now() });
    publish({ type: 'event', event });
    return json(res, event);
  }
  if (url.pathname === '/stream') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    res.write('retry: 3000\n\n'); clients.add(res);
    req.on('close', () => clients.delete(res)); return;
  }
  json(res, {}, 404);
});
const heartbeat = setInterval(() => {
  if (!status) return;
  status.last_seen = now();
  if (now() - status.ts < 10) status.ts = now();
  publish({ type: 'device', device: status });
}, 1000);
server.listen(port, '127.0.0.1');
const close = () => { clearInterval(heartbeat); clients.forEach(client => client.end()); server.close(); };
process.on('SIGTERM', close); process.on('SIGINT', close);
