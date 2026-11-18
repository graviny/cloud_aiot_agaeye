import { useState } from 'react';
import { ChevronLeft, ChevronRight, Moon, Plus, Pencil, Trash2 } from 'lucide-react';
import { Button, EmptyState, IconButton, PageHeader, Profile, SectionHeader } from '../components';
import { useApp } from '../context';
import { dateLabel, durationLabel, koreaDate, sleepMinutes, timeLabel, today, type SleepRecord } from '../domain';
import { Timeline } from '../components/Overview';
import { SleepForm } from '../components/SleepForm';
export function Summary() {
  const { data, busy, commit } = useApp();
  const [date, setDate] = useState(today());
  const [sleep, setSleep] = useState<SleepRecord | null | undefined>();
  const start = Date.parse(date+'T00:00:00+09:00');
  const records = data.sleepRecords.filter(r => r.childId === data.child!.id && Date.parse(r.endedAt) > start && Date.parse(r.startedAt) < start+86400000).sort((a,b) => b.startedAt.localeCompare(a.startedAt));
  function changeDay(amount: number) { setDate(koreaDate(new Date(start + (amount*24+12)*3600000))); }
  return <div className="narrow-page"><PageHeader title="히스토리" subtitle="아이의 수면 기록을 살펴봐요"/>
    <div className="date-picker"><IconButton label="이전 날짜" onClick={() => changeDay(-1)}><ChevronLeft size={20}/></IconButton><label><input type="date" max={today()} value={date} onChange={e => { if (e.target.value) setDate(e.target.value); }} aria-label="요약 날짜"/></label><IconButton label="다음 날짜" disabled={date >= today()} onClick={() => changeDay(1)}><ChevronRight size={20}/></IconButton></div>
    <section className="card summary-intro compact-summary"><div className="history-summary-header"><Profile child={data.child!} compact/><Button variant="secondary" disabled={busy} onClick={() => setSleep(null)}><Plus size={16}/>수면 시간 추가하기</Button></div><h2>{data.child!.name}의 하루 요약</h2><div className="summary-stats sleep-only-stats"><div><Moon/><strong>{durationLabel(sleepMinutes(data.sleepRecords,data.child!.id,date))}</strong><span>수면</span></div></div></section>
    <section className="card"><SectionHeader title="수면 타임라인"/><Timeline date={date}/></section>
    <section className="card"><SectionHeader title="수면 기록"/>{records.length ? records.map(record => <div className="sleep-history-row" key={record.id}><Moon size={20}/><div><strong>{timeLabel(record.startedAt)}–{timeLabel(record.endedAt)}</strong><small>{dateLabel(koreaDate(new Date(record.startedAt)))} · {durationLabel(Math.round((Date.parse(record.endedAt)-Date.parse(record.startedAt))/60000))}</small></div><IconButton label="수면 기록 수정" disabled={busy} onClick={() => setSleep(record)}><Pencil size={17}/></IconButton><IconButton label="수면 기록 삭제" disabled={busy} onClick={() => { if (window.confirm('이 수면 기록을 삭제할까요?')) void commit(previous => ({...previous,sleepRecords:previous.sleepRecords.filter(r => r.id !== record.id)})); }}><Trash2 size={17}/></IconButton></div>) : <EmptyState title="이날의 수면 기록이 없어요"/>}</section>
    {sleep !== undefined && <SleepForm initial={sleep || undefined} date={date} onClose={() => setSleep(undefined)}/>}
  </div>;
}
