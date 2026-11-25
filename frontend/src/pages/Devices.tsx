import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Link2, LogOut, Plus, ShieldCheck, Unplug, Wifi, WifiOff } from 'lucide-react';
import { Brand, Button, Cloud, Modal, Notice } from '../components';
import { useApp } from '../context';
import { normalizePairingCode, type Child, type Device, type Pairing, type Workspace } from '../api/deviceClient';
import { koreaDate } from '../domain';
import './Devices.css';
import { connectionLabel } from '../skyEye';

function DeviceReport({ device, stale }: { device: Device; stale: boolean }) {
  const { sky, go } = useApp();
  const model = sky.snapshot?.items.find(item => item.deviceId === device.id);
  if (stale) return <p className="device-analysis">기기 상태를 다시 불러와 주세요.</p>;
  if (!device.lastSeenAt) return <div className="device-analysis"><p>연결 승인은 완료됐어요. 파이의 전송 프로그램이 아직 실행되지 않았어요.</p><p>파이 터미널에서 다음 명령을 실행하고 창을 켜 두세요.</p><code>bash ~/backend/raspberry-pi/start-agaeye.sh</code></div>;
  return <div className="device-analysis"><p>{model ? connectionLabel(model) : device.connected ? '기기는 연결됐어요. 모델 데이터를 기다리고 있어요.' : '파이 응답이 멈췄어요. 실행 창과 네트워크를 확인해 주세요.'}</p><button className="text-button" onClick={() => go('/monitor')}>카메라·분석 보기</button></div>;
}


export function Devices() {
  const { go, api, authenticated: signedIn, account, username, logout, workspaceId, data, selectServerChild } = useApp();
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const locked = useRef(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]), [workspace, setWorkspace] = useState(workspaceId);
  const [children, setChildren] = useState<Child[]>([]), [child, setChild] = useState('');
  const [loadingChildren, setLoadingChildren] = useState(false), [childrenLoaded, setChildrenLoaded] = useState(false);
  const [childName, setChildName] = useState(''), [birthDate, setBirthDate] = useState('');
  const [code, setCode] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('code') || '');
  const [name, setName] = useState('아이 침대 카메라');
  const [pending, setPending] = useState<(Pairing & { key: string; code: string; name: string; child: Child; workspace: string }) | null>(null);
  const [devices, setDevices] = useState<Device[]>([]), [listError, setListError] = useState(''), [listLoading, setListLoading] = useState(false);
  const [unlink, setUnlink] = useState<Device | null>(null), [version, setVersion] = useState(0), [now, setNow] = useState(Date.now());
  const childRequest = useRef<{ body: string; key: string } | null>(null);
  const [childVersion, setChildVersion] = useState(0);
  const selectedChild = children.find(item => item.id === child);
  const canManage = selectedChild?.capabilities.includes('child:manage');
  const remaining = pending ? Math.max(0, Math.ceil((Date.parse(pending.expiresAt) - now) / 1000)) : 0;

  useEffect(() => {
    if (window.location.hash) window.history.replaceState({}, '', window.location.pathname + window.location.search);
  }, [api]);
  useEffect(() => { if (!pending) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [pending]);
  async function perform(action: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(''); setMessage('');
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '요청에 실패했어요. 다시 시도해 주세요.'); }
    finally { locked.current = false; setBusy(false); }
  }
  async function loadWorkspaces() { const result = await api.workspaces(); setWorkspaces(result.items); setWorkspace(result.items.find(item => item.id === workspaceId)?.id || result.items.find(item => item.type === 'PERSONAL')?.id || result.items[0]?.id || ''); }
  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    api.workspaces().then(result => { if (active) { setWorkspaces(result.items); setWorkspace(result.items.find(item => item.id === workspaceId)?.id || result.items.find(item => item.type === 'PERSONAL')?.id || result.items[0]?.id || ''); } }).catch(cause => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [api, signedIn]);
  useEffect(() => {
    if (!workspace || !signedIn) return;
    let active = true; setLoadingChildren(true); setChildrenLoaded(false); setChildren([]); setChild(''); setDevices([]);
    api.children(workspace).then(result => { if (active) { setChildren(result.items); const selected = result.items.find(item => item.id === data.child?.id) || result.items[0]; setChild(selected?.id || ''); setChildrenLoaded(true); if (selected) void selectServerChild(workspace, selected); } }).catch(cause => { if (active) setError(cause.message); }).finally(() => { if (active) setLoadingChildren(false); });
    return () => { active = false; };
  }, [api, workspace, signedIn, childVersion]);
  useEffect(() => {
    if (!workspace || !child || !signedIn) return;
    let active = true, timer: ReturnType<typeof setTimeout>;
    setDevices([]); setListError(''); setListLoading(true);
    async function refresh() {
      try { const result = await api.devices(workspace, child); if (active) { setDevices(result.items); setListError(''); } }
      catch (cause) { if (active) setListError(cause instanceof Error ? cause.message : '기기 상태를 불러오지 못했어요.'); }
      finally { if (active) { setListLoading(false); timer = setTimeout(refresh, 5000); } }
    }
    void refresh(); return () => { active = false; clearTimeout(timer); };
  }, [api, workspace, child, signedIn, version]);

  return <div className="device-page"><header className="device-top"><button className="brand-link" onClick={() => go('/home')} disabled={busy}><Brand /></button><button className="text-button" disabled={busy} onClick={() => go('/home')}><ArrowLeft size={16}/> 돌아가기</button></header>
    <main className="device-main"><div className="device-intro"><span className="eyebrow">CONNECTED WITH CARE</span><h1>아가아이 연결하기</h1><p>우리 아이 곁의 아가아이를 연결하고 함께 돌봄을 시작해요.</p></div>
    <ol className="device-steps"><li className={!signedIn ? 'current' : ''}><span>{signedIn ? <Check size={15}/> : '1'}</span>아가아이 로그인</li><li className={signedIn && !pending ? 'current' : ''}><span>2</span>아이와 코드 확인</li><li className={pending ? 'current' : ''}><span>3</span>연결 승인</li></ol>
    <div role="alert" className={error ? 'device-error' : ''}>{error}</div><div role="status" className={message ? 'device-success' : ''}>{message}</div>
    <div className="device-account"><span><ShieldCheck size={17}/>{username || account}</span><button className="text-button" disabled={busy} onClick={() => void perform(logout)}><LogOut size={16}/> 로그아웃</button></div>
    <section className="card device-selector"><h2>어느 아이에게 연결할까요?</h2>{!workspaces.length ? <Button variant="secondary" disabled={busy} onClick={() => void perform(loadWorkspaces)}>돌봄 공간 불러오기</Button> : <div className="device-fields"><label>돌봄 공간<select value={workspace} disabled={busy || !!pending} onChange={event => { setWorkspace(event.target.value); setChildren([]); setChild(''); setDevices([]); setChildrenLoaded(false); setError(''); }}>{workspaces.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>아이<select value={child} disabled={busy || !!pending || loadingChildren || !children.length} onChange={event => { const selected = children.find(item => item.id === event.target.value); setChild(event.target.value); setDevices([]); setMessage(''); if (selected) void selectServerChild(workspace, selected); }}><option value="" disabled>{loadingChildren ? '불러오는 중…' : '아이 선택'}</option>{children.map(item => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select></label></div>}
    {workspace && !loadingChildren && !childrenLoaded && <Button variant="secondary" disabled={busy} onClick={() => setChildVersion(value => value + 1)}>아이 목록 다시 불러오기</Button>}
    {workspace && childrenLoaded && !children.length && <form className="device-child-form" onSubmit={event => { event.preventDefault(); void perform(async () => { const body = JSON.stringify([workspace, childName.trim(), birthDate]); if (childRequest.current?.body !== body) childRequest.current = { body, key: crypto.randomUUID() }; await api.createChild(workspace, childName.trim(), birthDate, childRequest.current.key); setChildVersion(value => value + 1); setMessage('아이를 등록했어요. 이제 파이 코드를 입력해 주세요.'); }); }}><p>아직 등록된 아이가 없어요. 아이 정보를 먼저 알려주세요.</p><div className="device-fields"><label>아이 이름<input required maxLength={80} value={childName} disabled={busy} onChange={event => setChildName(event.target.value)}/></label><label>생년월일<input type="date" required max={koreaDate()} value={birthDate} disabled={busy} onChange={event => setBirthDate(event.target.value)}/></label></div><Button variant="secondary" disabled={busy || !childName.trim()}><Plus size={17}/> 아이 등록</Button></form>}</section>
    {selectedChild && <div className="device-grid"><section className="card device-connect"><span className="device-symbol"><Link2 size={26}/></span><h2>아가아이 연결하기</h2><p>파이에서 연결 프로그램을 실행한 뒤<br/>화면에 표시된 코드를 입력해 주세요.</p>{canManage ? <form onSubmit={event => { event.preventDefault(); void perform(async () => { const normalized = normalizePairingCode(code); const result = await api.inspect(workspace, normalized); setNow(Date.now()); setPending({ ...result, key: crypto.randomUUID(), code: normalized, name: name.trim(), child: selectedChild, workspace }); }); }}><label>연결 코드<input className="device-code" placeholder="ABCD-2345" autoCapitalize="characters" autoCorrect="off" spellCheck={false} maxLength={24} value={code} onChange={event => setCode(event.target.value.toUpperCase())} required disabled={busy || !!pending}/></label><label>기기 이름<input maxLength={80} value={name} onChange={event => setName(event.target.value)} required disabled={busy || !!pending}/></label><Button className="full" disabled={busy || !!pending || !name.trim()}>{busy ? '확인하고 있어요…' : '코드 확인하기'}</Button></form> : <Notice>기기를 연결하거나 해제하려면 아이 관리 권한이 필요해요. 보호자에게 요청해 주세요.</Notice>}<Notice>연결 코드는 5분 동안 사용할 수 있어요. QR 링크로 들어오면 코드가 자동 입력돼요.</Notice></section>
    <section className="card device-list"><div className="device-list-heading"><h2>{selectedChild.displayName}의 기기</h2><span>{devices.length}대</span></div><p>연결 상태는 5초마다 새로 확인해요.</p>{listError && <p role="alert" className="device-error">{listError}</p>}{listLoading ? <p role="status">기기를 불러오고 있어요…</p> : !devices.length && !listError ? <div className="device-empty"><Cloud /><strong>아이 곁의 첫 기기를 연결해 보세요</strong><p>연결이 완료되면 여기에 표시돼요.</p></div> : devices.map(device => <article className="device-item" key={device.id}><div className="device-item-title"><strong>{device.name}</strong><span className={'device-status ' + (listError ? '' : device.connected ? 'online' : '')}>{!listError && device.connected ? <Wifi size={14}/> : <WifiOff size={14}/>} {listError ? '상태 확인 불가' : device.connected ? '온라인' : device.lastSeenAt ? '오프라인' : '파이 응답 대기'}</span></div><p>기기 확인값 <code>{device.fingerprint}</code></p><p>{device.lastSeenAt ? `마지막 응답 ${new Date(device.lastSeenAt).toLocaleString('ko-KR')}` : '파이에서 연결 프로그램을 계속 실행해 주세요.'}</p><DeviceReport device={device} stale={!!listError}/>{device.canManage && <button className="text-button device-unlink" disabled={busy} onClick={() => { setUnlink(device); setError(''); }}><Unplug size={15}/> 연결 해제</button>}</article>)}</section></div>}
    <footer className="device-footer">아가아이 · 소중한 일상을 함께 연결해요</footer></main>
    {pending && <Modal title="아가아이를 연결할까요?" onClose={() => { if (!busy) { setPending(null); setError(''); } }}><div className="device-confirm"><span className="device-symbol"><ShieldCheck size={28}/></span><h3>{pending.child.displayName} · {pending.name}</h3><p>파이에 표시된 기기 확인값과 같은지 확인해 주세요.</p><code className="device-fingerprint">{pending.fingerprint}</code><p>{remaining ? `코드 유효 시간 ${Math.floor(remaining / 60)}분 ${remaining % 60}초` : '코드가 만료됐어요. 파이에서 새 코드를 발급해 주세요.'}</p>{pending.status !== 'pending' && <Notice>이미 승인된 코드예요. 창을 닫고 연결된 기기를 확인해 주세요.</Notice>}{error && <p role="alert" className="device-error">{error}</p>}<div className="modal-actions"><Button variant="secondary" disabled={busy} onClick={() => { setPending(null); setError(''); setVersion(value => value + 1); }}>닫기</Button><Button disabled={busy || !remaining || pending.status !== 'pending'} onClick={() => void perform(async () => { await api.approve(pending.workspace, pending.child.id, pending.code, pending.name, pending.key); setPending(null); setCode(''); setVersion(value => value + 1); setMessage('연결을 승인했어요. 파이의 아가아이 실행 창을 계속 켜 두면 데이터 전송이 이어져요.'); })}>{busy ? '연결 중…' : '이 아이에게 연결'}</Button></div></div></Modal>}
    {unlink && <Modal title="기기 연결을 해제할까요?" onClose={() => { if (!busy) setUnlink(null); }}><div className="device-confirm"><h3>{unlink.name}</h3><p>이 기기의 데이터 전송과 영상 접근 권한이 해제돼요. 이전에 저장한 기록은 유지돼요.</p><p>다시 사용하려면 파이에서 새 코드를 발급해 연결해 주세요.</p>{error && <p role="alert" className="device-error">{error}</p>}<div className="modal-actions"><Button variant="secondary" disabled={busy} onClick={() => setUnlink(null)}>취소</Button><Button variant="danger" disabled={busy} onClick={() => void perform(async () => { await api.unlink(workspace, unlink.id); setUnlink(null); setVersion(value => value + 1); setMessage('기기 연결을 해제했어요.'); })}>연결 해제</Button></div></div></Modal>}
  </div>;
}
