import { useEffect, useRef, useState } from 'react';
import { Video, WifiOff } from 'lucide-react';
import { useApp } from '../context';
import { connectionLabel } from '../skyEye';

/** Authenticated JPEG polling. Object URLs hold frames only while this view is mounted. */
export function CameraPreview() {
  const { api, workspaceId, data, sky } = useApp();
  const devices = sky.snapshot?.items || [];
  const [selected, setSelected] = useState('');
  const selectedDevice = devices.find(device => device.deviceId === selected) || devices[0];
  const device = selectedDevice?.deviceId || '';
  const child = data.child?.id || '';
  const scope = `${workspaceId}:${child}:${device}`;
  const [state, setState] = useState({ scope: '', url: '', error: '', at: 0 });
  const [now, setNow] = useState(Date.now());
  const url = useRef('');
  useEffect(() => {
    if (!workspaceId || !child || !device) return;
    let active = true, timer: ReturnType<typeof setTimeout>;
    const revoke = () => { if (url.current) URL.revokeObjectURL(url.current); url.current = ''; };
    const clock = setInterval(() => setNow(Date.now()), 500);
    const poll = async () => {
      try {
        const frame = await api.cameraFrame(workspaceId, child, device);
        if (!active) return;
        revoke();
        const at = Date.now();
        if (frame) url.current = URL.createObjectURL(frame);
        setNow(at); setState({ scope, url: url.current, error: '', at });
      } catch (error) {
        if (!active) return;
        revoke(); setState({ scope, url: '', error: error instanceof Error ? error.message : '카메라 연결을 확인해 주세요.', at: 0 });
      } finally { if (active) timer = setTimeout(poll, 500); }
    };
    void poll();
    return () => { active = false; clearTimeout(timer); clearInterval(clock); revoke(); };
  }, [api, workspaceId, child, device, scope]);
  const current = state.scope === scope;
  const visible = current && state.url && now - state.at < 3000;
  return <>
    {visible ? <><img className="camera-live-image" src={state.url} alt={`${data.child?.name || '아이'}의 카메라 미리보기`}/><span className="video-label"><Video size={13}/> 실시간 미리보기 · 최대 2fps · 소리 없음</span></> : <div className="video-offline"><WifiOff size={36}/><h3>{current && state.error ? '카메라를 불러오지 못했어요' : selectedDevice?.reportState === 'awaiting_sender' ? '파이에서 아가아이를 실행해 주세요' : '새로운 카메라 영상을 기다리고 있어요'}</h3><p>{current && state.error ? state.error : selectedDevice ? connectionLabel(selectedDevice) : '먼저 아가아이를 연결해 주세요.'}</p><p>영상이 중단되면 마지막 화면을 계속 표시하지 않아요.</p></div>}
    {devices.length > 1 && <label className="camera-selector">카메라<select value={device} onChange={event => setSelected(event.target.value)}>{devices.map(item => <option key={item.deviceId} value={item.deviceId}>{item.name}</option>)}</select></label>}
  </>;
}
