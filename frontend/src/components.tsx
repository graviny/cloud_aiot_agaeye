import { useEffect, useRef, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Baby, Bell, Check, ChevronRight, CircleHelp, Heart, Moon, Sparkles, Sun, X } from 'lucide-react';
import { ageLabel, type Child, type Routine, type RoutineType } from './domain';
export function Cloud({ className = '', sleepy = true }: {
    className?: string;
    sleepy?: boolean;
}) { return <svg className={'cloud ' + className} viewBox="0 0 150 115" fill="none" aria-hidden="true"><ellipse cx="75" cy="100" rx="47" ry="7" fill="#dcd2f5" opacity=".4"/><path d="M37 84C13 84 12 50 35 47C32 18 66 8 79 28C99 12 123 30 120 49C145 55 140 86 116 85L37 84Z" fill="white" stroke="#9a7eec" strokeWidth="3"/><path d={sleepy ? 'M46 58q6 9 12 0M88 58q6 9 12 0' : 'M51 55v5M94 55v5'} stroke="#8061d4" strokeWidth="3" strokeLinecap="round"/><path d="M69 69q6 6 12 0" stroke="#b69250" strokeWidth="2.5" strokeLinecap="round"/><ellipse cx="44" cy="68" rx="7" ry="3.5" fill="#ffd7d4"/><ellipse cx="105" cy="68" rx="7" ry="3.5" fill="#ffd7d4"/><path d="m128 14 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" fill="#ffe392"/><path d="m22 16 2 4 4 2-4 2-2 4-2-4-4-2 4-2Z" fill="#ffe392"/></svg>; }
export function Brand({ small = false }: {
    small?: boolean;
}) { return <span className={'brand ' + (small ? 'small' : '')} aria-label="아가아이 agaeye"><img src="/mascot-sleep.png" alt=""/><span>아가<span>아이</span></span></span>; }
export function Button({ children, variant = 'primary', className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'primary' | 'yellow' | 'secondary' | 'ghost' | 'danger';
}) { return <button {...props} className={`button ${variant} ${className}`}>{children}</button>; }
export function IconButton({ children, label, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    label: string;
}) { return <button {...props} aria-label={label} title={label} className="icon-button">{children}</button>; }
export function PageHeader({ title, subtitle, onBack, action }: {
    title: string;
    subtitle?: string;
    onBack?: () => void;
    action?: ReactNode;
}) { return <header className="page-header"><div className="page-title-line">{onBack && <IconButton label="뒤로가기" onClick={onBack}><ArrowLeft size={22}/></IconButton>}<div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div></div>{action}</header>; }
export function SectionHeader({ title, link, onClick, icon }: {
    title: string;
    link?: string;
    onClick?: () => void;
    icon?: ReactNode;
}) { return <div className="section-heading"><h2>{icon}{title}</h2>{link && <button className="text-button" onClick={onClick}>{link}<ChevronRight size={15}/></button>}</div>; }
export function Badge({ children, tone = 'purple' }: {
    children: ReactNode;
    tone?: string;
}) { return <span className={'badge ' + tone}>{children}</span>; }
export function Profile({ child, onEdit, compact = false }: {
    child: Child;
    onEdit?: () => void;
    compact?: boolean;
}) { return <div className={'profile ' + (compact ? 'compact' : '')}><div className="avatar">{child.photoUrl ? <img src={child.photoUrl} alt={`${child.name} 프로필`}/> : <Baby size={compact ? 28 : 36}/>}</div><div><strong>{child.name}</strong><p>{ageLabel(child.birthDate)} <Heart size={12} fill="currentColor"/></p></div>{onEdit && <button className="pill-button" onClick={onEdit}>정보 수정</button>}</div>; }
const routineIcons = { sleep: Moon, wake: Sun, play: Sparkles, soothe: Heart, custom: Baby };
export const routineLabels: Record<RoutineType, string> = { sleep: '수면', wake: '기상', play: '놀이', soothe: '달래기', custom: '기타' };
export function RoutineIcon({ type }: {
    type: RoutineType;
}) { const Icon = routineIcons[type]; return <span className={'round-icon ' + type}><Icon size={19}/></span>; }
export function RoutineRow({ routine, onToggle, onEdit }: {
    routine: Routine;
    onToggle: () => void;
    onEdit?: () => void;
}) { return <div className="routine-row"><RoutineIcon type={routine.type}/><button className="routine-copy" onClick={onEdit}><strong>{routineLabels[routine.type]}</strong><span>{routine.time ? `${routine.time}${routine.endTime ? ' – ' + routine.endTime : ''}` : '시간 미정'}</span></button><button className={'routine-status ' + routine.status} onClick={onToggle} aria-label={`${routine.title} ${routine.status === 'done' ? '완료 취소' : '완료하기'}`}>{routine.status === 'done' ? <Check size={15}/> : routine.status === 'in_progress' ? '진행 중' : '예정'}</button></div>; }
export function EmptyState({ title = '아직 기록이 없어요', description = '새로운 기록이 생기면 여기에 모아드릴게요.', action }: {
    title?: string;
    description?: string;
    action?: ReactNode;
}) { return <div className="empty-state"><Cloud /><h3>{title}</h3><p>{description}</p>{action}</div>; }
export function Modal({ title, onClose, children }: {
    title: string;
    onClose: () => void;
    children: ReactNode;
}) { const panel = useRef<HTMLDivElement>(null); useEffect(() => { const previous = document.activeElement as HTMLElement; const old = document.body.style.overflow; document.body.style.overflow = 'hidden'; panel.current?.focus(); const handler = (e: KeyboardEvent) => { const dialogs = document.querySelectorAll('[aria-modal="true"]'); if (dialogs[dialogs.length - 1] !== panel.current) return; if (e.key === 'Escape')
    onClose(); if (e.key === 'Tab') {
    const items = panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, textarea, a[href]');
    if (!items?.length)
        return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
        e.preventDefault();
        last.focus();
    }
    else if (!e.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) {
        e.preventDefault();
        first.focus();
    }
} }; document.addEventListener('keydown', handler); return () => { document.body.style.overflow = old; document.removeEventListener('keydown', handler); previous?.focus(); }; }, []); return <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget)
    onClose(); }}><div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className="modal"><div className="modal-heading"><h2>{title}</h2><IconButton label="닫기" onClick={onClose}><X size={20}/></IconButton></div>{children}</div></div>; }
export function Toggle({ label, description, checked, onChange }: {
    label: string;
    description: string;
    checked: boolean;
    onChange: () => void;
}) { return <div className="setting-row"><div><strong>{label}</strong><p>{description}</p></div><button type="button" role="switch" aria-label={label} aria-checked={checked} onClick={onChange} className={'toggle ' + (checked ? 'checked' : '')}><span /></button></div>; }
export function Steps({ current, labels = ['기본 정보', '알림 설정', '완료'] }: {
    current: number;
    labels?: string[];
}) { return <div className="steps">{labels.map((label, i) => <div key={label} className={i <= current ? 'active' : ''}><span>{i < current ? <Check size={12}/> : i + 1}</span><small>{label}</small>{i < labels.length - 1 && <i />}</div>)}</div>; }
export function Tip({ children }: {
    children: ReactNode;
}) { return <div className="tip"><span className="tip-icon"><Sparkles size={19}/></span><div><strong>오늘의 작은 돌봄 팁</strong><p>{children}</p></div></div>; }
export function NextArrow() { return <ArrowRight size={18}/>; }
export function Notice({ children }: {
    children: ReactNode;
}) { return <p className="notice"><CircleHelp size={16}/><span>{children}</span></p>; }
export function NotificationBell() { return <span className="notification-bell"><Bell size={21}/><i /></span>; }
