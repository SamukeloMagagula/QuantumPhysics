import React, { useEffect, useState } from 'react';
import { ABORT } from './qkdEngine';

/**
 * Reusable "quantum information" HUD widgets — the specific components the
 * design brief called out by name (state display, key generation, channel
 * status) rather than one-off JSX baked into a single screen. Built on the
 * app's existing glass/glow/label-mono design tokens (index.css), not a new
 * visual language — the ask was specialized *components*, not a rebrand.
 */

export function QuantumStateBadge({ bit, basis }: { bit: 0 | 1; basis: '+' | '×' }) {
  return (
    <span className="chip inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg glass text-xs font-mono">
      <span style={{ color: 'var(--accent)' }}>{bit === 0 ? '|0⟩' : '|1⟩'}</span>
      <span className="ink-4">·</span>
      <span className="ink-2">{basis}</span>
    </span>
  );
}

/** A raw or filtered/sifted key, revealed bit-by-bit rather than appearing
 * all at once — small, but it's what makes "here is your key" read as a
 * live cryptographic event instead of a static string dump. */
export function KeyStrip({
  label,
  bits,
  revealMs = 55,
}: {
  label: string;
  bits: readonly (0 | 1)[];
  revealMs?: number;
}) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    setShown(0);
    if (bits.length === 0) return;
    const id = setInterval(() => {
      setShown((s) => {
        if (s + 1 >= bits.length) {
          clearInterval(id);
          return bits.length;
        }
        return s + 1;
      });
    }, revealMs);
    return () => clearInterval(id);
    // Only re-run when the actual bit sequence changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bits.join(''), revealMs]);

  return (
    <div>
      <div className="label-mono mb-1.5 flex items-center justify-between">
        <span>{label}</span>
        <span className="ink-4">{bits.length} bits</span>
      </div>
      <div className="flex flex-wrap gap-1 font-mono text-sm">
        {bits.map((b, i) => (
          <span
            key={i}
            className={i === shown - 1 ? 'a-pop' : ''}
            style={{
              color: 'var(--ink-1)',
              opacity: i < shown ? 1 : 0.12,
              transition: 'opacity .18s ease',
            }}
          >
            {b}
          </span>
        ))}
      </div>
    </div>
  );
}

/** "CHANNEL STATUS ● SECURE / ● EAVESDROPPING DETECTED" — a live-glowing
 * badge driven by the same sampled-QBER value and the same abort threshold
 * (`ABORT` from qkdEngine.ts) the real BB84 decision logic already uses, so
 * the indicator can never disagree with what the game actually decides. */
export function ChannelStatusIndicator({ qber }: { qber: number }) {
  const compromised = qber > ABORT;
  const color = compromised ? 'var(--danger)' : 'var(--ok)';
  return (
    <div
      className="a-ring inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass"
      style={{ ['--glow' as string]: color }}
    >
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color, boxShadow: `0 0 10px 2px ${color}` }} />
      <span className="text-xs font-bold whitespace-nowrap" style={{ color }}>
        {compromised ? 'Eavesdropping detected' : 'Channel secure'}
      </span>
      <span className="label-mono !text-[9px] ink-4">{(qber * 100).toFixed(1)}%</span>
    </div>
  );
}
