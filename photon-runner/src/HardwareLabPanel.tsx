import React, { useState } from 'react';
import { LogOut } from 'lucide-react';
import { HardwareLab, LabTrack, gradeLab, labsForTrack } from './hardwareLabs';

/**
 * Alice's station: the hardware bench.
 *
 * Two tracks — the QKD optical bench, and ordinary workstation hardware. A
 * lab is a diagnosis exercise: read the instruments, name the fault, then
 * choose the repair. Getting the repair right off a wrong diagnosis is
 * explicitly not a pass, because the reasoning is the thing being taught.
 */

const TONE = {
  bg: '#080b11',
  text: '#d6e2f0',
  dim: '#7c8ba0',
  accent: '#ffa94d',
  good: '#4ade80',
  bad: '#fb7185',
};

const btn = (active: boolean): React.CSSProperties => ({
  padding: '9px 13px',
  borderRadius: 12,
  fontSize: 12,
  fontWeight: 600,
  textAlign: 'left',
  color: TONE.text,
  background: active ? 'rgba(255,169,77,.16)' : 'rgba(255,255,255,.05)',
  border: `1px solid ${active ? 'rgba(255,169,77,.5)' : 'rgba(255,255,255,.12)'}`,
  cursor: 'pointer',
  width: '100%',
});

export function HardwareLabPanel({ onClose }: { onClose: () => void }) {
  const [track, setTrack] = useState<LabTrack>('optics');
  const [lab, setLab] = useState<HardwareLab | null>(null);
  const [faultId, setFaultId] = useState<string | null>(null);
  const [fixId, setFixId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const reset = () => {
    setFaultId(null);
    setFixId(null);
    setSubmitted(false);
  };

  const result = lab && submitted ? gradeLab(lab, { faultId, fixId }) : null;

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
      <div style={{ color: TONE.accent, fontSize: 12, letterSpacing: 1.4, marginBottom: 12 }}>HARDWARE BENCH</div>

      {!lab ? (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            {(['optics', 'pc'] as LabTrack[]).map((t) => (
              <button key={t} onClick={() => setTrack(t)} style={{ ...btn(track === t), width: 'auto' }}>
                {t === 'optics' ? 'QKD optics' : 'PC hardware'}
              </button>
            ))}
          </div>
          <p style={{ color: TONE.dim, fontSize: 12, lineHeight: 1.6, marginBottom: 12 }}>
            {track === 'optics'
              ? 'The bench the protocol runs on. Every attack in the console works by exploiting a physical property of this kit — fixing it is the other half of understanding the attack.'
              : 'Ordinary workstation hardware. Diagnose from the instruments before replacing anything.'}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {labsForTrack(track).map((l) => (
              <button
                key={l.id}
                onClick={() => {
                  setLab(l);
                  reset();
                }}
                style={btn(false)}
              >
                {l.title}
                <div style={{ color: TONE.dim, fontWeight: 400, marginTop: 3, fontSize: 11 }}>{l.symptom}</div>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <button
            onClick={() => setLab(null)}
            style={{
              color: TONE.dim,
              background: 'transparent',
              border: 'none',
              fontSize: 11,
              cursor: 'pointer',
              padding: 0,
              marginBottom: 10,
            }}
          >
            ← all labs
          </button>
          <div style={{ color: TONE.text, fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{lab.title}</div>
          <p style={{ color: TONE.dim, fontSize: 12, lineHeight: 1.6, marginBottom: 14 }}>{lab.symptom}</p>

          <SectionLabel>instruments</SectionLabel>
          <div style={{ marginBottom: 16 }}>
            {lab.readings.map((r) => (
              <div
                key={r.label}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '6px 10px',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: 11.5,
                  borderRadius: 8,
                  background: r.abnormal ? 'rgba(251,113,133,.09)' : 'transparent',
                  color: r.abnormal ? TONE.bad : TONE.text,
                }}
              >
                <span>{r.label}</span>
                <span>{r.value}</span>
              </div>
            ))}
          </div>

          <SectionLabel>diagnosis</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 16 }}>
            {lab.faults.map((f) => (
              <button key={f.id} onClick={() => !submitted && setFaultId(f.id)} style={btn(faultId === f.id)}>
                {f.label}
                {submitted && (
                  <div style={{ color: TONE.dim, fontWeight: 400, marginTop: 4, fontSize: 11, lineHeight: 1.5 }}>
                    {f.why}
                  </div>
                )}
              </button>
            ))}
          </div>

          <SectionLabel>repair</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 16 }}>
            {lab.fixes.map((f) => (
              <button key={f.id} onClick={() => !submitted && setFixId(f.id)} style={btn(fixId === f.id)}>
                {f.label}
              </button>
            ))}
          </div>

          {!submitted ? (
            <button
              onClick={() => setSubmitted(true)}
              disabled={!faultId || !fixId}
              style={{
                ...btn(false),
                opacity: faultId && fixId ? 1 : 0.45,
                cursor: faultId && fixId ? 'pointer' : 'not-allowed',
                textAlign: 'center',
              }}
            >
              Submit diagnosis
            </button>
          ) : (
            <div
              style={{
                padding: 14,
                borderRadius: 12,
                background: result?.passed ? 'rgba(74,222,128,.08)' : 'rgba(251,113,133,.08)',
                border: `1px solid ${result?.passed ? 'rgba(74,222,128,.3)' : 'rgba(251,113,133,.3)'}`,
              }}
            >
              <div
                style={{
                  color: result?.passed ? TONE.good : TONE.bad,
                  fontWeight: 700,
                  fontSize: 13,
                  marginBottom: 6,
                }}
              >
                {result?.passed
                  ? 'PASS'
                  : result?.fixCorrect && !result?.faultCorrect
                    ? 'RIGHT REPAIR, WRONG REASON'
                    : 'FAIL'}
              </div>
              <p style={{ color: TONE.text, fontSize: 12.5, lineHeight: 1.65 }}>{lab.lesson}</p>
              <button onClick={reset} style={{ ...btn(false), marginTop: 12, textAlign: 'center' }}>
                Try again
              </button>
            </div>
          )}
        </>
      )}

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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ color: TONE.dim, fontSize: 9, letterSpacing: 1.3, textTransform: 'uppercase', marginBottom: 7 }}>
      {children}
    </div>
  );
}
