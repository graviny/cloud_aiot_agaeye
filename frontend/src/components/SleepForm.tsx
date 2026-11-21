import { useState } from 'react';
import { Button, Modal } from '../components';
import { useApp } from '../context';
import { koreaDate, timeLabel, today, type SleepRecord } from '../domain';

const inputTime = (iso: string) => `${koreaDate(new Date(iso))}T${timeLabel(iso)}`;
export function SleepForm({ initial, date, onClose }: { initial?: SleepRecord; date: string; onClose: () => void }) {
  const { data, commit, busy, toast } = useApp();
  const [id] = useState(() => initial?.id || crypto.randomUUID());
  const [start, setStart] = useState(() => initial ? inputTime(initial.startedAt) : date === today() ? inputTime(new Date(Date.now() - 3600000).toISOString()) : `${date}T12:00`);
  const [end, setEnd] = useState(() => initial ? inputTime(initial.endedAt) : date === today() ? inputTime(new Date().toISOString()) : `${date}T13:00`);
  const [deleting, setDeleting] = useState(false);
  return <Modal title={initial ? '수면 기록 수정' : '수면 기록 추가'} onClose={onClose}>
    <form onSubmit={async e => {
      e.preventDefault();
      const from = Date.parse(start + ':00+09:00'), to = Date.parse(end + ':00+09:00');
      if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || to > Date.now() + 300000 || to - from > 7 * 86400000) { toast('실제로 잠든 시작·종료 시간을 확인해 주세요. 최대 7일 범위로 입력할 수 있어요.'); return; }
      const record: SleepRecord = { id, version: initial?.version, childId: data.child!.id, startedAt: new Date(from).toISOString(), endedAt: new Date(to).toISOString() };
      if (await commit(d => ({ ...d, sleepRecords: initial ? d.sleepRecords.map(r => r.id === id ? record : r) : [...d.sleepRecords, record] }))) onClose();
    }}>
      <p className="section-description">보호자가 확인한 실제 수면 시간을 기록해 주세요. 시간은 한국 시간 기준이에요.</p>
      <label className="field">잠든 시간<input type="datetime-local" required value={start} onChange={e => setStart(e.target.value)}/></label>
      <label className="field">일어난 시간<input type="datetime-local" required value={end} onChange={e => setEnd(e.target.value)}/></label>
      <Button className="full" variant="yellow" disabled={busy}>{busy ? '저장 중…' : '수면 기록 저장'}</Button>
      {initial && <div className="delete-routine">{deleting ? <><p>이 수면 기록을 삭제할까요?</p><Button type="button" variant="danger" disabled={busy} onClick={async () => { if (await commit(d => { if (!d.sleepRecords.some(r => r.id === id && r.version === initial.version)) throw new Error('기록이 바뀌었어요. 다시 열어 주세요.'); return { ...d, sleepRecords: d.sleepRecords.filter(r => r.id !== id) }; })) onClose(); }}>삭제하기</Button><Button type="button" variant="ghost" onClick={() => setDeleting(false)}>취소</Button></> : <Button type="button" variant="ghost" onClick={() => setDeleting(true)}>수면 기록 삭제</Button>}</div>}
    </form>
  </Modal>;
}
