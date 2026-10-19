import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { LoaderCircle, MoonStar } from 'lucide-react';
import { authClient, CLOUD_MODE, cloudConfigError } from '../data/cloudAuth';
import { source } from '../data/source';
import App from '../App';

export function CloudGate() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(CLOUD_MODE);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const userId = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!authClient) { setLoading(false); return; }
    let active = true;
    let revision = 0;
    const { data: subscription } = authClient.auth.onAuthStateChange((_event, next) => {
      revision++;
      if (active) {
        if (next?.user.id !== userId.current) source.reset?.();
        userId.current = next?.user.id;
        setSession(next); setLoading(false);
      }
    });
    const current = revision;
    void authClient.auth.getSession().then(({ data, error: sessionError }) => {
      if (active && current === revision) {
        if (sessionError) setError('로그인을 다시 해 주세요.');
        userId.current = data.session?.user.id;
        setSession(data.session); setLoading(false);
      }
    }).catch(() => { if (active) { setError('로그인 정보를 불러오지 못했어요.'); setLoading(false); } });
    return () => { active = false; subscription.subscription.unsubscribe(); };
  }, []);
  if (!CLOUD_MODE) return <App />;
  if (session) return <App key={session.user.id} />;
  const configurationError = cloudConfigError || (!authClient ? '웹에는 Supabase 공개 키만 사용할 수 있습니다. 배포 설정을 확인해 주세요.' : null);
  const signIn = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!authClient || busy) return;
    setBusy(true); setError(null);
    try {
      const result = await authClient.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) setError('이메일과 비밀번호를 확인해 주세요. 등록된 보호자 계정으로 로그인할 수 있어요.');
      else setPassword('');
    } catch { setError('로그인 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.'); }
    finally { setBusy(false); }
  };
  return <main className="cloud-login">
    <div className="cloud-login-brand"><MoonStar size={36} /><span>아가 아이</span></div>
    <section aria-labelledby="login-title">
      <h1 id="login-title">우리 아기 상태를 확인해요</h1>
      <p>등록된 보호자만 상태와 위험 사진을 볼 수 있어요.</p>
      {configurationError ? <p className="cloud-login-error" role="alert">{configurationError}</p>
        : loading ? <p role="status"><LoaderCircle className="spin" size={20} />로그인 확인 중…</p>
          : <form onSubmit={event => { void signIn(event); }}>
            <label>이메일<input type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} /></label>
            <label>비밀번호<input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} /></label>
            {error && <p className="cloud-login-error" role="alert">{error}</p>}
            <button className="button primary" disabled={busy} type="submit">{busy ? '로그인 중…' : '로그인'}</button>
          </form>}
      <p className="cloud-login-note">계정 등록이나 비밀번호 변경은 프로젝트 관리자에게 문의해 주세요.</p>
    </section>
  </main>;
}
