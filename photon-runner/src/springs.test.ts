import { describe, expect, it } from 'vitest';
import { SpringSimulator, VectorSpringSimulator, RelativeSpringSimulator } from './springs';

function run(steps: number, dt: number, advance: () => void) {
  for (let i = 0; i < steps; i++) advance();
}

describe('SpringSimulator', () => {
  it('converges to the target without significant overshoot', () => {
    const s = new SpringSimulator(0.12, 5.8, 0);
    s.target = 10;
    let maxSeen = 0;
    run(300, 1 / 60, () => {
      s.advance(1 / 60);
      maxSeen = Math.max(maxSeen, s.position);
    });
    expect(s.position).toBeGreaterThan(9.9);
    expect(s.position).toBeLessThan(10.1);
    expect(maxSeen).toBeLessThan(10.5); // no meaningful overshoot
  });

  it('starts at rest and does not move before a target is set', () => {
    const s = new SpringSimulator(0.12, 5.8, 3);
    s.advance(1 / 60);
    expect(s.position).toBeCloseTo(3, 5);
  });
});

describe('VectorSpringSimulator', () => {
  it('converges to a 2D target', () => {
    const s = new VectorSpringSimulator(0.12, 5.8);
    s.target.set(4, -3);
    run(300, 1 / 60, () => s.advance(1 / 60));
    expect(s.position.x).toBeCloseTo(4, 1);
    expect(s.position.y).toBeCloseTo(-3, 1);
  });
});

describe('RelativeSpringSimulator', () => {
  it('converges to a plain target angle', () => {
    const s = new RelativeSpringSimulator(0.05, 9, 0);
    s.target = 1.2;
    run(300, 1 / 60, () => s.advance(1 / 60));
    expect(s.position).toBeCloseTo(1.2, 1);
  });

  it('takes the short way across the +-PI seam', () => {
    // start and target are ~0.28 rad apart across the wrap, ~6 rad apart the long way.
    const s = new RelativeSpringSimulator(0.05, 9, 3.0);
    s.target = -3.0;
    let maxDelta = 0;
    run(30, 1 / 60, () => {
      s.advance(1 / 60);
      const delta = Math.abs(s.position - 3.0);
      maxDelta = Math.max(maxDelta, Math.min(delta, Math.PI * 2 - delta));
    });
    // If it had gone the long way it would have travelled several radians in the
    // first half second; the short path stays under 1 rad throughout.
    expect(maxDelta).toBeLessThan(1);
  });
});
