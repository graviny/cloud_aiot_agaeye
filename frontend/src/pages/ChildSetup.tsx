import { Steps } from '../components';
import { useApp } from '../context';
import { AuthFrame } from '../components/AuthFrame';
import { ChildForm } from '../components/ChildForm';
export function ChildSetup() { const { data, saveChild, go } = useApp(); return <AuthFrame><Steps current={0}/><div className="auth-heading"><h1>아이 기본 정보 등록</h1><p>소중한 우리 아이에 대해 알려주세요.</p></div><ChildForm initial={data.child} onSave={async (child) => { if (await saveChild(child))
    go('/onboarding/notifications'); }}/></AuthFrame>; }
