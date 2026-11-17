import { useState } from 'react';
import { ArrowRight, Check, CircleAlert } from 'lucide-react';
import { Badge, Button, EmptyState, Modal, Notice } from '../components';
import { useApp } from '../context';
import { getSleepRisk, timeLabel, updateAlert } from '../domain';
export function AlertModal({ onClose }: {
    onClose: () => void;
}) { const { data, commit, go, busy } = useApp(); const [result, setResult] = useState(''); const alert = data.alert; if (!alert || alert.status === 'resolved')
    return <Modal title="감지 알림" onClose={onClose}><EmptyState title="미해결 감지 알림이 없어요" description="새로운 감지 알림이 생기면 알려드릴게요."/><Button className="full" onClick={onClose}>확인</Button></Modal>; return <Modal title="위험 감지 상세" onClose={onClose}><div className="alert-detail-header"><CircleAlert size={35}/><Badge tone="red">즉시 확인 필요 · 시연</Badge><h2>{getSleepRisk(alert).message}</h2><p>{data.child?.name} · {timeLabel(alert.startedAt)} 감지</p></div><div className="urgent-instruction">{getSleepRisk(alert).instruction}</div><p className="muted">화면 분석의 의심 신호예요. 아이의 실제 상태와 주변 물건을 보호자가 직접 살펴 주세요.</p><Button variant="yellow" className="full" disabled={busy} onClick={async () => { if (await commit(d => ({ ...d, alert: updateAlert(d.alert!, 'check') }))) {
    onClose();
    go('/monitor');
} }}>지금 확인하러 가기 <ArrowRight size={18}/></Button><fieldset className="resolution-form"><legend>현장 확인 결과</legend>{[['checking', '상황 확인 중'], ['removed', '위험 요소 제거함'], ['false_alarm', '문제 없음'], ['unverifiable', '확인 불가']].map(([value, label]) => <label key={value}><input type="radio" name="resolution" checked={result === value} onChange={() => setResult(value)}/>{label}</label>)}</fieldset><Button className="full" disabled={!result || busy} onClick={async () => { if (await commit(d => ({ ...d, alert: updateAlert(d.alert!, 'submit', result) })))
    onClose(); }}>현장 확인 결과 저장 <Check size={16}/></Button><Notice>열람하거나 닫아도 알림은 해결되지 않아요. 직접 확인한 결과를 선택하고 저장해 주세요.</Notice></Modal>; }
