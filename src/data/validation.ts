import type { DeviceStatus, RiskEvent } from '../domain/types';

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const date = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));
const nullableDate = (value: unknown) => value === null || date(value);
const oneOf = (value: unknown, choices: string[]) => typeof value === 'string' && choices.includes(value);
const kinds = ['prone', 'face_covered', 'combined'];
const connections = ['connected', 'connecting', 'delayed', 'disconnected'];

export function isDeviceStatus(value: unknown): value is DeviceStatus {
  return record(value) && typeof value.deviceId === 'string'
    && oneOf(value.server, connections) && oneOf(value.pi, connections)
    && oneOf(value.camera, ['ok', 'error', 'disconnected', 'unknown'])
    && oneOf(value.analysis, ['running', 'unavailable'])
    && oneOf(value.baby, ['present', 'absent', 'unknown'])
    && oneOf(value.risk, ['normal', 'caution', 'danger', 'unknown'])
    && (value.riskKind === null || oneOf(value.riskKind, kinds))
    && (value.activeEventId === undefined || value.activeEventId === null || typeof value.activeEventId === 'string')
    && date(value.updatedAt) && nullableDate(value.lastFrameAt) && nullableDate(value.lastAnalysisAt);
}

export function isRiskEvent(value: unknown): value is RiskEvent {
  return record(value) && typeof value.id === 'string' && typeof value.deviceId === 'string'
    && oneOf(value.kind, kinds) && date(value.startedAt) && date(value.confirmedAt)
    && nullableDate(value.endedAt) && nullableDate(value.acknowledgedAt)
    && (value.photoUrl === null || typeof value.photoUrl === 'string')
    && oneOf(value.photoState, ['available', 'loading', 'missing'])
    && nullableDate(value.capturedAt) && typeof value.isExample === 'boolean'
    && typeof value.delayed === 'boolean';
}

export function parseStatus(value: unknown): DeviceStatus {
  if (!isDeviceStatus(value)) throw new Error('상태 데이터 형식이 API 계약과 다릅니다.');
  return value;
}

export function parseEvents(value: unknown): RiskEvent[] {
  if (!Array.isArray(value) || !value.every(isRiskEvent)) throw new Error('위험 이력 형식이 API 계약과 다릅니다.');
  return value;
}
