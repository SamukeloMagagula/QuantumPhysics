import React, { useEffect, useRef } from 'react';

export function FacilityStoryComic({ kind, title, text, action, onContinue }: {
  kind: 'card' | 'briefing' | 'complete'; title: string; text: string; action: string; onContinue: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); return () => dialog.current?.close(); }, []);
  return <dialog ref={dialog} onCancel={e => e.preventDefault()} aria-labelledby="story-title"
    className="m-auto w-[min(1000px,94vw)] max-h-[92dvh] overflow-y-auto rounded-2xl border border-cyan-200/25 bg-slate-950 text-white p-0 backdrop:bg-black/80">
    <div className="px-5 py-4 sm:px-8 border-b border-white/10">
      <p className="text-[10px] tracking-[.2em] uppercase text-cyan-300">Phantom Q / {kind === 'card' ? 'Your story begins' : kind === 'complete' ? 'Assignment cleared' : 'Next assignment'}</p>
      <h2 id="story-title" className="text-2xl font-semibold mt-1">{title}</h2>
    </div>
    {kind === 'card' && <img src="/pq/access-card-comic.png" width="1774" height="887"
      alt="A receptionist hands the operative an access card. He scans it at a security door, enters Operations, and sits at a communications workstation."
      className="w-full block" />}
    {kind === 'card' && <ol className="grid grid-cols-3 gap-3 px-5 py-3 text-xs text-cyan-100 border-b border-white/10">
      <li>01 / Receive your card</li><li>02 / Enter Operations</li><li>03 / Begin your first task</li>
    </ol>}
    <div className="p-5 sm:p-8">
      <p className="text-sm text-slate-200 leading-relaxed max-w-3xl">{text}</p>
      <button autoFocus onClick={onContinue} className="mt-5 rounded-lg bg-cyan-200 text-slate-950 px-5 py-3 text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">{action}</button>
    </div>
  </dialog>;
}
