import type { SkySnapshot } from '../skyEye';
import type { CareChanges, HistoryKind, SavedCare } from '../careHistory';
export interface Session { accessToken: string; refreshToken: string; userId?: string; username?: string; email?: string | null; emailVerified?: boolean; }
export interface Workspace { id: string; name: string; role: string; type: string }
export interface Child { id: string; displayName: string; birthDate: string; capabilities: string[] }
export interface Device { id: string; name: string; childId: string; connected: boolean; state: string; lastSeenAt: string | null; pairedAt: string; fingerprint: string; canManage: boolean }
export interface Pairing { pairingId: string; status: string; expiresAt: string; fingerprint: string }
/** Latest periodic camera frame; the analysis fields describe that exact frame. */
export interface LatestCapture { image: Blob; capturedAt: string; state: string; posture: string | null; airway: string | null }
export function normalizeApiBaseUrl(value: string) {
  // Accept either an origin or the API base copied from the backend documentation.
  return value.trim().replace(/\/+$/, '').replace(/\/api(?:\/v1)?$/, '');
}
export class ApiError extends Error {
  status: number; code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
}
export function normalizePairingCode(value: string) {
  const code = value.replace(/[\s-]/g, '').toUpperCase();
  if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code)) throw new Error('파이에 표시된 영문·숫자 8자리를 입력해 주세요.');
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}
const messages: Record<string, string> = {
  PAIRING_CODE_NOT_FOUND: '연결 코드를 찾지 못했어요. 파이에 표시된 코드를 확인해 주세요.',
  PAIRING_EXPIRED: '코드가 만료됐어요. 파이에서 새 코드를 발급해 주세요.',
  PAIRING_CANCELLED: '취소된 코드예요. 파이에 표시된 최신 코드를 입력해 주세요.',
  PAIRING_ALREADY_USED: '이미 사용한 코드예요. 연결된 기기를 확인해 주세요.',
  DEVICE_ALREADY_PAIRED: '이미 연결된 파이예요. 기존 보호자가 연결을 해제해야 해요.',
  PAIRING_RATE_LIMITED: '확인 요청이 많아요. 15분 뒤 다시 시도해 주세요.',
  INVALID_CREDENTIALS: '아이디 또는 비밀번호를 확인해 주세요.',
  USERNAME_UNAVAILABLE: '이미 사용 중인 아이디예요. 다른 아이디를 입력해 주세요.',
  INVALID_USERNAME: '아이디는 영문·숫자로 시작하는 1~32자의 영문, 숫자, 점, 밑줄, 하이픈으로 입력해 주세요.',
  ACCOUNT_UNAVAILABLE: '가입 정보를 확인해 주세요. 이미 가입했다면 로그인해 주세요.',
  CARE_RECORD_CHANGED: '다른 화면에서 기록이 변경됐어요. 최신 기록을 불러온 뒤 다시 열어 주세요.',
  FEEDBACK_ALREADY_RECORDED: '이미 대응 결과가 저장됐어요. 최신 기록을 확인해 주세요.',
  INVALID_SLEEP_TIME: '수면 종료는 시작 이후여야 하고, 미래 시간은 기록할 수 없어요. 최대 7일 범위로 입력해 주세요.',
};
/** Account credentials live only in memory. Device credentials never reach this client. */
export class DeviceClient {
  onSessionExpired?: () => void;
  private baseUrl: string;
  private session: Session | null = null;
  private refreshing: Promise<void> | null = null;
  private generation = 0;
  constructor(baseUrl = '') { this.baseUrl = normalizeApiBaseUrl(baseUrl); }
  clear() { this.generation++; this.session = null; this.refreshing = null; }
  private async refresh() {
    if (!this.refreshing) {
      const token = this.session?.refreshToken;
      const generation = this.generation;
      this.refreshing = this.request<Session>('POST', '/auth/refresh', { refreshToken: token }, undefined, undefined, false)
        .then(session => { if (generation !== this.generation) throw new ApiError(401, 'SESSION_CHANGED', '다시 로그인해 주세요.'); this.session = session; })
        .catch(error => { if (generation === this.generation) { this.clear(); this.onSessionExpired?.(); } throw error; })
        .finally(() => { if (generation === this.generation) this.refreshing = null; });
    }
    return this.refreshing;
  }
  async request<T>(method: string, path: string, body?: unknown, workspace?: string, key?: string, retry = true, format: 'json' | 'image' | 'frame' = 'json'): Promise<T> {
    const generation = this.generation;
    const headers = new Headers({ Accept: format === 'json' ? 'application/json' : 'image/jpeg' });
    if (body !== undefined) headers.set('Content-Type', 'application/json');
    const access = this.session?.accessToken;
    if (access) headers.set('Authorization', `Bearer ${access}`);
    if (workspace) headers.set('X-Workspace-Id', workspace);
    if (key) headers.set('Idempotency-Key', key);
    let response: Response;
    try { response = await fetch(`${this.baseUrl}/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(15000) }); }
    catch { throw new Error('서버에 연결하지 못했어요. 네트워크와 아가아이 서버 주소를 확인해 주세요.'); }
    if (generation !== this.generation) throw new ApiError(401, 'SESSION_CHANGED', '로그인 계정이 변경됐어요.');
    if (response.status === 401 && retry && this.session && !path.startsWith('/auth/')) {
      // Another concurrent request may already have rotated the access token.
      if (access === this.session.accessToken) await this.refresh();
      return this.request<T>(method, path, body, workspace, key, false, format);
    }
    if (response.ok && format !== 'json') {
      if (response.status === 204) return null as T;
      if (!response.headers.get('content-type')?.startsWith('image/jpeg')) throw new Error('알림 사진 형식을 확인할 수 없어요.');
      const image = await response.blob();
      return (format === 'frame' ? { image, headers: response.headers } : image) as T;
    }
    const data = await response.json().catch(() => null);
    if (generation !== this.generation) throw new ApiError(401, 'SESSION_CHANGED', '로그인 계정이 변경됐어요.');
    if (!response.ok) {
      if (response.status === 401 && !path.startsWith('/auth/') && this.session) { this.clear(); this.onSessionExpired?.(); }
      if (response.status === 404 && path.startsWith('/auth/')) throw new ApiError(404, 'API_ROUTE_NOT_FOUND', '로그인 서버를 찾지 못했어요. 서버 연결 주소와 배포 설정을 확인해 주세요.');
      const code = data?.error?.code ?? 'API_ERROR';
      throw new ApiError(response.status, code, messages[code] ?? data?.error?.message ?? `요청에 실패했어요 (${response.status}).`);
    }
    if (!data) throw new Error('서버 응답을 확인할 수 없어요. API 주소를 확인해 주세요.');
    return data as T;
  }
  async authenticate(mode: 'login' | 'signup', identifier: string, password: string) {
    const normalized = identifier.trim().toLowerCase();
    const body = { username: normalized, password };
    const session = await this.request<Session>('POST', `/auth/${mode}`, body);
    this.generation++; this.refreshing = null; this.session = session; return session;
  }
  async logout() { try { await this.request('POST', '/auth/logout', {}); } finally { this.clear(); } }
  workspaces() { return this.request<{ items: Workspace[] }>('GET', '/me/workspaces'); }
  children(workspace: string) { return this.request<{ items: Child[] }>('GET', '/children', undefined, workspace); }
  createChild(workspace: string, displayName: string, birthDate: string, key: string) { return this.request<Child>('POST', '/children', { displayName, birthDate }, workspace, key); }
  updateChild(workspace: string, child: string, displayName: string, birthDate: string) { return this.request<Pick<Child, 'id' | 'displayName' | 'birthDate'>>('PATCH', `/children/${encodeURIComponent(child)}`, { displayName, birthDate }, workspace); }
  devices(workspace: string, child: string) { return this.request<{ items: Device[] }>('GET', `/children/${encodeURIComponent(child)}/devices`, undefined, workspace); }
  inspect(workspace: string, code: string) { return this.request<Pairing>('POST', '/device-pairings/inspect', { code: normalizePairingCode(code) }, workspace); }
  approve(workspace: string, childId: string, code: string, name: string, key: string) { return this.request('POST', '/device-pairings/approve', { code: normalizePairingCode(code), childId, name }, workspace, key); }
  unlink(workspace: string, device: string) { return this.request('DELETE', `/devices/${encodeURIComponent(device)}`, undefined, workspace); }
  skyEye(workspace: string, child: string) { return this.request<SkySnapshot>('GET', `/children/${encodeURIComponent(child)}/sky-eye`, undefined, workspace); }
  alertPhoto(workspace: string, child: string, device: string, alert: string) { return this.request<Blob | null>('GET', `/children/${encodeURIComponent(child)}/devices/${encodeURIComponent(device)}/alerts/${encodeURIComponent(alert)}/photo`, undefined, workspace, undefined, true, 'image'); }
  acknowledgeAlert(workspace: string, child: string, device: string, alert: string) {
    return this.request<{ id: string; acknowledgedAt: string; duplicate: boolean }>('POST', `/children/${encodeURIComponent(child)}/devices/${encodeURIComponent(device)}/alerts/${encodeURIComponent(alert)}/acknowledgement`, {}, workspace);
  }
  async latestCapture(workspace: string, child: string, device: string): Promise<LatestCapture | null> {
    const frame = await this.request<{ image: Blob; headers: Headers } | null>('GET', `/children/${encodeURIComponent(child)}/devices/${encodeURIComponent(device)}/capture`, undefined, workspace, undefined, true, 'frame');
    if (!frame) return null;
    const capturedAt = frame.headers.get('X-Frame-Captured-At'), state = frame.headers.get('X-Frame-State');
    // Without its capture time a frame could be mistaken for the current scene.
    if (!capturedAt || !Number.isFinite(Date.parse(capturedAt)) || !state) throw new Error('사진의 촬영 시각을 확인할 수 없어요.');
    return { image: frame.image, capturedAt, state, posture: frame.headers.get('X-Frame-Posture'), airway: frame.headers.get('X-Frame-Airway') };
  }
  careHistory<T>(workspace: string, child: string, kind: HistoryKind, cursor: string | null = null) {
    const query = new URLSearchParams({ kind, limit: '100' }); if (cursor) query.set('cursor', cursor);
    return this.request<{ items: T[]; nextCursor: string | null }>('GET', `/children/${encodeURIComponent(child)}/care-history?${query}`, undefined, workspace);
  }
  saveCareHistory(workspace: string, child: string, changes: CareChanges, key: string) {
    return this.request<SavedCare>('PUT', `/children/${encodeURIComponent(child)}/care-history`, changes, workspace, key);
  }
}
