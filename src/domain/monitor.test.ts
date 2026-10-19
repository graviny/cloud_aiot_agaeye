import { afterEach, describe, expect, it, vi } from 'vitest';
import { acknowledgeEvent, isSnapshotStale, mergeEvents, visibleStatus } from './monitor';
import { createMockSource } from '../data/mockSource';
import { parseStatus, parseEvents } from '../data/validation';

afterEach(() => vi.useRealTimers());

describe('위험 이벤트와 상태 처리', () => {
  it('중복 이벤트는 하나로 유지하고 확인 기록을 보존한다', async () => {
    const source = createMockSource();
    source.runScenario!('prone');
    const event = source.getSnapshot().events[0];
    await source.acknowledge(event.id);
    source.runScenario!('duplicate');
    expect(source.getSnapshot().events.filter(item => item.id === event.id)).toHaveLength(1);
    expect(source.getSnapshot().events[0].acknowledgedAt).not.toBeNull();
  });
  it('보호자 확인은 위험이나 종료 시각을 변경하지 않는다', async () => {
    const source = createMockSource();
    source.runScenario!('face_covered');
    await source.acknowledge(source.getSnapshot().events[0].id);
    expect(source.getSnapshot().status?.risk).toBe('danger');
    expect(source.getSnapshot().events[0].endedAt).toBeNull();
  });
  it('종료 이벤트가 도착해야 위험이 해제된다', () => {
    const source = createMockSource();
    source.runScenario!('prone');
    source.runScenario!('end_risk');
    expect(source.getSnapshot().status?.risk).toBe('normal');
    expect(source.getSnapshot().events[0].endedAt).not.toBeNull();
    expect(source.getSnapshot().events[0].acknowledgedAt).toBeNull();
  });
  it.each(['camera_disconnected', 'pi_disconnected', 'server_disconnected', 'analysis_unavailable', 'stale'] as const)(
    '%s 상황은 아기 미감지나 정상으로 표시하지 않는다', scenario => {
      const source = createMockSource();
      source.runScenario!(scenario);
      const status = visibleStatus(source.getSnapshot(), Date.now(), 12000);
      expect(status?.baby).toBe('unknown');
      expect(status?.risk).toBe('unknown');
    });
  it('아기 미감지는 정상 위험 상태와 구분한다', () => {
    const source = createMockSource();
    source.runScenario!('absent');
    const status = visibleStatus(source.getSnapshot(), Date.now(), 12000);
    expect(status?.baby).toBe('absent');
    expect(status?.risk).toBe('unknown');
  });
  it('과거 종료 이벤트를 현재 위험으로 전환하지 않는다', () => {
    const source = createMockSource();
    source.runScenario!('delayed_event');
    expect(source.getSnapshot().status?.risk).toBe('normal');
    expect(source.getSnapshot().events.find(event => event.delayed)?.endedAt).not.toBeNull();
  });
  it('갱신 중단은 시간 경과로 감지한다', () => {
    const snapshot = createMockSource().getSnapshot();
    const received = Date.parse(snapshot.receivedAt!);
    expect(isSnapshotStale(snapshot, received + 12000, 12000)).toBe(false);
    expect(isSnapshotStale(snapshot, received + 12001, 12000)).toBe(true);
  });
  it('서버 생존 신호가 최신이어도 오래된 분석 결과는 정상으로 표시하지 않는다', () => {
    const snapshot = createMockSource().getSnapshot();
    snapshot.status = { ...snapshot.status!, lastAnalysisAt: new Date(Date.now() - 60000).toISOString() };
    const status = visibleStatus(snapshot, Date.now(), 12000);
    expect(status?.camera).toBe('ok');
    expect(status?.analysis).toBe('unavailable');
    expect(status?.risk).toBe('unknown');
  });
  it('연결 단절 중 확인 저장 실패 시 확인 완료로 표시하지 않는다', async () => {
    const source = createMockSource();
    source.runScenario!('prone');
    const id = source.getSnapshot().events[0].id;
    source.runScenario!('server_disconnected');
    await expect(source.acknowledge(id)).rejects.toThrow();
    expect(source.getSnapshot().events.find(event => event.id === id)?.acknowledgedAt).toBeNull();
    source.runScenario!('recover');
    expect(source.getSnapshot().status?.risk).toBe('danger');
  });
  it('새로고침 뒤 확인·위험 지속 기록을 복원한다', async () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) || null,
      setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
    const source = createMockSource(storage);
    source.runScenario!('prone');
    const id = source.getSnapshot().events[0].id;
    await source.acknowledge(id);
    const restored = createMockSource(storage).getSnapshot();
    expect(restored.status?.risk).toBe('danger');
    expect(restored.events.find(event => event.id === id)?.acknowledgedAt).not.toBeNull();
  });
  it('손상된 저장소에서도 앱을 시작한다', () => {
    const storage = { getItem: () => '{broken', setItem: () => {}, removeItem: () => {} };
    expect(createMockSource(storage).getSnapshot().events).toHaveLength(3);
  });
  it('미지원 API 형식은 성공 결과로 처리하지 않는다', () => {
    expect(() => parseStatus({ risk: 'normal' })).toThrow();
    expect(() => parseEvents([{ id: 'broken' }])).toThrow();
  });
  it('다시 확인해도 최초 확인 시각을 유지한다', () => {
    const events = createMockSource().getSnapshot().events;
    const first = acknowledgeEvent(events, events[0].id, '2026-10-13T00:00:00Z');
    const second = acknowledgeEvent(first, events[0].id, '2026-10-13T00:01:00Z');
    expect(second[0].acknowledgedAt).toBe(first[0].acknowledgedAt);
    expect(mergeEvents(events, [events[0]])).toHaveLength(events.length);
  });
  it('오래된 이벤트 재전송으로 확인·종료·완료된 사진을 되돌리지 않는다', () => {
    const event = createMockSource().getSnapshot().events[1];
    const oldVersion = { ...event, endedAt: null, acknowledgedAt: null, photoState: 'loading' as const, photoUrl: null };
    const merged = mergeEvents([event], [oldVersion])[0];
    expect(merged.endedAt).toBe(event.endedAt);
    expect(merged.acknowledgedAt).toBe(event.acknowledgedAt);
    expect(merged.photoState).toBe('available');
    expect(merged.photoUrl).toBe(event.photoUrl);
  });
  it('상태 갱신 타이머는 종료 후 더 이상 발행하지 않는다', () => {
    vi.useFakeTimers();
    const source = createMockSource();
    const listener = vi.fn();
    source.subscribe(listener);
    const stop = source.start();
    vi.advanceTimersByTime(2000);
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    vi.advanceTimersByTime(6000);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
