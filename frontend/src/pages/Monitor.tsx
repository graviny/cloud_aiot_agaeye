import { useId, useState } from 'react';
import { Camera, ChevronRight, CircleHelp, ShieldCheck, Thermometer, Droplets } from 'lucide-react';
import { Badge, Button, PageHeader, SectionHeader } from '../components';
import { useApp } from '../context';
import { getSleepRisk } from '../domain';
import { SkyEyeSafety } from '../components/SkyEyePanel';
import { AlertPhoto, alertTime } from '../components/AlertPhoto';
import { alertLabel, listAlerts } from '../skyEye';
function MonitorHelp() {
    const [open, setOpen] = useState(false);
    const id = useId();
    return <div className="monitor-help" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
        <button type="button" className="flow-help-button" aria-label="모니터링 감지 안내" aria-describedby={open ? id : undefined}
            onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onClick={() => setOpen(true)}
            onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); } }}>
            <CircleHelp size={18}/>
        </button>
        {open && <div className="monitor-help-tooltip" id={id} role="tooltip">화면에 감지 알림이 없어도 위험이 없다는 의미는 아니에요. 아이의 상태를 직접 확인해 주세요.</div>}
    </div>;
}

export function Monitor({ onAlert }: { onAlert: () => void }) {
    const { data, path, go, sky } = useApp();
    const snapshot = sky.snapshot?.childId === data.child?.id ? sky.snapshot : null;
    const alerts = listAlerts(snapshot);
    const selectedId = path.startsWith('/monitor/alerts/') ? path.slice('/monitor/alerts/'.length) : '';
    const selected = alerts.find(({ alert }) => alert.id === selectedId);
    const connected = snapshot?.items.some(item => item.connected);
    const active = data.demo && data.alert && data.alert.status !== 'resolved';
    return <>
        <PageHeader title="수면 모니터링" subtitle="수면 환경과 알림 당시의 사진을 확인해요" action={<Badge tone={connected ? 'green' : 'gray'}>{connected ? '기기 연결됨' : snapshot?.items.length ? '파이 연결 대기' : '아가아이 연결 필요'}</Badge>}/>
        <div className="device-entry"><Button variant="secondary" onClick={() => go('/devices')}><Camera size={18}/> 아가아이 연결하기</Button></div>
        <div className="monitor-grid"><section className="card monitor-main">
            <SectionHeader title={selectedId ? '알림 상세' : '최근 수면 알림'} icon={<Camera size={19}/>}/>
            {selectedId ? <>
                {selected ? <><h3>{alertLabel(selected.alert)}</h3>
                    <p>{selected.device.name} · {alertTime(selected.alert.observedAt)}</p>
                    <AlertPhoto device={selected.device.deviceId} alert={selected.alert}/></>
                    : <p className="muted">{sky.loading ? '알림을 불러오고 있어요.' : '이 알림을 찾을 수 없어요.'}</p>}
                <Button variant="secondary" onClick={() => go('/monitor')}>알림 목록</Button>
            </> : active && data.alert ? <Button variant="secondary" className="full" onClick={onAlert}>{getSleepRisk(data.alert).message} · 시연 알림 <ChevronRight size={16}/></Button>
            : alerts.length ? <div className="photo-alert-list">{alerts.map(({ device, alert }) =>
                <button key={alert.id} onClick={() => go('/monitor/alerts/' + alert.id)}>
                    <span><strong>{alertLabel(alert)}</strong><small>{device.name} · {alertTime(alert.observedAt)}</small></span><ChevronRight size={17}/>
                </button>)}</div>
            : <p className="alert-photo-empty">{sky.error || (sky.loading ? '알림을 불러오고 있어요.' : '아직 수면 알림이 없어요. 알림이 생기면 이곳에서 사진을 확인할 수 있어요.')}</p>}
            <MonitorHelp/>
        </section><div className="monitor-side"><section className="card"><SectionHeader title="수면 환경 점검" icon={<ShieldCheck size={19}/>}/><p className="section-description">카메라 연결 후 감지 상태를 표시해요.</p>{data.demo ? <div className="safety-list">{['아기 자세', '얼굴 노출', '주변 물체', '가장자리 접근'].map(label => <div key={label} className={label === '아기 자세' && data.alert?.kind === 'posture' && data.alert.childId === data.child?.id && data.alert.status !== 'resolved' ? 'posture-risk-highlight' : undefined}><span><ShieldCheck size={17}/>{label}</span><Badge tone={active && getSleepRisk(data.alert!).label === label ? 'red' : 'gray'}>{active && getSleepRisk(data.alert!).label === label ? '위험 의심 · 시연' : '확인 불가'}</Badge></div>)}</div> : <SkyEyeSafety/>}</section><section className="card environment-disabled" aria-label="아이의 주변 환경" aria-disabled="true"><div className="section-heading"><h2>아이의 주변 환경</h2><Badge tone="gray">비활성화</Badge></div><p className="section-description">주변 환경 기능은 현재 비활성화되어 있어요.</p><div className="sensor-cards"><div><Thermometer /><span>실내 온도</span><strong>—</strong><small>사용 안 함</small></div><div><Droplets /><span>실내 습도</span><strong>—</strong><small>사용 안 함</small></div></div></section></div>
        </div>
    </>;
}
