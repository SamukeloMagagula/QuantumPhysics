import { useCallback, useRef } from 'react';
import type { PointerEvent } from 'react';

/**
 * Mouse-tracked 3D tilt for a card — cheap, tasteful depth feedback rather
 * than a flat hover state. Spread the returned handlers onto the element;
 * `ref` goes on the same element so its bounding box can be measured.
 */
export function useTilt(maxDeg = 8) {
  const ref = useRef<HTMLElement | null>(null);

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width - 0.5;
      const py = (e.clientY - rect.top) / rect.height - 0.5;
      el.style.transform = `perspective(800px) rotateX(${(-py * maxDeg).toFixed(2)}deg) rotateY(${(px * maxDeg).toFixed(2)}deg) translateY(-5px)`;
    },
    [maxDeg]
  );

  const onPointerLeave = useCallback(() => {
    if (ref.current) ref.current.style.transform = '';
  }, []);

  return { ref, onPointerMove, onPointerLeave };
}
