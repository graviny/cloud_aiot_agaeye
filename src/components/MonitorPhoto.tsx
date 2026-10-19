import { ArrowRight, Camera, Check, LoaderCircle, TriangleAlert } from 'lucide-react';
import { timeLabel } from '../domain/monitor';
import { riskLabels } from '../domain/types';
import type { RiskEvent, RiskKind } from '../domain/types';
import { Photo } from './Photo';

type Props = {
  event: RiskEvent | null;
  danger: boolean;
  kind: RiskKind | null;
  loading: boolean;
  busyId: string | null;
  onAcknowledge: (id: string) => void;
  onSelect: (id: string) => void;
};

export function MonitorPhoto({ event, danger, kind, loading, busyId, onAcknowledge, onSelect }: Props) {
  const title = danger
    ? kind ? `${riskLabels[kind]} 위험이 감지됐어요` : '위험 징후가 감지됐어요'
    : event ? event.endedAt ? '지난 알림 사진' : '마지막 알림 사진' : '알림 사진';
  const pending = !!event && !event.endedAt;

  return <section className={`home-photo ${danger ? 'danger-panel' : 'past-photo'}`} role={danger ? 'alert' : undefined} aria-label={danger ? '현재 위험 알림' : '이전 알림 사진'}>
    <div className="photo-heading">
      <div><span className="eyebrow">{danger ? '위험 알림' : '사진 기록'}</span><h2>{danger && <TriangleAlert size={22} />}{title}</h2></div>
      <span className={`badge ${danger ? 'red' : pending ? 'amber' : 'neutral'}`}>{danger ? '진행 중' : event ? event.endedAt ? '종료된 기록' : '종료 미확인' : '위험 발생 시 표시'}</span>
    </div>
    {event ? <>
      <Photo event={event} compact />
      <div className="photo-details">
        <div><span>{danger ? '위험 확정 시점' : `${riskLabels[event.kind]} · 사진 촬영 시각`}</span><strong>{danger ? timeLabel(event.confirmedAt, true) : event.capturedAt ? timeLabel(event.capturedAt, true) : '촬영 시각 미제공'}</strong></div>
        {danger
          ? <button className="button danger-button" disabled={!!event.acknowledgedAt || busyId === event.id} onClick={() => onAcknowledge(event.id)}><Check size={17} />{event.acknowledgedAt ? '보호자 확인 완료 · 위험 지속 중' : busyId === event.id ? '저장 중…' : '확인했어요'}</button>
          : <button className="text-button" onClick={() => onSelect(event.id)}>기록 보기<ArrowRight size={16} /></button>}
      </div>
      <p className="photo-help">{danger
        ? '알림이 발생한 시점의 사진이에요. 아기를 직접 확인해 주세요. 확인 버튼을 눌러도 위험 상태는 해제되지 않아요.'
        : pending
          ? '종료가 확인되지 않은 알림의 사진이에요. 현재 분석과 별도로 확인해 주세요. 실시간 화면은 아니에요.'
          : '이전에 촬영된 알림 사진이에요. 현재 아기의 모습이나 실시간 화면은 아니에요.'}</p>
    </> : <div className="empty-photo">
      {loading || danger ? <LoaderCircle size={32} className="spin" /> : <Camera size={32} />}
      <h3>{danger ? '알림 사진을 기다리고 있어요' : loading ? '사진 기록을 확인하고 있어요' : '위험 알림 사진이 아직 없어요'}</h3>
      <p>{danger ? '사진을 기다리지 말고 아기를 먼저 확인해 주세요.' : loading ? '저장된 알림을 불러오는 중이에요.' : '위험이 감지되면 그 시점의 사진을 여기에 보여드려요.'}</p>
    </div>}
  </section>;
}