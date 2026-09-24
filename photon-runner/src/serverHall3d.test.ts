import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildServerHall, hallCanStand, HALL_SOLIDS } from './serverHall3d';

describe('3D server hall', () => {
  it('keeps the spawn and continuous route to the console clear', () => {
    for (let z = 4.8; z >= -4.6; z -= .05) expect(hallCanStand(0, z)).toBe(true);
    for (let x = 0; x <= 2; x += .05) expect(hallCanStand(x, -4.6)).toBe(true);
  });
  it('blocks equipment and room boundaries with body clearance', () => {
    for (const b of HALL_SOLIDS) {
      expect(hallCanStand(b.x, b.z)).toBe(false);
      expect(hallCanStand(b.x + b.w / 2 + .1, b.z)).toBe(false);
    }
    expect(hallCanStand(5.6, 5)).toBe(false);
    expect(hallCanStand(0, -6.6)).toBe(false);
  });
  it('builds and disposes a solid scene with an animated player', () => {
    const scene = new THREE.Scene(); const hall = buildServerHall(scene);
    expect(scene.children.length).toBeGreaterThan(100);
    expect(hallCanStand(hall.avatar.position.x, hall.avatar.position.z)).toBe(true);
    hall.animate(1, true); hall.animate(2, false); hall.dispose();
  });
});
