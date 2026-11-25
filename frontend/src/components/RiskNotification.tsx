import { useEffect, useState } from 'react';
import { ArrowRight, CircleAlert } from 'lucide-react';
import { Badge, Button, Modal } from '../components';
import { useApp } from '../context';
import { getSleepRisk, timeLabel, updateAlert } from '../domain';
import { alertLabel, listAlerts, pendingSecondAlerts, SECOND_ALERT_SECONDS } from '../skyEye';
import { AlertPhoto, alertTime } from './AlertPhoto';
import { playNotification } from './NotificationSettings';

const announced = new Set<string>();

/** Returns whether this key was already announced, and records it either way. */
function seenBefore(key: string) {
    let seen = announced.has(key);
    try { seen ||= sessionStorage.getItem(key) === '1'; } catch { /* Memory fallback. */ }
    announced.add(key);
    try { sessionStorage.setItem(key, '1'); } catch { /* Memory fallback. */ }
    return seen;
}

/** A system notification and sound reach a caregiver who is not looking at this page. */
function announce(title: string, body: string, tag: string, push: boolean) {
    if (push && 'Notification' in window && Notification.permission === 'granted') {
        try { new Notification(title, { body, tag }); } catch { /* Some mobile browsers allow notifications only from a service worker. */ }
    }
    playNotification().catch(() => { /* Browsers can block sound until the page has been used. */ });
}

export function ModelRiskNotification() {
    const { data, account, workspaceId, sky, path, api, toast } = useApp();
    const [open, setOpen] = useState<{ scope: string; id: string; stage: 'first' | 'second' } | null>(null);
    const [saving, setSaving] = useState(false);
    const scope = account && !data.demo && data.child && data.onboardingComplete
        ? JSON.stringify([account, workspaceId, data.child.id]) : '';
    const snapshot = sky.snapshot?.childId === data.child?.id ? sky.snapshot : null;
    const push = data.preferences.push;
    useEffect(() => {
        if (!scope || !snapshot || open?.scope === scope) return;
        const now = Date.parse(snapshot.serverTime);
        // A second alert comes first: an immediate alert went unacknowledged.
        for (const { device, alert } of pendingSecondAlerts(snapshot)) {
            if (now - Date.parse(alert.secondAlertAt!) > 60000) continue;
            if (seenBefore('agaeye-alert-second-seen:' + scope + ':' + alert.id)) continue;
            announce('2차 알림 · ' + alertLabel(alert), device.name + ' · 아직 확인되지 않았어요.', alert.id + ':second', push);
            setOpen({ scope, id: alert.id, stage: 'second' });
            return;
        }
        for (const { device, alert } of listAlerts(snapshot)) {
            if (now - Date.parse(alert.observedAt) > 30000 || alert.acknowledgedAt) continue;
            if (seenBefore('agaeye-alert-seen:' + scope + ':' + alert.id)) continue;
            if (path === '/monitor/alerts/' + alert.id) continue;
            announce(alertLabel(alert), device.name + ' · 아이의 상태를 직접 확인해 주세요.', alert.id, push);
            setOpen({ scope, id: alert.id, stage: 'first' });
            break;
        }
    }, [scope, snapshot, open, path, push]);
    const entry = open?.scope === scope ? listAlerts(snapshot).find(item => item.alert.id === open.id) : null;
    useEffect(() => {
        // Close when the alert disappears or another caregiver already acknowledged it.
        if (open && (!scope || open.scope !== scope || snapshot && (!entry || entry.alert.acknowledgedAt))) setOpen(null);
    }, [scope, snapshot, entry, open]);
    if (!entry || !open || !data.child) return null;
    const second = open.stage === 'second';
    const child = data.child.id;
    const acknowledge = async () => {
        setSaving(true);
        try {
            await api.acknowledgeAlert(workspaceId, child, entry.device.deviceId, entry.alert.id);
            setOpen(null);
        } catch (error) {
            toast(error instanceof Error ? error.message : '확인 기록을 저장하지 못했어요.');
        } finally { setSaving(false); }
    };
    return <div className="risk-notification-layer"><Modal title={second ? '2차 알림' : '수면 상태 알림'} onClose={() => setOpen(null)}>
        <h2>{alertLabel(entry.alert)}</h2>
        <p>{entry.device.name} · {alertTime(entry.alert.observedAt)}</p>
        <AlertPhoto device={entry.device.deviceId} alert={entry.alert}/>
        <p>{second ? `알림 후 ${SECOND_ALERT_SECONDS}초가 지나도록 확인되지 않았어요. 지금 바로 아이를 확인해 주세요.` : '아이의 상태를 직접 확인해 주세요.'}</p>
        <Button className="full" variant={second ? 'danger' : undefined} disabled={saving} onClick={acknowledge}>확인했어요</Button>
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
