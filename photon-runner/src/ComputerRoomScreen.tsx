import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GameEngine } from './GameEngine';
import { createComputerRoom, FacilityGame, StationKind } from './sceneComputerRoom';
import { createKeyboardMovementInput } from './keyboardMovement';
import { Joystick } from './Joystick';
import { PerfOverlay } from './PerfOverlay';
import { QkdConsole } from './QkdConsole';
import { ForensicsPanel } from './ForensicsPanel';
import { HardwareLabPanel } from './HardwareLabPanel';
import { AttackState } from './qkdAttack';
import { Tier, TIER_INFO, getTier, setTier } from './sceneQuality';

/**
 * The QKD facility screen. Three rooms, three stations, one loop:
 *
 *   Eve's closet  -> run the attack
 *   Bob's room    -> read the forensics and name the eavesdropper
 *   Alice's room  -> fix the hardware the attacks exploit
 *
 * The scene owns the seated state (camera and character pose); this screen
 * mirrors it into React only to decide which terminal to mount. The attack
 * session is held here rather than in the console, because Bob's station has
 * to be able to analyse the exchange Eve ran in a different room.
 */
export function ComputerRoomScreen() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<FacilityGame | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [station, setStation] = useState<StationKind | null>(null);
  const [session, setSession] = useState<AttackState | null>(null);
  const [tier, setTierState] = useState<Tier>(() => getTier());
  const getStats = useCallback(() => engineRef.current?.getStats() ?? null, []);

  // Remounting on tier change is deliberate: texture resolution, shadow map
  // size and mesh density are all baked at scene build time, so a live
  // switch would only change the render scale and leave everything else.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new GameEngine();
    engineRef.current = engine;
    if (!engine.mount(canvas)) {
      setUnsupported(true);
      return;
    }

    const game = createComputerRoom({
      onSit: (kind) => setStation(kind),
      onStand: () => setStation(null),
      onPromptChange: setPrompt,
    });
    gameRef.current = game;
    engine.setGame(game);

    const keyboard = createKeyboardMovementInput();
    keyboard.attach(canvas, {
      onMove: (x, z, sprint) => game.setMoveVector(x, z, sprint),
      onInteract: () => game.interact(),
    });

    return () => {
      keyboard.detach();
      engine.dispose();
      gameRef.current = null;
      engineRef.current = null;
    };
  }, [tier]);

  const standUp = useCallback(() => {
    gameRef.current?.standUp();
  }, []);

  // Escape stands up from any station, not just the console.
  useEffect(() => {
    if (!station) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') standUp();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [station, standUp]);

  if (unsupported) {
    return (
      <div className="h-full grid place-items-center px-6">
        <div className="glass rounded-3xl p-8 max-w-sm text-center">
          <p className="text-sm ink-2">WebGL isn't available on this device or browser.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      <canvas ref={canvasRef} className="block h-full w-full" />

      {!station && (
        <>
          <div className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-none">
            <div className="glass rounded-2xl px-4 py-2 text-center">
              <div className="label-mono !text-[9px]">qkd facility</div>
              <p className="text-[11px] ink-3 mt-0.5">
                WASD to walk · <span className="ink-1 font-semibold">E</span> to sit — Alice west, Bob east, Eve south
              </p>
            </div>
          </div>

          {/* Graphics tier lives here because the lobby that used to own it
              is gone, and there is otherwise no way to reach 4K at all. */}
          <div className="absolute top-4 right-4 flex gap-1.5">
            {(Object.keys(TIER_INFO) as Tier[]).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTier(t);
                  setTierState(t);
                }}
                title={TIER_INFO[t].blurb}
                className="px-2.5 py-1.5 rounded-lg text-[10px] font-semibold"
                style={{
                  background: t === tier ? 'var(--accent)' : 'rgba(10,14,20,.7)',
                  color: t === tier ? '#04121a' : '#cfe0ee',
                  border: '1px solid rgba(255,255,255,.14)',
                }}
              >
                {TIER_INFO[t].label}
              </button>
            ))}
          </div>

          {prompt && (
            <div className="absolute bottom-24 left-1/2 -translate-x-1/2 pointer-events-none">
              <div
                className="rounded-2xl px-4 py-2 flex items-center gap-2"
                style={{ background: 'rgba(10,14,20,.82)', border: '1px solid rgba(255,255,255,.14)' }}
              >
                <span
                  className="grid place-items-center w-5 h-5 rounded-md text-[10px] font-bold"
                  style={{ background: 'var(--accent)', color: '#04121a' }}
                >
                  E
                </span>
                <span className="text-xs" style={{ color: '#e6eef7' }}>
                  {prompt}
                </span>
              </div>
            </div>
          )}

          <div className="absolute bottom-6 left-6 sm:hidden">
            <Joystick onChange={(x, z) => gameRef.current?.setMoveVector(x, z)} />
          </div>
        </>
      )}

      {station && (
        <div
          className="absolute inset-0 flex items-center justify-center p-4 sm:p-8"
          style={{ background: 'rgba(4,7,11,.74)', backdropFilter: 'blur(2px)' }}
        >
          <div
            className={station === 'attack' ? 'w-full max-w-5xl' : 'w-full max-w-2xl'}
            style={{ height: 'min(86%, 660px)' }}
          >
            {station === 'attack' && <QkdConsole onClose={standUp} embedded onSessionChange={setSession} />}
            {station === 'forensics' && <ForensicsPanel session={session} onClose={standUp} />}
            {station === 'hardware' && <HardwareLabPanel onClose={standUp} />}
          </div>
        </div>
      )}

      <PerfOverlay getStats={getStats} />
    </div>
  );
}
