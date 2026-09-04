import React from 'react';
import { Check } from 'lucide-react';

/**
 * Shared furniture for the campaign exercises, so the ordering, sorting,
 * transfer, rack and phishing views all present the same way.
 */

export const TONE = {
  text: '#d6e2f0',
  dim: '#7c8ba0',
  accent: '#5ec8e8',
  good: '#4ade80',
  warn: '#fbbf24',
};

export function ExFrame({ prompt, children }: { prompt: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 12,
        background: 'rgba(255,255,255,.03)',
        border: '1px solid rgba(255,255,255,.1)',
        marginBottom: 14,
      }}
    >
      <div style={{ color: TONE.accent, fontSize: 11.5, fontWeight: 600, marginBottom: 10 }}>{prompt}</div>
      {children}
    </div>
  );
}

export const ExLabel = ({ children }: { children: React.ReactNode }) => (
  <div style={{ color: TONE.dim, fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 6 }}>
    {children}
  </div>
);

export const Feedback = ({ text }: { text: string | null }) =>
  text ? (
    <div
      style={{
        marginTop: 11,
        padding: '9px 11px',
        borderRadius: 9,
        background: 'rgba(251,191,36,.08)',
        border: '1px solid rgba(251,191,36,.3)',
        color: TONE.text,
        fontSize: 11.5,
        lineHeight: 1.55,
      }}
    >
      {text}
    </div>
  ) : null;

export function Primary({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        marginTop: 12,
        width: '100%',
        padding: '9px 12px',
        borderRadius: 10,
        fontSize: 12,
        fontWeight: 700,
        color: '#04121a',
        background: disabled ? 'rgba(94,200,232,.35)' : TONE.accent,
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
      }}
    >
      {children}
    </button>
  );
}

export const Solved = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      marginTop: 12,
      color: TONE.good,
      fontSize: 11.5,
      fontWeight: 700,
      display: 'flex',
      alignItems: 'center',
      gap: 6,
    }}
  >
    <Check size={14} /> {children}
  </div>
);
