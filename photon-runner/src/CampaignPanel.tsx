import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Check, Clock, Footprints, Lock, LogOut, Play, Wrench } from 'lucide-react';
import {
  AREA_NAMES,
  CampaignState,
  Choice,
  SPEAKER_NAMES,
  Place,
  advance,
  chapterProgress,
  choose,
  currentBeat,
  getChapter,
  initialCampaign,
} from './campaignStory';
import {
  STAGES,
  StageDef,
  StageProgress,
  formatTime,
  getStage,
  isCompleted,
  isPlayable,
  isUnlocked,
  loadCase,
  loadProgress,
  mergeCase,
  rate,
  recordClear,
  saveCase,
  saveProgress,
} from './campaignStages';
import { elapsedMs, getSession, resetSession, subscribeSession, updateSession } from './campaignSession';
import { HardwareLabPanel } from './HardwareLabPanel';
import { CampaignExerciseView } from './CampaignExerciseView';

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

/** Human names for the places a beat can happen, used in the walk prompt. */
const PLACE_NAMES: Record<Place, string> = {
  workstation: 'Workstation 04',
  rack: 'the training rack on the equipment row',
};

/**
 * Shown when the current task is somewhere else in the building. It names the
 * place rather than drawing a waypoint: the room is small, the rack is
 * visible from the desk, and finding it is part of knowing the floor.
 */
function GoTo({ place }: { place: Place }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 11,
        padding: 14,
        borderRadius: 12,
        marginBottom: 14,
        background: 'rgba(94,200,232,.07)',
        border: '1px dashed rgba(94,200,232,.35)',
      }}
    >
      <Footprints size={18} color={TONE.accent} />
      <div>
        <div style={{ color: TONE.accent, fontSize: 12, fontWeight: 700 }}>
          This one is not desk work.
        </div>
        <div style={{ color: TONE.dim, fontSize: 11.5, lineHeight: 1.5 }}>
          Press Esc to stand up, walk to {PLACE_NAMES[place]}, and press E there.
        </div>
      </div>
    </div>
  );
}

/** Shown back at the desk for work already finished somewhere else. */
function DoneElsewhere({ place }: { place: Place }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '11px 14px',
        borderRadius: 12,
        marginBottom: 14,
        background: 'rgba(74,222,128,.07)',
        border: '1px solid rgba(74,222,128,.28)',
        color: TONE.good,
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      <Check size={14} /> Done at {PLACE_NAMES[place]}.
    </div>
  );
}

/** The equipment row with no stage running — there is nothing to do here. */
function NothingHere({ onClose }: { onClose: () => void }) {
  return (
    <div style={{ padding: 24 }}>
      <div style={{ color: TONE.accent, fontSize: 12, letterSpacing: 1.4, marginBottom: 8 }}>
        TRAINING RACK
      </div>
      <p style={{ color: TONE.dim, fontSize: 12.5, lineHeight: 1.6 }}>
        The bays are as you left them. Hardware tasks are handed out with the
        case — start a stage at Workstation 04 and come back when one needs the
        rack.
      </p>
      <button onClick={onClose} style={{ ...ghostBtn, marginTop: 18 }}>
        <LogOut size={13} /> Step away
      </button>
    </div>
  );
}

const SPEAKER_COLOUR: Record<string, string> = {
  alice: '#ffa94d',
  bob: '#5ec8e8',
  eve: '#c9a7f0',
  system: '#8fa6bd',
  reception: '#8fa6bd',
  workstation: '#4ade80',
  trainee: '#d6e2f0',
};

export function CampaignPanel({ onClose, place = 'workstation' }: { onClose: () => void; place?: Place }) {
  const [progressStore, setProgressStore] = useState<StageProgress>(() => loadProgress());
  const [showBench, setShowBench] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // The run itself lives outside React, so standing up and walking to another
  // station does not destroy it — see campaignSession.ts.
  const session = useSyncExternalStore(subscribeSession, getSession, getSession);
  const active = session.stageId ? getStage(session.stageId) ?? null : null;
  const { state, lastOutcome, result } = session;
  const solved = useMemo(() => new Set(session.solved), [session.solved]);
  const elapsed = elapsedMs(session, now);

  // Live clock while a stage is running. Stops the moment it is cleared, so
  // the reported time is the run, not how long the summary sat on screen.
  useEffect(() => {
    if (!active || result) return;
    const t = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(t);
  }, [active, result]);

  const beat = currentBeat(state);
  const chapter = getChapter(state.chapter);
  const progress = chapterProgress(state);

  const beginStage = (stage: StageDef) => {
    // Seed from the carried case file so an investigation opens with the
    // evidence already earned, rather than an empty board.
    const carried = loadCase();
    updateSession(() => ({
      stageId: stage.id,
      state: {
        ...initialCampaign(),
        chapter: stage.id,
        knownFacts: carried.knownFacts,
        evidence: carried.evidence,
      },
      solved: [],
      startedAt: Date.now(),
      lastOutcome: null,
      result: null,
    }));
    setNow(Date.now());
  };

  const finishStage = () => {
    if (!active) return;
    const ms = Date.now() - session.startedAt;
    const next = recordClear(progressStore, active.id, ms);
    setProgressStore(next);
    saveProgress(next);
    saveCase(mergeCase(loadCase(), { knownFacts: state.knownFacts, evidence: state.evidence }));
    updateSession((s) => ({ ...s, result: { ms, underPar: rate(active.id, ms) === 'under-par' } }));
  };

  // A stage ends when its own chapter completes.
  useEffect(() => {
    if (active && !result && state.complete) finishStage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, active, result]);

  const take = (c: Choice) => {
    updateSession((s) => ({
      ...s,
      lastOutcome: { text: c.outcome, unsupported: !!c.unsupported },
      state: choose(s.state, c.id),
    }));
  };
  const next = () => {
    updateSession((s) => ({ ...s, lastOutcome: null, state: advance(s.state) }));
  };
  const markSolved = (beatId: string) =>
    updateSession((s) => (s.solved.includes(beatId) ? s : { ...s, solved: [...s.solved, beatId] }));

  const evidence = useMemo(() => [...state.evidence].reverse(), [state.evidence]);

  if (showBench) {
    return <HardwareLabPanel onClose={() => setShowBench(false)} />;
  }

  if (!active) {
    // Only Workstation 04 starts a stage. The equipment row is a place you go
    // during one, not a second front door into the campaign.
    if (place !== 'workstation') return <NothingHere onClose={onClose} />;
    return <StageSelect progress={progressStore} onPick={beginStage} onClose={onClose} />;
  }

  // Some beats are physical work and happen away from the desk. In the wrong
  // place the beat still reads — the briefing is what sends the player across
  // the floor — but the task itself only opens where the hardware is.
  const beatPlace: Place = beat?.at ?? 'workstation';
  const here = beatPlace === place;

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
          <span
            style={{
              marginLeft: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontFamily: 'ui-monospace, monospace',
              fontSize: 12,
              // Amber past par, but never a failure — see campaignStages.ts.
              color: elapsed > active.parSeconds * 1000 ? TONE.warn : TONE.dim,
            }}
            title={`Par ${formatTime(active.parSeconds * 1000)}`}
          >
            <Clock size={12} /> {formatTime(result ? result.ms : elapsed)}
            <span style={{ color: TONE.dim, opacity: 0.65 }}>/ {formatTime(active.parSeconds * 1000)}</span>
          </span>
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

        {result ? (
          <StageResult
            stage={active}
            chapter={chapter}
            result={result}
            onStageSelect={resetSession}
            onClose={onClose}
          />
        ) : !beat ? (
          <p style={{ color: TONE.dim, fontSize: 12 }}>Closing the case…</p>
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

            {/* Stays mounted after it is solved: the completed timeline or
                board is the player's own work, and whisking it away the
                instant it is right hides both the confirmation and what
                they just built. */}
            {beat.exercise && here && (
              <CampaignExerciseView key={beat.id} exercise={beat.exercise} onSolved={() => markSolved(beat.id)} />
            )}
            {beat.exercise && !here &&
              (solved.has(beat.id) ? <DoneElsewhere place={beatPlace} /> : <GoTo place={beatPlace} />)}

            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {beat.exercise && !solved.has(beat.id) ? (
                <p style={{ color: TONE.dim, fontSize: 11.5, textAlign: 'center' }}>
                  {here
                    ? 'Complete the task above to continue.'
                    : 'The clock is still running while you walk.'}
                </p>
              ) : beat.choices?.length ? (
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

/** Level select. Stages unlock in order; the rest stay visible but shut,
 * which is the clearance mechanic the campaign bible asks for. */
function StageSelect({
  progress,
  onPick,
  onClose,
}: {
  progress: StageProgress;
  onPick: (s: StageDef) => void;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        background: TONE.bg,
        border: '1px solid rgba(255,255,255,.1)',
        borderRadius: 16,
        height: '100%',
        padding: 22,
        overflowY: 'auto',
      }}
    >
      <div style={{ color: TONE.accent, fontSize: 12, letterSpacing: 1.4 }}>PHANTOM Q CAMPAIGN</div>
      <p style={{ color: TONE.dim, fontSize: 12, lineHeight: 1.6, margin: '6px 0 18px' }}>
        Seven stages. Clear one to unlock the next. The clock runs while a stage is open and is measured
        against a par time — beating par is a bonus, not a requirement.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {STAGES.map((st) => {
          const done = isCompleted(progress, st.id);
          const unlocked = isUnlocked(progress, st.id);
          const playable = isPlayable(progress, st.id);
          const best = progress[st.id]?.bestMs ?? null;
          return (
            <button
              key={st.id}
              onClick={() => playable && onPick(st)}
              disabled={!playable}
              style={{
                textAlign: 'left',
                padding: '13px 15px',
                borderRadius: 13,
                background: playable ? 'rgba(94,200,232,.07)' : 'rgba(255,255,255,.03)',
                border: `1px solid ${playable ? 'rgba(94,200,232,.3)' : 'rgba(255,255,255,.09)'}`,
                cursor: playable ? 'pointer' : 'not-allowed',
                opacity: unlocked ? 1 : 0.55,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 3 }}>
                <span style={{ color: TONE.dim, fontSize: 10, fontFamily: 'ui-monospace, monospace' }}>
                  {String(st.order).padStart(2, '0')}
                </span>
                <span style={{ color: TONE.text, fontSize: 13, fontWeight: 700 }}>{st.title}</span>
                <span style={{ color: TONE.dim, fontSize: 11 }}>{st.subtitle}</span>
                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {done && (
                    <span style={{ color: TONE.good, fontSize: 10.5, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Check size={12} /> {best != null ? formatTime(best) : 'cleared'}
                    </span>
                  )}
                  {!unlocked && <Lock size={12} color={TONE.dim} />}
                  {playable && !done && <Play size={12} color={TONE.accent} />}
                </span>
              </div>
              <div style={{ color: TONE.dim, fontSize: 11.5, lineHeight: 1.5 }}>{st.brief}</div>
              <div style={{ color: TONE.dim, fontSize: 10, marginTop: 5, fontFamily: 'ui-monospace, monospace' }}>
                PAR {formatTime(st.parSeconds * 1000)}
                {!st.built && ' · NOT YET BUILT'}
                {!unlocked && st.built && ' · LOCKED'}
              </div>
              {!st.built && st.sourceNote && (
                <div style={{ color: TONE.dim, fontSize: 10, marginTop: 3, opacity: 0.8 }}>{st.sourceNote}</div>
              )}
            </button>
          );
        })}
      </div>

      <button onClick={onClose} style={{ ...ghostBtn, marginTop: 18 }}>
        <LogOut size={13} /> Step away <span style={{ color: TONE.dim }}>(Esc)</span>
      </button>
    </div>
  );
}

/** End-of-stage summary: the clear time against par, and the case board. */
function StageResult({
  stage,
  chapter,
  result,
  onStageSelect,
  onClose,
}: {
  stage: StageDef;
  chapter: ReturnType<typeof getChapter>;
  result: { ms: number; underPar: boolean };
  onStageSelect: () => void;
  onClose: () => void;
}) {
  const nextUp = STAGES.find((s) => s.order === stage.order + 1);
  return (
    <div>
      <div style={{ color: TONE.good, fontSize: 14, fontWeight: 700, marginBottom: 4 }}>STAGE CLEARED</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
        <span style={{ color: TONE.text, fontSize: 22, fontFamily: 'ui-monospace, monospace' }}>
          {formatTime(result.ms)}
        </span>
        <span style={{ color: result.underPar ? TONE.good : TONE.dim, fontSize: 11.5 }}>
          {result.underPar ? `under par (${formatTime(stage.parSeconds * 1000)})` : `par ${formatTime(stage.parSeconds * 1000)}`}
        </span>
      </div>

      {chapter?.endState && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 16 }}>
          {chapter.endState.map((e) => (
            <div
              key={e.label}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                fontSize: 11.5,
                fontFamily: 'ui-monospace, monospace',
              }}
            >
              <span style={{ color: TONE.dim }}>{e.label}</span>
              <span style={{ color: e.value.includes('UNKNOWN') ? TONE.warn : TONE.text }}>{e.value}</span>
            </div>
          ))}
        </div>
      )}

      <p style={{ color: TONE.dim, fontSize: 12, lineHeight: 1.6 }}>
        {nextUp
          ? nextUp.built
            ? `${nextUp.title} — ${nextUp.subtitle} — is now unlocked.`
            : `${nextUp.title} — ${nextUp.subtitle} — is specified in the campaign bible but not yet built.`
          : 'That is every stage currently written.'}
      </p>

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button onClick={onStageSelect} style={{ ...ghostBtn, flex: 1 }}>
          Stage select
        </button>
        <button onClick={onClose} style={{ ...ghostBtn, flex: 1 }}>
          <LogOut size={13} /> Step away
        </button>
      </div>
    </div>
  );
}
