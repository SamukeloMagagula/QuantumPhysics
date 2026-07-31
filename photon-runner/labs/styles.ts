/**
 * Tailwind class strings standing in for CyberRange's semantic CSS classes
 * (.card, .muted, .secondary, var(--accent)/var(--danger)) so ported labs
 * match photon-runner's dark cyberpunk look instead of pulling in a
 * separate stylesheet.
 */
export const CARD = 'bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-2 font-mono text-sm';
export const MUTED = 'text-slate-400 text-xs';
export const HEADING = 'text-lg font-bold text-white';
export const INPUT =
  'w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:border-cyan-500';
export const BUTTON =
  'px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold font-mono text-sm transition-all';
export const BUTTON_SECONDARY =
  'px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-sm transition-all';
export const ACCENT_CARD = 'bg-cyan-950/40 border border-cyan-500/50 rounded-2xl p-4 font-mono text-sm';
export const DANGER_CARD = 'bg-rose-950/40 border border-rose-500/50 rounded-2xl p-4 font-mono text-sm';
export const DONE_TEXT = 'text-emerald-400 font-bold font-mono text-sm';
