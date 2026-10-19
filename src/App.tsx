import { useEffect, useState, useSyncExternalStore } from 'react';
import { Activity, ArrowRight, Baby, Bell, BookOpen, Camera, Check,
  CheckCheck, ChevronRight, Clock3, History, Info, LayoutDashboard,
  LoaderCircle, MoonStar, RefreshCw, Search, Server, ShieldCheck, TriangleAlert,
  WifiOff } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { DATA_MODE, source, STALE_AFTER_MS, LOCAL_AI_DEMO } from './data/source';
import { isSnapshotStale, localDate, timeLabel, visibleStatus } from './domain/monitor';
import { riskLabels } from './domain/types';
import type { MonitorSnapshot, RiskEvent } from './domain/types';
import { DemoPanel } from './components/DemoPanel';
import { Modal } from './components/Modal';
import { Photo } from './components/Photo';
import { MonitorPhoto } from './components/MonitorPhoto';

type Page = 'monitor' | 'history' | 'help';
type Tone = 'green' | 'amber' | 'red' | 'neutral';

function StatusCard({ title, value, note, icon: Icon, tone, updatedAt }: {
  title: string; value: string; note: string; icon: LucideIcon; tone: Tone; updatedAt: string | null;
}) {
  return <article className={`status-card tone-${tone}`} aria-label={`${title}: ${value}`}>
    <div className="status-card-top"><span>{title}</span><span className="status-icon"><Icon size={19} /></span></div>
    <div className="status-value"><span className="status-dot" />{value}</div>
    <p>{note}</p><div className="status-time"><Clock3 size={12} />{timeLabel(updatedAt)}</div>
  </article>;
}

function EventList({ events, onSelect, onAcknowledge, busyId, compact = false }: {
  events: RiskEvent[]; onSelect: (id: string) => void;
  onAcknowledge: (id: string) => void; busyId: string | null; compact?: boolean;
}) {
  if (!events.length) return <div className="empty-state"><ShieldCheck size={32} /><h3>아직 위험 이력이 없어요</h3><p>새로운 이벤트가 발생하면 여기에 기록돼요.</p></div>;
  return <div className={`event-list ${compact ? 'compact' : ''}`}>
    <div className="event-table-head"><span>위험 유형 · 발생 시각</span><span>진행 상태</span><span>보호자 확인</span><span>상세</span></div>
    {events.map(event => <article className="event-row" key={event.id}>
      <button className="event-main" onClick={() => onSelect(event.id)} aria-label={`${riskLabels[event.kind]} ${timeLabel(event.confirmedAt)} 상세 보기`}>
        <span className={`event-icon ${event.endedAt ? 'muted' : ''}`}><TriangleAlert size={18} /></span>
        <span><strong>{riskLabels[event.kind]}{event.delayed && <span className="delayed-label">지연 수신</span>}</strong><span className="event-date">{timeLabel(event.confirmedAt, true)}<span>·</span>{event.photoState === 'missing' ? '사진 없음' : event.isExample ? '예시 이미지' : '사진 있음'}</span></span>
      </button>
      <span className={`badge ${event.endedAt ? 'neutral' : 'red'}`}>{event.endedAt ? '종료됨' : '진행 중'}</span>
      {event.acknowledgedAt ? <span className="acknowledged"><CheckCheck size={15} />확인 완료</span>
        : <button className="ack-button" disabled={busyId === event.id} onClick={() => onAcknowledge(event.id)}>{busyId === event.id ? '저장 중…' : '확인했어요'}</button>}
      <button className="icon-button event-chevron" aria-label={`${riskLabels[event.kind]} 이벤트 상세`} onClick={() => onSelect(event.id)}><ChevronRight size={18} /></button>
    </article>)}
  </div>;
}

function EventDetail({ event, onClose, onAcknowledge, busyId }: {
  event: RiskEvent; onClose: () => void; onAcknowledge: (id: string) => void; busyId: string | null;
}) {
  return <Modal title="위험 이벤트 상세" onClose={onClose}>
    <div className="detail-title"><span className={`badge ${event.endedAt ? 'neutral' : 'red'}`}>{event.endedAt ? '종료됨' : '진행 중'}</span><h3>{riskLabels[event.kind]}</h3>{event.delayed && <p className="muted-text">연결 복구 후 수신한 과거 이벤트예요.</p>}</div>
    <Photo event={event} />
    <dl className="detail-fields">
      <div><dt>위험 시작</dt><dd>{timeLabel(event.startedAt, true)}</dd></div>
      <div><dt>위험 확정</dt><dd>{timeLabel(event.confirmedAt, true)}</dd></div>
      <div><dt>위험 종료</dt><dd>{event.endedAt ? timeLabel(event.endedAt, true) : '아직 종료되지 않음'}</dd></div>
      <div><dt>사진 촬영</dt><dd>{event.capturedAt ? timeLabel(event.capturedAt, true) : '시각 미제공'}</dd></div>
      <div><dt>보호자 확인</dt><dd>{event.acknowledgedAt ? timeLabel(event.acknowledgedAt, true) : '미확인'}</dd></div>
      <div><dt>이벤트 ID</dt><dd className="event-id">{event.id}</dd></div>
    </dl>
    <div className="detail-bottom"><p><Info size={14} />확인 버튼은 위험 상태를 해제하지 않아요.</p><button className="button primary" disabled={!!event.acknowledgedAt || busyId === event.id} onClick={() => onAcknowledge(event.id)}><Check size={16} />{event.acknowledgedAt ? '확인 완료' : busyId === event.id ? '저장 중…' : '확인했어요'}</button></div>
  </Modal>;
}

function HistoryPage({ snapshot, onSelect, onAcknowledge, busyId, onRefresh }: {
  snapshot: MonitorSnapshot; onSelect: (id: string) => void; onAcknowledge: (id: string) => void;
  busyId: string | null; onRefresh: () => void;
}) {
  const [date, setDate] = useState('');
  const [kind, setKind] = useState('all');
  const [confirmation, setConfirmation] = useState('all');
  const filtered = snapshot.events.filter(event => (!date || localDate(event.confirmedAt) === date)
    && (kind === 'all' || event.kind === kind)
    && (confirmation === 'all' || (confirmation === 'unread' ? !event.acknowledgedAt : !!event.acknowledgedAt)));
  return <section className="panel history-panel">
    <div className="panel-heading"><div><h2>전체 기록</h2><p>날짜와 유형으로 기록을 찾을 수 있습니다.</p></div><button className="button small" onClick={onRefresh}><RefreshCw size={15} />새로고침</button></div>
    <div className="filters"><label>발생 날짜<input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
      <label>위험 유형<select value={kind} onChange={event => setKind(event.target.value)}><option value="all">전체 유형</option><option value="prone">엎드림</option><option value="face_covered">안면 차폐</option><option value="combined">복합 위험</option></select></label>
      <label>보호자 확인<select value={confirmation} onChange={event => setConfirmation(event.target.value)}><option value="all">전체</option><option value="unread">미확인</option><option value="read">확인 완료</option></select></label>
      <button className="text-button filter-reset" onClick={() => { setDate(''); setKind('all'); setConfirmation('all'); }}>필터 초기화</button></div>
    <div className="list-count">총 <strong>{filtered.length}</strong>건{(date || kind !== 'all' || confirmation !== 'all') && ' · 필터 적용 중'}</div>
    {snapshot.historyError ? <div className="empty-state error-state"><TriangleAlert size={30} /><h3>이력을 불러오지 못했어요</h3><p>{snapshot.historyError}</p><button className="button" onClick={onRefresh}>다시 시도</button></div>
      : snapshot.loading ? <div className="empty-state"><LoaderCircle className="spin" /><p>이력을 불러오는 중이에요.</p></div>
        : filtered.length ? <EventList events={filtered} onSelect={onSelect} onAcknowledge={onAcknowledge} busyId={busyId} />
          : <div className="empty-state"><Search size={30} /><h3>{snapshot.events.length ? '조건에 맞는 이력이 없어요' : '아직 위험 이력이 없어요'}</h3><p>{snapshot.events.length ? '날짜나 위험 유형을 변경해 보세요.' : '위험 이벤트가 발생하면 이곳에서 확인할 수 있어요.'}</p></div>}
  </section>;
}

function HelpPage() {
  return <div className="help-grid"><section className="panel"><div className="panel-heading"><div><h2>처음 사용하는 아가 아이</h2><p>현재 상태를 확인하고, 알림이 오면 아기를 직접 살펴보세요.</p></div><BookOpen size={22} /></div>
    <ol className="help-steps"><li><span>01</span><div><h3>연결과 분석 상태를 확인해요</h3><p>서버와 {LOCAL_AI_DEMO ? '노트북 분석 프로그램' : '라즈베리파이'} 연결, 카메라 입력이 정상인지 확인하세요. ‘판단 불가’는 ‘정상’과 다른 상태예요.</p></div></li><li><span>02</span><div><h3>위험 알림과 사진을 확인해요</h3><p>알림이 발생한 시각의 사진을 보여드려요. 실시간 영상이 아니며, 사진을 불러오지 못해도 텍스트 알림은 표시돼요.</p></div></li><li><span>03</span><div><h3>아기를 직접 확인하고 기록해요</h3><p>‘확인했어요’를 누르면 보호자 확인 시각이 남아요. 위험 종료는 분석 결과에 따라 별도로 갱신돼요.</p></div></li></ol>
  </section><section className="panel help-note"><span className="eyebrow">사용 환경</span><h2>{DATA_MODE === 'mock' ? '로컬 데모 버전' : '로컬 기기 연결'}</h2>
    {DATA_MODE === 'mock' ? <><p>데모 모드에서는 실제 카메라와 AI 모델에 연결하지 않아요. 사진은 직접 그린 예시 이미지이고, 이력은 이 브라우저에 저장돼요.</p><p>화면 아래 개발용 패널에서 여러 상황을 선택해 동작을 확인할 수 있어요.</p></> : <><p>연결된 기기의 분석 결과와 위험 발생 당시 사진을 보여드려요. 사진이 없거나 연결이 끊기면 화면 안내를 확인해 주세요.</p><p>‘확인했어요’는 보호자의 확인 기록이며 위험 종료 판정과는 별개예요.</p></>}
    <p>웹을 닫은 상태의 PUSH 알림은 제공하지 않아요.</p>
  </section></div>;
}

export default function App() {
  const snapshot = useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot);
  const [page, setPage] = useState<Page>('monitor');
  const [now, setNow] = useState(Date.now());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  useEffect(() => source.start(), []);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const status = visibleStatus(snapshot, now, STALE_AFTER_MS);
  const stale = isSnapshotStale(snapshot, now, STALE_AFTER_MS);
  const unresolved = snapshot.events.filter(event => !event.endedAt && !event.delayed);
  const activeEvent = status?.risk === 'danger'
    ? status.activeEventId !== undefined
      ? unresolved.find(event => event.id === status.activeEventId) || null
      : unresolved[0]
    : null;
  const recentPhoto = snapshot.events[0] || null;
  const selectedEvent = snapshot.events.find(event => event.id === selectedId);
  const unread = snapshot.events.filter(event => !event.acknowledgedAt).length;
  const todayEvents = snapshot.events.filter(event => localDate(event.confirmedAt) === localDate(new Date(now).toISOString()));
  const unavailable = !status || status.risk === 'unknown';
  const danger = status?.risk === 'danger';
  const caution = status?.risk === 'caution';
  const acknowledge = async (id: string) => {
    if (busyId) return;
    setBusyId(id); setActionError(null);
    try { await source.acknowledge(id); }
    catch (error) { setActionError(error instanceof Error ? error.message : '확인 기록을 저장하지 못했습니다.'); }
    finally { setBusyId(null); }
  };
  const refresh = async () => {
    setActionError(null);
    try { await source.refresh(); }
    catch (error) { setActionError(error instanceof Error ? error.message : '다시 불러오지 못했습니다.'); }
  };
  const navigate = (next: Page) => { setPage(next); setActionError(null); };
  const connection = snapshot.transport === 'connected' ? status?.server || 'connected' : snapshot.transport;
  const connectionLabel = { connected: '연결됨', connecting: '연결 중', delayed: '응답 지연', disconnected: '연결 끊김' }[connection];
  const cameraLabel = !status ? '확인 중' : { ok: '정상 작동', error: '입력 오류', disconnected: '연결 끊김', unknown: '확인 불가' }[status.camera];
  const babyLabel = !status ? '확인 중' : { present: '감지됨', absent: '감지되지 않음', unknown: '판단 불가' }[status.baby];
  const riskLabel = !status ? '확인 중' : { normal: '정상', caution: '주의', danger: '위험', unknown: '판단 불가' }[status.risk];
  const pages: { id: Page; label: string; icon: LucideIcon }[] = [
    { id: 'monitor', label: '모니터링', icon: LayoutDashboard },
    { id: 'history', label: '위험 이력', icon: History },
    { id: 'help', label: '사용 안내', icon: BookOpen },
  ];
  const heroTitle = snapshot.loading ? '분석 결과 확인 중' : danger ? '아기를 지금 확인해 주세요' : caution ? '자세 변화를 살펴보고 있어요' : status?.baby === 'absent' ? '아기가 감지되지 않았어요' : unavailable ? '현재 상태 확인 불가' : '위험 징후가 없어요';
  const heroNote = danger ? `${status?.riskKind ? riskLabels[status.riskKind] : '위험'} 징후가 감지됐어요. 아기를 직접 확인해 주세요.` : caution ? '위험 징후의 지속 여부를 분석하고 있어요.' : status?.baby === 'absent' ? '관찰 영역에서 아기를 찾지 못해 위험 여부를 판단할 수 없어요.' : unavailable ? '연결과 카메라 입력을 확인해 주세요. 마지막 결과를 정상으로 표시하지 않아요.' : '최근 분석에서 위험 징후가 확인되지 않았어요.';
  return <div className="app-shell">
    <header className="app-header">
      <a className="brand" href="#" onClick={event => { event.preventDefault(); navigate('monitor'); }} aria-label="아가 아이 모니터링 홈"><MoonStar size={28} /><span>아가 아이<small>수면 상태 모니터</small></span></a>
      <nav aria-label="주 메뉴">{pages.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${page === id ? 'active' : ''}`} aria-current={page === id ? 'page' : undefined} onClick={() => navigate(id)}><Icon size={18} /><span>{label}</span>{id === 'history' && unread > 0 && <span className="nav-count">{unread}</span>}</button>)}</nav>
      <div className="header-actions"><span className="mode-label">{DATA_MODE === 'mock' ? '데모 모드' : LOCAL_AI_DEMO ? '실제 모델 데모' : 'API 모드'}</span><button className="notification-button" aria-label={`미확인 위험 이력 ${unread}건 보기`} onClick={() => navigate('history')}><Bell size={20} />{unread > 0 && <span />}</button></div>
    </header>
    <div className="main-shell">
      <main id="main-content"><div className="page-heading"><div><h1>{page === 'monitor' ? '수면 모니터링' : page === 'history' ? '위험 이력' : '사용 안내'}</h1><p>{page === 'monitor' ? '아기의 현재 상태와 알림 사진을 함께 확인해요.' : page === 'history' ? '위험 발생 시점과 보호자 확인 기록입니다.' : '상태 표시와 알림을 읽는 방법입니다.'}</p></div><span className="today">{new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' }).format(now)}</span></div>
      {(snapshot.error || stale || actionError) && <div className="connection-alert" role="alert"><WifiOff size={18} /><span>{actionError || (stale ? '상태 갱신이 중단됐어요. 마지막 수신 정보를 현재의 정상 상태로 해석하지 마세요.' : snapshot.error)}</span><button className="text-button" onClick={refresh}><RefreshCw size={14} />다시 확인</button></div>}
      {page === 'monitor' ? <>
        <div className={`home-monitor ${danger ? 'is-danger' : ''}`}>
          <section className={`home-state ${danger ? 'state-danger' : caution ? 'state-caution' : unavailable ? 'state-unknown' : ''}`} aria-label="아기의 현재 상태">
            <div className="home-state-heading"><span>우리 아기 방</span><span className={`badge ${danger ? 'red' : caution ? 'amber' : unavailable ? 'neutral' : 'green'}`}>{danger || caution ? <TriangleAlert size={16} /> : unavailable ? <Info size={16} /> : <ShieldCheck size={16} />}{danger ? '위험 감지' : caution ? '주의 상태' : unavailable ? '상태 확인 필요' : '최근 분석 결과'}</span></div>
            <div className="hero-copy" aria-live="polite"><h2>{heroTitle}</h2><p>{heroNote}</p><span className="analysis-time">분석 시각 {timeLabel(status?.lastAnalysisAt || null)}</span></div>
            <section className="baby-state-grid" aria-label="현재 상태">
              <StatusCard title="아기 감지" value={babyLabel} icon={Baby} tone={status?.baby === 'present' ? 'green' : status?.baby === 'absent' ? 'amber' : 'neutral'} note={status?.baby === 'present' ? '관찰 영역에서 아기 확인' : status?.baby === 'absent' ? '관찰 영역에서 아기를 찾지 못했어요' : '유효한 분석 결과가 필요해요'} updatedAt={status?.lastAnalysisAt || null} />
              <StatusCard title="위험 상태" value={riskLabel} icon={ShieldCheck} tone={danger ? 'red' : caution ? 'amber' : unavailable ? 'neutral' : 'green'} note={status?.riskKind ? `${riskLabels[status.riskKind]} 징후가 감지됐어요` : unavailable ? '현재 위험 여부를 판단할 수 없어요' : '최근 분석 결과에 위험 징후 없음'} updatedAt={status?.lastAnalysisAt || null} />
            </section>
          </section>
          <MonitorPhoto event={danger ? activeEvent : recentPhoto} danger={!!danger} kind={status?.riskKind || null} loading={snapshot.loading} busyId={busyId} onAcknowledge={acknowledge} onSelect={setSelectedId} />
          <section className="home-connections" aria-label="장치 연결 상태">
            <div className="connection-heading"><h2>연결 상태</h2><span className="update-note"><span className={`tiny-dot ${!stale && snapshot.transport === 'connected' ? 'green-dot' : ''}`} />마지막 수신 {timeLabel(snapshot.receivedAt)}</span></div>
            <div className="hardware-grid">
              <StatusCard title="카메라" value={cameraLabel} icon={Camera} tone={status?.camera === 'ok' ? 'green' : status?.camera === 'disconnected' || status?.camera === 'error' ? 'red' : 'neutral'} note={status?.camera === 'ok' ? '카메라 프레임 정상 수신' : '카메라 입력 상태를 확인해 주세요'} updatedAt={status?.lastFrameAt || null} />
              <StatusCard title="서버 연결" value={connectionLabel} icon={Server} tone={connection === 'connected' ? 'green' : connection === 'disconnected' ? 'red' : connection === 'delayed' ? 'amber' : 'neutral'} note={DATA_MODE === 'mock' ? '노트북 API 연결 · 모의 상태' : '노트북 API와의 통신 상태예요'} updatedAt={snapshot.receivedAt} />
            </div>
            <div className="device-meta"><span><span className={`tiny-dot ${status?.pi === 'connected' ? 'green-dot' : status?.pi === 'disconnected' ? 'red-dot' : status?.pi === 'delayed' ? 'amber-dot' : ''}`} />{LOCAL_AI_DEMO ? '노트북 분석' : '라즈베리파이'} {status?.pi === 'connected' ? '연결됨' : status?.pi === 'disconnected' ? '연결 끊김' : '확인 중'}</span><span><Activity size={14} />분석 {status?.analysis === 'running' ? '진행 중' : '확인 불가'}</span></div>
          </section>
        </div>
        {!danger && unresolved.length > 0 && <div className="pending-risk"><TriangleAlert size={18} /><span>종료가 확인되지 않은 위험 이력이 {unresolved.length}건 있어요. 현재 상태와 별도로 확인해 주세요.</span><button className="text-button" onClick={() => setSelectedId(unresolved[0].id)}>이력 확인<ArrowRight size={14} /></button></div>}
        <div className="dashboard-lower"><section className="panel recent-panel"><div className="panel-heading"><div><h2>최근 위험 이력</h2><p>최근 발생한 이벤트와 보호자 확인 기록</p></div><div className="day-summary" aria-label="오늘의 기록"><span>오늘의 위험<strong>{todayEvents.length}<small>건</small></strong></span><span>오늘 미확인<strong>{todayEvents.filter(event => !event.acknowledgedAt).length}<small>건</small></strong></span></div><button className="text-button" onClick={() => navigate('history')}>전체 보기<ArrowRight size={15} /></button></div>{snapshot.historyError ? <div className="empty-state error-state"><TriangleAlert size={24} /><p>최근 이력을 불러오지 못했어요.</p><button className="button small" onClick={refresh}>다시 시도</button></div> : snapshot.loading ? <div className="empty-state"><LoaderCircle className="spin" /><p>이력을 불러오는 중이에요.</p></div> : <EventList events={snapshot.events.slice(0, 3)} compact onSelect={setSelectedId} onAcknowledge={acknowledge} busyId={busyId} />}</section>
        </div>
        <div className="privacy-note"><ShieldCheck size={15} /><span>{DATA_MODE === 'mock' ? '연속 영상은 사용하지 않아요. 데모 이력과 확인 기록은 이 브라우저에만 저장돼요.' : '위험 발생 사진과 이벤트만 조회해요. 연속 영상은 이 화면에서 저장하지 않아요.'}</span></div>
      </> : page === 'history' ? <HistoryPage snapshot={snapshot} onSelect={setSelectedId} onAcknowledge={acknowledge} busyId={busyId} onRefresh={refresh} /> : <HelpPage />}
      {DATA_MODE === 'mock' && <div className="demo-banner"><Info size={15} /><span><strong>모의 데이터로 실행 중이에요.</strong> 실제 카메라와 AI 모델은 연결되지 않았습니다.</span></div>}
      {DATA_MODE === 'mock' && import.meta.env.DEV && <DemoPanel source={source} message={snapshot.lastMessage} />}
      <footer><span>아가 아이<span className="footer-dot">·</span>수면 모니터링</span><span>{DATA_MODE === 'mock' ? '로컬 프론트엔드 데모' : '로컬 API 연결 모드'}</span></footer>
      </main>
    </div>
    {selectedEvent && <EventDetail event={selectedEvent} onClose={() => setSelectedId(null)} onAcknowledge={acknowledge} busyId={busyId} />}
  </div>;
}
