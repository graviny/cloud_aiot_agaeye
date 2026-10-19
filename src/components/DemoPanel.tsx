import { FlaskConical, RotateCcw, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import type { MonitorSource, Scenario } from '../domain/types';

const scenarios: { title: string; options: [Scenario, string][] }[] = [
  { title: '아기와 분석', options: [['normal', '전체 정상'], ['absent', '아기 미감지'], ['analysis_unavailable', '분석 불가'], ['caution', '주의 상태']] },
  { title: '위험과 사진', options: [['prone', '엎드림 위험'], ['face_covered', '안면 차폐 위험'], ['photo_loading', '사진 로딩'], ['photo_failed', '사진 조회 실패'], ['end_risk', '위험 종료']] },
  { title: '연결과 복구', options: [['camera_disconnected', '카메라 단절'], ['pi_disconnected', '라즈베리파이 단절'], ['server_disconnected', '서버 단절'], ['stale', '갱신 중단'], ['recover', '연결 복구']] },
  { title: '이벤트와 이력', options: [['duplicate', '동일 이벤트 재수신'], ['delayed_event', '과거 이벤트 수신'], ['history_error', '이력 조회 실패']] },
];

export function DemoPanel({ source, message }: { source: MonitorSource; message: string | null }) {
  const [selected, setSelected] = useState<Scenario>('normal');
  const [confirmReset, setConfirmReset] = useState(false);
  return <details className="demo-panel">
    <summary><span><FlaskConical size={18} />개발용 시나리오<span className="badge neutral">MOCK</span></span><ChevronDown size={18} /></summary>
    <div className="demo-content">
      <p>실제 장치 없이 상태와 알림을 확인해 보세요. 이 패널은 데모 모드에서만 보여요.</p>
      <div className="scenario-groups">{scenarios.map(group => <div className="scenario-group" key={group.title}><span className="eyebrow">{group.title}</span><div>{group.options.map(([value, label]) => <button key={value} className={`scenario-button ${selected === value ? 'selected' : ''}`} onClick={() => { setSelected(value); source.runScenario?.(value); }}>{label}</button>)}</div></div>)}</div>
      <div className="demo-bottom"><p role="status">{message || '상태를 선택하면 대시보드에 바로 반영돼요.'}</p>
        {confirmReset ? <div className="reset-confirm"><span>모든 데모 이력을 지울까요?</span><button className="text-button danger-text" onClick={() => { source.reset?.(); setSelected('normal'); setConfirmReset(false); }}>초기화하기</button><button className="text-button" onClick={() => setConfirmReset(false)}>취소</button></div>
          : <button className="text-button" onClick={() => setConfirmReset(true)}><RotateCcw size={14} />데모 기록 초기화</button>}
      </div>
    </div>
  </details>;
}
