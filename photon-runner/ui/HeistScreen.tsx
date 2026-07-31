import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bell,
  Check,
  Crosshair,
  Eye,
  Ghost,
  KeyRound,
  Radio,
  Siren,
  Skull,
  Timer,
  Trophy,
  Users,
  Zap,
} from 'lucide-react';
import { GameEngine } from '../engine/GameEngine';
import { createKeyboardMovementInput } from '../engine/inputSchemes/keyboardMovement';
import { createQuantumHeist, HeistGame, HeistUiState } from '../games/quantum-heist/index';
import { CRISIS_INFO, CrisisKind } from '../games/quantum-heist/logic';
import { getMap } from '../games/lab/maps';
import { Joystick } from './Joystick';
import { Minimap } from './Minimap';
import { Terminal } from './Terminal';
import { TutorialPanel } from './HeistLobby';
import { ThemeMode } from './theme';

const CREW_COLOR = '#7ea87a';
const EVE_COLOR = '#fb7185';

export function HeistScreen({
  onExit,
  theme,
  mapId,
  tutorial,
}: {
  onExit: () => void;
  theme: ThemeMode;
  mapId: string;
  tutorial: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<HeistGame | null>(null);
  const [ui, setUi] = useState<HeistUiState | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const [showComms, setShowComms] = useState(false);
  const [showSabotage, setShowSabotage] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new GameEngine();
    if (!engine.mount(canvas)) {
      setUnsupported(true);
      return;
    }
    const game = createQuantumHeist({ mapId, tutorial });
    gameRef.current = game;
    engine.setGame(game);
    const unsub = game.subscribe(setUi);

    const keyboard = createKeyboardMovementInput();
    keyboard.attach(canvas, {
      onMove: (x, z) => game.setMoveVector(x, z),
      onInteract: () => game.interact(),
    });

    return () => {
      unsub();
      keyboard.detach();
      engine.dispose();
      gameRef.current = null;
    };
    // Remounting on map/tutorial change is intentional — it rebuilds the scene.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapId, tutorial]);

  // Theme currently only affects the DOM HUD; the world keeps its own palette.
  void theme;

  const isEve = ui?.you.role === 'eve';
  const accent = isEve ? EVE_COLOR : CREW_COLOR;

  if (unsupported) {
    return (
      <div className="h-full grid place-items-center px-6">
        <div className="glass rounded-3xl p-8 max-w-sm text-center">
          <p className="text-sm ink-2 mb-4">WebGL isn't available on this device or browser.</p>
          <button onClick={onExit} className="btn btn-ghost px-5 py-2.5 text-sm">
            Back
          </button>
        </div>
      </div>
    );
  }

  const term = ui?.activeTerminal;

  return (
    <div className="relative w-full h-full overflow-hidden">
      <canvas ref={canvasRef} className="w-full h-full block touch-none" />

      {/* Blackout dims the world without hiding the HUD. */}
      {ui?.blackout && <div className="absolute inset-0 bg-black/78 pointer-events-none" />}

      {ui && (
        <>
          {/* ------------------------------ top bar ------------------------------ */}
          <div className="absolute top-3 left-3 right-3 flex items-start justify-between gap-3 pointer-events-none">
            <div className="glass rounded-2xl px-3.5 py-2.5 pointer-events-auto flex items-center gap-2.5">
              <span style={{ color: accent }}>
                {!ui.you.alive ? <Ghost size={18} /> : isEve ? <Eye size={18} /> : <Users size={18} />}
              </span>
              <div>
                <div className="text-xs font-semibold" style={{ color: accent }}>
                  {!ui.you.alive ? 'Compromised' : isEve ? 'Eavesdropper' : 'Crew'}
                </div>
                <div className="label-mono !tracking-[.1em]">{ui.you.codename}</div>
              </div>
            </div>

            <div className="glass rounded-2xl px-3.5 py-2.5 pointer-events-auto min-w-[160px]">
              <div className="flex justify-between items-center mb-1.5">
                <span className="label-mono flex items-center gap-1">
                  <KeyRound size={10} /> Key
                </span>
                <span className="text-xs font-bold" style={{ color: 'var(--accent)' }}>
                  {Math.round(ui.keyProgress * 100)}%
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgb(var(--glass-tint)/.14)' }}>
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{
                    width: `${ui.keyProgress * 100}%`,
                    background: 'linear-gradient(90deg, var(--accent), var(--accent-2))',
                  }}
                />
              </div>
              {ui.channelNoise > 0.05 && (
                <div className="mt-1.5 flex items-center gap-1 text-[10px]" style={{ color: 'var(--danger)' }}>
                  <Activity size={9} /> channel noise {Math.round(ui.channelNoise * 100)}%
                </div>
              )}
            </div>

            <div className="glass rounded-2xl px-3 py-2.5 pointer-events-auto">
              <div className="label-mono mb-1.5">Operatives</div>
              <div className="flex gap-1.5">
                {ui.operatives.map((o) => (
                  <span
                    key={o.codename}
                    title={`${o.codename}${o.alive ? '' : ' — compromised'}`}
                    className="w-2.5 h-2.5 rounded-full"
                    style={{
                      background: o.alive ? (o.isYou ? accent : 'var(--ink-3)') : 'transparent',
                      border: o.alive ? 'none' : '1.5px solid var(--danger)',
                    }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* ------------------------------ crisis banner ------------------------------ */}
          {ui.crisis && (
            <div className="absolute top-20 left-1/2 -translate-x-1/2 a-pop pointer-events-none z-10">
              <div
                className="glass glass-strong rounded-2xl px-4 py-3 flex items-center gap-3 border"
                style={{ borderColor: 'color-mix(in oklab, var(--danger) 55%, transparent)' }}
              >
                <span
                  className="a-ring grid place-items-center w-9 h-9 rounded-xl"
                  style={{
                    background: 'color-mix(in oklab, var(--danger) 18%, transparent)',
                    color: 'var(--danger)',
                    ['--glow' as string]: 'var(--danger)',
                  }}
                >
                  <Siren size={18} />
                </span>
                <div>
                  <div className="text-xs font-bold" style={{ color: 'var(--danger)' }}>
                    {ui.crisis.label}
                    {ui.crisis.secondsLeft > 0 && ` · ${ui.crisis.secondsLeft}s`}
                  </div>
                  <div className="text-[11px] ink-2 max-w-xs">{ui.crisis.blurb}</div>
                  <div className="label-mono !text-[9px] mt-0.5">
                    {ui.crisis.held}/{ui.crisis.required} consoles held
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ------------------------------ task list ------------------------------ */}
          {ui.phase === 'play' && (
            <div className="absolute top-24 left-3 w-56 glass rounded-2xl p-3 hidden lg:block pointer-events-none">
              <div className="label-mono mb-2">Consoles</div>
              <ul className="space-y-1.5">
                {ui.tasks.map((t) => (
                  <li key={t.id} className="flex items-start gap-2 text-[11px]">
                    <span className="mt-0.5 shrink-0" style={{ color: t.done ? 'var(--ok)' : 'var(--ink-4)' }}>
                      {t.done ? <Check size={11} /> : <Crosshair size={11} />}
                    </span>
                    <span className={t.done ? 'ink-4 line-through' : 'ink-2'}>
                      {t.label}
                      <span className="ink-4"> · {t.room}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ------------------------------ minimap ------------------------------ */}
          {ui.phase === 'play' && (
            <div className="absolute top-24 right-3 pointer-events-none">
              <Minimap
                map={getMap(ui.mapId)}
                blips={ui.blips.map((b) => ({
                  id: b.id,
                  x: b.x,
                  z: b.z,
                  color:
                    b.kind === 'body'
                      ? EVE_COLOR
                      : b.kind === 'mentor'
                        ? '#f2c078'
                        : b.isYou
                          ? accent
                          : '#9a8f7d',
                  isYou: b.isYou,
                }))}
                objectives={ui.objectives}
              />
            </div>
          )}

          {ui.phase === 'play' && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-none">
              <span className="label-mono">
                {ui.mapName} · {ui.currentRoom}
              </span>
            </div>
          )}

          {ui.toast && (
            <div className="absolute top-40 left-1/2 -translate-x-1/2 a-pop glass rounded-2xl px-4 py-2.5 max-w-md pointer-events-none z-10">
              <p className="text-xs ink-1 leading-relaxed text-center">{ui.toast}</p>
            </div>
          )}

          {ui.prompt && !term && (
            <div className="absolute bottom-32 left-1/2 -translate-x-1/2 a-pop pointer-events-none">
              <div className="glass rounded-full px-4 py-2 flex items-center gap-2">
                <kbd
                  className="px-1.5 py-0.5 rounded text-[10px] font-mono ink-1"
                  style={{ background: 'rgb(var(--glass-tint)/.2)' }}
                >
                  E
                </kbd>
                <span className="text-xs ink-1">{ui.prompt.label}</span>
              </div>
            </div>
          )}

          {/* ------------------------------ controls ------------------------------ */}
          {ui.phase === 'play' && !term && (
            <>
              <div className="absolute bottom-6 left-6 pointer-events-auto">
                <Joystick onChange={(x, z) => gameRef.current?.setMoveVector(x, z)} />
              </div>

              <div className="absolute bottom-8 right-6 flex flex-col items-end gap-2 pointer-events-auto">
                <button
                  onClick={() => setShowComms(true)}
                  aria-label="Comms"
                  className="btn btn-ghost w-11 h-11 rounded-full"
                >
                  <Radio size={15} />
                </button>

                {isEve && ui.you.alive && (
                  <>
                    <button
                      onClick={() => setShowSabotage(true)}
                      disabled={!ui.canSabotage}
                      aria-label="Sabotage"
                      className="btn btn-ghost w-11 h-11 rounded-full disabled:opacity-40"
                      style={{ ['--glow' as string]: EVE_COLOR }}
                    >
                      <Zap size={15} />
                    </button>

                    <button
                      onClick={() => gameRef.current?.kill()}
                      disabled={!ui.canKillNow}
                      className="btn btn-primary w-16 h-16 rounded-full text-[11px] disabled:opacity-45"
                      style={{ ['--glow' as string]: EVE_COLOR }}
                    >
                      {ui.killCooldown > 0 ? Math.ceil(ui.killCooldown) : 'Burn'}
                    </button>
                  </>
                )}

                <button
                  onPointerDown={() => gameRef.current?.interact()}
                  className="btn btn-primary w-16 h-16 rounded-full text-xs"
                  style={{ ['--glow' as string]: accent }}
                >
                  Use
                </button>
              </div>
            </>
          )}

          {/* ------------------------------ modals ------------------------------ */}
          {term && (
            <Terminal
              terminal={term}
              comms={ui.comms}
              yourCodename={ui.you.codename}
              onComplete={() => gameRef.current?.completeTerminal(term.stationId)}
              onClose={() => gameRef.current?.closeTerminal()}
              onSend={(t) => gameRef.current?.sendComms(t)}
            />
          )}

          {showComms && !term && (
            <Terminal
              terminal={{
                stationId: 'comms',
                kind: 'comms',
                label: 'Comms relay',
                hint: 'Everything you send is public.',
              }}
              comms={ui.comms}
              yourCodename={ui.you.codename}
              onComplete={() => setShowComms(false)}
              onClose={() => setShowComms(false)}
              onSend={(t) => gameRef.current?.sendComms(t)}
            />
          )}

          {showSabotage && (
            <SabotageMenu
              onPick={(k) => {
                gameRef.current?.sabotage(k);
                setShowSabotage(false);
              }}
              onClose={() => setShowSabotage(false)}
            />
          )}

          {ui.tutorial && (
            <TutorialPanel
              view={ui.tutorial}
              onNext={() => gameRef.current?.nextTutorialStep()}
              onSkip={() => gameRef.current?.skipTutorial()}
            />
          )}

          {ui.phase === 'briefing' && (
            <BriefingOverlay ui={ui} onStart={() => gameRef.current?.start()} onExit={onExit} />
          )}

          {ui.phase === 'meeting' && ui.meeting && (
            <MeetingOverlay ui={ui} onVote={(id) => gameRef.current?.vote(id)} />
          )}

          {ui.phase === 'ended' && ui.outcome && (
            <ResultsOverlay ui={ui} onRestart={() => gameRef.current?.restart()} onExit={onExit} />
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- overlays

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-20 bg-black/76 backdrop-blur-lg grid place-items-center px-4 py-6 overflow-y-auto">
      <div className="a-pop glass glass-strong rounded-3xl p-6 md:p-8 w-full max-w-lg my-auto">{children}</div>
    </div>
  );
}

function SabotageMenu({ onPick, onClose }: { onPick: (k: CrisisKind) => void; onClose: () => void }) {
  const kinds: CrisisKind[] = ['decoherence', 'blackout', 'keypurge'];
  return (
    <Shell>
      <div className="flex items-center gap-2.5 mb-1">
        <span style={{ color: EVE_COLOR }}>
          <Zap size={18} />
        </span>
        <h2 className="h-section text-xl ink-1">Sabotage the channel</h2>
      </div>
      <p className="text-xs ink-3 mb-5">
        Force the crew to drop what they're doing and run. Nobody can call a meeting while a crisis
        is live.
      </p>
      <div className="space-y-2">
        {kinds.map((k) => (
          <button
            key={k}
            onClick={() => onPick(k)}
            style={{ ['--glow' as string]: EVE_COLOR }}
            className="card glass w-full rounded-2xl p-4 text-left"
          >
            <div className="text-sm font-semibold ink-1">{CRISIS_INFO[k].label}</div>
            <div className="text-[11px] ink-3 mt-1">{CRISIS_INFO[k].blurb}</div>
            <div className="text-[10px] mt-1.5 flex items-center gap-1" style={{ color: 'var(--danger)' }}>
              <AlertTriangle size={10} />
              {CRISIS_INFO[k].seconds > 0
                ? `${CRISIS_INFO[k].seconds}s to fix · ${CRISIS_INFO[k].consoles} console(s)`
                : 'No timer — blinds everyone until repaired'}
            </div>
          </button>
        ))}
      </div>
      <button onClick={onClose} className="btn btn-ghost w-full mt-3 py-2.5 text-xs">
        Not yet
      </button>
    </Shell>
  );
}

function BriefingOverlay({
  ui,
  onStart,
  onExit,
}: {
  ui: HeistUiState;
  onStart: () => void;
  onExit: () => void;
}) {
  const isEve = ui.you.role === 'eve';
  return (
    <Shell>
      <div className="text-center mb-5">
        <div
          className="a-float inline-grid place-items-center w-16 h-16 rounded-2xl mb-3"
          style={{
            background: `color-mix(in oklab, ${isEve ? EVE_COLOR : CREW_COLOR} 18%, transparent)`,
            color: isEve ? EVE_COLOR : CREW_COLOR,
          }}
        >
          {isEve ? <Eye size={30} /> : <Users size={30} />}
        </div>
        <div className="label-mono mb-1">You are</div>
        <h2 className="h-section text-2xl" style={{ color: isEve ? EVE_COLOR : CREW_COLOR }}>
          {isEve ? 'The Eavesdropper' : 'Crew'}
        </h2>
        <p className="text-xs ink-3 mt-1">Known publicly as {ui.you.codename}</p>
      </div>

      <div className="rounded-2xl panel p-4 mb-5 space-y-2 text-[11px] ink-2 leading-relaxed">
        {isEve ? (
          <>
            <p>
              <strong className="ink-1">Blend in.</strong> Work consoles like everyone else. When you
              catch someone alone, burn their key share — they drop a corrupted node where they fell.
            </p>
            <p>
              Sabotage the channel to scatter them, and use the vents to be somewhere you shouldn't.
              You win when you equal the remaining crew, or a crisis runs out unfixed.
            </p>
          </>
        ) : (
          <>
            <p>
              <strong className="ink-1">Finish the key.</strong> Six operatives, and one is quietly
              burning key shares. Clear consoles to push the exchange to 100% and you win the shift.
            </p>
            <p>
              Find a corrupted node, or hit the alarm, and everyone comes in to argue. Eject the
              eavesdropper and it's over — eject a colleague and you've handed her the numbers.
            </p>
          </>
        )}
        <p className="ink-4">WASD / arrows or the joystick · E to use, report, or call a meeting.</p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={onStart}
          className="btn btn-primary flex-1 py-3 text-sm"
          style={{ ['--glow' as string]: isEve ? EVE_COLOR : CREW_COLOR }}
        >
          Begin the shift
        </button>
        <button onClick={onExit} className="btn btn-ghost px-5 py-3 text-sm">
          Leave
        </button>
      </div>
    </Shell>
  );
}

function MeetingOverlay({ ui, onVote }: { ui: HeistUiState; onVote: (id: string) => void }) {
  const m = ui.meeting!;
  const tally: Record<string, number> = {};
  for (const v of Object.values(m.votes)) tally[v] = (tally[v] ?? 0) + 1;

  if (m.result) {
    const { ejected, wasEve } = m.result;
    return (
      <Shell>
        <div className="text-center">
          <div
            className="a-pop inline-grid place-items-center w-16 h-16 rounded-2xl mb-3"
            style={{
              background: `color-mix(in oklab, ${wasEve ? 'var(--ok)' : 'var(--danger)'} 16%, transparent)`,
              color: wasEve ? 'var(--ok)' : 'var(--danger)',
            }}
          >
            {ejected ? <Skull size={30} /> : <Users size={30} />}
          </div>
          <h2 className="h-section text-xl ink-1 mb-2">
            {ejected ? `${ejected} was ejected` : 'Nobody was ejected'}
          </h2>
          <p className="text-sm ink-2">
            {!ejected
              ? 'The vote was split. Everyone goes back to work.'
              : wasEve
                ? 'They were the eavesdropper. The channel is clean.'
                : 'They were not the eavesdropper.'}
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="text-center mb-5">
        <div
          className="a-float inline-grid place-items-center w-16 h-16 rounded-2xl mb-3"
          style={{ background: 'color-mix(in oklab, var(--danger) 16%, transparent)', color: 'var(--danger)' }}
        >
          <Bell size={30} />
        </div>
        <h2 className="h-section text-2xl ink-1">Emergency Meeting</h2>
        <p className="text-xs ink-3 mt-1.5">{m.reason}</p>
        <div className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold" style={{ color: 'var(--warn)' }}>
          <Timer size={14} /> {m.secondsLeft}s
        </div>
      </div>

      {ui.comms.length > 0 && (
        <div className="mb-4">
          <div className="label-mono mb-1.5">Channel traffic</div>
          <div className="rounded-xl panel p-2.5 max-h-24 overflow-y-auto space-y-1">
            {ui.comms.slice(-5).map((c, i) => (
              <div key={i} className="text-[10px] ink-3">
                <span className="ink-2 font-semibold">{c.from}</span>
                {c.isYou && <span className="ink-4"> (you)</span>}: {c.text}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <div className="label-mono">{ui.you.alive ? 'Cast your vote' : 'Ghosts cannot vote'}</div>
        {m.candidates.map((c) => (
          <button
            key={c.codename}
            onClick={() => onVote(c.codename)}
            disabled={!!m.yourVote || !ui.you.alive || c.isYou}
            style={{ ['--glow' as string]: EVE_COLOR }}
            className="card glass w-full rounded-xl px-4 py-3 text-left disabled:opacity-45 flex items-center justify-between"
          >
            <span className="text-sm font-semibold ink-1">
              {c.codename}
              {c.isYou && <span className="ink-4 font-normal"> (you)</span>}
            </span>
            {tally[c.codename] > 0 && (
              <span className="text-[11px] ink-3">
                {tally[c.codename]} vote{tally[c.codename] > 1 ? 's' : ''}
              </span>
            )}
          </button>
        ))}

        <button
          onClick={() => onVote('skip')}
          disabled={!!m.yourVote || !ui.you.alive}
          className="btn btn-ghost w-full py-3 text-xs disabled:opacity-45 flex items-center justify-between px-4"
        >
          <span>Skip vote</span>
          {tally.skip > 0 && <span className="ink-3">{tally.skip}</span>}
        </button>
      </div>

      {m.yourVote && <p className="text-[11px] ink-4 mt-3 text-center">Vote locked: {m.yourVote}. Waiting…</p>}
    </Shell>
  );
}

const REASON_COPY: Record<string, string> = {
  'key-established': 'The crew finished the key exchange before she could stop them.',
  'eve-ejected': 'The crew found the eavesdropper and cut her out.',
  outnumbered: 'She burned enough key shares to control what is left of the channel.',
  'crisis-expired': 'The channel collapsed while nobody was fixing it.',
  'crew-eliminated': 'Every crew key share was burned.',
};

function ResultsOverlay({
  ui,
  onRestart,
  onExit,
}: {
  ui: HeistUiState;
  onRestart: () => void;
  onExit: () => void;
}) {
  const o = ui.outcome!;
  const won = o.youWon;
  return (
    <Shell>
      <div className="text-center mb-5">
        <div
          className="a-pop inline-grid place-items-center w-20 h-20 rounded-3xl mb-3"
          style={{
            background: `color-mix(in oklab, ${won ? 'var(--ok)' : 'var(--danger)'} 16%, transparent)`,
            color: won ? 'var(--ok)' : 'var(--danger)',
          }}
        >
          {won ? <Trophy size={38} /> : <Skull size={38} />}
        </div>
        <h2 className="h-display text-4xl" style={{ color: won ? 'var(--ok)' : 'var(--danger)' }}>
          {won ? 'You win' : 'You lose'}
        </h2>
        <p className="text-sm ink-2 mt-2">{REASON_COPY[o.reason] ?? ''}</p>
        <p className="text-xs ink-4 mt-1">
          The eavesdropper was <strong style={{ color: EVE_COLOR }}>{o.eveId}</strong>
          {o.eveId === ui.you.codename && ' — that was you.'}
        </p>
      </div>

      <div className="rounded-2xl panel p-4 mb-5 grid grid-cols-2 gap-3 text-center">
        <div>
          <div className="label-mono mb-1">Key reached</div>
          <div className="h-section text-2xl ink-1">{Math.round(ui.keyProgress * 100)}%</div>
        </div>
        <div>
          <div className="label-mono mb-1">Still standing</div>
          <div className="h-section text-2xl ink-1">
            {ui.operatives.filter((x) => x.alive).length}/{ui.operatives.length}
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={onRestart} className="btn btn-primary flex-1 py-3 text-sm">
          Play again
        </button>
        <button onClick={onExit} className="btn btn-ghost px-5 py-3 text-sm">
          Leave
        </button>
      </div>
    </Shell>
  );
}
