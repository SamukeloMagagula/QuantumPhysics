import React, { useEffect, useRef, useState } from 'react';
import { WORLD_HEIGHT, WORLD_WIDTH, type Point } from './worldLayout';

export const MAX_ZOOM = 2.5;

/**
 * Camera for the campus SVG: fits the map to its host, zooms with the wheel,
 * buttons and two-finger pinch, and eases toward the whole-campus view as the
 * player zooms out so the minimum zoom always shows everything.
 */
export function useMapZoom(active: boolean) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 1100, h: 800 });
  const [zoom, setZoom] = useState(1);
  const touches = useRef(new Map<number, Point>());
  const pinchDistance = useRef(0);
  const suppressClickUntil = useRef(0);

  const baseWidth = Math.max(340, (320 * size.w) / Math.max(1, size.h));
  const baseHeight = Math.max(320, (baseWidth * size.h) / Math.max(1, size.w));
  const fitZoom = Math.min(baseWidth / (WORLD_WIDTH + 40), baseHeight / (WORLD_HEIGHT + 40));
  const effectiveZoom = Math.max(fitZoom, Math.min(MAX_ZOOM, zoom));
  const overview = effectiveZoom <= fitZoom + 0.001;
  const adjustZoom = (factor: number) =>
    setZoom((z) => Math.max(fitZoom, Math.min(MAX_ZOOM, Math.max(fitZoom, z) * factor)));

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const resize = new ResizeObserver(() =>
      setSize({
        w: el.clientWidth || 1100,
        h: Math.max(200, (el.clientHeight || 800) - (el.clientWidth > 700 ? 150 : 0)),
      }),
    );
    resize.observe(el);
    return () => resize.disconnect();
  }, []);

  useEffect(() => {
    const el = canvas.current;
    if (!el || !active) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? size.h : 1);
      const factor = Math.exp(-Math.max(-200, Math.min(200, delta)) * 0.002);
      setZoom((z) => Math.max(fitZoom, Math.min(MAX_ZOOM, Math.max(fitZoom, z) * factor)));
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [active, fitZoom, size.h]);

  const endTouch = (event: React.PointerEvent<SVGSVGElement>) => {
    touches.current.delete(event.pointerId);
    if (pinchDistance.current) suppressClickUntil.current = performance.now() + 400;
    pinchDistance.current = 0;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  /** Pinch gestures zoom; the clicks they would otherwise fire are swallowed. */
  const canvasProps = {
    onClickCapture: (event: React.MouseEvent) => {
      if (performance.now() < suppressClickUntil.current) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    onPointerDown: (event: React.PointerEvent<SVGSVGElement>) => {
      if (event.pointerType !== 'touch') return;
      touches.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touches.current.size === 2) {
        const [a, b] = [...touches.current.values()];
        pinchDistance.current = Math.hypot(a.x - b.x, a.y - b.y);
        suppressClickUntil.current = Infinity;
        for (const id of touches.current.keys()) event.currentTarget.setPointerCapture(id);
      }
    },
    onPointerMove: (event: React.PointerEvent<SVGSVGElement>) => {
      if (!touches.current.has(event.pointerId)) return;
      touches.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touches.current.size !== 2) return;
      const [a, b] = [...touches.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDistance.current > 0 && distance > 0) adjustZoom(distance / pinchDistance.current);
      pinchDistance.current = distance;
    },
    onPointerUp: endTouch,
    onPointerCancel: endTouch,
    onLostPointerCapture: endTouch,
  };

  /** The SVG viewBox centred on `focus`, drifting to the campus centre when zoomed out. */
  const viewBox = (focus: Point) => {
    const width = baseWidth / effectiveZoom;
    const height = baseHeight / effectiveZoom;
    const recenter = Math.max(0, Math.min(1, (1 - effectiveZoom) / (1 - fitZoom)));
    const cx = focus.x + (WORLD_WIDTH / 2 - focus.x) * recenter;
    const cy = focus.y + (WORLD_HEIGHT / 2 - focus.y) * recenter;
    return `${cx - width / 2} ${cy - height / 2} ${width} ${height}`;
  };

  return { host, canvas, canvasProps, zoom: effectiveZoom, fitZoom, overview, adjustZoom, setZoom, viewBox };
}
