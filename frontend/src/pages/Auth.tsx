import { useState } from 'react';
import { ArrowLeft, ArrowRight, Eye, EyeOff, Heart } from 'lucide-react';
import { Button, IconButton, Notice } from '../components';
import { useApp } from '../context';
import { AuthFrame } from '../components/AuthFrame';
import { authContinuation, authModeRoute } from '../sessionFlow';

export function Auth() {
  const { path, go, login, busy } = useApp();
  const isLogin = path === '/login';
  const [username, setUsername] = useState(''), [password, setPassword] = useState('');
  const [show, setShow] = useState(false), [error, setError] = useState('');
  const connecting = !!authContinuation(window.location.search, window.location.hash);
  return <AuthFrame>
    <IconButton label="시작 화면으로" disabled={busy} onClick={() => go('/welcome')}><ArrowLeft size={20}/></IconButton>
    <div className="auth-heading"><span className="round-icon big"><Heart size={26}/></span><h1>{isLogin ? '다시 만나 반가워요' : '회원가입'}</h1><p>{connecting ? '로그인 후 아가아이 연결을 이어갈게요.' : isLogin ? '아이의 하루를 함께 살펴볼까요?' : '아이디와 비밀번호로 시작해요'}</p></div>
    <form onSubmit={async event => {
      event.preventDefault(); setError('');
      try { await login(username, password, isLogin ? 'login' : 'signup'); setPassword(''); }
      catch (cause) { setError(cause instanceof Error ? cause.message : '로그인하지 못했어요. 다시 시도해 주세요.'); }
    }}>
      <label className="field">아이디<input type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="아이디를 입력해 주세요" required maxLength={isLogin ? 254 : 32} pattern={isLogin ? undefined : '[A-Za-z0-9][A-Za-z0-9._\\-]{0,31}'} title={isLogin ? undefined : '영문·숫자로 시작하는 1~32자: 영문, 숫자, 점, 밑줄, 하이픈'} disabled={busy} value={username} onChange={event => setUsername(event.target.value)}/>{!isLogin && <small>영문·숫자로 시작하는 1~32자 · 영문, 숫자, 점, 밑줄, 하이픈</small>}</label>
      <label className="field">비밀번호 (8자 이상)<span className="password-field"><input type={show ? 'text' : 'password'} autoComplete={isLogin ? 'current-password' : 'new-password'} placeholder="비밀번호를 입력해 주세요" minLength={8} maxLength={72} required disabled={busy} value={password} onChange={event => setPassword(event.target.value)}/><button type="button" aria-label={show ? '비밀번호 숨기기' : '비밀번호 표시'} onClick={() => setShow(!show)}>{show ? <EyeOff size={18}/> : <Eye size={18}/>}</button></span></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <Button className="full" disabled={busy}>{busy ? '확인하고 있어요…' : isLogin ? '로그인' : '회원가입'}<ArrowRight size={18}/></Button>
    </form>
    <p className="auth-switch">{isLogin ? '처음이신가요?' : '이미 계정이 있으신가요?'} <button disabled={busy} onClick={() => go(authModeRoute(isLogin ? 'signup' : 'login', window.location.search, window.location.hash))}>{isLogin ? '회원가입' : '로그인'}</button></p>
    <Notice>아가아이 계정으로 로그인하면 모니터링·더보기에서 아가아이를 연결할 수 있어요.</Notice>
  </AuthFrame>;
}
