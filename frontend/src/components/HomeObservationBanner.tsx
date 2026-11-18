import { ArrowRight, CircleAlert } from 'lucide-react';
import { Button, Cloud } from '../components';
import { safetyItems, type SkyDevice } from '../skyEye';
export function HomeObservationBanner({ items, go }: { items: SkyDevice[]; childId?: string; childName?: string; go: (path: string) => void }) {
  const states = items.flatMap(item => safetyItems.map(field => ({ state: item.safety[field.key], label: field.label })));
  const risk = states.find(s => s.state === 'immediate') || states.find(s => s.state === 'caution');
  const unknown = !states.length || states.some(s => s.state === 'unknown');
  return <div className={'alert-banner ' + (risk ? 'danger' : unknown ? 'observation-unknown' : 'calm')}>
    {risk || unknown ? <span className="alert-icon"><CircleAlert size={27}/></span> : <Cloud/>}
    <div><h3>{risk ? `${risk.label} 확인이 필요해요.` : unknown ? '현재 아이의 상태를 확인할 수 없어요.' : '새로운 감지 알림이 없어요.'}</h3>
    <p>{risk || unknown ? '아이를 직접 살피고, 모니터링에서 관측 결과를 확인해 주세요.' : '수신된 카메라 관측 결과를 확인했어요.'}</p></div>
    <Button variant="yellow" onClick={() => go('/monitor')}>관측 결과 보기 <ArrowRight size={16}/></Button>
  </div>;
}
