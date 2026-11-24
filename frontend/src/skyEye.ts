export type Safety = 'stable' | 'caution' | 'immediate' | 'unknown';
export interface ModelEvent { id: string; episodeKey: string; kind: string; riskType: string | null; observedAt: string; episodeUid: string | null; endReason: string | null }
export interface CameraAlert {
  id: string;
  field: 'posture' | 'face' | 'edge' | 'observation';
  level: Exclude<Safety, 'stable'>;
  observedAt: string;
  capturedAt: string | null;
}
export function alertLabel(alert: CameraAlert) {
  const field = { posture: '아기 자세', face: '얼굴 노출', edge: '가장자리 접근', observation: '기기 관측' }[alert.field];
  return field + ' · ' + safetyLabels[alert.level];
}
export function listAlerts(snapshot: SkySnapshot | null) {
  return (snapshot?.items || []).flatMap(device => (device.alerts || []).map(alert => ({ device, alert })))
    .sort((a, b) => Date.parse(b.alert.observedAt) - Date.parse(a.alert.observedAt) || a.alert.id.localeCompare(b.alert.id));
}
export interface SkyDevice {
  deviceId: string; name: string; connected: boolean;
  reportState?: 'awaiting_sender' | 'awaiting_model' | 'offline' | 'input_unavailable' | 'receiving';
  lastReportAt?: string | null;
  alerts?: CameraAlert[];
  status: {
    observedAt: string;
    video: { available: boolean; observedAt: string | null; posture: string | null; airway: string | null; state: string; geometryValid: boolean; fallState: string | null; fps: number | null };
  };
  safety: Record<'posture' | 'face' | 'edge' | 'objects', Safety>;
  events: { event: ModelEvent; recent: boolean }[];
}
export interface SkySnapshot { childId: string; serverTime: string; items: SkyDevice[] }
export const safetyLabels: Record<Safety, string> = { stable: '관측 정상', caution: '확인 필요', immediate: '즉시 확인', unknown: '확인 불가' };
export const safetyTones = { stable: 'green', caution: 'yellow', immediate: 'red', unknown: 'gray' } as const;
export const safetyItems = [{ key: 'posture', label: '아기 자세' }, { key: 'face', label: '얼굴 노출' }, { key: 'objects', label: '주변 물체' }, { key: 'edge', label: '가장자리 접근' }] as const;
export function connectionLabel(device: Pick<SkyDevice, 'connected' | 'reportState'>) {
  if (device.reportState === 'awaiting_sender') return '연결 승인됨 · 파이 실행 대기';
  if (!device.connected) return '기기 응답이 멈췄어요';
  if (device.reportState === 'awaiting_model') return '기기 연결됨 · 모델 전송 대기';
  if (device.reportState === 'input_unavailable') return '기기 연결됨 · 분석 입력 확인 필요';
  return '기기 데이터 수신 중';
}
export function eventLabel(event: ModelEvent) {
  const risk = ({ prone: '엎드림', face_covered: '얼굴 가림', edge_departure_warning: '가장자리 접근' } as Record<string, string>)[event.riskType || ''] || '관측';
  const kind = ({ risk_started: '위험 의심 감지', risk_ended: '모델 위험 구간 종료', risk_interrupted: '관찰 중단', status_changed: '상태 변경', posture_changed: '자세 변경' } as Record<string, string>)[event.kind] || event.kind;
  return `${risk} · ${kind}`;
}
const frameStates: Record<string, { label: string; tone: string }> = {
  normal: { label: '관측 정상', tone: 'green' }, caution: { label: '확인 필요', tone: 'yellow' },
  risk: { label: '위험 의심', tone: 'red' }, unavailable: { label: '판정 불가', tone: 'gray' },
};
const frameDetails: Record<string, string> = { supine: '바로 누움', side: '옆으로 누움', prone: '엎드림', airway_visible: '코·입 보임', airway_covered: '코·입 가림' };
/** The model's result for one periodic capture, worded as an observation at that moment. */
export function captureSummary(capture: { state: string; posture: string | null; airway: string | null }) {
  const state = frameStates[capture.state] || frameStates.unavailable;
  const details = [capture.posture, capture.airway].map(value => value && frameDetails[value]).filter(Boolean).join(' · ');
  return { label: state.label, tone: state.tone, details };
}
// Expire the cached response during a disconnected network or a hanging request.
// Server time plus elapsed time avoids trusting a skewed client clock.
export function currentSnapshot(snapshot: SkySnapshot | null, receivedAt: number, now: number): SkySnapshot | null {
  if (!snapshot) return null;
  const elapsed = Math.max(0, now - receivedAt), serverNow = Date.parse(snapshot.serverTime) + elapsed;
  const fresh = (at: string | null, limit: number) => at !== null && Number.isFinite(Date.parse(at)) && serverNow - Date.parse(at) <= limit && Date.parse(at) <= serverNow + 5000;
  return { ...snapshot, items: snapshot.items.map(item => {
    const exporter = fresh(item.status.observedAt, 8000) && elapsed < 8000;
    const video = exporter && item.status.video.available && fresh(item.status.video.observedAt, 5000);
    return { ...item, connected: item.connected && elapsed < 15000,
      safety: video ? item.safety : { posture: 'unknown', face: 'unknown', edge: 'unknown', objects: 'unknown' },
      status: { observedAt: item.status.observedAt, video: { ...item.status.video, available: video } },
      events: item.events.map(entry => ({ ...entry, recent: entry.recent && fresh(entry.event.observedAt, 30000) })),
    };
  }) };
}
