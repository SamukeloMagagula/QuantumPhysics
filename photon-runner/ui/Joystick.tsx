import React, { useRef, useState } from 'react';

interface JoystickProps {
  onChange: (x: number, z: number) => void;
}

const BASE_RADIUS = 44;

export function Joystick({ onChange }: JoystickProps) {
  const baseRef = useRef<HTMLDivElement>(null);
  const pointerIdRef = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const updateFromPointer = (clientX: number, clientY: number) => {
    const base = baseRef.current;
    if (!base) return;
    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > BASE_RADIUS) {
      dx = (dx / dist) * BASE_RADIUS;
      dy = (dy / dist) * BASE_RADIUS;
    }
    setKnob({ x: dx, y: dy });
    // Screen y-down maps to world -z (up on screen = forward).
    onChange(dx / BASE_RADIUS, -dy / BASE_RADIUS);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    pointerIdRef.current = e.pointerId;
    updateFromPointer(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (pointerIdRef.current !== e.pointerId) return;
    updateFromPointer(e.clientX, e.clientY);
  };

  const reset = (e: React.PointerEvent) => {
    if (pointerIdRef.current !== e.pointerId) return;
    pointerIdRef.current = null;
    setKnob({ x: 0, y: 0 });
    onChange(0, 0);
  };

  return (
    <div
      ref={baseRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={reset}
      onPointerCancel={reset}
      className="relative w-28 h-28 rounded-full bg-slate-900/70 border border-slate-700 touch-none select-none"
    >
      <div
        className="absolute w-12 h-12 rounded-full bg-cyan-500/80 border border-cyan-300 pointer-events-none"
        style={{
          left: `calc(50% + ${knob.x}px - 24px)`,
          top: `calc(50% + ${knob.y}px - 24px)`,
        }}
      />
    </div>
  );
}
