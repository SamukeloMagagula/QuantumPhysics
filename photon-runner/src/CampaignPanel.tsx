import React, { useMemo, useState } from 'react';
import { LogOut, Wrench } from 'lucide-react';
import {
  AREA_NAMES,
  CampaignState,
  Choice,
  SPEAKER_NAMES,
  advance,
  chapterProgress,
  choose,
  currentBeat,
  getChapter,
  initialCampaign,
} from './campaignStory';
import { HardwareLabPanel } from './HardwareLabPanel';

/**
 * Workstation 04 — the campaign terminal.
 *
 * The client's bible makes this a persistent object: the same workstation
 * across the whole game, not a different machine per scene, because it
 * becomes part of the evidence chain. So the campaign is presented as this
 * machine's screen rather than as a cutscene layer over the world.
 *
 * The case board on the right is deliberately the strict record of what the
 * player has personally established — the "information boundary" the bible
 * insists on. It never shows anything the player has not observed.
 */

const TONE = {
  bg: '#080b11',
  text: '#d6e2f0',
  dim: '#7c8ba0',
  accent: '#5ec8e8',
  good: '#4ade80',
  warn: '#fbbf24',
  bad: '#fb7185',
};

const SPEAKER_COLOUR: Record<string, string> = {
  alice: '#ffa94d',
  bob: '#5ec8e8',
  eve: '#c9a7f0',
  system: '#8fa6bd',
  reception: '#8fa6bd',
  workstation: '#4ade80',
  trainee: '#d6e2f0',
};

export function CampaignPanel({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<CampaignState>(() => initialCampaign());
  const [lastOutcome, setLastOutcome] = useState<{ text: string; unsupported: boolean } | null>(null);
  const [showBench, setShowBench] = useState(false);

  const beat = currentBeat(state);
  const chapter = getChapter(state.chapter);
  const progress = chapterProgress(state);

  const take = (c: Choice) => {
    setLastOutcome({ text: c.outcome, unsupported: !!c.unsupported });
    setState((s) => choose(s, c.id));
  };
  const next = () => {
    setLastOutcome(null);
    setState((s) => advance(s));
  };

  const evidence = useMemo(() => [...state.evidence].reverse(), [state.evidence]);

  if (showBench) {
    return <HardwareLabPanel onClose={() => setShowBench(false)} />;
  }

  return (
    <div
      style={{
        background: TONE.bg,
        border: '1px solid rgba(255,255,255,.1)',
        borderRadius: 16,
        height: '100%',
        display: 'grid',
        gridTemplateColumns: 'minmax(0,1fr) 280px',
        overflow: 'hidden',
      }}
    >
      {/* ---------------- story ---------------- */}
      <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
          <span style={{ color: TONE.accent, fontSize: 12, letterSpacing: 1.4 }}>
            {chapter?.title.toUpperCase()}
          </span>
          <span style={{ color: TONE.dim, fontSize: 11 }}>{chapter?.subtitle}</span>
        </div>

        <div style={{ height: 3, background: 'rgba(255,255,255,.07)', borderRadius: 3, marginBottom: 14 }}>
          <div
            style={{
              width: `${progress * 100}%`,
              height: '100%',
              background: TONE.accent,
              borderRadius: 3,
              transition: 'width .35s',
            }}
          />
        </div>

        {state.complete || !beat ? (
          <CaseClosed chapter={chapter} onClose={onClose} />
        ) : (
          <>
            <div style={{ color: TONE.dim, fontSize: 10, letterSpacing: 1.2, marginBottom: 12 }}>
              {AREA_NAMES[beat.area].toUpperCase()}
            </div>

            {beat.objective && (
              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: 10,
                  background: 'rgba(94,200,232,.09)',
                  border: '1px solid rgba(94,200,232,.28)',
                  marginBottom: 14,
                }}
              >
                <div style={{ color: TONE.dim, fontSize: 9, letterSpacing: 1.2 }}>OBJECTIVE</div>
                <div style={{ color: TONE.text, fontSize: 12.5, fontWeight: 600 }}>{beat.objective}</div>
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  color: SPEAKER_COLOUR[beat.speaker] ?? TONE.text,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 0.6,
                  marginBottom: 5,
                }}
              >
                {SPEAKER_NAMES[beat.speaker]}
              </div>
              <p style={{ color: TONE.text, fontSize: 13.5, lineHeight: 1.68, whiteSpace: 'pre-wrap' }}>{beat.text}</p>
            </div>

            {lastOutcome && (
              <div
                style={{
                  padding: 13,
                  borderRadius: 12,
                  marginBottom: 16,
                  background: lastOutcome.unsupported ? 'rgba(251,191,36,.08)' : 'rgba(255,255,255,.045)',
                  border: `1px solid ${lastOutcome.unsupported ? 'rgba(251,191,36,.32)' : 'rgba(255,255,255,.1)'}`,
                }}
              >
                {lastOutcome.unsupported && (
                  <div style={{ color: TONE.warn, fontSize: 10, letterSpacing: 1.2, marginBottom: 5 }}>
                    EVIDENCE CHECK
                  </div>
                )}
                <p style={{ color: TONE.text, fontSize: 12.5, lineHeight: 1.65 }}>{lastOutcome.text}</p>
              </div>
            )}

            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {beat.choices?.length ? (
                beat.choices.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => take(c)}
                    style={{
                      textAlign: 'left',
                      padding: '11px 14px',
                      borderRadius: 12,
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: TONE.text,
                      background: 'rgba(255,255,255,.05)',
                      border: '1px solid rgba(255,255,255,.13)',
                      cursor: 'pointer',
                    }}
                  >
                    {c.label}
                  </button>
                ))
              ) : (
                <button
                  onClick={next}
                  style={{
                    padding: '11px 14px',
                    borderRadius: 12,
                    fontSize: 12.5,
                    fontWeight: 700,
                    color: '#04121a',
                    background: TONE.accent,
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Continue
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* ---------------- case board ---------------- */}
      <div
        style={{
          borderLeft: '1px solid rgba(255,255,255,.09)',
          background: 'rgba(255,255,255,.02)',
          padding: 16,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <Section label="what I know">
          {state.knownFacts.length ? (
            <ul style={{ margin: 0, paddingLeft: 15, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {state.knownFacts.map((f) => (
                <li key={f} style={{ color: TONE.text, fontSize: 11.5, lineHeight: 1.5 }}>
                  {f}
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Nothing yet. You have just arrived.</Empty>
          )}
        </Section>

        <Section label={`evidence · ${state.evidence.length}`}>
          {evidence.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {evidence.map((e) => (
                <div key={e.id}>
                  <div style={{ color: TONE.text, fontSize: 11.5, fontWeight: 600 }}>{e.label}</div>
                  <div style={{ color: TONE.dim, fontSize: 10.5, lineHeight: 1.45 }}>{e.detail}</div>
                </div>
              ))}
            </div>
          ) : (
            <Empty>No artefacts filed.</Empty>
          )}
        </Section>

        <Section label="clearance">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {(Object.keys(AREA_NAMES) as (keyof typeof AREA_NAMES)[]).map((a) => {
              const open = state.unlocked.includes(a);
              return (
                <div
                  key={a}
                  style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, fontFamily: 'ui-monospace, monospace' }}
                >
                  <span style={{ color: open ? TONE.text : TONE.dim }}>{AREA_NAMES[a]}</span>
                  <span style={{ color: open ? TONE.good : TONE.dim }}>{open ? 'OPEN' : 'LOCKED'}</span>
                </div>
              );
            })}
          </div>
        </Section>

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={() => setShowBench(true)} style={ghostBtn}>
            <Wrench size={13} /> Hardware bench
          </button>
          <button onClick={onClose} style={ghostBtn}>
            <LogOut size={13} /> Step away <span style={{ color: TONE.dim }}>(Esc)</span>
          </button>
        </div>
      </div>
    </div>
  );
}

const ghostBtn: React.CSSProperties = {
  padding: '9px 12px',
  borderRadius: 11,
  fontSize: 11.5,
  fontWeight: 600,
  color: TONE.text,
  background: 'rgba(255,255,255,.06)',
  border: '1px solid rgba(255,255,255,.12)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
  cursor: 'pointer',
};

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ color: TONE.dim, fontSize: 9, letterSpacing: 1.3, textTransform: 'uppercase', marginBottom: 7 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => (
  <p style={{ color: TONE.dim, fontSize: 11, lineHeight: 1.5 }}>{children}</p>
);

function CaseClosed({ chapter, onClose }: { chapter: ReturnType<typeof getChapter>; onClose: () => void }) {
  return (
    <div>
      <div style={{ color: TONE.good, fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
        {chapter?.endState ? 'CHAPTER COMPLETE' : 'END OF WRITTEN CONTENT'}
      </div>
      {chapter?.endState && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 16 }}>
          {chapter.endState.map((e) => (
            <div
              key={e.label}
              style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 11.5, fontFamily: 'ui-monospace, monospace' }}
            >
              <span style={{ color: TONE.dim }}>{e.label}</span>
              <span style={{ color: e.value === 'UNKNOWN' || e.value.includes('UNKNOWN') ? TONE.warn : TONE.text }}>
                {e.value}
              </span>
            </div>
          ))}
        </div>
      )}
      <p style={{ color: TONE.dim, fontSize: 12, lineHeight: 1.6 }}>
        Incidents 02 to 06 are specified in the campaign bible and not yet built. The evidence you have gathered
        carries forward into them.
      </p>
      <button onClick={onClose} style={{ ...ghostBtn, marginTop: 16 }}>
        <LogOut size={13} /> Step away
      </button>
    </div>
  );
}
