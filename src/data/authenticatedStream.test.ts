import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAuthenticatedStream } from './authenticatedStream';
import { createAgaEyeSource } from './agaEyeSource';

const cleanups: Array<() => void> = [];
const settle = async () => { for (let index = 0; index < 30; index++) await Promise.resolve(); };
afterEach(() => { cleanups.splice(0).forEach(close => close()); vi.unstubAllGlobals(); });

describe('보호자 인증 스트림', () => {
  it('토큰을 URL 대신 헤더로 보내고 분할된 한글 SSE 메시지를 복원한다', async () => {
    const encoder = new TextEncoder();
    let input!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({ start(controller) { input = controller; } });
    const fetcher = vi.fn(async () => new Response(body, { headers: { 'Content-Type': 'text/event-stream' } }));
    vi.stubGlobal('fetch', fetcher);
    const stream = createAuthenticatedStream('https://api.example/stream', async () => 'guardian-test-session');
    cleanups.push(stream.close);
    const onmessage = vi.fn(); stream.onmessage = onmessage;
    await settle();
    const bytes = encoder.encode(': ping\r\n\r\ndata: {"type":"event","message":"위험"}\r\n\r\n');
    for (let index = 0; index < bytes.length; index += 2) input.enqueue(bytes.slice(index, index + 2));
    await settle();
    expect(fetcher.mock.calls[0]).toEqual(['https://api.example/stream', expect.objectContaining({
      headers: { Authorization: 'Bearer guardian-test-session', Accept: 'text/event-stream' }, credentials: 'omit',
    })]);
    expect(onmessage).toHaveBeenCalledOnce();
    expect(JSON.parse(onmessage.mock.calls[0][0].data).message).toBe('위험');
  });

  it('취소 후 늦은 토큰 조회가 끝나도 연결하지 않는다', async () => {
    let release!: (token: string) => void;
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const stream = createAuthenticatedStream('https://api.example/stream', () => new Promise(resolve => { release = resolve; }));
    await settle(); stream.close(); release('late-test-session'); await settle();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('로그아웃하면 이전 보호자의 상태와 이력을 즉시 비운다', async () => {
    let input!: ReadableStreamDefaultController<Uint8Array>;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/stream')
      ? new Response(new ReadableStream<Uint8Array>({ start(controller) { input = controller; } }), { headers: { 'Content-Type': 'text/event-stream' } })
      : Response.json(url.includes('/devices/') ? { device_id: 'crib-01', online: true, last_seen: Date.now() / 1000,
        ts: Date.now() / 1000, status: 'normal', posture: 'supine', airway: 'airway_visible' } : [])));
    const source = createAgaEyeSource('https://api.example', 'crib-01', 12000, { getToken: async () => 'test-session' });
    cleanups.push(source.start()); await settle();
    expect(source.getSnapshot().status?.baby).toBe('present');
    source.reset?.();
    input.enqueue(new TextEncoder().encode('data: {"type":"device","device":{}}\n\n'));
    await settle(); expect(source.getSnapshot().status).toBeNull(); expect(source.getSnapshot().events).toEqual([]);
  });
});
