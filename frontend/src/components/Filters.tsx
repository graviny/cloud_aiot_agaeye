export function Filters({ value, onChange }: {
    value: string;
    onChange: (value: string) => void;
}) { return <div className="filters" role="group" aria-label="기간 필터">{[['all', '전체'], ['today', '오늘'], ['week', '지난 7일']].map(([id, label]) => <button key={id} aria-pressed={value === id} className={value === id ? 'active' : ''} onClick={() => onChange(id)}>{label}</button>)}</div>; }
