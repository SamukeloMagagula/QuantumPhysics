import React from 'react';

const POL_GLYPH: Record<0 | 1 | 2 | 3, string> = { 0: '↕ 0°', 1: '↔ 90°', 2: '↘ -45°', 3: '↗ +45°' };
const BASIS_GLYPH = { plus: '⊕ rectilinear', cross: '⊗ diagonal' } as const;

/**
 * Eve's full attack readout for the photon just fired: which basis she guessed,
 * what she read, what she resent, and whether that left a trace. Without this
 * the eavesdropper is invisible — you only ever saw the downstream error.
 */
export function EveInterceptReport({
  report,
}: {
  report: {
    eveBasis: 'plus' | 'cross';
    aliceBasis: 'plus' | 'cross';
    guessedRight: boolean;
    measuredBit: 0 | 1;
    resentPolarization: 0 | 1 | 2 | 3;
    disturbed: boolean;
  };
}) {
  const tone = report.disturbed
    ? { ring: 'border-rose-500/40', bg: 'bg-rose-500/5', text: 'text-rose-300', chip: 'bg-rose-500/15 text-rose-300 border-rose-500/30' }
    : { ring: 'border-amber-500/40', bg: 'bg-amber-500/5', text: 'text-amber-300', chip: 'bg-amber-500/15 text-amber-300 border-amber-500/30' };

  return (
    <div className={`mt-2 rounded-xl border ${tone.ring} ${tone.bg} p-3 space-y-2.5`}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-200">
          <span>🕵️</span> EVE INTERCEPT LOG
        </span>
        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-md border ${tone.chip}`}>
          {report.disturbed ? 'TRACE LEFT' : 'CLEAN READ'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-1.5 text-[10px]">
        <div className="rounded-lg bg-black/40 px-2 py-1.5">
          <div className="text-slate-500">Alice sent in</div>
          <div className="text-slate-200 font-bold">{BASIS_GLYPH[report.aliceBasis]}</div>
        </div>
        <div className="rounded-lg bg-black/40 px-2 py-1.5">
          <div className="text-slate-500">Eve guessed</div>
          <div className={`font-bold ${report.guessedRight ? 'text-emerald-300' : 'text-rose-300'}`}>
            {BASIS_GLYPH[report.eveBasis]}
          </div>
        </div>
        <div className="rounded-lg bg-black/40 px-2 py-1.5">
          <div className="text-slate-500">Eve read bit</div>
          <div className="text-slate-200 font-bold">
            {report.measuredBit}
            {!report.guessedRight && <span className="text-rose-400 font-normal"> (garbage)</span>}
          </div>
        </div>
        <div className="rounded-lg bg-black/40 px-2 py-1.5">
          <div className="text-slate-500">Resent to Bob</div>
          <div className="text-slate-200 font-bold">{POL_GLYPH[report.resentPolarization]}</div>
        </div>
      </div>

      <p className={`text-[10px] leading-relaxed ${tone.text}`}>
        {report.disturbed
          ? 'Wrong basis — measuring collapsed the photon, so what continued to Bob is a fresh random state, not what Alice sent. Alice and Bob will see this as an error when they compare a sample of their bits. That error rate is how Eve gets caught.'
          : 'Right basis — she recovered the real bit and forwarded an identical photon. This one is undetectable. She only gets away with it about half the time, which is why sampling enough bits still exposes her.'}
      </p>
    </div>
  );
}

/**
 * Eve's running dossier. A single intercept proves nothing — BB84's whole
 * argument is statistical, so this shows the numbers that actually decide
 * whether she gets away with it: how much key she truly holds, and how much
 * error she injected into the sifted bits Alice and Bob will compare.
 */
export function EveDossier({
  stats,
  onReset,
}: {
  stats: {
    intercepts: number;
    cleanReads: number;
    disturbed: number;
    bitsLearned: number;
    sifted: number;
    siftedErrors: number;
  };
  onReset: () => void;
}) {
  const qber = stats.sifted ? stats.siftedErrors / stats.sifted : 0;
  const caught = stats.sifted >= 4 && qber > 0.11;
  const knowledge = stats.sifted ? stats.bitsLearned / stats.sifted : 0;

  const Stat = ({ label, value, tone }: { label: string; value: string; tone?: string }) => (
    <div className="rounded-lg bg-black/40 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-sm font-bold" style={{ color: tone ?? '#e2e8f0' }}>
        {value}
      </div>
    </div>
  );

  return (
    <div className="absolute top-16 right-4 w-56 rounded-2xl border border-rose-500/35 bg-slate-950/92 backdrop-blur-md p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-rose-300">EVE — LIVE DOSSIER</span>
        <button onClick={onReset} className="text-[9px] text-slate-500 hover:text-slate-300 underline">
          reset
        </button>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <Stat label="Tapped" value={String(stats.intercepts)} />
        <Stat label="Clean reads" value={String(stats.cleanReads)} tone="#4ade80" />
        <Stat label="Disturbed" value={String(stats.disturbed)} tone="#fb7185" />
        <Stat label="Key bits held" value={String(stats.bitsLearned)} tone="#fbbf24" />
      </div>

      <div>
        <div className="flex justify-between text-[9px] mb-1">
          <span className="text-slate-500">KEY SHE ACTUALLY KNOWS</span>
          <span className="text-amber-300 font-bold">{Math.round(knowledge * 100)}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-400 to-rose-500 transition-[width] duration-500"
            style={{ width: `${knowledge * 100}%` }}
          />
        </div>
      </div>

      <div>
        <div className="flex justify-between text-[9px] mb-1">
          <span className="text-slate-500">ERROR SHE INJECTED (QBER)</span>
          <span className={caught ? 'text-rose-400 font-bold' : 'text-slate-300 font-bold'}>
            {(qber * 100).toFixed(0)}%
          </span>
        </div>
        <div className="relative h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{
              width: `${Math.min(100, qber * 100)}%`,
              background: caught ? '#fb7185' : '#38bdf8',
            }}
          />
          {/* 11% is the classic BB84 abort threshold. */}
          <div className="absolute inset-y-0 w-px bg-white/60" style={{ left: '11%' }} />
        </div>
      </div>

      <p
        className="text-[10px] leading-relaxed"
        style={{ color: caught ? '#fb7185' : '#94a3b8' }}
      >
        {stats.sifted < 4
          ? 'Fire more photons — a few samples prove nothing either way.'
          : caught
            ? 'Above the 11% abort line. Alice and Bob would throw this key away and know they were tapped.'
            : 'Under the abort line so far. She is getting away with it — but every wrong-basis guess pushes this up.'}
      </p>
    </div>
  );
}
