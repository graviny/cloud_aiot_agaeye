import { Camera, ImageOff, LoaderCircle, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { timeLabel } from '../domain/monitor';
import type { RiskEvent } from '../domain/types';
import { DATA_MODE, imageUrl } from '../data/source';
import { cloudAccessToken } from '../data/cloudAuth';

export function Photo({ event, compact = false }: { event: RiskEvent; compact?: boolean }) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [authorizedUrl, setAuthorizedUrl] = useState<string | null>(null);
  useEffect(() => { setFailed(false); setAttempt(0); }, [event.id, event.photoUrl]);
  const url = imageUrl(event.photoUrl);
  useEffect(() => {
    if (DATA_MODE !== 'cloud' || !url || event.photoState !== 'available') return;
    const abort = new AbortController();
    let objectUrl: string | undefined;
    setAuthorizedUrl(null);
    void (async () => {
      try {
        const token = await cloudAccessToken();
        if (!token) throw new Error('로그인이 필요합니다');
        const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` },
          credentials: 'omit', signal: abort.signal, cache: 'no-store' });
        if (!response.ok || !response.headers.get('content-type')?.includes('image/jpeg')) throw new Error('사진 조회 실패');
        const blob = await response.blob();
        if (abort.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob); setAuthorizedUrl(objectUrl);
      } catch { if (!abort.signal.aborted) setFailed(true); }
    })();
    return () => { abort.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [url, event.photoState, attempt]);
  return <figure className={`photo ${compact ? 'photo-compact' : ''}`}>
    {event.photoState === 'loading' || (DATA_MODE === 'cloud' && event.photoState === 'available' && url && !authorizedUrl && !failed) ? <div className="photo-placeholder"><LoaderCircle className="spin" size={30} /><strong>사진을 불러오는 중이에요</strong><span>알림 정보는 계속 확인할 수 있어요.</span></div>
      : event.photoState === 'missing' || !url ? <div className="photo-placeholder"><Camera size={30} /><strong>저장된 사진이 없어요</strong><span>이벤트 정보는 확인할 수 있어요.</span></div>
        : failed ? <div className="photo-placeholder"><ImageOff size={30} /><strong>사진을 불러오지 못했어요</strong><span>알림 정보와 확인 기록은 유지돼요.</span><button className="button small" onClick={() => { setFailed(false); setAttempt(value => value + 1); }}><RotateCcw size={14} />사진 다시 시도</button></div>
          : <img key={`${event.id}-${attempt}`} src={DATA_MODE === 'cloud' ? authorizedUrl || undefined : url} alt={`${event.isExample ? '실제 촬영이 아닌 예시 그림. ' : ''}위험 확정 시점의 카메라 사진`} onError={() => setFailed(true)} />}
    <figcaption><span className="photo-tag">{event.isExample ? '예시 이미지' : '위험 발생 사진'}</span><span>{event.capturedAt ? timeLabel(event.capturedAt) : '촬영 시각 미제공'}</span></figcaption>
  </figure>;
}
