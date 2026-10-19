import { EMPTY_SNAPSHOT, mergeEvents } from '../domain/monitor';
import type { MonitorSnapshot, MonitorSource } from '../domain/types';
import { mapAgaEyeDevice, mapAgaEyeEvent, mapAgaEyeEvents } from './agaEyeMapping';
import { createAuthenticatedStream } from './authenticatedStream';
import type { TokenProvider } from './authenticatedStream';

class HttpError extends Error {
  constructor(readonly status: number) { super(`요청에 실패했습니다. (${status})`); }
}

export function createAgaEyeSource(baseUrl: string, deviceId: string, staleMs: number,
  options?: { getToken: TokenProvider }): MonitorSource {
  const base = baseUrl.replace(/\/$/, '');
  const devicePath = `/devices/${encodeURIComponent(deviceId)}/status`;
  let snapshot: MonitorSnapshot = { ...EMPTY_SNAPSHOT };
  const listeners = new Set<() => void>();
  let running = false;
  let generation = 0;
  let statusRevision = 0;
  let controller: AbortController | null = null;
  const publish = (patch: Partial<MonitorSnapshot>) => {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach(listener => listener());
  };
  const request = async (path: string, signal: AbortSignal | undefined, init?: RequestInit): Promise<unknown> => {
    const accessToken = options ? await options.getToken() : null;
    if (options && !accessToken) throw new Error('로그인이 필요합니다. 다시 로그인해 주세요.');
    const response = await fetch(`${base}${path}`, {
      credentials: options ? 'omit' : 'include', signal, ...init,
      headers: { Accept: 'application/json', ...init?.headers, ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
    });
    if (response.status === 401) throw new Error('로그인이 만료되었습니다. 다시 로그인해 주세요.');
    if (response.status === 403) throw new Error('이 기기의 보호자 계정으로 로그인해 주세요.');
    if (!response.ok) throw new HttpError(response.status);
    return response.json();
  };
  const refresh = async () => {
    if (!running) return;
    const token = generation;
    const revision = statusRevision;
    const signal = controller?.signal;
    const [device, history] = await Promise.allSettled([
      request(devicePath, signal).then(value => mapAgaEyeDevice(value, deviceId, Date.now(), staleMs)),
      // Upstream defaults to 50 across all devices. This UI currently selects one device.
      request('/events?limit=200', signal).then(value => mapAgaEyeEvents(value, deviceId, base)),
    ]);
    if (!running || token !== generation) return;
    const patch: Partial<MonitorSnapshot> = { loading: false };
    // A REST response started earlier must not overwrite a newer SSE status or disconnection.
    if (revision === statusRevision) {
      if (device.status === 'fulfilled') {
        patch.status = device.value; patch.transport = 'connected';
        patch.receivedAt = new Date().toISOString(); patch.error = null;
      } else if (device.reason instanceof HttpError && device.reason.status === 404) {
        patch.status = null; patch.transport = 'connected';
        patch.error = `기기 ${deviceId}의 첫 연결을 기다리고 있어요. 기기 ID와 실행 상태를 확인해 주세요.`;
      } else {
        patch.transport = 'disconnected';
        patch.error = device.reason instanceof Error ? device.reason.message : '기기 상태를 조회하지 못했습니다.';
      }
    }
    if (history.status === 'fulfilled') {
      patch.events = mergeEvents(snapshot.events, history.value); patch.historyError = null;
    } else patch.historyError = history.reason instanceof Error ? history.reason.message : '위험 이력을 조회하지 못했습니다.';
    publish(patch);
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    refresh,
    start: () => {
      const token = ++generation;
      running = true;
      const activeController = new AbortController();
      controller = activeController;
      const activeStream = options ? createAuthenticatedStream(`${base}/stream`, options.getToken)
        : new EventSource(`${base}/stream`, { withCredentials: true });
      const live = () => running && token === generation;
      void refresh();
      activeStream.onopen = () => { if (live()) void refresh(); };
      // This repository sends unnamed SSE messages containing {type, device/event/...}.
      activeStream.onmessage = (message: MessageEvent<string>) => {
        if (!live()) return;
        try {
          const value: unknown = JSON.parse(message.data);
          if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid SSE');
          const msg = value as Record<string, unknown>;
          if (msg.type === 'resync') { void refresh(); return; }
          if (msg.type === 'storage_unavailable') throw new Error('클라우드 저장소 연결을 확인해 주세요.');
          if (msg.type === 'device') {
            const raw = msg.device as Record<string, unknown> | undefined;
            if (raw?.device_id !== deviceId) return;
            const status = mapAgaEyeDevice(raw, deviceId, Date.now(), staleMs);
            statusRevision++;
            publish({ status, transport: 'connected', receivedAt: new Date().toISOString(), loading: false, error: null });
          } else if (msg.type === 'event') {
            const raw = msg.event as Record<string, unknown> | undefined;
            if (raw?.device_id !== deviceId) return;
            // End-before-start delivery is retained by the API until metadata arrives.
            if (raw.metadata_complete === false) { void refresh(); return; }
            const event = mapAgaEyeEvent(raw, base);
            publish({ events: mergeEvents(snapshot.events, [event]) });
          }
          // alert/settings messages do not change current inference or clear a risk.
        } catch (error) {
          statusRevision++;
          publish({ transport: 'delayed', loading: false,
            error: error instanceof Error ? error.message : '실시간 데이터 형식을 확인해 주세요.' });
        }
      };
      activeStream.onerror = () => {
        if (!live()) return;
        statusRevision++;
        publish({ transport: 'disconnected', loading: false,
          error: '실시간 연결이 끊겼습니다. 자동으로 재연결을 시도합니다.' });
      };
      return () => {
        activeStream.close(); activeController.abort();
        if (token === generation) { running = false; generation++; controller = null; }
      };
    },
    acknowledge: async id => {
      const token = generation;
      const value = await request(`/events/${encodeURIComponent(id)}/ack`, controller?.signal, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ guardian: '보호자' }),
      });
      const event = mapAgaEyeEvent(value, base);
      if (event.id !== id || event.deviceId !== deviceId || !event.acknowledgedAt) {
        throw new Error('확인 응답의 기기·이벤트 ID 또는 확인 시각이 올바르지 않습니다.');
      }
      if (running && token === generation) publish({
        events: mergeEvents(snapshot.events, [event]), lastMessage: '보호자 확인을 기록했습니다.',
      });
    },
    reset: () => {
      generation++; running = false; controller?.abort(); controller = null;
      snapshot = { ...EMPTY_SNAPSHOT }; listeners.forEach(listener => listener());
    },
  };
}
