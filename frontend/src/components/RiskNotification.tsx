import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CircleAlert } from 'lucide-react';
import { Badge, Button, Modal } from '../components';
import { useApp } from '../context';
import { getSleepRisk, timeLabel, updateAlert } from '../domain';
import { eventLabel, safetyLabels } from '../skyEye';
import { advanceSafetyNotices, currentSafetyNotices, type SafetyNotice, type SafetyNoticeState } from '../safetyNotifications';

// Each detection is announced once per browser session, without resolving it.
const announced = new Set<string>();
// Real model events retain their own IDs and never resolve the caregiver's local alert.
export function ModelRiskNotification() {
    const { data, account, workspaceId, sky, go } = useApp();
    const [openKey, setOpenKey] = useState('');
    const [safetyOpen, setSafetyOpen] = useState<{ scope: string; notices: SafetyNotice[] } | null>(null);
    const tracker = useRef<{ scope: string; state: SafetyNoticeState }>({ scope: '', state: {} });
    const scope = !data.demo && account && data.child && data.onboardingComplete
        ? JSON.stringify([account, workspaceId, data.child.id]) : '';
    useEffect(() => {
        if (tracker.current.scope !== scope) {
            let state: SafetyNoticeState = {};
            try {
                const stored = JSON.parse(sessionStorage.getItem('agaeye-safety-notices:' + scope) || '{}');
                for (const [key, value] of Object.entries(stored)) {
                    const entry = value as SafetyNoticeState[string];
                    if (entry && [-1, 0, 1, 2].includes(entry.highest) && [entry.unknownSince, entry.stableSince].every(time => time === null || typeof time === 'number' && Number.isFinite(time))) state[key] = { ...entry, unknownSince: null, stableSince: null };
                }
            } catch { /* Memory fallback. */ }
            tracker.current = { scope, state };
            setSafetyOpen(null);
        }
        if (!scope) return;
        const observations = sky.snapshot?.childId === data.child?.id && sky.snapshot ? currentSafetyNotices(sky.snapshot.items) : [];
        const result = advanceSafetyNotices(tracker.current.state, observations, Date.now());
        tracker.current.state = result.state;
        try { sessionStorage.setItem('agaeye-safety-notices:' + scope, JSON.stringify(result.state)); } catch { /* Memory fallback. */ }
        if (result.notices.length) setSafetyOpen(previous => ({ scope, notices: [...(previous?.scope === scope ? previous.notices.filter(old => !result.notices.some(next => next.key === old.key)) : []), ...result.notices] }));
    }, [scope, sky.snapshot, data.child?.id]);
    const observation = !data.demo && account && data.onboardingComplete
        ? sky.snapshot?.items.flatMap(device => device.events.filter(entry => entry.recent && entry.event.kind === 'risk_started' && !['prone', 'face_covered'].includes(entry.event.riskType || '')).map(entry => ({ device, event: entry.event })))[0] : undefined;
    const key = observation ? JSON.stringify([account, workspaceId, data.child?.id, observation.device.deviceId, observation.event.id]) : '';
    useEffect(() => {
        if (!key) { setOpenKey(''); return; }
        let seen = announced.has(key);
        try { seen ||= sessionStorage.getItem('agaeye-model-seen:' + key) === '1'; } catch { /* memory fallback */ }
        if (seen) return;
        announced.add(key);
        try { sessionStorage.setItem('agaeye-model-seen:' + key, '1'); } catch { /* memory fallback */ }
        setOpenKey(key);
    }, [key]);
    if (scope && safetyOpen?.scope === scope) return <SafetyObservationPopup notices={safetyOpen.notices} childName={data.child?.name || '아이'} onClose={() => setSafetyOpen(null)} onMonitor={() => { setSafetyOpen(null); go('/monitor'); }}/>;
    if (!observation || openKey !== key) return null;
    const close = () => setOpenKey('');
    return <div className="risk-notification-layer"><Modal title="기기 관측 알림" onClose={close}>
        <div className="alert-detail-header"><CircleAlert size={35}/><Badge tone="red">모델 위험 의심</Badge><h2>{eventLabel(observation.event)}</h2><p>{data.child?.name} · {timeLabel(observation.event.observedAt)} 관측</p></div>
        <div className="urgent-instruction">아이의 상태를 직접 확인해 주세요. 관측이 중단되거나 구간이 종료되어도 안전하다는 뜻은 아니에요.</div>
        <Button className="full" variant="danger" onClick={() => { close(); go('/monitor'); }}>관측 결과 확인하기 <ArrowRight size={17}/></Button>
        <Button className="full" variant="ghost" onClick={close}>닫기</Button>
    </Modal></div>;
}
export function RiskNotification() {
    const { data, account, go, commit, busy } = useApp();
    const [openKey, setOpenKey] = useState<string | null>(null);
    const alert = data.alert;
    const eligible = !!(account && data.child && data.onboardingComplete && alert && data.demo && (alert.kind === 'posture' || alert.kind === 'face') && alert.childId === data.child.id && alert.status !== 'resolved');
    const key = eligible && alert ? JSON.stringify([account, alert.childId, alert.id, alert.kind || 'face', alert.startedAt]) : '';
    useEffect(() => {
        if (!key) { setOpenKey(null); return; }
        let seen = announced.has(key);
        try { seen ||= sessionStorage.getItem('agaeye-risk-seen:' + key) === '1'; } catch { /* In-memory deduplication still applies. */ }
        if (seen) return;
        announced.add(key);
        try { sessionStorage.setItem('agaeye-risk-seen:' + key, '1'); } catch { /* Storage can be unavailable. */ }
        setOpenKey(key);
    }, [key]);
    if (!eligible || !alert || openKey !== key) return null;
    const close = () => setOpenKey(null);
    const risk = getSleepRisk(alert);
    return <div className="risk-notification-layer"><Modal title="위험 감지 알림" onClose={close}>
        <div className="alert-detail-header"><CircleAlert size={35}/><Badge tone="red">즉시 확인 필요{data.demo ? ' · 체험' : ''}</Badge><h2>{risk.message}</h2><p>{data.child?.name} · {timeLabel(alert.startedAt)} 감지</p></div>
        <div className="urgent-instruction">{risk.instruction}</div>
        <Button className="full" variant="danger" disabled={busy} onClick={async () => {
            const id = alert.id;
            const startedAt = alert.startedAt;
            const saved = await commit(d => d.alert?.id === id && d.alert.startedAt === startedAt && d.alert.status !== 'resolved' ? { ...d, alert: updateAlert(d.alert, 'check') } : d);
            if (saved) { close(); go('/monitor'); }
        }}>지금 확인하기 <ArrowRight size={17}/></Button>
        <Button className="full" variant="ghost" onClick={close}>나중에 확인</Button>
    </Modal></div>;
}

export function SafetyObservationPopup({ notices, childName, onClose, onMonitor }: {
    notices: SafetyNotice[]; childName: string; onClose: () => void; onMonitor: () => void;
}) {
    const risk = notices.some(notice => notice.level === 'immediate' || notice.level === 'caution');
    return <div className="risk-notification-layer"><Modal title="아이 상태 확인 알림" onClose={onClose}>
        <div className="alert-detail-header"><CircleAlert size={35}/><Badge tone={risk ? 'red' : 'yellow'}>{risk ? '상태 확인 필요' : '관측 확인 불가'}</Badge><h2>{childName}의 상태를 확인해 주세요</h2></div>
        <div className="safety-popup-items">{notices.map(notice => <div className="safety-popup-item" key={notice.key}>
            <strong>{notice.field === 'posture' ? '아기 자세' : '얼굴 노출'} · {safetyLabels[notice.level]}</strong>
            <p>{notice.level === 'unknown' ? '현재 관측으로 확인할 수 없어요. 아이를 직접 살피고 카메라 화면과 연결 상태를 확인해 주세요.' : notice.field === 'posture' ? '주의가 필요한 자세가 관측됐어요. 아이의 자세와 상태를 직접 확인해 주세요.' : '얼굴 가림 의심 신호가 관측됐어요. 아이의 얼굴 주변을 직접 확인해 주세요.'}</p>
            <small>{notice.deviceName}</small>
        </div>)}</div>
        <Button className="full" variant={risk ? 'danger' : 'yellow'} onClick={onMonitor}>관측 결과 확인하기 <ArrowRight size={17}/></Button>
        <Button className="full" variant="ghost" onClick={onClose}>확인했어요</Button>
    </Modal></div>;
}
