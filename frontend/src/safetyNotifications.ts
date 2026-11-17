import type { Safety, SkyDevice } from './skyEye.ts';

export interface SafetyNotice {
  key: string;
  deviceName: string;
  field: 'posture' | 'face';
  level: Safety;
}
export interface SafetyNoticeTracker {
  highest: number;
  unknownSince: number | null;
  stableSince: number | null;
}
export type SafetyNoticeState = Record<string, SafetyNoticeTracker>;

export function currentSafetyNotices(items: SkyDevice[]): SafetyNotice[] {
  return items.filter(device => device.connected && !['awaiting_sender', 'awaiting_model', 'offline'].includes(device.reportState || ''))
    .flatMap(device => (['posture', 'face'] as const).map(field => ({
      key: JSON.stringify([device.deviceId, field]), deviceName: device.name, field,
      level: device.status.video.available ? device.safety[field] : 'unknown' as const,
    })));
}

/** Announce once per ongoing condition; a healthy 10 seconds rearms it. */
export function advanceSafetyNotices(previous: SafetyNoticeState, observations: SafetyNotice[], now: number) {
  const state = { ...previous };
  const notices: SafetyNotice[] = [];
  const present = new Set(observations.map(observation => observation.key));
  for (const [key, old] of Object.entries(state)) {
    if (!present.has(key)) state[key] = { ...old, unknownSince: null, stableSince: null };
  }
  for (const observation of observations) {
    const old = state[observation.key] || { highest: -1, unknownSince: null, stableSince: null };
    if (observation.level === 'stable') {
      const stableSince = old.stableSince ?? now;
      state[observation.key] = { highest: now - stableSince >= 10000 ? -1 : old.highest, unknownSince: null, stableSince };
      continue;
    }
    const rank = observation.level === 'immediate' ? 2 : observation.level === 'caution' ? 1 : 0;
    const unknownSince = rank === 0 ? old.unknownSince ?? now : null;
    const ready = rank > 0 || now - unknownSince! >= 10000;
    const announce = ready && rank > old.highest;
    if (announce) notices.push(observation);
    state[observation.key] = { highest: announce ? rank : old.highest, unknownSince, stableSince: null };
  }
  return { state, notices };
}
