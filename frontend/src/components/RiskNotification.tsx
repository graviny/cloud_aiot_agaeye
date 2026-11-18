import { useEffect, useState } from 'react';
import { ArrowRight, CircleAlert } from 'lucide-react';
import { Badge, Button, Modal } from '../components';
import { useApp } from '../context';
import { getSleepRisk, timeLabel, updateAlert } from '../domain';
import { alertLabel, listAlerts } from '../skyEye';
import { AlertPhoto, alertTime } from './AlertPhoto';

const announced = new Set<string>();

export function ModelRiskNotification() {
    const { data, account, workspaceId, sky, path } = useApp();
    const [open, setOpen] = useState<{ scope: string; id: string } | null>(null);
    const scope = account && !data.demo && data.child && data.onboardingComplete
        ? JSON.stringify([account, workspaceId, data.child.id]) : '';
    const snapshot = sky.snapshot?.childId === data.child?.id ? sky.snapshot : null;
    useEffect(() => {
        if (!scope || !snapshot || open?.scope === scope) return;
        const now = Date.parse(snapshot.serverTime);
        for (const { alert } of listAlerts(snapshot)) {
            if (now - Date.parse(alert.observedAt) > 30000) continue;
            const key = 'agaeye-alert-seen:' + scope + ':' + alert.id;
            let seen = announced.has(key);
            try { seen ||= sessionStorage.getItem(key) === '1'; } catch { /* Memory fallback. */ }
            if (seen) continue;
            announced.add(key);
            try { sessionStorage.setItem(key, '1'); } catch { /* Memory fallback. */ }
            if (path === '/monitor/alerts/' + alert.id) continue;
            setOpen({ scope, id: alert.id });
            break;
        }
    }, [scope, snapshot, open, path]);
    const entry = open?.scope === scope ? listAlerts(snapshot).find(item => item.alert.id === open.id) : null;
    useEffect(() => {
        if (open && (!scope || open.scope !== scope || snapshot && !entry)) setOpen(null);
    }, [scope, snapshot, entry, open]);
    if (!entry) return null;
    return <div className="risk-notification-layer"><Modal title="수면 상태 알림" onClose={() => setOpen(null)}>
        <h2>{alertLabel(entry.alert)}</h2>
        <p>{entry.device.name} · {alertTime(entry.alert.observedAt)}</p>
        <AlertPhoto device={entry.device.deviceId} alert={entry.alert}/>
        <p>아이의 상태를 직접 확인해 주세요.</p>
        <Button className="full" onClick={() => setOpen(null)}>확인했어요</Button>
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
        <figure className="alert-photo"><img src="/baby-demo.png" alt="시연 알림에 첨부한 예시 사진"/><figcaption>시연 알림 사진</figcaption></figure><div className="urgent-instruction">{risk.instruction}</div>
        <Button className="full" variant="danger" disabled={busy} onClick={async () => {
            const id = alert.id;
            const startedAt = alert.startedAt;
            const saved = await commit(d => d.alert?.id === id && d.alert.startedAt === startedAt && d.alert.status !== 'resolved' ? { ...d, alert: updateAlert(d.alert, 'check') } : d);
            if (saved) { close(); go('/monitor'); }
        }}>지금 확인하기 <ArrowRight size={17}/></Button>
        <Button className="full" variant="ghost" onClick={close}>나중에 확인</Button>
    </Modal></div>;
}
