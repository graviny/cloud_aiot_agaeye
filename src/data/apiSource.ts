import { EMPTY_SNAPSHOT, mergeEvents } from '../domain/monitor';
import type { MonitorSnapshot, MonitorSource } from '../domain/types';
import { isRiskEvent, parseEvents, parseStatus } from './validation';

export function createApiSource(baseUrl: string): MonitorSource {
  let snapshot: MonitorSnapshot = { ...EMPTY_SNAPSHOT };
  const listeners = new Set<() => void>();
  const base = baseUrl.replace(/\/$/, '');
  let stream: EventSource | null = null;
  let controller: AbortController | null = null;
  let running = false;
  const publish = (patch: Partial<MonitorSnapshot>) => {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach(listener => listener());
  };
  const request = async (path: string, init?: RequestInit): Promise<unknown> => {
    const response = await fetch(`${base}/api${path}`, {
      credentials: 'include', signal: controller?.signal,
      ...init, headers: { Accept: 'application/json', ...init?.headers },
    });
    if (!response.ok) throw new Error(`요청에 실패했습니다. (${response.status})`);
    return response.json();
  };
  const refresh = async () => {
    const [statusResult, eventsResult] = await Promise.allSettled([
      request('/status').then(parseStatus),
      request('/events').then(value => parseEvents((value as { events?: unknown })?.events)),
    ]);
    if (!running) return;
    const patch: Partial<MonitorSnapshot> = { loading: false };
    if (statusResult.status === 'fulfilled') {
      patch.status = statusResult.value;
      patch.receivedAt = new Date().toISOString();
      patch.transport = 'connected'; patch.error = null;
    } else {
      patch.transport = 'disconnected';
      patch.error = statusResult.reason instanceof Error ? statusResult.reason.message : '상태를 조회하지 못했습니다.';
    }
    if (eventsResult.status === 'fulfilled') {
      const localVersions = snapshot.events.filter(event => eventsResult.value.some(incoming => incoming.id === event.id));
      patch.events = mergeEvents(localVersions, eventsResult.value); patch.historyError = null;
    } else patch.historyError = '이력을 조회하지 못했습니다. 다시 시도해 주세요.';
    publish(patch);
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    start: () => {
      running = true;
      controller = new AbortController();
      void refresh();
      stream = new EventSource(`${base}/api/stream`, { withCredentials: true });
      stream.onopen = () => { if (running) void refresh(); };
      stream.addEventListener('status', message => {
        if (!running) return;
        try { publish({ status: parseStatus(JSON.parse((message as MessageEvent<string>).data)),
          transport: 'connected', receivedAt: new Date().toISOString(), loading: false, error: null }); }
        catch { publish({ transport: 'delayed', error: '수신한 상태 데이터의 형식을 확인해 주세요.' }); }
      });
      stream.addEventListener('risk-event', message => {
        if (!running) return;
        try {
          const event: unknown = JSON.parse((message as MessageEvent<string>).data);
          if (!isRiskEvent(event)) throw new Error('invalid event');
          publish({ events: mergeEvents(snapshot.events, [event]) });
        } catch { publish({ error: '수신한 위험 이벤트의 형식을 확인해 주세요.' }); }
      });
      stream.onerror = () => {
        if (running) publish({ transport: 'disconnected', loading: false,
          error: '실시간 연결이 끊겼습니다. 자동으로 재연결을 시도합니다.' });
      };
      return () => { running = false; stream?.close(); stream = null; controller?.abort(); controller = null; };
    },
    acknowledge: async id => {
      const event = await request(`/events/${encodeURIComponent(id)}/ack`, { method: 'POST' });
      if (!isRiskEvent(event)) throw new Error('확인 응답 형식이 올바르지 않습니다.');
      publish({ events: mergeEvents(snapshot.events, [event]), lastMessage: '보호자 확인을 기록했습니다.' });
    },
    refresh,
  };
}
