import { HomeObservationBanner } from './HomeObservationBanner';
import { ArrowRight, CircleAlert } from 'lucide-react';
import { Badge, Button, Cloud } from '../components';
import { useApp } from '../context';
import { getSleepRisk, koreaDate, timeLabel, today } from '../domain';
export function AlertBanner({ onAlert }: {
    onAlert: () => void;
}) { const { data, sky, go } = useApp(); if (!data.demo) return <HomeObservationBanner items={sky.snapshot?.items || []} childId={data.child?.id} childName={data.child?.name} go={go}/>; const active = data.alert && data.alert.status !== 'resolved'; return active ? <div className="alert-banner danger"><span className="alert-icon"><CircleAlert size={27}/></span><div><span className="eyebrow">즉시 확인 필요 · 시연 알림</span><h3>{getSleepRisk(data.alert!).message}</h3><p>{getSleepRisk(data.alert!).instruction}</p></div><Button variant="yellow" onClick={onAlert}>확인하러 가기 <ArrowRight size={16}/></Button></div> : <div className="alert-banner calm"><Cloud /><div><h3>새로운 감지 알림이 없어요.</h3><p>{data.demo ? data.child?.name + '의 평온한 하루를 함께 살펴요.' : '카메라 미연결 · 현재 상태는 직접 확인해 주세요.'}</p></div><span className="banner-sparkle">✧</span></div>; }
export function Timeline({ date = today() }: { date?: string }) {
    const { data } = useApp();
    const dayStart = Date.parse(date + 'T00:00:00+09:00');
    const sleeps = data.sleepRecords.filter(r => r.childId === data.child!.id && Date.parse(r.endedAt) > dayStart && Date.parse(r.startedAt) < dayStart+86400000);
    return <div className="timeline"><div className="timeline-legend"><span><i className="sleep-dot"/>수면</span></div><div className="timeline-track" aria-label="24시간 수면 기록">
    {sleeps.map(r => { const start = Math.max(0, Date.parse(r.startedAt)-dayStart); const end = Math.min(86400000,Date.parse(r.endedAt)-dayStart); return <span key={r.id} className="sleep-block" title={`수면 ${timeLabel(r.startedAt)}–${timeLabel(r.endedAt)}`} style={{left:`${start/864000}%`,width:`${(end-start)/864000}%`}}/>; })}
    </div><div className="timeline-hours"><span>00시</span><span>06시</span><span>12시</span><span>18시</span><span>24시</span></div>{!sleeps.length && <p className="muted small-text">아직 수면 기록이 없어요.</p>}</div>;
}
