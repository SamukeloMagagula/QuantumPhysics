import React from 'react';
import { ArrowRight, Check, Globe, Fish, Wifi, KeyRound, Shield, FlaskConical } from 'lucide-react';
import { LABS, CATEGORY_ORDER } from '../labs/registry';
import { createGuestStore } from '../labs/framework';

interface LabsHubProps {
  onOpenLab: (labId: string) => void;
  onOpenGame: () => void;
}

const CATEGORY_META: Record<string, { Icon: React.ComponentType<{ size?: number }>; glow: string }> = {
  'Web Attacks': { Icon: Globe, glow: '#fb7185' },
  'Social Engineering & Passwords': { Icon: Fish, glow: '#fbbf24' },
  Wireless: { Icon: Wifi, glow: '#22d3ee' },
  Cryptography: { Icon: KeyRound, glow: '#a78bfa' },
};

/** Difficulty pill colours, expressed in theme tokens so light mode works too. */
const DIFFICULTY_TOKEN: Record<string, string> = {
  Easy: 'var(--ok)',
  Medium: 'var(--warn)',
  Hard: 'var(--danger)',
};

export function LabsHub({ onOpenLab, onOpenGame }: LabsHubProps) {
  const store = createGuestStore();
  const completed = store.all();
  const categories = [...new Set(LABS.map((l) => l.category))].sort(
    (a, b) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b)
  );
  const pct = LABS.length ? Math.round((completed.length / LABS.length) * 100) : 0;

  return (
    <div className="bg-scene bg-mesh min-h-full px-4 py-10 md:px-8">
      <div className="max-w-5xl mx-auto space-y-7">
        <header className="a-rise">
          <h1 className="h-display text-4xl md:text-5xl text-grad">Security Labs</h1>
          <p className="text-sm ink-2 mt-2 max-w-xl leading-relaxed">
            Short, hands-on breakers. Every lab is a real (scaled-down) attack you carry out
            yourself, not a quiz about one.
          </p>

          <div className="mt-5 glass rounded-2xl p-4 flex items-center gap-4">
            <div className="flex-1">
              <div className="flex justify-between text-[11px] mb-2">
                <span className="ink-3">Progress</span>
                <span className="font-bold">
                  {completed.length} / {LABS.length}
                </span>
              </div>
              <div
                className="h-2 rounded-full overflow-hidden"
                style={{ background: 'rgb(var(--glass-tint)/.12)' }}
              >
                <div
                  className="h-full rounded-full transition-[width] duration-700 ease-out"
                  style={{
                    width: `${pct}%`,
                    background: 'linear-gradient(90deg, var(--accent), var(--accent-2))',
                  }}
                />
              </div>
            </div>
            <div className="h-section text-3xl ink-1 tabular-nums shrink-0">{pct}%</div>
          </div>
        </header>

        <button
          onClick={onOpenGame}
          style={{ ['--glow' as string]: '#34d399' }}
          className="a-pop card sheen glass w-full rounded-[22px] p-5 flex items-center gap-4 text-left"
        >
          <span className="a-float grid place-items-center w-11 h-11 rounded-2xl shrink-0" style={{ background: "color-mix(in oklab, #34d399 15%, transparent)", color: "#34d399" }}><Shield size={21} /></span>
          <div className="flex-1 min-w-0">
            <div className="text-base font-semibold ink-1">Network Defender</div>
            <div className="text-xs ink-3 mt-0.5">
              Arcade break — click threats before they reach your servers.
            </div>
          </div>
          <span className="text-[11px] ink-4 shrink-0 flex items-center gap-1">Play <ArrowRight size={11} /></span>
        </button>

        {categories.map((cat, ci) => {
          const meta = CATEGORY_META[cat] ?? { Icon: FlaskConical, glow: '#a78bfa' };
          const labs = LABS.filter((l) => l.category === cat);
          return (
            <section key={cat} className="a-rise space-y-3" style={{ animationDelay: `${ci * 70}ms` }}>
              <h2 className="flex items-center gap-2 label-mono">
                <meta.Icon size={13} />
                {cat}
                <span className="ml-1 ink-4">({labs.length})</span>
              </h2>
              <div className="stagger grid gap-3 sm:grid-cols-2">
                {labs.map((lab, i) => {
                  const done = store.isComplete(lab.id);
                  return (
                    <button
                      key={lab.id}
                      onClick={() => onOpenLab(lab.id)}
                      style={{ ['--glow' as string]: meta.glow, ['--i' as string]: i }}
                      className="card sheen glass group rounded-[18px] p-4 text-left"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-sm font-semibold ink-1 transition-colors">
                          {lab.title}
                        </div>
                        {done && <span className="shrink-0" style={{ color: "var(--ok)" }}><Check size={14} /></span>}
                      </div>
                      <div className="flex items-center gap-2 mt-2.5">
                        {(() => {
                          const tone = DIFFICULTY_TOKEN[lab.difficulty] ?? 'var(--ink-3)';
                          return (
                            <span
                              className="text-[10px] font-mono px-2 py-0.5 rounded-md border"
                              style={{
                                color: tone,
                                borderColor: `color-mix(in oklab, ${tone} 32%, transparent)`,
                                background: `color-mix(in oklab, ${tone} 12%, transparent)`,
                              }}
                            >
                              {lab.difficulty}
                            </span>
                          );
                        })()}
                        {done && (
                          <span className="text-[10px] font-mono" style={{ color: 'var(--ok)' }}>
                            completed
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
