import { useCallback, useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { canStandAt, isNearStation, SPAWN, type Point2 } from './cryptoLabLayout';

const MOVE_KEYS = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'];
const SPEED = 2.4; // metres/second
const RUN_SPEED = 4;

export type PilotFacing = 'north' | 'south' | 'east' | 'west';

/** WASD/arrow movement + wall/obstacle collision for the 3D pilot room,
 * mirroring useCharacterMovement.ts's shape but scoped to this scene's
 * metre-space geometry. Must be called from inside a react-three-fiber
 * <Canvas> (it uses useFrame). */
export function usePilotRoomMovement(onInteract: () => void, onEscape: () => void) {
  const [position, setPosition] = useState<Point2>(SPAWN);
  const positionRef = useRef(position);
  const [facing, setFacing] = useState<PilotFacing>('north');
  const [moving, setMoving] = useState(false);
  const [nearStation, setNearStation] = useState(isNearStation(SPAWN));
  const nearStationRef = useRef(nearStation);
  const keys = useRef(new Set<string>());
  const handlers = useRef({ onInteract, onEscape });
  handlers.current = { onInteract, onEscape };

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea,select,button,[contenteditable="true"]')) return;
      const key = e.key.toLowerCase();
      if (key === 'e' && nearStationRef.current) handlers.current.onInteract();
      if (key === 'escape') handlers.current.onEscape();
      if (MOVE_KEYS.includes(key)) {
        keys.current.add(key);
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const blur = () => keys.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  useFrame((_, delta) => {
    const held = (a: string, b: string) => Number(keys.current.has(a) || keys.current.has(b));
    const dx = held('d', 'arrowright') - held('a', 'arrowleft');
    const dz = held('s', 'arrowdown') - held('w', 'arrowup');
    const length = Math.hypot(dx, dz);
    if (length < 0.01) {
      if (moving) setMoving(false);
      return;
    }
    const speed = (keys.current.has('shift') ? RUN_SPEED : SPEED) * Math.min(delta, 0.05);
    const stepX = (dx / length) * speed;
    const stepZ = (dz / length) * speed;
    const p = positionRef.current;
    let next = { x: p.x, z: p.z };
    if (canStandAt({ x: p.x + stepX, z: p.z + stepZ })) next = { x: p.x + stepX, z: p.z + stepZ };
    else {
      if (canStandAt({ x: p.x + stepX, z: p.z })) next = { x: p.x + stepX, z: p.z };
      if (canStandAt({ x: next.x, z: p.z + stepZ })) next = { x: next.x, z: p.z + stepZ };
    }
    if (next.x !== p.x || next.z !== p.z) {
      positionRef.current = next;
      setPosition(next);
      setFacing(Math.abs(stepX) > Math.abs(stepZ) ? (stepX > 0 ? 'east' : 'west') : stepZ > 0 ? 'south' : 'north');
      nearStationRef.current = isNearStation(next);
      setNearStation(nearStationRef.current);
      if (!moving) setMoving(true);
    } else if (moving) setMoving(false);
  });

  const reset = useCallback(() => {
    positionRef.current = SPAWN;
    setPosition(SPAWN);
    nearStationRef.current = isNearStation(SPAWN);
    setNearStation(nearStationRef.current);
  }, []);

  return { position, facing, moving, nearStation, reset };
}
