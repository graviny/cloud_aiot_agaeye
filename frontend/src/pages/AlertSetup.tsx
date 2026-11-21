import { Steps } from '../components';
import { useApp } from '../context';
import { AuthFrame } from '../components/AuthFrame';
import { NotificationSettings } from '../components/NotificationSettings';
export function AlertSetup() { const { commit, go } = useApp(); return <AuthFrame><Steps current={1}/><div className="auth-heading"><h1>알림 설정</h1><p>중요한 상황을 바로 알려드릴게요.</p></div><NotificationSettings onComplete={async () => { if (await commit(d => ({ ...d, onboardingComplete: true })))
    go('/home'); }}/></AuthFrame>; }
