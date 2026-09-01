import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DoorOpen } from 'lucide-react';
import { GameEngine } from './GameEngine';
import { createCampusWorld } from './sceneCampus';
import { createKeyboardMovementInput } from './keyboardMovement';
import { Joystick } from './Joystick';
import { PerfOverlay } from './PerfOverlay';

/** The exterior campus hub — walk up to a building's door to enter one of
 * the existing scenes (Quantum Lab, Security, Research Lab, Server Room). */
export function CampusScreen({ onEnterBuilding }: { onEnterBuilding: (sceneId: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<ReturnType<typeof createCampusWorld> | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const [prompt, setPrompt] = useState<string | null>(null);
  const getStats = useCallback(() => engineRef.current?.getStats() ?? null, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new GameEngine();
    engineRef.current = engine;
    if (!engine.mount(canvas)) {
      setUnsupported(true);
      return;
    }
    const game = createCampusWorld({ onEnterBuilding, onPromptChange: setPrompt });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    <div className="relative w-full h-full overflow-hidden">
      <canvas ref={canvasRef} className="w-full h-full block touch-none" />

      <PerfOverlay getStats={getStats} />

      <div className="absolute top-3 left-3 pointer-events-none">
        <div className="glass rounded-2xl px-3.5 py-2.5">
          <div className="label-mono">Research Campus</div>
          <div className="text-xs ink-2 mt-0.5">Walk up to a building to go inside.</div>
        </div>
      </div>

      {prompt && (
        <div className="absolute bottom-32 left-1/2 -translate-x-1/2 a-pop pointer-events-none">
          <div className="glass rounded-full px-4 py-2 flex items-center gap-2">
            <kbd
              className="px-1.5 py-0.5 rounded text-[10px] font-mono ink-1"
              style={{ background: 'rgb(var(--glass-tint)/.2)' }}
            >
              E
            </kbd>
            <span className="text-xs ink-1">{prompt}</span>
          </div>
        </div>
      )}

      <div className="absolute bottom-6 left-6 pointer-events-auto">
        <Joystick onChange={(x, z) => gameRef.current?.setMoveVector(x, z)} />
      </div>

      <button
        onPointerDown={() => gameRef.current?.interact()}
        aria-label="Interact"
        className="btn btn-primary w-16 h-16 rounded-full text-xs absolute bottom-8 right-6 pointer-events-auto"
      >
        <DoorOpen size={18} />
      </button>
    </div>
  );
}
