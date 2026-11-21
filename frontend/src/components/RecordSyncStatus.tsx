import { useApp } from '../context';

export function RecordSyncStatus() {
  const { authenticated, data, recordsLoading, recordsError } = useApp();
  if (!authenticated || data.demo || (!recordsLoading && !recordsError)) return null;
  return <div className={'record-sync-status' + (recordsError ? ' has-error' : '')} role="status">
    <span>{recordsError ? `서버 기록을 불러오지 못했어요. ${recordsError} 표시 중인 기록은 최신이 아닐 수 있어요.` : '수면 기록을 불러오는 중이에요…'}</span>
  </div>;
}
