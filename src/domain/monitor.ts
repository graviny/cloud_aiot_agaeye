import type { DeviceStatus, MonitorSnapshot, RiskEvent } from './types';

export const EMPTY_SNAPSHOT: MonitorSnapshot = {
  status: null, events: [], transport: 'connecting', loading: true,
  error: null, historyError: null, receivedAt: null, lastMessage: null,
};

export function mergeEvents(previous: RiskEvent[], incoming: RiskEvent[]): RiskEvent[] {
  const byId = new Map(previous.map(event => [event.id, event]));
  incoming.forEach(event => {
    const previousEvent = byId.get(event.id);
    byId.set(event.id, previousEvent ? {
      ...event,
      // Confirmation and resolution are irreversible for a single event ID.
      acknowledgedAt: previousEvent.acknowledgedAt || event.acknowledgedAt,
      endedAt: previousEvent.endedAt || event.endedAt,
      ...(previousEvent.photoState === 'available' && event.photoState === 'loading' ? {
        photoState: previousEvent.photoState, photoUrl: previousEvent.photoUrl, capturedAt: previousEvent.capturedAt,
      } : {}),
    } : event);
  });
  return [...byId.values()].sort((a, b) => Date.parse(b.confirmedAt) - Date.parse(a.confirmedAt));
}

export function acknowledgeEvent(events: RiskEvent[], id: string, at: string): RiskEvent[] {
  return events.map(event => event.id === id
    ? { ...event, acknowledgedAt: event.acknowledgedAt || at }
    : event);
}

export function isSnapshotStale(snapshot: MonitorSnapshot, now: number, staleAfterMs: number): boolean {
  if (!snapshot.status || !snapshot.receivedAt) return false;
  return now - Date.parse(snapshot.receivedAt) > staleAfterMs
    || now - Date.parse(snapshot.status.updatedAt) > staleAfterMs;
}

export function visibleStatus(snapshot: MonitorSnapshot, now: number, staleAfterMs: number): DeviceStatus | null {
  const status = snapshot.status;
  if (!status) return null;
  const unavailable = snapshot.transport !== 'connected'
    || status.server !== 'connected'
    || status.pi !== 'connected'
    || isSnapshotStale(snapshot, now, staleAfterMs);
  if (unavailable) return {
    ...status, camera: 'unknown', analysis: 'unavailable', baby: 'unknown', risk: 'unknown', riskKind: null,
  };
  if (status.camera !== 'ok' || status.analysis !== 'running') return {
    ...status, baby: 'unknown', risk: 'unknown', riskKind: null,
  };
  if (!status.lastFrameAt || now - Date.parse(status.lastFrameAt) > staleAfterMs) return {
    ...status, camera: 'unknown', analysis: 'unavailable', baby: 'unknown', risk: 'unknown', riskKind: null,
  };
  if (!status.lastAnalysisAt || now - Date.parse(status.lastAnalysisAt) > staleAfterMs) return {
    ...status, analysis: 'unavailable', baby: 'unknown', risk: 'unknown', riskKind: null,
  };
  if (status.baby !== 'present') return { ...status, risk: 'unknown', riskKind: null };
  return status;
}

export function localDate(value: string): string {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function timeLabel(value: string | null, withDate = false): string {
  if (!value) return '아직 수신하지 않음';
  return new Intl.DateTimeFormat('ko-KR', {
    ...(withDate ? { month: 'long', day: 'numeric' } : {}),
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(new Date(value));
}
