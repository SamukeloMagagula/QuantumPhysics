import React, { useEffect, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';

/** Keep the world mounted underneath every activity, with one way back. */
export function ActivityOverlay({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close.current(); }
      if (event.key !== 'Tab') return;
      const elements = [...(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]') ?? [])].filter(e => e.getClientRects().length > 0);
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <div className="activity-backdrop"><div className="activity-panel" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
    <header className="activity-header"><button onClick={onClose}><ArrowLeft size={16} />Back to map</button><span>{title}</span><span className="activity-saved">Your place on the map is saved</span></header>
    <div className="activity-content" key={title}>{children}</div>
  </div></div>;
}
