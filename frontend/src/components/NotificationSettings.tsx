import { useState } from 'react';
import { ArrowRight, Bell, Check, LockKeyhole, Volume2 } from 'lucide-react';
import { Button, Notice, Toggle } from '../components';
import { useApp } from '../context';
export async function playNotification() { const AudioCtx = window.AudioContext; const context = new AudioCtx(); try {
    await context.resume();
    [0, .23, .46].forEach((offset, i) => { const osc = context.createOscillator(); const gain = context.createGain(); osc.type = 'sine'; osc.frequency.value = [659, 784, 988][i]; gain.gain.setValueAtTime(0, context.currentTime + offset); gain.gain.linearRampToValueAtTime(.12, context.currentTime + offset + .03); gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + offset + .55); osc.connect(gain); gain.connect(context.destination); osc.start(context.currentTime + offset); osc.stop(context.currentTime + offset + .6); });
    setTimeout(() => context.close(), 1300);
}
catch {
    await context.close();
    throw new Error('소리 재생이 차단되었어요. 브라우저 소리 권한을 확인해 주세요.');
} }
export function NotificationSettings({ onComplete }: {
    onComplete?: () => void;
}) { const { data, commit, toast, busy } = useApp(); const [permission, setPermission] = useState('Notification' in window ? Notification.permission : 'unsupported'); return <><div className="notification-hero"><Bell size={42}/><i>✦</i></div><div className="setting-row"><div><strong>위험 알림 소리</strong><p>중요한 감지 알림을 놓치지 않도록</p></div><span className="always-on"><LockKeyhole size={12}/> 항상 켜짐</span></div><Toggle label="앱 푸시 알림" description={permission === 'granted' ? '브라우저 알림이 허용되어 있어요' : permission === 'denied' ? '브라우저 설정에서 알림을 허용해 주세요' : '알림 권한을 허용해 주세요'} checked={data.preferences.push && permission === 'granted'} onChange={async () => { if (!('Notification' in window)) {
    toast('이 브라우저는 시스템 알림을 지원하지 않아요.');
    return;
} if (data.preferences.push) {
    await commit(d => ({ ...d, preferences: { ...d.preferences, push: false } }));
    return;
} const result = await Notification.requestPermission(); setPermission(result); if (result === 'granted')
    await commit(d => ({ ...d, preferences: { ...d.preferences, push: true } }));
else
    toast('앱 안에서 감지 알림을 확인할 수 있어요.'); }}/><button className="sound-test" onClick={async () => { try {
    await playNotification();
    toast('테스트 알림 소리를 재생했어요.');
}
catch (e) {
    toast((e as Error).message);
} }}><Volume2 size={23}/><div><strong>알림 소리 테스트</strong><span>지금 소리를 들어보세요</span></div><ArrowRight size={18}/></button><Notice>시연에서는 앱 내 알림을 확인할 수 있어요. 백그라운드 푸시는 서버 연결 후 제공됩니다.</Notice>{onComplete && <Button variant="yellow" className="full" disabled={busy} onClick={onComplete}>완료 <Check size={18}/></Button>}</>; }
