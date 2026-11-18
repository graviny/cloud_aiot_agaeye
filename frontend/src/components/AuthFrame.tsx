import { Brand, Cloud } from '../components';
import { useApp } from '../context';
export function AuthFrame({ children }: {
    children: React.ReactNode;
}) { const { go } = useApp(); return <div className="auth-shell"><div className="auth-brand"><button onClick={() => go('/welcome')} aria-label="시작 화면"><Brand /></button></div><div className="auth-decoration"><Cloud /><h2>작은 순간을 함께,<br />아가아이</h2><p>오늘도 아이와 보호자 모두<br />편안한 하루를 보내길 바라요.</p><span>✦</span></div><main className="auth-card">{children}</main><span className="auth-footer">우리 아기의 오늘도, 더 안전하고 더 편안하게 ♡</span></div>; }
