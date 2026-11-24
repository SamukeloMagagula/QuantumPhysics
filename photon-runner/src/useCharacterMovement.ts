import { useCallback, useEffect, useRef, useState } from 'react';
import type { CharacterFacing } from './WorldCharacter';
import { play } from './sound';
import { moveCharacter, routeTo, type Point, type WorldZone } from './worldLayout';

const MOVE_KEYS = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'];

export interface MovementHandlers {
  /** E pressed while standing still. Return true if something used it. */
  onInteract: () => boolean;
  /** Escape not already handled by a panel. Return true if something used it. */
  onEscape: () => boolean;
  /** The player steered by hand this frame. */
  onManualMove: () => void;
}

/**
 * The player's own character: WASD / arrows / joystick steering, guided walks
 * along routes, collision through `moveCharacter`, and footstep sounds. The
 * loop only runs while the map is the active screen.
 */
export function useCharacterMovement(active: boolean, start: Point, handlers: MovementHandlers) {
  const [position, setPosition] = useState(start);
  const positionRef = useRef(position);
  const [facing, setFacing] = useState<CharacterFacing>('south');
  const [moving, setMoving] = useState(false);
  const [target, setTarget] = useState<WorldZone | null>(null);
  const route = useRef<Point[]>([]);
  const joystick = useRef({ x: 0, y: 0 });
  const on = useRef(handlers);
  on.current = handlers;

  const walkTo = useCallback((zone: WorldZone) => {
    route.current = routeTo(positionRef.current, zone);
    setTarget(zone);
  }, []);
  const stopWalking = useCallback(() => {
    route.current = [];
    setTarget(null);
  }, []);
  const placeAt = useCallback((p: Point, face?: CharacterFacing) => {
    route.current = [];
    setTarget(null);
    positionRef.current = p;
    setPosition(p);
    if (face) setFacing(face);
  }, []);

  useEffect(() => {
    if (!active) {
      joystick.current = { x: 0, y: 0 };
      setMoving(false);
      return;
    }
    const keys = new Set<string>();
    const down = (e: KeyboardEvent) => {
      // An Escape that just closed an activity panel arrives here already handled.
      if (e.key === 'Escape' && !e.defaultPrevented && on.current.onEscape()) {
        e.preventDefault();
        return;
      }
      if ((e.target as HTMLElement)?.closest('input,textarea,select,button,[contenteditable="true"]')) return;
      const key = e.key.toLowerCase();
      if (key === 'e' && !route.current.length && on.current.onInteract()) e.preventDefault();
      if (MOVE_KEYS.includes(key)) {
        keys.add(key);
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    const blur = () => {
      keys.clear();
      joystick.current = { x: 0, y: 0 };
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);

    let frame = 0;
    let last = performance.now();
    let stride = 0;
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.04);
      last = now;
      const p = positionRef.current;
      const held = (a: string, b: string) => Number(keys.has(a) || keys.has(b));
      const dx = joystick.current.x + held('d', 'arrowright') - held('a', 'arrowleft');
      const dy = joystick.current.y + held('s', 'arrowdown') - held('w', 'arrowup');
      const manual = Math.hypot(dx, dy) > 0.1;
      if (manual) {
        route.current = [];
        setTarget(null);
        on.current.onManualMove();
      }
      const next = route.current[0];
      const speed = (keys.has('shift') ? 260 : 160) * dt;
      let movement = { x: 0, y: 0 };
      if (!manual && next) {
        const distance = Math.hypot(next.x - p.x, next.y - p.y);
        const amount = Math.min(speed, distance);
        if (distance > 0.001) movement = { x: ((next.x - p.x) / distance) * amount, y: ((next.y - p.y) / distance) * amount };
      } else {
        const length = Math.max(1, Math.hypot(dx, dy));
        movement = { x: (dx / length) * speed, y: (dy / length) * speed };
      }
      const moved = moveCharacter(p, movement, manual);
      const travelled = Math.hypot(moved.x - p.x, moved.y - p.y);
      // A footstep every stride, a little brisker when running.
      stride += travelled;
      if (stride > (keys.has('shift') ? 30 : 24)) {
        stride = 0;
        play('step');
      }
      setMoving(travelled > 0.001);
      if (travelled > 0.001) {
        const sideways = Math.abs(moved.x - p.x) > Math.abs(moved.y - p.y);
        setFacing(sideways ? (moved.x > p.x ? 'east' : 'west') : moved.y > p.y ? 'south' : 'north');
        positionRef.current = moved;
        setPosition(moved);
      }
      if (!manual && next && Math.hypot(next.x - moved.x, next.y - moved.y) < 0.01) {
        route.current.shift();
        if (!route.current.length) setTarget(null);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [active]);

  return { position, positionRef, facing, setFacing, moving, target, route, joystick, walkTo, stopWalking, placeAt };
}
