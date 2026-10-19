import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { visibleStatus } from '../domain/monitor';
import { mapAgaEyeDevice, mapAgaEyeEvent, mapAgaEyeEvents } from './agaEyeMapping';
import { createAgaEyeSource } from './agaEyeSource';

const now = Date.parse('2026-10-14T12:00:00+09:00');
const ts = now / 1000;
const device = (patch: Record<string, unknown> = {}) => ({
  device_id: 'crib-01', online: true, last_seen: ts, ts, status: 'normal', reason: '',
  posture: 'supine', airway: 'airway_visible', active_event_id: null, ...patch,
});
const event = (patch: Record<string, unknown> = {}) => ({
  event_id: 'risk-1', device_id: 'crib-01', risk_type: 'prone', started_at: ts - 5,
  confirmed_at: ts, ended_at: null, acked: false, acked_at: null,
  status: 'active', has_snapshot: true, ...patch,
});

class FakeStream {
  static instances: FakeStream[] = [];
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  close = vi.fn();
  constructor(readonly url: string) { FakeStream.instances.push(this); }
  send(value: unknown) { this.onmessage?.({ data: JSON.stringify(value) } as MessageEvent<string>); }
}
const stops: Array<() => void> = [];
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); FakeStream.instances = []; });
afterEach(() => { stops.splice(0).forEach(stop => stop()); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('선택한 aga-eye 모델 저장소 데이터 변환', () => {
  it.each([['normal', 'normal'], ['caution', 'caution'], ['risk', 'danger']] as const)(
    '%s 상태를 화면의 %s 상태로 변환한다', (raw, expected) => {
      const result = mapAgaEyeDevice(device({ status: raw, reason: raw === 'normal' ? '' : 'prone' }), 'crib-01', now, 12000);
      expect(result.risk).toBe(expected);
      expect(result.lastAnalysisAt).toBe(new Date(now).toISOString());
    });
  it('아기 미감지와 어두운 화면을 구별한다', () => {
    const absent = mapAgaEyeDevice(device({ status: 'unavailable', reason: 'no_baby', posture: null, airway: null }), 'crib-01', now, 12000);
    expect(absent).toMatchObject({ baby: 'absent', risk: 'unknown', camera: 'ok', analysis: 'running' });
    const dark = mapAgaEyeDevice(device({ status: 'unavailable', reason: 'dark' }), 'crib-01', now, 12000);
    expect(dark).toMatchObject({ baby: 'unknown', risk: 'unknown', analysis: 'unavailable' });
  });
  it('몸 박스가 없어도 가린 얼굴 탐지를 아기 미감지로 바꾸지 않는다', () => {
    expect(mapAgaEyeDevice(device({ status: 'risk', reason: 'face_covered', posture: null, airway: 'airway_covered' }), 'crib-01', now, 12000))
      .toMatchObject({ baby: 'present', risk: 'danger', riskKind: 'face_covered' });
  });
  it('생존 신호가 새로워도 같은 ts 재전송을 새로운 정상 분석으로 취급하지 않는다', () => {
    const result = mapAgaEyeDevice(device({ ts: ts - 30 }), 'crib-01', now, 12000);
    expect(result).toMatchObject({ risk: 'unknown', camera: 'unknown', analysis: 'unavailable' });
    expect(result.updatedAt).toBe(new Date(now - 30000).toISOString());
    expect(mapAgaEyeDevice(device({ online: false }), 'crib-01', now, 12000).risk).toBe('unknown');
  });
  it('명시적인 입력 중지는 최신 ts가 있어도 정상으로 표시하지 않는다', () => {
    expect(mapAgaEyeDevice(device({ camera_status: 'unknown' }), 'crib-01', now, 12000))
      .toMatchObject({ camera: 'unknown', analysis: 'unavailable', baby: 'unknown', risk: 'unknown' });
    expect(mapAgaEyeDevice(device({ camera_status: 'ok' }), 'crib-01', now, 12000))
      .toMatchObject({ camera: 'ok', analysis: 'running', risk: 'normal' });
  });
  it('아직 프레임 없는 첫 생존 신호로 카메라 정상을 만들지 않는다', () => {
    expect(mapAgaEyeDevice(device({ ts: undefined, status: 'unavailable', reason: 'starting' }), 'crib-01', now, 12000))
      .toMatchObject({ lastFrameAt: null, camera: 'unknown', baby: 'unknown', risk: 'unknown' });
  });
  it('기기와 이벤트를 걸러 사진 URL·시각·확인 기록을 변환한다', () => {
    const result = mapAgaEyeEvents([event(), event({ event_id: 'other', device_id: 'crib-02' })], 'crib-01', '/agaeye-api');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ photoUrl: '/agaeye-api/events/risk-1/snapshot', isExample: false, capturedAt: null });
    expect(mapAgaEyeEvent(event({ has_snapshot: false, acked: true, acked_at: ts + 1 }), '/agaeye-api'))
      .toMatchObject({ photoUrl: null, photoState: 'missing', acknowledgedAt: new Date(now + 1000).toISOString(), endedAt: null });
  });
  it('불완전한 종료 기록에 시작·확정 시각을 만들어 넣지 않는다', () => {
    expect(() => mapAgaEyeEvent(event({ status: 'ended', ended_at: ts, started_at: null, confirmed_at: null }), '/agaeye-api')).toThrow('시작·확정');
    expect(() => mapAgaEyeDevice(device({ status: 'safe' }), 'crib-01', now, 12000)).toThrow();
  });
});

describe('aga-eye 서버 REST·SSE 연결', () => {
  const launch = (fetcher = vi.fn(async (input: RequestInfo | URL) =>
    Response.json(String(input).includes('/devices/') ? device() : [event()]))) => {
    vi.stubGlobal('fetch', fetcher); vi.stubGlobal('EventSource', FakeStream);
    const source = createAgaEyeSource('/agaeye-api', 'crib-01', 12000);
    stops.push(source.start());
    return { source, fetcher, stream: FakeStream.instances[0] };
  };
  it('실제 경로를 사용하고 이름 없는 SSE를 수신한다', async () => {
    const { source, fetcher, stream } = launch(); await settle();
    expect(fetcher.mock.calls.map(call => String(call[0]))).toEqual(['/agaeye-api/devices/crib-01/status', '/agaeye-api/events?limit=200']);
    expect(stream.url).toBe('/agaeye-api/stream');
    stream.send({ type: 'device', device: device({ status: 'risk', reason: 'prone', active_event_id: 'risk-1' }) });
    expect(source.getSnapshot().status).toMatchObject({ risk: 'danger', activeEventId: 'risk-1' });
    stream.send({ type: 'device', device: device({ device_id: 'crib-02', status: 'normal' }) });
    expect(source.getSnapshot().status?.risk).toBe('danger');
  });
  it('확인 POST 성공 뒤에도 위험을 유지하고 오래된 중복 메시지로 확인·종료가 취소되지 않는다', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => Response.json(
      String(input).endsWith('/ack') ? event({ acked: true, acked_at: ts + 1 })
        : String(input).includes('/devices/') ? device({ status: 'risk', reason: 'prone', active_event_id: 'risk-1' }) : [event()]));
    const { source, stream } = launch(fetcher); await settle();
    await source.acknowledge('risk-1');
    expect(fetcher.mock.calls.at(-1)?.[1]).toMatchObject({ method: 'POST', body: '{"guardian":"보호자"}' });
    expect(source.getSnapshot().status?.risk).toBe('danger');
    stream.send({ type: 'event', event: event({ status: 'ended', ended_at: ts + 3 }) });
    stream.send({ type: 'event', event: event() });
    expect(source.getSnapshot().events).toHaveLength(1);
    expect(source.getSnapshot().events[0]).toMatchObject({ acknowledgedAt: new Date(now + 1000).toISOString(), endedAt: new Date(now + 3000).toISOString() });
  });
  it('미등록 기기는 서버 단절이나 정상으로 표시하지 않는다', async () => {
    const { source } = launch(vi.fn(async input => String(input).includes('/devices/') ? Response.json({}, { status: 404 }) : Response.json([])));
    await settle();
    expect(source.getSnapshot()).toMatchObject({ transport: 'connected', status: null, events: [] });
    expect(source.getSnapshot().error).toContain('첫 연결');
  });
  it('늦게 끝난 REST 정상 응답이 새 SSE 위험 상태를 덮어쓰지 않는다', async () => {
    let resolveDevice!: (response: Response) => void;
    const pending = new Promise<Response>(resolve => { resolveDevice = resolve; });
    const { source, stream } = launch(vi.fn(async input => String(input).includes('/devices/') ? pending : Response.json([])));
    stream.send({ type: 'device', device: device({ status: 'risk', reason: 'prone' }) });
    resolveDevice(Response.json(device())); await settle();
    expect(source.getSnapshot().status?.risk).toBe('danger');
  });
  it('단절 시 현재 상태는 판단 불가이며 종료 미확인 기록은 남긴다', async () => {
    const { source, stream } = launch(); await settle(); stream.onerror?.();
    expect(visibleStatus(source.getSnapshot(), now, 12000)?.risk).toBe('unknown');
    expect(source.getSnapshot().events[0].endedAt).toBeNull();
    stream.onopen?.(); await settle();
    expect(source.getSnapshot().transport).toBe('connected');
  });
  it('잘못된 SSE와 확인 응답을 정상 처리하지 않는다', async () => {
    const { source, stream } = launch(vi.fn(async input => Response.json(String(input).endsWith('/ack')
      ? event({ event_id: 'wrong', acked: true, acked_at: ts }) : String(input).includes('/devices/') ? device() : [event()])));
    await settle(); stream.send({ type: 'device', device: device({ ts: 'wrong' }) });
    expect(source.getSnapshot().transport).toBe('delayed');
    await expect(source.acknowledge('risk-1')).rejects.toThrow('확인 응답');
    expect(source.getSnapshot().events[0].acknowledgedAt).toBeNull();
  });
  it('StrictMode 재시작 전 요청과 SSE가 새 세션을 덮어쓰지 않는다', async () => {
    const { source, stream } = launch(); stops.pop()!();
    stops.push(source.start()); await settle();
    stream.send({ type: 'device', device: device({ status: 'risk', reason: 'prone' }) });
    expect(stream.close).toHaveBeenCalledOnce();
    expect(source.getSnapshot().status?.risk).toBe('normal');
  });
});
