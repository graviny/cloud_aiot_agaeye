import { Camera, Film, Square, Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '../data/source';

type DemoInfo = { modelReady: boolean; modelName: string; running: boolean; sourceLabel: string | null;
  error: string | null; frameVersion: number | null; provider: string };
const base = (API_BASE_URL || '/agaeye-api').replace(/\/$/, '');
async function request(path: string, init?: RequestInit) {
  const response = await fetch(`${base}/demo${path}`, { credentials: 'include', ...init });
  const body = await response.json();
  if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : `요청 실패 (${response.status})`);
  return body;
}

export function LaptopDemo() {
  const [info, setInfo] = useState<DemoInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cameraIndex, setCameraIndex] = useState('0');
  const [preview, setPreview] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    const refresh = async () => {
      try { const value = await request('/info', { signal: controller.signal }); if (live) setInfo(value); }
      catch { if (live) setError('노트북 분석 서버에 연결할 수 없어요. start-ai-demo.cmd로 실행해 주세요.'); }
    };
    void refresh();
    const timer = setInterval(refresh, 1000);
    return () => { live = false; clearInterval(timer); controller.abort(); };
  }, []);
  const act = async (operation: () => Promise<DemoInfo>) => {
    setBusy(true); setError(null);
    try { setInfo(await operation()); }
    catch (error) { setError(error instanceof Error ? error.message : '분석 요청에 실패했습니다.'); }
    finally { setBusy(false); }
  };
  const startCamera = () => act(async () => {
    const value = await request('/start', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'camera', camera_index: Number(cameraIndex) }) });
    setPreview(true); return value;
  });
  const startVideo = (file: File) => act(async () => {
    if (file.size > 512 * 1024 * 1024) throw new Error('데모 영상은 512MB 이하로 선택해 주세요.');
    const uploaded = await request(`/video?name=${encodeURIComponent(file.name)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: file,
    });
    const value = await request('/start', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'video', video_id: uploaded.videoId }) });
    setPreview(true); return value;
  });
  return <section className="laptop-demo" aria-label="노트북 실제 분석 데모">
    <div className="laptop-demo-row">
      <div className="laptop-demo-title"><strong>노트북 AI 데모</strong><span>실제 모델 · CPU 분석</span></div>
      <div className="laptop-demo-controls">
        <select aria-label="웹캠 번호" value={cameraIndex} onChange={event => setCameraIndex(event.target.value)} disabled={busy || info?.running}>
          <option value="0">기본 웹캠 (0)</option><option value="1">다른 웹캠 (1)</option><option value="2">다른 웹캠 (2)</option>
        </select>
        <button className="button" disabled={busy || !info?.modelReady || info.running} onClick={startCamera}><Camera size={17} />웹캠 시작</button>
        <button className="button" disabled={busy || !info?.modelReady || info.running} onClick={() => fileInput.current?.click()}><Film size={17} />영상으로 분석</button>
        <button className="button" disabled={busy || !info?.running} onClick={() => act(() => request('/stop', { method: 'POST' }))}><Square size={15} />분석 중지</button>
        <input ref={fileInput} type="file" accept=".mp4,.avi,.mov,.mkv,.webm" aria-label="분석할 영상 파일" hidden onChange={event => {
          const file = event.target.files?.[0]; if (file) void startVideo(file); event.target.value = '';
        }} />
      </div>
    </div>
    <div className="laptop-demo-note"><p role="status">{busy ? <><LoaderCircle className="spin" size={15} />입력을 준비하고 있어요…</>
      : info?.running ? `${info.sourceLabel} 분석 중` : info?.modelReady ? '모델 준비 완료 · 웹캠이나 영상을 선택하세요.' : '모델을 확인하고 있어요.'}</p>
      {info?.frameVersion && <button className="text-button" onClick={() => setPreview(value => !value)}>{preview ? <EyeOff size={16} /> : <Eye size={16} />}{preview ? '입력 화면 접기' : '입력 화면 보기'}</button>}
    </div>
    {(error || info?.error) && <p className="laptop-demo-error" role="alert">{error || info?.error}</p>}
    {preview && info?.frameVersion && <div className="laptop-preview">
      <img src={`${base}/demo/frame?t=${info.frameVersion}`} alt="현재 분석 입력 미리보기. 위험 알림 사진과 별개의 화면입니다." />
      <div><strong>{info.running ? '현재 분석 입력' : '마지막 분석 입력'}</strong><p>탐지 박스는 모델이 찾은 자세와 코·입 상태예요. 위험 여부는 아래 분석 결과에서 확인하세요.</p><p>사진은 이 노트북에서 처리합니다. 위험 알림 사진은 별도로 기록돼요.</p></div>
    </div>}
  </section>;
}
