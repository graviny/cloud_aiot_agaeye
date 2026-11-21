import { useEffect, useState } from 'react';
import { useApp } from '../context';
import { alertLabel, type CameraAlert } from '../skyEye';

export function alertTime(value: string) {
  return new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Seoul' }).format(new Date(value));
}

export function AlertPhoto({ device, alert }: { device: string; alert: CameraAlert }) {
  const { api, account, workspaceId, data, sky } = useApp();
  const child = data.child?.id || '';
  const scope = JSON.stringify([account, workspaceId, child, device, alert.id, alert.capturedAt]);
  const [image, setImage] = useState({ scope: '', url: '', error: false });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!child || !alert.capturedAt) return;
    let active = true, url = '';
    api.alertPhoto(workspaceId, child, device, alert.id).then(blob => {
      if (!active) return;
      if (blob) url = URL.createObjectURL(blob);
      setImage({ scope, url, error: !blob });
    }).catch(() => { if (active) setImage({ scope, url: '', error: true }); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [api, workspaceId, child, device, alert.id, alert.capturedAt, scope, attempt]);
  const pending = sky.snapshot && Date.parse(sky.snapshot.serverTime) - Date.parse(alert.observedAt) < 8000;
  if (!alert.capturedAt) return <p className="alert-photo-empty" role="status">{pending ? '알림 사진을 기다리고 있어요.' : '이 알림에 저장된 사진이 없어요.'}</p>;
  if (image.scope === scope && image.error) return <div className="alert-photo-empty" role="status">사진을 불러오지 못했어요. <button className="text-button" onClick={() => setAttempt(n => n + 1)}>다시 보기</button></div>;
  if (image.scope !== scope || !image.url) return <p className="alert-photo-empty" role="status">사진을 불러오고 있어요.</p>;
  return <figure className="alert-photo"><img src={image.url} alt={alertLabel(alert) + ' 알림 당시 사진'}/><figcaption>촬영 {alertTime(alert.capturedAt)}</figcaption></figure>;
}
