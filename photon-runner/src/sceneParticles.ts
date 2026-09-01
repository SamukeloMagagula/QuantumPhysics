import * as THREE from 'three';
import { Res } from './sceneWorld';

/**
 * A small, reusable particle layer — genuinely absent before this: every
 * scene had lights and materials but nothing airborne. Two shapes: a
 * persistent ambient dust field (slow drifting motes, disposed with the
 * rest of the scene via `Res`) and a one-shot sparkle burst (self-disposing,
 * not `Res`-tracked since its whole lifecycle is measured in under a
 * second).
 */

export interface DustField {
  update(dt: number): void;
}

export function createDustField(
  scene: THREE.Scene,
  res: Res,
  opts: { count?: number; bounds: THREE.Vector3; center?: THREE.Vector3; color?: number }
): DustField {
  const count = opts.count ?? 220;
  const bounds = opts.bounds;
  const center = opts.center ?? new THREE.Vector3();

  const positions = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = center.x + (Math.random() - 0.5) * bounds.x;
    positions[i * 3 + 1] = center.y + Math.random() * bounds.y;
    positions[i * 3 + 2] = center.z + (Math.random() - 0.5) * bounds.z;
    speeds[i] = 0.12 + Math.random() * 0.22;
  }

  const geo = res.g(new THREE.BufferGeometry());
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = res.m(
    new THREE.PointsMaterial({
      color: opts.color ?? 0xcfe8ff,
      size: 0.035,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  const points = new THREE.Points(geo, mat);
  scene.add(points);

  let clock = 0;
  return {
    update(dt) {
      clock += dt;
      const pos = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < count; i++) {
        let y = pos.getY(i) + speeds[i] * dt * 0.3;
        if (y > center.y + bounds.y) y = center.y;
        pos.setY(i, y);
        pos.setX(i, pos.getX(i) + Math.sin(clock * 0.4 + i) * dt * 0.02);
      }
      pos.needsUpdate = true;
    },
  };
}

/** Returns an updater that reports back whether it's still alive — the
 * caller drives it each frame and drops it once `update()` returns false. */
export interface Burst {
  update(dt: number): boolean;
}

export function createSparkleBurst(scene: THREE.Scene, position: THREE.Vector3, color: number): Burst {
  const count = 26;
  const positions = new Float32Array(count * 3);
  const velocities: THREE.Vector3[] = [];
  for (let i = 0; i < count; i++) {
    positions[i * 3] = position.x;
    positions[i * 3 + 1] = position.y;
    positions[i * 3 + 2] = position.z;
    const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.6, Math.random() - 0.5).normalize();
    velocities.push(dir.multiplyScalar(0.8 + Math.random() * 1.2));
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color,
    size: 0.05,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  scene.add(points);

  let age = 0;
  const lifetime = 0.9;
  return {
    update(dt) {
      age += dt;
      const pos = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < count; i++) {
        pos.setX(i, pos.getX(i) + velocities[i].x * dt);
        pos.setY(i, pos.getY(i) + velocities[i].y * dt - dt * 0.4);
        pos.setZ(i, pos.getZ(i) + velocities[i].z * dt);
      }
      pos.needsUpdate = true;
      mat.opacity = Math.max(0, 1 - age / lifetime);

      if (age >= lifetime) {
        scene.remove(points);
        geo.dispose();
        mat.dispose();
        return false;
      }
      return true;
    },
  };
}
