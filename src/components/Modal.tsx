import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    element?.showModal();
    return () => { element?.close(); previous?.focus(); };
  }, []);
  return <dialog ref={dialog} className="modal" aria-labelledby="detail-title" onCancel={onClose}
    onClick={event => { if (event.target === dialog.current) onClose(); }}>
    <div className="modal-head"><h2 id="detail-title">{title}</h2><button className="icon-button" aria-label="상세 창 닫기" onClick={onClose}><X size={20} /></button></div>
    {children}
  </dialog>;
}
