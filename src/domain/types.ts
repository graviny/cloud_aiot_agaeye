export type Connection = 'connected' | 'connecting' | 'delayed' | 'disconnected';
export type CameraState = 'ok' | 'error' | 'disconnected' | 'unknown';
export type BabyState = 'present' | 'absent' | 'unknown';
export type RiskState = 'normal' | 'caution' | 'danger' | 'unknown';
export type RiskKind = 'prone' | 'face_covered' | 'combined';
export type PhotoState = 'available' | 'loading' | 'missing';

export interface DeviceStatus {
  deviceId: string;
  server: Connection;
  pi: Connection;
  camera: CameraState;
  analysis: 'running' | 'unavailable';
  baby: BabyState;
  risk: RiskState;
  riskKind: RiskKind | null;
  activeEventId?: string | null;
  updatedAt: string;
  lastFrameAt: string | null;
  lastAnalysisAt: string | null;
}

export interface RiskEvent {
  id: string;
  deviceId: string;
  kind: RiskKind;
  startedAt: string;
  confirmedAt: string;
  endedAt: string | null;
  acknowledgedAt: string | null;
  photoUrl: string | null;
  photoState: PhotoState;
  capturedAt: string | null;
  isExample: boolean;
  delayed: boolean;
}

export interface MonitorSnapshot {
  status: DeviceStatus | null;
  events: RiskEvent[];
  transport: Connection;
  loading: boolean;
  error: string | null;
  historyError: string | null;
  receivedAt: string | null;
  lastMessage: string | null;
}

export type Scenario =
  | 'normal' | 'absent' | 'analysis_unavailable' | 'caution'
  | 'prone' | 'face_covered' | 'photo_loading' | 'photo_failed'
  | 'camera_disconnected' | 'pi_disconnected' | 'server_disconnected'
  | 'stale' | 'recover' | 'end_risk' | 'duplicate' | 'delayed_event'
  | 'history_error';

export interface MonitorSource {
  getSnapshot(): MonitorSnapshot;
  subscribe(listener: () => void): () => void;
  start(): () => void;
  acknowledge(eventId: string): Promise<void>;
  refresh(): Promise<void>;
  runScenario?(scenario: Scenario): void;
  reset?(): void;
}

export const riskLabels: Record<RiskKind, string> = {
  prone: '엎드림',
  face_covered: '안면 차폐',
  combined: '엎드림 · 안면 차폐',
};
