import { ChevronRight, ClipboardList, Heart, History } from 'lucide-react';
import { PageHeader } from '../components';
import { useApp } from '../context';
export function ChildManagement() { const { go } = useApp(); return <div className="narrow-page"><PageHeader title="우리 아이 관리" subtitle="아이의 수면 기록을 한곳에서"/><section className="card menu-card">{[[History, '히스토리', '우리의 하루를 차곡차곡 기록해요', '/children/history']].map(([Icon, title, description, url]) => { const I = Icon as typeof Heart; return <button key={title as string} className="management-menu" onClick={() => go(url as string)}><span className="round-icon"><I size={23}/></span><span><strong>{title as string}</strong><small>{description as string}</small></span><ChevronRight size={20}/></button>; })}</section></div>; }
