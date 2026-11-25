export type Severity = 'immediate' | 'caution' | 'stable' | 'unknown';
export type DetectionStatus = 'new' | 'acknowledged' | 'checking' | 'resolved' | 'unverifiable';
export type RoutineType = 'sleep' | 'wake' | 'play' | 'soothe' | 'custom';
export interface Child {
    id: string;
    name: string;
    birthDate: string;
    gender?: string;
    photoUrl?: string;
}
export interface Routine {
    id: string;
    version?: number;
    childId: string;
    title: string;
    type: RoutineType;
    date: string;
    time: string;
    endTime?: string;
    endDate?: string;
    note?: string;
    status: 'todo' | 'in_progress' | 'done';
}
export const sleepRisks = {
    posture: { label: '아기 자세', message: '아기 자세 확인이 필요해요', instruction: '아이의 자세와 호흡을 직접 확인해 주세요.' },
    face: { label: '얼굴 노출', message: '얼굴 가림 의심 신호가 감지됐어요', instruction: '아이의 얼굴 주변을 직접 확인해 주세요.' },
    objects: { label: '주변 물체', message: '주변 물체 위험이 의심돼요', instruction: '아이 주변의 물건을 직접 확인해 주세요.' },
    edge: { label: '가장자리 접근', message: '가장자리 접근이 감지됐어요', instruction: '아이의 위치와 가장자리를 직접 확인해 주세요.' },
};
export type SleepRisk = keyof typeof sleepRisks;
export function getSleepRisk(alert: AlertEvent) { return sleepRisks[alert.kind || 'face'] || sleepRisks.face; }
export interface AlertEvent {
    kind?: SleepRisk;
    id: string;
    childId: string;
    severity: Severity;
    status: DetectionStatus;
    startedAt: string;
    result?: string;
}
export interface SleepRecord {
    id: string;
    version?: number;
    childId: string;
    startedAt: string;
    endedAt: string;
}
export interface AppData {
    child: Child | null;
    routines: Routine[];
    sleepRecords: SleepRecord[];
    alert: AlertEvent | null;
    preferences: {
            push: boolean;
    };
    demo: boolean;
    onboardingComplete: boolean;
}
export const koreaDate = (date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
export const today = () => koreaDate();
export const timeLabel = (iso: string) => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
export const dateLabel = (date: string) => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(date + 'T12:00:00+09:00'));
export function ageLabel(birth: string, date = today()) {
    const [by, bm, bd] = birth.split('-').map(Number);
    const [y, m, d] = date.split('-').map(Number);
    let months = (y - by) * 12 + m - bm;
    let days = d - bd;
    if (days < 0) {
        months--;
        days += new Date(y, m - 1, 0).getDate();
    }
    return `${Math.max(0, months)}개월 ${Math.max(0, days)}일`;
}
export function validBirthDate(value: string, date = today()) { const parsed = new Date(value + 'T12:00:00+09:00'); return /^\d{4}-\d{2}-\d{2}$/.test(value) && value <= date && value >= '2000-01-01' && !Number.isNaN(parsed.getTime()) && koreaDate(parsed) === value; }
export function sleepMinutes(records: SleepRecord[], childId: string, date: string): number { const from = new Date(date + 'T00:00:00+09:00').getTime(); const to = from + 86400000; const ranges = records.filter(r => r.childId === childId).map(r => [Math.max(from, new Date(r.startedAt).getTime()), Math.min(to, new Date(r.endedAt).getTime())]).filter(([s, e]) => e > s).sort((a, b) => a[0] - b[0]); let total = 0, end = from; for (const [s, e] of ranges) {
    total += Math.max(0, e - Math.max(s, end));
    end = Math.max(end, e);
} return Math.round(total / 60000); }
export function durationLabel(minutes: number): string { return minutes ? `${Math.floor(minutes / 60) ? Math.floor(minutes / 60) + '시간 ' : ''}${minutes % 60 ? minutes % 60 + '분' : ''}`.trim() : '기록 없음'; }
export function updateAlert(alert: AlertEvent, action: 'open' | 'check' | 'close' | 'submit', result?: string): AlertEvent {
    if (alert.status === 'resolved' || action === 'close')
        return alert;
    if (action === 'open')
        return { ...alert, status: alert.status === 'new' ? 'acknowledged' : alert.status };
    if (action === 'check')
        return { ...alert, status: 'checking' };
    if (!result)
        throw new Error('현장 확인 결과를 선택해 주세요.');
    return { ...alert, status: result === 'removed' || result === 'false_alarm' ? 'resolved' : result === 'unverifiable' ? 'unverifiable' : 'checking', result };
}
export const emptyData = (): AppData => ({ child: null, routines: [], sleepRecords: [], alert: null, preferences: { push: false }, demo: false, onboardingComplete: false });
export function demoData(): AppData {
    const date = today();
    const birth = new Date(date + 'T12:00:00+09:00');
    birth.setMonth(birth.getMonth() - 6);
    birth.setDate(birth.getDate() - 12);
    return { ...emptyData(), demo: true, onboardingComplete: true, child: { id: 'child-demo', name: '지안이', birthDate: koreaDate(birth), photoUrl: '/baby-demo.png' },
        sleepRecords: [{ id: 's1', childId: 'child-demo', startedAt: date + 'T00:00:00+09:00', endedAt: date + 'T06:00:00+09:00' }, { id: 's2', childId: 'child-demo', startedAt: date + 'T07:00:00+09:00', endedAt: date + 'T09:00:00+09:00' }, { id: 's3', childId: 'child-demo', startedAt: date + 'T12:00:00+09:00', endedAt: date + 'T13:20:00+09:00' }],
        routines: [{ id: 'r1', childId: 'child-demo', title: '포근한 밤잠', type: 'sleep', date, time: '20:30', endTime: '06:00', status: 'todo' }, { id: 'r2', childId: 'child-demo', title: '즐거운 놀이 시간', type: 'play', date, time: '10:00', endTime: '10:30', status: 'done' }, { id: 'r3', childId: 'child-demo', title: '안아주고 달래기', type: 'soothe', date, time: '15:00', endTime: '15:20', status: 'in_progress' }] };
}
