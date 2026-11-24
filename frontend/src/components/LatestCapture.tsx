import { useEffect, useState } from 'react';
import { Badge } from '../components';
import { useApp } from '../context';
import { ApiError } from '../api/deviceClient';
import { captureSummary } from '../skyEye';
import { alertTime } from './AlertPhoto';

const POLL_MS = 5000;
// Beyond this the photo may no longer show the child's current position.
const STALE_MS = 60000;

interface Frame { url: string; capturedAt: string; state: string; posture: string | null; airway: string | null }
interface View { scope: string; status: 'loading' | 'empty' | 'ready' | 'unsupported'; frame: Frame | null; failed: boolean }

function age(capturedAt: string, now: number) {
  const seconds = Math.max(0, Math.round((now - Date.parse(capturedAt)) / 1000));
  return seconds < 60 ? `${seconds}초 전` : `${Math.floor(seconds / 60)}분 전`;
}

export function LatestCapture({ device, name, showName }: { device: string; name: string; showName: boolean }) {
  const { api, account, workspaceId, data } = useApp();
  const child = data.child?.id || '';
  const scope = JSON.stringify([account, workspaceId, child, device]);
  const [view, setView] = useState<View>({ scope: '', status: 'loading', frame: null, failed: false });
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!child) return;
    let active = true, timer: ReturnType<typeof setTimeout>, frame: Frame | null = null;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = async () => {
      if (!document.hidden) {
        try {
          const capture = await api.latestCapture(workspaceId, child, device);
          if (!active) return;
          if (!capture) {
            if (frame) URL.revokeObjectURL(frame.url);
            frame = null;
            setView({ scope, status: 'empty', frame: null, failed: false });
          } else if (capture.capturedAt !== frame?.capturedAt) {
            const next = { url: URL.createObjectURL(capture.image), capturedAt: capture.capturedAt, state: capture.state, posture: capture.posture, airway: capture.airway };
            if (frame) URL.revokeObjectURL(frame.url);
            frame = next;
            setView({ scope, status: 'ready', frame, failed: false });
          } else setView(current => current.failed ? { ...current, failed: false } : current);
        } catch (error) {
          if (!active) return;
          // An API without the capture route answers 404; stop polling until the page reloads.
          if (error instanceof ApiError && error.status === 404) { setView({ scope, status: 'unsupported', frame: null, failed: false }); return; }
          setView({ scope, status: frame ? 'ready' : 'loading', frame, failed: true });
        }
      }
      if (active) timer = setTimeout(poll, POLL_MS);
    };
    void poll();
    return () => { active = false; clearTimeout(timer); clearInterval(tick); if (frame) URL.revokeObjectURL(frame.url); };
  }, [api, workspaceId, child, device, scope]);

  const current = view.scope === scope ? view : { scope, status: 'loading', frame: null, failed: false } as View;
  const title = showName ? <h3 className="latest-capture-name">{name}</h3> : null;
  if (current.status === 'unsupported') return <>{title}<p className="alert-photo-empty" role="status">서버가 아직 주기 사진을 지원하지 않아요. 서버를 업데이트하면 표시돼요.</p></>;
  if (current.status === 'empty') return <>{title}<p className="alert-photo-empty" role="status">아직 받은 사진이 없어요. 파이에서 주기 캡처를 켜면 정해진 간격마다 사진이 올라와요.</p></>;
  if (!current.frame) return <>{title}<p className="alert-photo-empty" role="status">{current.failed ? '최근 사진을 불러오지 못했어요. 잠시 후 다시 확인해요.' : '최근 사진을 불러오고 있어요.'}</p></>;
  const { frame } = current, summary = captureSummary(frame);
  const stale = now - Date.parse(frame.capturedAt) > STALE_MS;
  return <>{title}<figure className="alert-photo latest-capture">
    <img src={frame.url} alt={name + ' 최근 카메라 사진'}/>
    <figcaption>
      <span className="latest-capture-result"><Badge tone={summary.tone}>{summary.label}</Badge>{summary.details && <span>{summary.details}</span>}</span>
      촬영 {alertTime(frame.capturedAt)} · {age(frame.capturedAt, now)}
    </figcaption>
  </figure>
  {stale && <p className="model-error" role="status">사진이 1분 넘게 새로 오지 않았어요. 지금 모습과 다를 수 있으니 아이를 직접 확인해 주세요.</p>}
  {current.failed && !stale && <p className="card-footnote" role="status">새 사진을 확인하지 못해 마지막 사진을 보여주고 있어요.</p>}</>;
}
