import { afterEach, expect, it, vi } from 'vitest';
import { startNetworkDefender } from './networkDefenderRun';
import { spawn } from './networkDefenderLogic';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('holds traffic before start and during inspection, then resumes without a time jump', () => {
  let frame: FrameRequestCallback = () => {};
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { frame = callback; return 1; }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.spyOn(performance, 'now').mockReturnValue(0);
  const ctx = new Proxy({}, { get: () => () => {}, set: () => true });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as CanvasRenderingContext2D);
  const canvas = document.createElement('canvas');
  const inspected = vi.fn();
  const handle = startNetworkDefender(canvas, vi.fn(), vi.fn(), inspected);
  spawn(handle.getState(), () => 0.9);
  const packet = handle.getState().threats[0];
  frame(50); expect(packet.x).toBe(640);
  handle.setPaused(false); frame(100); expect(packet.x).toBeLessThan(640);
  handle.inspect(packet.id);
  expect(inspected).toHaveBeenCalledOnce();
  const pausedX = packet.x; frame(50000); expect(packet.x).toBe(pausedX);
  const result = handle.review(packet.id, 'allow');
  expect(result?.correct).toBe(true); expect(handle.getState().reviewed).toBe(1);
  handle.setPaused(false); frame(50050);
  expect(handle.getState().spawnTimer).toBeLessThan(0.2);
  handle.dispose(); expect(cancelAnimationFrame).toHaveBeenCalled();
});
