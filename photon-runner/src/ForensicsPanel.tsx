import React, { useMemo, useState } from 'react';
import { LogOut } from 'lucide-react';
import { AttackState } from './qkdAttack';
import {
  ForensicReport,
  StationId,
  STATION_LABELS,
  Verdict,
  buildReport,
  judge,
  suspicionScore,
} from './qkdForensics';

/**
 * Bob's station: read the trail a hack left and name the eavesdropper.
 *
 * This is where BB84's actual guarantee gets taught. The three columns are
 * the three fingerprints an intercept leaves — error rate, error shape, and
 * basis-match rate — and the player has to weigh them rather than be told
 * the answer. A quiet attack leaves the table looking innocent on purpose.
 */

const TONE = {
  bg: '#080b11',
  text: '#d6e2f0',
  dim: '#7c8ba0',
  accent: '#22d3ee',
  good: '#4ade80',
  warn: '#fbbf24',
  bad: '#fb7185',
};

const cell = (v: string, danger = false): React.CSSProperties => ({
  padding: '10px 12px',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 12,
  color: danger ? TONE.bad : TONE.text,
  whiteSpace: 'nowrap' as const,
  ...(v ? {} : {}),
});

export function ForensicsPanel({ session, onClose }: { session: AttackState | null; onClose: () => void }) {
  // Built once per mounted session so the jitter doesn't reshuffle on every
  // keystroke — the evidence has to stay put while it's being read.
  const report: ForensicReport | null = useMemo(() => (session ? buildReport(session) : null), [session]);
  const [verdict, setVerdict] = useState<Verdict | null>(null);

  if (!session || !report) {
    return (
      <Shell onClose={onClose}>
        <p style={{ color: TONE.dim, fontSize: 13, lineHeight: 1.6 }}>
          No exchange on record. Run an attack from Eve&apos;s console first — this station reads the trail a hack
          leaves behind, so there has to be one.
        </p>
      </Shell>
    );
  }

  const ranked = [...report.evidence].sort((a, b) => suspicionScore(b) - suspicionScore(a));

  return (
    <Shell onClose={onClose}>
      <div style={{ color: TONE.accent, fontSize: 12, letterSpacing: 1.4, marginBottom: 4 }}>
        POST-EXCHANGE FORENSICS
      </div>
      <p style={{ color: TONE.dim, fontSize: 12, lineHeight: 1.6, marginBottom: 14 }}>
        {session.target.name} · {session.sifted} sifted bits. One of these three stations was the tap. An honest
        station sits at the channel noise floor with a ~100% basis match.
      </p>

      <div style={{ overflowX: 'auto', border: '1px solid rgba(255,255,255,.1)', borderRadius: 12 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 460 }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,.04)' }}>
              {['station', 'QBER', 'error shape', 'basis match'].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: 'left',
                    padding: '9px 12px',
                    fontSize: 9,
                    letterSpacing: 1.2,
                    textTransform: 'uppercase',
                    color: TONE.dim,
                    fontWeight: 600,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ranked.map((e) => {
              const hotQber = e.qber > 0.03;
              const hotBasis = e.basisMatch < 0.9;
              return (
                <tr key={e.station} style={{ borderTop: '1px solid rgba(255,255,255,.07)' }}>
                  <td style={cell(e.station)}>{STATION_LABELS[e.station]}</td>
                  <td style={cell('', hotQber)}>{(e.qber * 100).toFixed(2)}%</td>
                  <td style={cell('', e.errorShape === 'clustered')}>{e.errorShape}</td>
                  <td style={cell('', hotBasis)}>{(e.basisMatch * 100).toFixed(1)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!verdict ? (
        <>
          <p style={{ color: TONE.dim, fontSize: 12, margin: '16px 0 8px' }}>Who was tapping the line?</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(['alice', 'bob', 'eve'] as StationId[]).map((s) => (
              <button
                key={s}
                onClick={() => setVerdict(judge(report, s))}
                style={{
                  padding: '9px 14px',
                  borderRadius: 12,
                  fontSize: 12,
                  fontWeight: 600,
                  color: TONE.text,
                  background: 'rgba(255,255,255,.06)',
                  border: '1px solid rgba(255,255,255,.13)',
                  cursor: 'pointer',
                }}
              >
                Accuse {STATION_LABELS[s].split(' · ')[0]}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div
          style={{
            marginTop: 16,
            padding: 14,
            borderRadius: 12,
            background: verdict.correct ? 'rgba(74,222,128,.08)' : 'rgba(251,113,133,.08)',
            border: `1px solid ${verdict.correct ? 'rgba(74,222,128,.3)' : 'rgba(251,113,133,.3)'}`,
          }}
        >
          <div style={{ color: verdict.correct ? TONE.good : TONE.bad, fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
            {verdict.correct ? 'CORRECT' : 'INCORRECT'}
          </div>
          <p style={{ color: TONE.text, fontSize: 12.5, lineHeight: 1.65 }}>{verdict.explanation}</p>
          <button
            onClick={() => setVerdict(null)}
            style={{
              marginTop: 12,
              padding: '7px 12px',
              borderRadius: 10,
              fontSize: 11,
              color: TONE.dim,
              background: 'transparent',
              border: '1px solid rgba(255,255,255,.13)',
              cursor: 'pointer',
            }}
          >
            Re-examine
          </button>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      style={{
        background: TONE.bg,
        border: '1px solid rgba(255,255,255,.1)',
        borderRadius: 16,
        padding: 20,
        height: '100%',
        overflowY: 'auto',
      }}
    >
      {children}
      <button
        onClick={onClose}
        style={{
          marginTop: 18,
          padding: '9px 14px',
          borderRadius: 12,
          fontSize: 12,
          fontWeight: 600,
          color: TONE.text,
          background: 'rgba(255,255,255,.07)',
          border: '1px solid rgba(255,255,255,.12)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          cursor: 'pointer',
        }}
      >
        <LogOut size={14} /> Stand up <span style={{ color: TONE.dim }}>(Esc)</span>
      </button>
    </div>
  );
}
