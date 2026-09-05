import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check } from 'lucide-react';
import { getLab } from './labRegistry';
import { createGuestStore, mountLab } from './labFramework';

interface LabRunnerProps {
  labId: string;
  onExit?: () => void;
}

/**
 * The shell a lab runs inside.
 *
 * The lab itself is vanilla DOM built by the module, so this only supplies
 * the frame: where you are, how hard it is, whether you have finished it
 * before, and a way back. Everything is drawn from the same theme tokens as
 * the dashboard, so a lab looks like part of the product in either theme.
 */
export function LabRunner({ labId, onExit }: LabRunnerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lab = getLab(labId);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!lab) return;
    setDone(createGuestStore().isComplete(lab.id));
  }, [lab]);

  useEffect(() => {
    if (!containerRef.current || !lab) return;
    const store = createGuestStore();
    mountLab(containerRef.current, lab, store, () => setDone(true));
  }, [labId, lab]);

  const tone: Record<string, string> = {
    beginner: 'var(--ok)',
    intermediate: 'var(--warn)',
    advanced: 'var(--danger)',
  };

  return (
    <div className="bg-scene bg-mesh min-h-full px-4 py-6 md:px-8">
      <div className="max-w-3xl mx-auto space-y-4">
        {onExit && (
          <button onClick={onExit} className="btn btn-ghost px-3 py-2 text-xs">
            <ArrowLeft size={13} /> Back to labs
          </button>
        )}

        {!lab ? (
          <p className="text-[var(--danger)] font-mono text-sm">Lab not found.</p>
        ) : (
          <>
            <header className="panel rounded-2xl p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <div className="label-mono !text-[9px] ink-4">{lab.category}</div>
                  <h1 className="h-section text-xl ink-1 mt-0.5">{lab.title}</h1>
                </div>
                <div className="flex items-center gap-2">
                  {done && (
                    <span
                      className="text-[10px] font-mono px-2 py-1 rounded-md flex items-center gap-1"
                      style={{ color: 'var(--ok)', background: 'color-mix(in oklab, var(--ok) 14%, transparent)' }}
                    >
                      <Check size={11} /> completed
                    </span>
                  )}
                  <span
                    className="text-[10px] font-mono px-2 py-1 rounded-md border"
                    style={{
                      color: tone[lab.difficulty] ?? 'var(--ink-3)',
                      borderColor: `color-mix(in oklab, ${tone[lab.difficulty] ?? 'var(--ink-3)'} 32%, transparent)`,
                      background: `color-mix(in oklab, ${tone[lab.difficulty] ?? 'var(--ink-3)'} 12%, transparent)`,
                    }}
                  >
                    {lab.difficulty}
                  </span>
                </div>
              </div>
            </header>

            <div ref={containerRef} className="space-y-4" />
          </>
        )}
      </div>
    </div>
  );
}
