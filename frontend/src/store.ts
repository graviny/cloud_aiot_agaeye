import { emptyData, type AppData } from './domain';
const prefix = 'agaeye-camera-v1:';
export const getSession = (): string | null => { try {
    return sessionStorage.getItem(prefix + 'session');
}
catch {
    return null;
} };
export const setSession = (account: string | null) => { if (account)
    sessionStorage.setItem(prefix + 'session', account);
else
    sessionStorage.removeItem(prefix + 'session'); };
export function readData(account: string | null): AppData { if (!account)
    return emptyData(); try {
    const raw = localStorage.getItem(prefix + account);
    if (!raw)
        return emptyData();
    const parsed = JSON.parse(raw);
    return parsed && Array.isArray(parsed.sleepRecords) && Array.isArray(parsed.routines) ? { ...emptyData(), ...parsed } : emptyData();
}
catch {
    return emptyData();
} }
/** Device-local cache and demo storage. Authenticated care records are saved by the API first. */
export async function persistData(account: string, data: AppData): Promise<AppData> {
    try {
        localStorage.setItem(prefix + account, JSON.stringify(data));
        return data;
    }
    catch {
        throw new Error('기록을 저장하지 못했어요. 브라우저 저장 공간과 접근 권한을 확인한 뒤 다시 시도해 주세요.');
    }
}
export function backupLegacyRecords(account: string, data: AppData) {
    const key = prefix + 'records-backup:' + account + ':' + data.child?.id;
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data));
}
