import { acknowledgeEvent, EMPTY_SNAPSHOT, mergeEvents } from '../domain/monitor';
import type { DeviceStatus, MonitorSnapshot, MonitorSource, RiskEvent, RiskKind, Scenario } from '../domain/types';
import { parseEvents } from './validation';

export const STORAGE_KEY = 'aga-eye.demo.events.v1';
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function normalStatus(now: string): DeviceStatus {
  return { deviceId: 'pi-nursery-01', server: 'connected', pi: 'connected', camera: 'ok',
    analysis: 'running', baby: 'present', risk: 'normal', riskKind: null,
    updatedAt: now, lastFrameAt: now, lastAnalysisAt: now };
}

function makeEvent(kind: RiskKind, at = Date.now()): RiskEvent {
  const timestamp = new Date(at).toISOString();
  return { id: `demo-${crypto.randomUUID()}`, deviceId: 'pi-nursery-01', kind,
    startedAt: new Date(at - 10000).toISOString(), confirmedAt: timestamp, endedAt: null,
    acknowledgedAt: null, photoUrl: `/images/${kind === 'face_covered' ? 'covered' : 'prone'}.svg`,
    photoState: 'available', capturedAt: timestamp, isExample: true, delayed: false };
}

function seeds(): RiskEvent[] {
  return [15, 72, 150].map((minutes, index) => {
    const event = makeEvent(index === 1 ? 'face_covered' : 'prone', Date.now() - minutes * 60000);
    return { ...event, endedAt: new Date(Date.parse(event.confirmedAt) + 35000).toISOString(),
      acknowledgedAt: index === 0 ? null : new Date(Date.parse(event.confirmedAt) + 5000).toISOString() };
  });
}

export function createMockSource(storage?: StorageLike): MonitorSource {
  let persistenceError: string | null = null;
  let events = seeds();
  try {
    const saved = storage?.getItem(STORAGE_KEY);
    if (saved) events = mergeEvents([], parseEvents(JSON.parse(saved)));
  } catch { persistenceError = '저장된 데모 이력을 읽지 못해 예시 이력으로 시작했습니다.'; }
  const now = new Date().toISOString();
  const status = normalStatus(now);
  const active = events.find(event => !event.endedAt && !event.delayed);
  if (active) { status.risk = 'danger'; status.riskKind = active.kind; }
  let snapshot: MonitorSnapshot = { ...EMPTY_SNAPSHOT, status, events, transport: 'connected',
    loading: false, receivedAt: now, lastMessage: persistenceError };
  let freeze = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  const listeners = new Set<() => void>();
  let lastEvent: RiskEvent | null = active || null;
  const publish = (patch: Partial<MonitorSnapshot>) => {
    snapshot = { ...snapshot, ...patch };
    if (patch.events) {
      try { storage?.setItem(STORAGE_KEY, JSON.stringify(snapshot.events)); }
      catch { snapshot = { ...snapshot, lastMessage: '브라우저 저장소를 사용할 수 없어 새로고침 시 기록이 유지되지 않습니다.' }; }
    }
    listeners.forEach(listener => listener());
  };
  const resolveActive = (at: string) => snapshot.events.map(event =>
    !event.endedAt ? { ...event, endedAt: at } : event);

  return {
    getSnapshot: () => snapshot,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    start: () => {
      if (!timer) timer = setInterval(() => {
        if (freeze || snapshot.transport !== 'connected' || !snapshot.status) return;
        const at = new Date().toISOString();
        publish({ receivedAt: at, status: { ...snapshot.status, updatedAt: at,
          lastFrameAt: snapshot.status.pi === 'connected' && snapshot.status.camera === 'ok' ? at : snapshot.status.lastFrameAt,
          lastAnalysisAt: snapshot.status.pi === 'connected' && snapshot.status.analysis === 'running' ? at : snapshot.status.lastAnalysisAt } });
      }, 2000);
      return () => { if (timer) clearInterval(timer); timer = null; };
    },
    acknowledge: async id => {
      if (snapshot.transport !== 'connected') throw new Error('서버 연결을 확인한 뒤 다시 시도해 주세요.');
      if (!snapshot.events.some(event => event.id === id)) throw new Error('해당 이벤트를 찾을 수 없습니다.');
      publish({ events: acknowledgeEvent(snapshot.events, id, new Date().toISOString()), lastMessage: '보호자 확인을 기록했습니다. 위험 판정은 변경되지 않습니다.' });
    },
    refresh: async () => {
      if (snapshot.transport !== 'connected') throw new Error('서버에 연결할 수 없습니다. 데모 패널에서 연결 복구를 선택해 주세요.');
      publish({ historyError: null, lastMessage: '이력을 다시 불러왔습니다.' });
    },
    reset: () => {
      freeze = false;
      lastEvent = null;
      const at = new Date().toISOString();
      publish({ status: normalStatus(at), events: [], transport: 'connected', receivedAt: at,
        error: null, historyError: null, lastMessage: '데모 기록을 초기화했습니다.' });
    },
    runScenario: scenario => {
      const at = new Date().toISOString();
      let next = normalStatus(at);
      let nextEvents = snapshot.events;
      let transport: MonitorSnapshot['transport'] = 'connected';
      freeze = false;
      let message = '모의 상태를 적용했습니다.';
      if (scenario === 'normal' || scenario === 'end_risk') {
        nextEvents = resolveActive(at);
        message = scenario === 'end_risk' ? '라즈베리파이가 위험 종료를 판정한 상황입니다.' : '정상 상태를 적용했습니다.';
      } else if (scenario === 'absent') {
        next.baby = 'absent'; next.risk = 'unknown';
      } else if (scenario === 'analysis_unavailable') {
        next.analysis = 'unavailable'; next.baby = 'unknown'; next.risk = 'unknown';
      } else if (scenario === 'caution') {
        next.risk = 'caution'; next.riskKind = 'prone';
      } else if (['prone', 'face_covered', 'photo_loading', 'photo_failed'].includes(scenario)) {
        const kind = scenario === 'face_covered' ? 'face_covered' : 'prone';
        const event = makeEvent(kind);
        if (scenario === 'photo_loading') event.photoState = 'loading';
        if (scenario === 'photo_failed') event.photoUrl = '/images/intentionally-missing-demo.jpg';
        nextEvents = mergeEvents(resolveActive(at), [event]);
        lastEvent = event;
        next.risk = 'danger'; next.riskKind = kind;
        message = '새 위험 이벤트를 수신했습니다. 사진 상태와 별개로 경보를 표시합니다.';
      } else if (scenario === 'camera_disconnected') {
        next.camera = 'disconnected'; next.analysis = 'unavailable'; next.baby = 'unknown'; next.risk = 'unknown';
      } else if (scenario === 'pi_disconnected') {
        next.pi = 'disconnected'; next.analysis = 'unavailable'; next.baby = 'unknown'; next.risk = 'unknown';
      } else if (scenario === 'server_disconnected') {
        next = snapshot.status || next; transport = 'disconnected';
      } else if (scenario === 'stale') {
        freeze = true;
        next.updatedAt = new Date(Date.now() - 3600000).toISOString();
        message = '갱신이 중단된 상황입니다. 이전 정상 값을 현재 상태로 표시하지 않습니다.';
      } else if (scenario === 'duplicate') {
        if (!lastEvent) { message = '먼저 위험 이벤트를 발생시켜 주세요.'; next = snapshot.status || next; }
        else {
          const latest = snapshot.events.find(event => event.id === lastEvent!.id) || lastEvent;
          nextEvents = mergeEvents(snapshot.events, [latest]);
          next = snapshot.status || next;
          message = '동일 이벤트를 다시 수신했습니다. 이력 수는 증가하지 않습니다.';
        }
      } else if (scenario === 'delayed_event') {
        const event = makeEvent('face_covered', Date.now() - 3600000);
        event.delayed = true; event.endedAt = new Date(Date.parse(event.confirmedAt) + 30000).toISOString();
        nextEvents = mergeEvents(snapshot.events, [event]); next = snapshot.status || next;
        message = '이미 종료된 과거 이벤트를 이력에 추가했습니다. 현재 위험 경보는 생성하지 않습니다.';
      } else if (scenario === 'recover') {
        const open = snapshot.events.find(event => !event.endedAt && !event.delayed);
        if (open) { next.risk = 'danger'; next.riskKind = open.kind; }
        message = '연결을 복구하고 최신 상태와 이력을 동기화했습니다.';
      } else if (scenario === 'history_error') {
        publish({ historyError: '이력을 불러오지 못했습니다. 다시 시도해 주세요.', lastMessage: '이력 조회 실패 상황입니다.' });
        return;
      }
      publish({ status: next, events: nextEvents, transport,
        receivedAt: transport === 'connected' ? at : snapshot.receivedAt,
        error: transport === 'disconnected' ? '노트북 API 연결을 확인할 수 없습니다.' : null,
        historyError: null, lastMessage: message });
    },
  };
}
