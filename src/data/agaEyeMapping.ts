import type { DeviceStatus, RiskEvent, RiskKind } from '../domain/types';

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const seconds = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 8.64e12;
const iso = (value: unknown): string | null => seconds(value) ? new Date(value * 1000).toISOString() : null;
const kind = (value: unknown): RiskKind | null =>
  value === 'prone' || value === 'face_covered' ? value : null;

// Reviewed against wlsdn66597/aga-eye commit 65d672cb, not the older /api draft.
export function mapAgaEyeDevice(value: unknown, deviceId: string, now: number, staleMs: number): DeviceStatus {
  if (!record(value) || value.device_id !== deviceId || typeof value.online !== 'boolean'
    || !seconds(value.last_seen) || !['normal', 'caution', 'risk', 'unavailable'].includes(String(value.status))
    || (value.ts != null && !seconds(value.ts))) {
    throw new Error('기기 상태 형식이 aga-eye 서버 규격과 다릅니다.');
  }
  const frameAt = iso(value.ts);
  const fresh = frameAt !== null && now - Date.parse(frameAt) <= staleMs;
  const camera = value.camera_status === 'error' || value.camera_status === 'disconnected' || value.camera_status === 'unknown'
    ? value.camera_status : fresh && value.online ? 'ok' : 'unknown';
  const body = ['supine', 'side', 'prone'].includes(String(value.posture));
  const noBaby = value.reason === 'no_baby';
  const unavailable = value.status === 'unavailable' || value.reason === 'dark' || value.reason === 'starting';
  const baby = !fresh || !value.online || camera !== 'ok' || value.reason === 'dark' ? 'unknown'
    : noBaby ? 'absent' : body || value.airway === 'airway_covered' ? 'present' : 'unknown';
  const riskKind = kind(value.reason) || (value.posture === 'prone' ? 'prone'
    : value.airway === 'airway_covered' ? 'face_covered' : null);
  const risk = !fresh || !value.online || unavailable || baby !== 'present' ? 'unknown'
    : value.status === 'risk' ? 'danger' : value.status === 'caution' ? 'caution' : 'normal';
  return {
    deviceId, server: 'connected', pi: value.online ? 'connected' : 'disconnected',
    // The upstream has no independent camera diagnostic; ts proves a processed frame only.
    camera,
    analysis: fresh && value.online && camera === 'ok' && (!unavailable || noBaby) ? 'running' : 'unavailable',
    baby, risk, riskKind: risk === 'normal' || risk === 'unknown' ? null : riskKind,
    updatedAt: frameAt || iso(value.last_seen)!, lastFrameAt: frameAt, lastAnalysisAt: frameAt,
    activeEventId: typeof value.active_event_id === 'string' ? value.active_event_id : null,
  };
}

export function mapAgaEyeEvent(value: unknown, baseUrl: string): RiskEvent {
  if (!record(value) || typeof value.event_id !== 'string' || !value.event_id
    || typeof value.device_id !== 'string' || !kind(value.risk_type)
    || !iso(value.started_at) || !iso(value.confirmed_at)
    || !['active', 'ended'].includes(String(value.status)) || typeof value.acked !== 'boolean'
    || typeof value.has_snapshot !== 'boolean'
    || (value.ended_at != null && !iso(value.ended_at))
    || (value.acked_at != null && !iso(value.acked_at))
    || (value.status === 'ended' && !iso(value.ended_at))
    || (value.acked && !iso(value.acked_at))) {
    throw new Error('위험 기록의 ID·유형·시각을 확인해 주세요. 시작·확정 시각이 없는 기록은 표시할 수 없습니다.');
  }
  return {
    id: value.event_id, deviceId: value.device_id, kind: kind(value.risk_type)!,
    startedAt: iso(value.started_at)!, confirmedAt: iso(value.confirmed_at)!,
    endedAt: iso(value.ended_at), acknowledgedAt: iso(value.acked_at),
    photoUrl: value.has_snapshot ? `${baseUrl.replace(/\/$/, '')}/events/${encodeURIComponent(value.event_id)}/snapshot` : null,
    photoState: value.has_snapshot ? 'available' : 'missing',
    // Upstream does not send a separate camera capture timestamp. Do not invent one.
    capturedAt: iso(value.captured_at), isExample: false, delayed: false,
  };
}

export function mapAgaEyeEvents(value: unknown, deviceId: string, baseUrl: string): RiskEvent[] {
  if (!Array.isArray(value)) throw new Error('위험 이력 응답이 목록 형식이 아닙니다.');
  return value.filter(item => {
    if (!record(item) || typeof item.device_id !== 'string') throw new Error('위험 기록의 기기 ID가 없습니다.');
    return item.device_id === deviceId;
  }).map(item => mapAgaEyeEvent(item, baseUrl));
}
