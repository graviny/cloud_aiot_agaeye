import { useId, useRef, useState } from 'react';
import { CircleAlert, CircleHelp, Eye, Maximize2, RefreshCw, ShieldCheck, Thermometer, Droplets, Video, VolumeX, WifiOff } from 'lucide-react';
import { Badge, Button, PageHeader, SectionHeader } from '../components';
import { useApp } from '../context';
import { getSleepRisk } from '../domain';
import { SkyEyeSafety } from '../components/SkyEyePanel';
import { CameraPreview } from '../components/CameraPreview';
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

export function Monitor({ onAlert }: {
    onAlert: () => void;
}) { const { data, toast, online, go, sky, api, workspaceId } = useApp(); const connected = sky.snapshot?.items.some(item => item.connected); const approved = !!sky.snapshot?.items.length; const streaming = sky.snapshot?.items.some(item => item.camera?.available); const [connecting, setConnecting] = useState(false); const [obstructed, setObstructed] = useState(false); const frame = useRef<HTMLDivElement>(null); const active = data.demo && data.alert && data.alert.status !== 'resolved'; const retry = async () => { if (data.demo) { toast('체험 모드에서는 기기 분석에 연결하지 않아요.'); return; } if (connecting || !data.child) return; setConnecting(true); try { await api.skyEye(workspaceId, data.child.id); toast('분석 연결 상태를 확인했어요.'); } catch (error) { toast(error instanceof Error ? error.message : '연결을 확인하지 못했어요.'); } finally { setConnecting(false); } }; return <><PageHeader title="실시간 모니터링" subtitle="아이의 상태를 가까이에서 살펴요" action={<Badge tone={connected ? "green" : "gray"}>{connected ? '기기 연결됨' : approved ? '연결 승인됨 · 파이 실행 대기' : '아가아이 연결 필요'}</Badge>}/><div className="device-entry"><Button variant="secondary" onClick={() => go('/devices')}><Video size={18}/> 아가아이 연결하기</Button></div><div className="monitor-grid"><section className="card monitor-main"><div className={'monitor-frame ' + (obstructed ? 'obstructed' : '')} ref={frame}>{!data.demo ? <CameraPreview/> : data.demo && online && !obstructed ? <><img src="/baby-demo.png" alt="카메라 미연결 상태의 시연 이미지"/><span className="video-label">시연 이미지 · 실시간 영상 아님</span></> : <div className="video-offline"><WifiOff size={36}/><h3>{!online ? '네트워크가 끊겼어요' : obstructed ? '화면을 확인할 수 없어요' : '실시간 영상이 연결되지 않았어요'}</h3><p>아이의 상태를 직접 확인해 주세요.</p></div>}{connecting && <div className="connecting"><RefreshCw className="spin" size={28}/><span>분석 연결을 확인하고 있어요…</span></div>}<div className="monitor-controls"><span><Video size={16}/> {data.child?.name}의 공간</span><div><button aria-label="카메라 미리보기는 소리를 제공하지 않습니다" disabled><VolumeX size={19}/></button><button aria-label="화면 확대" onClick={async () => { try {
    if (document.fullscreenElement)
        await document.exitFullscreen();
    else
        await frame.current?.requestFullscreen();
}
catch {
    toast('이 브라우저에서는 전체 화면을 지원하지 않아요.');
} }}><Maximize2 size={18}/></button></div></div></div><div className="connection-status"><span><i />{streaming ? '카메라 미리보기 수신 중 · 분석 상태는 별도 확인' : connected ? '기기 연결됨 · 새 카메라 영상 대기' : approved ? '연결은 승인됐어요. 파이에서 아가아이 실행을 이어가 주세요.' : '아가아이를 연결하면 카메라를 볼 수 있어요.'}</span><MonitorHelp/><button className="text-button" disabled={connecting || !online} onClick={retry}><RefreshCw size={15} className={connecting ? 'spin' : ''}/> 상태 새로고침</button></div>{active && <div className="monitor-warning"><CircleAlert size={24}/><div><strong>{getSleepRisk(data.alert!).message}</strong><p>{getSleepRisk(data.alert!).instruction}</p></div><Button variant="danger" onClick={onAlert}>확인</Button></div>}{data.demo && <button className="text-button" onClick={() => setObstructed(!obstructed)}><Eye size={16}/>{obstructed ? '시연 이미지 다시 보기' : '화면 가림 상태 체험'}</button>}</section><div className="monitor-side"><section className="card"><SectionHeader title="수면 환경 점검" icon={<ShieldCheck size={19}/>}/><p className="section-description">카메라 연결 후 감지 상태를 표시해요.</p>{data.demo ? <div className="safety-list">{['아기 자세', '얼굴 노출', '주변 물체', '가장자리 접근'].map(label => <div key={label} className={label === '아기 자세' && data.alert?.kind === 'posture' && data.alert.childId === data.child?.id && data.alert.status !== 'resolved' ? 'posture-risk-highlight' : undefined}><span><ShieldCheck size={17}/>{label}</span><Badge tone={active && getSleepRisk(data.alert!).label === label ? 'red' : 'gray'}>{active && getSleepRisk(data.alert!).label === label ? '위험 의심 · 시연' : '확인 불가'}</Badge></div>)}</div> : <SkyEyeSafety/>}</section><section className="card environment-disabled" aria-label="아이의 주변 환경" aria-disabled="true"><div className="section-heading"><h2>아이의 주변 환경</h2><Badge tone="gray">비활성화</Badge></div><p className="section-description">주변 환경 기능은 현재 비활성화되어 있어요.</p><div className="sensor-cards"><div><Thermometer /><span>실내 온도</span><strong>—</strong><small>사용 안 함</small></div><div><Droplets /><span>실내 습도</span><strong>—</strong><small>사용 안 함</small></div></div></section></div></div></>; }
