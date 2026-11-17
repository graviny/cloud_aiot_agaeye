import { ShieldCheck } from 'lucide-react';
import { Badge } from '../components';
import { useApp } from '../context';
import { safetyItems, safetyLabels, safetyTones, type Safety, type SkyDevice } from '../skyEye';

export function CompactSleepSafety({ items }: { items: SkyDevice[] }) {
  const priority: Safety[] = ['immediate', 'caution', 'unknown', 'stable'];
  return <div className="safety-list home-safety-grid" aria-label="수면 관리 상태 4가지">{safetyItems.map(({ key, label }) => {
    const states = items.map(item => item.safety[key]);
    const state = priority.find(value => states.includes(value)) || 'unknown';
    return <div key={key} className={key === 'posture' && (state === 'immediate' || state === 'caution') ? 'posture-risk-highlight' : undefined}>
      <span><ShieldCheck size={17}/>{label}</span><Badge tone={safetyTones[state]}>{safetyLabels[state]}</Badge>
    </div>;
  })}</div>;
}

export function SkyEyeSafety({ compact = false }: { compact?: boolean }) {
  const { sky } = useApp();
  const items = sky.snapshot?.items || [];
  if (compact) return <CompactSleepSafety items={items}/>;
  return <>{(items.length ? items : [null]).map((device, index) => <div key={device?.deviceId || index}>
    <div className="safety-list">{safetyItems.map(({ key, label }) => {
      const state = device?.safety[key] || 'unknown';
      return <div key={key} className={key === 'posture' && (state === 'immediate' || state === 'caution') ? 'posture-risk-highlight' : undefined}><span><ShieldCheck size={17}/>{label}</span><Badge tone={safetyTones[state]}>{safetyLabels[state]}</Badge></div>;
    })}</div>
    {device && !device.status.video.geometryValid && <p className="card-footnote">침대 영역 보정 전에는 가장자리 상태를 판단하지 않아요.</p>}
  </div>)}{sky.error && <p className="model-error" role="status">{sky.error}</p>}</>;
}
