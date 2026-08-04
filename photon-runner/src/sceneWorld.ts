import * as THREE from 'three';
import { CorridorDef, MapDef, RoomDef } from './sceneMaps';
import { applySurface, groundSurface, metalSurface, wallSurface } from './sceneTextures';
import { profile } from './sceneQuality';
import { VectorSpringSimulator } from './springs';

export interface MarkerHandle {
  group: THREE.Group;
}

export interface FirstPersonView {
  /** World-space height above `playerPos` to plant the camera — roughly eye level. */
  eyeHeight: number;
  /** Y-axis facing angle in radians, same convention as the character's own rotation.y. */
  facing: number;
}

export interface World {
  spawnMarker(position: THREE.Vector3, color: number, kind?: 'task' | 'hostile'): MarkerHandle;
  removeMarker(handle: MarkerHandle): void;
  update(dt: number): void;
  updateCamera(playerPos: THREE.Vector3, dt: number, velocity?: THREE.Vector2, firstPerson?: FirstPersonView): void;
  pingSensor(id: string): void;
  popVent(ventId: string): void;
  dispose(): void;
}

const WALL_H = 3.1;
const WALL_T = 0.34;

class Res {
  private geoms = new Set<THREE.BufferGeometry>();
  private mats = new Set<THREE.Material>();
  private texs = new Set<THREE.Texture>();

  g<T extends THREE.BufferGeometry>(x: T): T {
    this.geoms.add(x);
    return x;
  }
  m<T extends THREE.Material>(x: T): T {
    this.mats.add(x);
    return x;
  }
  t<T extends THREE.Texture>(x: T): T {
    this.texs.add(x);
    return x;
  }
  dispose(): void {
    this.geoms.forEach((x) => x.dispose());
    this.mats.forEach((x) => x.dispose());
    this.texs.forEach((x) => x.dispose());
    this.geoms.clear();
    this.mats.clear();
    this.texs.clear();
  }
}

/**
 * Subtract holes from a 1D span and return the solid runs left over. Used to
 * carve doorways exactly where a corridor meets a wall, so openings always
 * line up with where you can actually walk.
 */
function solidRuns(a: number, b: number, holes: [number, number][]): [number, number][] {
  const sorted = holes
    .map(([h0, h1]) => [Math.max(a, Math.min(h0, h1)), Math.min(b, Math.max(h0, h1))] as [number, number])
    .filter(([h0, h1]) => h1 > h0)
    .sort((p, q) => p[0] - q[0]);

  const runs: [number, number][] = [];
  let cursor = a;
  for (const [h0, h1] of sorted) {
    if (h0 > cursor) runs.push([cursor, h0]);
    cursor = Math.max(cursor, h1);
  }
  if (cursor < b) runs.push([cursor, b]);
  return runs.filter(([r0, r1]) => r1 - r0 > 0.05);
}

/** Deterministic per-room PRNG (mulberry32) so clutter placement is stable
 * across remounts instead of reshuffling every time the scene rebuilds. */
function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/** Small crates and a coiled cable near two room corners — clutter that
 * breaks up an otherwise flat floor/wall silhouette without adding
 * collision or interaction surface (purely decorative). */
function scatterProps(
  room: RoomDef,
  res: Res,
  scene: THREE.Scene,
  crateMat: THREE.Material,
  cableMat: THREE.Material
): void {
  const rand = seededRandom(room.id);
  const inset = 0.55;
  const corners: [number, number][] = [
    [-1, -1],
    [1, 1],
  ];

  for (const [sx, sz] of corners) {
    if (rand() < 0.15) continue; // not every corner in every room — avoids visual monotony

    const cx = room.center.x + sx * (room.size.w / 2 - inset);
    const cz = room.center.z + sz * (room.size.d / 2 - inset);

    if (rand() < 0.6) {
      const size = 0.32 + rand() * 0.14;
      const crate = new THREE.Mesh(res.g(new THREE.BoxGeometry(size, size, size)), crateMat);
      crate.position.set(cx, size / 2, cz);
      crate.rotation.y = rand() * Math.PI * 2;
      crate.castShadow = true;
      crate.receiveShadow = true;
      scene.add(crate);
      if (rand() < 0.4) {
        const stackSize = size * (0.7 + rand() * 0.2);
        const stack = new THREE.Mesh(res.g(new THREE.BoxGeometry(stackSize, stackSize, stackSize)), crateMat);
        stack.position.set(cx + (rand() - 0.5) * 0.1, size + stackSize / 2, cz + (rand() - 0.5) * 0.1);
        stack.rotation.y = rand() * Math.PI * 2;
        stack.castShadow = true;
        stack.receiveShadow = true;
        scene.add(stack);
      }
    } else {
      const coil = new THREE.Mesh(res.g(new THREE.TorusGeometry(0.16, 0.035, 8, 20)), cableMat);
      coil.position.set(cx, 0.035, cz);
      coil.rotation.x = -Math.PI / 2;
      coil.receiveShadow = true;
      scene.add(coil);
    }
  }
}

function nameplate(text: string, color: string, res: Res): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.font = '600 46px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,.95)';
  ctx.shadowBlur = 18;
  ctx.fillStyle = color;
  ctx.fillText(text.toUpperCase(), canvas.width / 2, canvas.height / 2);
  const tex = res.t(new THREE.CanvasTexture(canvas));
  tex.anisotropy = 8;
  const s = new THREE.Sprite(res.m(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })));
  s.scale.set(6, 1, 1);
  return s;
}

export function createWorld(scene: THREE.Scene, camera: THREE.PerspectiveCamera, map: MapDef): World {
  const res = new Res();
  const p = map.palette;

  scene.background = new THREE.Color(p.air);
  scene.fog = new THREE.FogExp2(p.air, 0.021);

  // The IBL environment now supplies most of the ambient fill, so the
  // hemisphere light is dialled back to a tint rather than a light source.
  scene.add(new THREE.HemisphereLight(p.ambientSky, p.ambientGround, 0.32));

  const key = new THREE.DirectionalLight(p.sun, 1.5);
  key.position.set(11, 21, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(profile().shadowMapSize, profile().shadowMapSize);
  const span = 26;
  key.shadow.camera.left = -span;
  key.shadow.camera.right = span;
  key.shadow.camera.top = span;
  key.shadow.camera.bottom = -span;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.0009;
  key.shadow.normalBias = 0.028;
  scene.add(key);

  // Full PBR sets: albedo + normal + roughness. The normal maps are what make
  // concrete read as poured and walls read as block rather than painted card.
  const ventMetal = metalSurface(0x4a4038);
  const applySurfaceTo = (m: THREE.MeshStandardMaterial) => {
    applySurface(m, ventMetal, 1, 0.9);
    return m;
  };

  const groundMaps = groundSurface(p.floor, p.floorAccent, undefined, 7);
  const wallMaps = wallSurface(p.wall);

  const wallMat = res.m(new THREE.MeshStandardMaterial({ color: p.wall, roughness: 0.92, metalness: 0.03 }));
  applySurface(wallMat, wallMaps, 1.4, 1.1);

  const floorFor = (w: number, d: number, color: number) => {
    const mat = res.m(new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0.03 }));
    // Tile by physical size so a big hall and a narrow corridor share a scale.
    applySurface(mat, groundMaps, Math.max(w, d) / 3.2, 1.25);
    res.t(mat.map!);
    res.t(mat.normalMap!);
    res.t(mat.roughnessMap!);
    return mat;
  };

  // ---- floors ----
  for (const c of map.corridors) {
    const f = new THREE.Mesh(res.g(new THREE.PlaneGeometry(c.w, c.d)), floorFor(c.w, c.d, 0xbfb4a6));
    f.rotation.x = -Math.PI / 2;
    f.position.set(c.x, 0.002, c.z);
    f.receiveShadow = true;
    scene.add(f);
  }

  for (const room of map.rooms) {
    const f = new THREE.Mesh(
      res.g(new THREE.PlaneGeometry(room.size.w, room.size.d)),
      floorFor(room.size.w, room.size.d, 0xffffff)
    );
    f.rotation.x = -Math.PI / 2;
    f.position.set(room.center.x, 0, room.center.z);
    f.receiveShadow = true;
    scene.add(f);
  }

  // ---- walls with doorways carved where corridors land ----
  const capMat = res.m(
    new THREE.MeshStandardMaterial({ color: p.wallTop, roughness: 0.52, metalness: 0.55 })
  );
  applySurface(capMat, metalSurface(p.wallTop), 3, 1.0);

  const crateMat = res.m(new THREE.MeshStandardMaterial({ color: 0x5a4a36, roughness: 0.82, metalness: 0.08 }));
  applySurface(crateMat, metalSurface(0x5a4a36), 1.5, 0.7);
  const cableMat = res.m(new THREE.MeshStandardMaterial({ color: 0x1a1815, roughness: 0.75, metalness: 0.1 }));

  function buildWalls(room: RoomDef, corridors: CorridorDef[]): void {
    const halfW = room.size.w / 2;
    const halfD = room.size.d / 2;
    const x0 = room.center.x - halfW;
    const x1 = room.center.x + halfW;
    const z0 = room.center.z - halfD;
    const z1 = room.center.z + halfD;
    const touch = 0.9; // how close a corridor must be to count as attached

    const place = (sx: number, sz: number, px: number, pz: number) => {
      const wall = new THREE.Mesh(res.g(new THREE.BoxGeometry(sx, WALL_H, sz)), wallMat);
      wall.position.set(px, WALL_H / 2, pz);
      wall.castShadow = true;
      wall.receiveShadow = true;
      scene.add(wall);

      const cap = new THREE.Mesh(res.g(new THREE.BoxGeometry(sx * 1.02, 0.16, sz * 1.02)), capMat);
      cap.position.set(px, WALL_H + 0.08, pz);
      cap.castShadow = true;
      scene.add(cap);
    };

    // North & south walls run along x; holes come from corridors meeting them.
    for (const [zEdge, dir] of [
      [z0, -1],
      [z1, 1],
    ] as [number, number][]) {
      const holes = corridors
        .filter((c) => Math.abs((dir < 0 ? c.z + c.d / 2 : c.z - c.d / 2) - zEdge) < touch && c.w < c.d + 4)
        .map((c) => [c.x - c.w / 2, c.x + c.w / 2] as [number, number]);
      for (const [a, b] of solidRuns(x0, x1, holes)) {
        place(b - a + WALL_T, WALL_T, (a + b) / 2, zEdge);
      }
    }

    // East & west walls run along z.
    for (const [xEdge, dir] of [
      [x0, -1],
      [x1, 1],
    ] as [number, number][]) {
      const holes = corridors
        .filter((c) => Math.abs((dir < 0 ? c.x + c.w / 2 : c.x - c.w / 2) - xEdge) < touch && c.d < c.w + 4)
        .map((c) => [c.z - c.d / 2, c.z + c.d / 2] as [number, number]);
      for (const [a, b] of solidRuns(z0, z1, holes)) {
        place(WALL_T, b - a + WALL_T, xEdge, (a + b) / 2);
      }
    }
  }

  for (const room of map.rooms) buildWalls(room, map.corridors);

  // ---- room labels + practical lamps ----
  for (const room of map.rooms) {
    const label = nameplate(room.name, `#${room.color.toString(16).padStart(6, '0')}`, res);
    label.position.set(room.center.x, 3.7, room.center.z);
    scene.add(label);

    const lamp = new THREE.PointLight(p.lamp, p.lampIntensity * 0.8, Math.max(room.size.w, room.size.d) * 1.7, 2);
    lamp.position.set(room.center.x, 2.7, room.center.z);
    scene.add(lamp);

    // Visible fixture so the light has a source.
    const shade = new THREE.Mesh(
      res.g(new THREE.ConeGeometry(0.42, 0.34, 10, 1, true)),
      res.m(new THREE.MeshStandardMaterial({ color: 0x2e2820, roughness: 0.8, side: THREE.DoubleSide }))
    );
    shade.position.set(room.center.x, 2.95, room.center.z);
    scene.add(shade);

    const bulb = new THREE.Mesh(
      res.g(new THREE.SphereGeometry(0.1, 16, 12)),
      res.m(new THREE.MeshBasicMaterial({ color: p.lamp, toneMapped: false }))
    );
    bulb.position.set(room.center.x, 2.82, room.center.z);
    scene.add(bulb);

    // Corner bounce lights — expensive, so only above the balanced tier.
    if (profile().fillLights) {
      for (const [sx, sz] of [
        [-1, -1],
        [1, 1],
      ] as [number, number][]) {
        const fill = new THREE.PointLight(p.lamp, p.lampIntensity * 0.22, Math.max(room.size.w, room.size.d), 2);
        fill.position.set(
          room.center.x + sx * room.size.w * 0.3,
          1.1,
          room.center.z + sz * room.size.d * 0.3
        );
        scene.add(fill);
      }
      // Small clutter breaks up a flat floor the way real facilities never are —
      // same tier gate as the bounce lights, since neither changes gameplay,
      // only how grounded the room reads.
      scatterProps(room, res, scene, crateMat, cableMat);
    }
  }

  // ---- vents ----
  const vents = map.vents.map((v) => {
    const g = new THREE.Group();
    g.position.set(v.x, 0, v.z);

    const rim = new THREE.Mesh(
      res.g(new THREE.CylinderGeometry(0.6, 0.64, 0.12, 16)),
      res.m(applySurfaceTo(new THREE.MeshStandardMaterial({ color: 0x2c2620, roughness: 0.5, metalness: 0.75 })))
    );
    rim.position.y = 0.06;
    rim.receiveShadow = true;
    g.add(rim);

    const shaft = new THREE.Mesh(
      res.g(new THREE.CylinderGeometry(0.52, 0.52, 0.7, 16, 1, true)),
      res.m(new THREE.MeshBasicMaterial({ color: 0x050403, side: THREE.BackSide }))
    );
    shaft.position.y = -0.35;
    g.add(shaft);

    const lid = new THREE.Mesh(
      res.g(new THREE.CylinderGeometry(0.54, 0.54, 0.08, 16)),
      res.m(applySurfaceTo(new THREE.MeshStandardMaterial({ color: 0x6b5a44, roughness: 0.45, metalness: 0.8 })))
    );
    lid.position.y = 0.14;
    lid.castShadow = true;
    g.add(lid);

    scene.add(g);
    return { id: v.id, lid, open: 0 };
  });

  // ---- sensors ----
  const sensors = map.sensors.map((s) => {
    const mat = res.m(new THREE.MeshBasicMaterial({ color: 0x8b7355, transparent: true, opacity: 0.4 }));
    const ring = new THREE.Mesh(res.g(new THREE.TorusGeometry(1.05, 0.04, 8, 32)), mat);
    ring.position.set(s.x, 0.06, s.z);
    ring.rotation.x = -Math.PI / 2;
    scene.add(ring);
    return { id: s.id, ring, mat, pulse: 0 };
  });

  // ---- fiber run ----
  const fFrom = new THREE.Vector3(map.fiber.from[0], 2.55, map.fiber.from[1]);
  const fTo = new THREE.Vector3(map.fiber.to[0], 2.55, map.fiber.to[1]);
  const fiberLen = fFrom.distanceTo(fTo);
  const conduit = new THREE.Mesh(
    res.g(new THREE.CylinderGeometry(0.05, 0.05, fiberLen, 8)),
    res.m(new THREE.MeshStandardMaterial({ color: 0x3a3128, roughness: 0.6, metalness: 0.5 }))
  );
  conduit.position.copy(fFrom).lerp(fTo, 0.5);
  conduit.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3().subVectors(fTo, fFrom).normalize()
  );
  conduit.castShadow = true;
  scene.add(conduit);

  const pulses: THREE.Mesh[] = [];
  const pulseGeo = res.g(new THREE.SphereGeometry(0.07, 10, 8));
  const pulseMat = res.m(new THREE.MeshBasicMaterial({ color: 0xffe9a8, toneMapped: false }));
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(pulseGeo, pulseMat);
    scene.add(m);
    pulses.push(m);
  }

  const markers = new Set<THREE.Group>();
  let clock = 0;
  const lookAhead = new VectorSpringSimulator(0.35, 3.4);

  function buildMarker(color: number, kind: 'task' | 'hostile'): THREE.Group {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(
      res.g(new THREE.TorusGeometry(0.46, 0.05, 8, 28)),
      res.m(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, toneMapped: false }))
    );
    ring.rotation.x = Math.PI / 2;
    g.add(ring);

    const core = new THREE.Mesh(
      res.g(kind === 'hostile' ? new THREE.OctahedronGeometry(0.19) : new THREE.IcosahedronGeometry(0.17, 0)),
      res.m(new THREE.MeshBasicMaterial({ color, toneMapped: false }))
    );
    g.add(core);

    const pool = new THREE.Mesh(
      res.g(new THREE.CircleGeometry(0.8, 24)),
      res.m(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.13 }))
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = -0.9;
    g.add(pool);

    g.add(new THREE.PointLight(color, 3, 4.5, 2));
    g.position.y = 0.98;
    return g;
  }

  return {
    spawnMarker(position, color, kind = 'task') {
      const group = buildMarker(color, kind);
      group.position.x = position.x;
      group.position.z = position.z;
      scene.add(group);
      markers.add(group);
      return { group };
    },

    removeMarker(handle) {
      scene.remove(handle.group);
      markers.delete(handle.group);
    },

    pingSensor(id) {
      const s = sensors.find((x) => x.id === id);
      if (s) s.pulse = 1;
    },

    popVent(ventId) {
      const v = vents.find((x) => x.id === ventId);
      if (v) v.open = 1;
    },

    update(dt) {
      clock += dt;

      markers.forEach((g) => {
        g.rotation.y = clock * 1.5;
        g.position.y = 0.98 + Math.sin(clock * 2.1) * 0.08;
      });

      for (const v of vents) {
        v.lid.position.y = 0.14 + v.open * 0.4;
        v.lid.rotation.y = clock * 0.3;
        v.open *= 0.9;
      }

      for (const s of sensors) {
        if (s.pulse > 0) {
          s.pulse = Math.max(0, s.pulse - dt * 1.5);
          s.mat.color.setHex(0xffb457);
          s.mat.opacity = 0.32 + s.pulse * 0.68;
          s.ring.scale.setScalar(1 + (1 - s.pulse) * 0.22);
        } else {
          s.mat.color.setHex(0x8b7355);
          s.mat.opacity = 0.3 + Math.sin(clock * 1.8) * 0.06;
          s.ring.scale.setScalar(1);
        }
      }

      pulses.forEach((m, i) => {
        const t = (clock * 0.26 + i / pulses.length) % 1;
        m.position.lerpVectors(fFrom, fTo, t);
      });
    },

    updateCamera(playerPos, dt, velocity, firstPerson) {
      if (firstPerson) {
        // Plant the camera at eye height and snap to facing — no lag, no
        // spring: it's supposed to feel like your own head, not a chase cam.
        camera.position.set(playerPos.x, firstPerson.eyeHeight, playerPos.z);
        const lookX = playerPos.x + Math.sin(firstPerson.facing);
        const lookZ = playerPos.z + Math.cos(firstPerson.facing);
        camera.lookAt(lookX, firstPerson.eyeHeight, lookZ);
        // The third-person look-ahead spring keeps decaying toward zero while
        // unused, so switching back doesn't inherit a stale offset.
        lookAhead.target.set(0, 0);
        lookAhead.advance(dt);
        return;
      }

      // Look slightly ahead of travel direction — more pronounced at higher
      // speed (sprinting), settles back to zero at rest.
      const vx = velocity?.x ?? 0;
      const vz = velocity?.y ?? 0;
      lookAhead.target.set(vx * 0.18, vz * 0.18);
      lookAhead.advance(dt);

      const anchorX = playerPos.x + lookAhead.position.x;
      const anchorZ = playerPos.z + lookAhead.position.y;
      const desired = new THREE.Vector3(anchorX * 0.6, 13.5, anchorZ + 10);
      camera.position.lerp(desired, Math.min(dt * 3.2, 1));
      camera.lookAt(anchorX * 0.6, 0.8, anchorZ + 0.5);
    },

    dispose() {
      res.dispose();
    },
  };
}
