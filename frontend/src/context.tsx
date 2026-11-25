import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { demoData, emptyData, type AppData, type Child } from './domain';
import { backupLegacyRecords, getSession, persistData, readData, setSession } from './store';
import { ApiError, DeviceClient, type Child as ServerChild } from './api/deviceClient';
import { applySavedCare, careChanges, hasCareChanges, legacyCareChanges, loadCareRecords } from './careHistory';
import { authContinuation, deviceLoginRoute, homeRoute, previewAccount, routeRedirect, withServerChild } from './sessionFlow';
import { useSkyEye } from './useSkyEye';

type Change = AppData | ((previous: AppData) => AppData);
interface Context {
  data: AppData; account: string | null; username: string; path: string; busy: boolean; online: boolean;
  go: (path: string, replace?: boolean) => void;
  commit: (change: Change) => Promise<boolean>;
  toast: (message: string) => void;
  login: (identifier: string, password: string, mode: 'login' | 'signup') => Promise<void>;
  enterDemo: () => Promise<void>;
  logout: () => Promise<void>;
  api: DeviceClient; authenticated: boolean;
  workspaceId: string;
  saveChild: (child: Child) => Promise<boolean>;
  selectServerChild: (workspace: string, child: ServerChild) => Promise<void>;
  sky: ReturnType<typeof useSkyEye>;
  recordsLoading: boolean; recordsError: string; refreshRecords: () => Promise<void>;
}
const AppContext = createContext<Context>(null!);
export const useApp = () => useContext(AppContext);

export function AppProvider({ children }: { children: ReactNode }) {
  const [api] = useState(() => new DeviceClient(import.meta.env.VITE_API_BASE_URL || ''));
  const [account, setAccount] = useState(() => previewAccount(getSession()));
  const [username, setUsername] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [workspaceId, setWorkspaceId] = useState('');
  const [data, setData] = useState(() => readData(previewAccount(getSession())));
  const sky = useSkyEye(api, `${account}:${workspaceId}:${data.child?.id}`, workspaceId, data.child?.id || '', authenticated && !data.demo);
  const dataRef = useRef(data), storageAccount = useRef<string | null>(previewAccount(getSession()));
  const [path, setPath] = useState(window.location.pathname);
  const [busy, setBusy] = useState(false), locked = useRef(false);
  const [message, setMessage] = useState(''), toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const createChildRequest = useRef<{ body: string; key: string } | null>(null);
  const careRequest = useRef<{ body: string; key: string } | null>(null);
  const recordsRequest = useRef(0), recordsPending = useRef(false), recordsReady = useRef(false);
  const [recordsLoading, setRecordsLoading] = useState(false), [recordsError, setRecordsError] = useState('');
  const childId = data.child?.id || '';
  const go = useCallback((next: string, replace = false) => {
    const url = new URL(next, window.location.href);
    if (url.origin !== window.location.origin) return;
    window.history[replace ? 'replaceState' : 'pushState']({}, '', url.pathname + url.search + url.hash);
    setPath(url.pathname); window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);
  const toast = useCallback((text: string) => { setMessage(text); if (toastTimer.current) clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setMessage(''), 4500); }, []);
  function resetAccount() {
    recordsRequest.current++; recordsReady.current = false; recordsPending.current = false; careRequest.current = null;
    setRecordsLoading(false); setRecordsError('');
    api.clear(); setAuthenticated(false); setWorkspaceId('');
    setAccount(null); setUsername(''); storageAccount.current = null; createChildRequest.current = null;
    dataRef.current = emptyData(); setData(dataRef.current);
    try { setSession(null); } catch { /* In-memory logout still succeeds if storage is blocked. */ }
  }
  useEffect(() => {
    api.onSessionExpired = () => {
      const destination = window.location.pathname === '/devices' ? deviceLoginRoute(window.location.hash) : '/login';
      resetAccount(); toast('로그인이 만료됐어요. 다시 로그인해 주세요.'); go(destination, true);
    };
    return () => { api.onSessionExpired = undefined; api.clear(); if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, [api, go, toast]);
  useEffect(() => {
    const pop = () => setPath(window.location.pathname), network = () => setOnline(navigator.onLine);
    window.addEventListener('popstate', pop); window.addEventListener('online', network); window.addEventListener('offline', network);
    return () => { window.removeEventListener('popstate', pop); window.removeEventListener('online', network); window.removeEventListener('offline', network); };
  }, []);
  useEffect(() => {
    if (busy) return;
    const redirect = routeRedirect(path, account, authenticated, data, window.location.search, window.location.hash);
    if (redirect) go(redirect, true);
  }, [account, authenticated, path, data.child, data.onboardingComplete, busy, go]);

  async function store(next: AppData) {
    if (!storageAccount.current) throw new Error('로그인이 필요해요.');
    if (authenticated) {
      dataRef.current = next; setData(next);
      await persistData(storageAccount.current, next).catch(() => toast('서버에는 저장됐지만 브라우저에 사본을 보관하지 못했어요.'));
    } else { await persistData(storageAccount.current, next); dataRef.current = next; setData(next); }
  }
  const refreshRecords = useCallback(async () => {
    if (!authenticated || !childId || locked.current || recordsPending.current) return;
    const request = ++recordsRequest.current, cacheAccount = storageAccount.current;
    const current = () => request === recordsRequest.current && storageAccount.current === cacheAccount && dataRef.current.child?.id === childId;
    recordsPending.current = true; setRecordsLoading(true);
    try {
      let records = await loadCareRecords(api, workspaceId, childId, current);
      if (!current()) return;
      if (!recordsReady.current) {
        if (cacheAccount && [...dataRef.current.routines, ...dataRef.current.sleepRecords].some(r => r.version === undefined)) backupLegacyRecords(cacheAccount, dataRef.current);
        const legacy = legacyCareChanges(dataRef.current, records);
        if (hasCareChanges(legacy) && cacheAccount) {
          // Back up pre-DB records before importing. Demo IDs and another child's records are excluded.
          while (legacy.routines.length || legacy.sleepRecords.length) {
            if (!current()) return;
            await api.saveCareHistory(workspaceId, childId, { ...legacy, routines: legacy.routines.splice(0, 50), sleepRecords: legacy.sleepRecords.splice(0, 50) }, crypto.randomUUID());
          }
          records = await loadCareRecords(api, workspaceId, childId, current);
        }
      }
      if (!current()) return;
      const next = { ...dataRef.current, ...records };
      recordsReady.current = true; dataRef.current = next; setData(next); setRecordsError('');
      if (cacheAccount) await persistData(cacheAccount, next).catch(() => {});
    } catch (error) { if (current()) setRecordsError(error instanceof Error ? error.message : '기록을 불러오지 못했어요.'); }
    finally { if (request === recordsRequest.current) { recordsPending.current = false; setRecordsLoading(false); } }
  }, [api, authenticated, workspaceId, childId]);
  useEffect(() => {
    recordsRequest.current++; recordsPending.current = false; recordsReady.current = false; setRecordsError(''); setRecordsLoading(false);
    if (!authenticated || !childId) return;
    // Login/child setup releases its write lock before the effect's first request.
    const first = setTimeout(() => void refreshRecords(), 0);
    const interval = setInterval(() => { if (!document.hidden) void refreshRecords(); }, 20000);
    const resume = () => { if (!document.hidden) void refreshRecords(); };
    window.addEventListener('online', resume); document.addEventListener('visibilitychange', resume);
    return () => { recordsRequest.current++; recordsPending.current = false; clearTimeout(first); clearInterval(interval); window.removeEventListener('online', resume); document.removeEventListener('visibilitychange', resume); };
  }, [authenticated, childId, workspaceId, refreshRecords]);
  const commit = async (change: Change) => {
    if (locked.current || !account) return false;
    locked.current = true; setBusy(true);
    const cacheAccount = storageAccount.current, selected = dataRef.current.child?.id;
    let conflict = false;
    try {
      let next = typeof change === 'function' ? change(dataRef.current) : change;
      if (authenticated && selected) {
        const changes = careChanges(dataRef.current, next);
        if (hasCareChanges(changes)) {
          if (!recordsReady.current) throw new Error('서버 기록을 먼저 불러와 주세요. 화면 위의 다시 불러오기를 눌러 주세요.');
          recordsRequest.current++; recordsPending.current = false; setRecordsLoading(false);
          const body = JSON.stringify([workspaceId, selected, changes]);
          if (careRequest.current?.body !== body) careRequest.current = { body, key: crypto.randomUUID() };
          const saved = await api.saveCareHistory(workspaceId, selected, changes, careRequest.current.key);
          if (cacheAccount !== storageAccount.current || selected !== dataRef.current.child?.id) return false;
          next = applySavedCare(next, saved); careRequest.current = null; setRecordsError('');
        }
      }
      await store(next); return true;
    }
    catch (error) { conflict = error instanceof ApiError && error.status === 409; toast(error instanceof Error ? error.message : '저장하지 못했어요.'); return false; }
    finally { locked.current = false; setBusy(false); if (conflict) void refreshRecords(); }
  };
  const login = async (identifier: string, password: string, mode: 'login' | 'signup') => {
    if (locked.current) return;
    locked.current = true; setBusy(true);
    const continuation = authContinuation(window.location.search, window.location.hash);
    try {
      const normalized = identifier.trim().toLowerCase();
      const session = await api.authenticate(mode, normalized, password);
      const accountKey = session.email || `user:${session.userId || normalized}`;
      const spaces = await api.workspaces();
      const workspace = spaces.items.find(item => item.type === 'PERSONAL') || spaces.items[0];
      if (!workspace) throw new Error('이 계정의 돌봄 공간을 찾지 못했어요.');
      const serverChildren = (await api.children(workspace.id)).items;
      const storageKey = `server:${session.userId || accountKey}`;
      const previous = readData(storageKey);
      const child = serverChildren.find(item => item.id === previous.child?.id) || serverChildren[0] || null;
      const next = withServerChild(previous, child);
      if (child) next.onboardingComplete = true;
      storageAccount.current = storageKey; dataRef.current = next; setData(next);
      setAccount(accountKey); setUsername(session.username || (normalized.includes('@') ? '' : normalized)); setAuthenticated(true); setWorkspaceId(workspace.id);
      try { setSession(null); } catch { /* Credentials remain memory-only. */ }
      go(continuation || homeRoute(next), true);
    } catch (error) { api.clear(); throw error; }
    finally { locked.current = false; setBusy(false); }
  };
  const enterDemo = async () => {
    if (locked.current) return;
    locked.current = true; setBusy(true);
    try {
      const next = readData('demo').child ? readData('demo') : demoData();
      await persistData('demo', next); setSession('demo'); api.clear(); setAuthenticated(false);
      setWorkspaceId(''); setUsername('');
      storageAccount.current = 'demo'; dataRef.current = next; setData(next); setAccount('demo'); go('/home');
    } catch { toast('브라우저 저장 공간에 접근할 수 없어요.'); }
    finally { locked.current = false; setBusy(false); }
  };
  const logout = async () => {
    if (locked.current) return;
    locked.current = true; setBusy(true);
    try { if (authenticated) await api.logout(); }
    catch { toast('이 기기에서 로그아웃했어요. 서버에 연결하지 못했어요.'); }
    finally { resetAccount(); go('/welcome', true); locked.current = false; setBusy(false); }
  };
  const selectServerChild = async (workspace: string, child: ServerChild) => {
    recordsRequest.current++; recordsPending.current = false; recordsReady.current = false; careRequest.current = null;
    const next = withServerChild(dataRef.current, child); next.onboardingComplete = true;
    setWorkspaceId(workspace); dataRef.current = next; setData(next);
    if (storageAccount.current) await persistData(storageAccount.current, next).catch(() => toast('아이 정보는 서버에 저장됐지만 브라우저에 보관하지 못했어요.'));
  };
  const saveChild = async (child: Child) => {
    if (locked.current || !account) return false;
    locked.current = true; setBusy(true);
    try {
      let saved = child;
      if (authenticated) {
        const body = JSON.stringify([workspaceId, child.name, child.birthDate]);
        if (createChildRequest.current?.body !== body) createChildRequest.current = { body, key: crypto.randomUUID() };
        const result = dataRef.current.child
          ? await api.updateChild(workspaceId, dataRef.current.child.id, child.name, child.birthDate)
          : await api.createChild(workspaceId, child.name, child.birthDate, createChildRequest.current.key);
        saved = { ...child, id: result.id, name: result.displayName, birthDate: result.birthDate };
      }
      await store({ ...dataRef.current, child: saved }); return true;
    } catch (error) { toast(error instanceof Error ? error.message : '아이 정보를 저장하지 못했어요.'); return false; }
    finally { locked.current = false; setBusy(false); }
  };
  return <AppContext.Provider value={{ data, account, username, path, go, commit, busy, toast, login, enterDemo, logout, online, api, authenticated, workspaceId, saveChild, selectServerChild, sky, recordsLoading, recordsError, refreshRecords }}>{children}<div className={'toast ' + (message ? 'show' : '')} role="status" aria-live="polite">{message}</div></AppContext.Provider>;
}
