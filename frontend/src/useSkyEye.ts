import { useEffect, useState } from 'react';
import type { DeviceClient } from './api/deviceClient';
import { currentSnapshot, type SkySnapshot } from './skyEye';

export function useSkyEye(api: DeviceClient, scope: string, workspace: string, child: string, enabled: boolean) {
  const [state, setState] = useState<{ scope: string; snapshot: SkySnapshot | null; error: string; receivedAt: number }>({ scope: '', snapshot: null, error: '', receivedAt: 0 });
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!enabled || !workspace || !child) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = async () => {
      try {
        const snapshot = await api.skyEye(workspace, child);
        if (!cancelled && snapshot.childId === child) { const at = Date.now(); setNow(at); setState({ scope, snapshot, error: '', receivedAt: at }); }
      } catch (error) {
        if (!cancelled) setState({ scope, snapshot: null, receivedAt: Date.now(), error: error instanceof Error ? error.message : '기기의 관측 결과를 불러오지 못했어요.' });
      } finally { if (!cancelled) timer = setTimeout(poll, 2500); }
    };
    void poll();
    return () => { cancelled = true; clearTimeout(timer); clearInterval(tick); };
  }, [api, scope, workspace, child, enabled]);
  const matching = enabled && state.scope === scope;
  return { snapshot: matching ? currentSnapshot(state.snapshot, state.receivedAt, now) : null, error: matching ? state.error : '', loading: enabled && (!matching || !state.snapshot && !state.error) };
}
