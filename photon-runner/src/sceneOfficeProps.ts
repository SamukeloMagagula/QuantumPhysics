import * as THREE from 'three';
import { RoomDef, receptionCounterSlot } from './sceneMaps';
import { applySurface, metalSurface, woodSurface } from './sceneTextures';
import { createLabel } from './sceneText';

/**
 * Procedural "office" prop vocabulary — desks, a reception counter + keypad,
 * wall-mounted signage, potted plants, a conference table, server racks, and
 * a tier-aware glass material. Kept separate from sceneWorld.ts's industrial-
 * facility helpers (crates, cable coils, vents) since this is a distinct
 * aesthetic used only by furnished rooms (`RoomDef.furniture`).
 *
 * Everything here is built the same way as the rest of the scene: primitives
 * + the existing procedural PBR textures, no imported assets.
 */

/** Structural subset of sceneWorld.ts's resource tracker — avoids a circular
 * import (sceneWorld.ts is what calls into this module) while still letting
 * every mesh/material/texture built here get disposed with the rest of the
 * scene when the level unloads. */
export interface ResLike {
  g<T extends THREE.BufferGeometry>(x: T): T;
  m<T extends THREE.Material>(x: T): T;
  t<T extends THREE.Texture>(x: T): T;
  d<T extends { dispose(): void }>(x: T): T;
}

// ---------------------------------------------------------------- textures

// A bullpen draws several identical-looking desks, and every furnished room
// mounts a keypad — without caching, each one re-ran a canvas-drawing loop
// and allocated its own GPU texture for pixel-identical output.
//
// The cache is keyed by `res` (each scene builds its own fresh `Res`
// instance), not shared globally — a global cache would hand out an
// already-disposed texture the second time a player revisits a scene, since
// `Res.dispose()` disposes every texture it tracked when that scene tore
// down, and a module-level cache would still be holding onto that same, now
// invalid, object. Scoping to `res` via a WeakMap means the cache's
// lifetime always matches the textures' actual GPU lifetime, and needs no
// manual invalidation — a fresh `Res` per scene load just means a fresh,
// empty cache.
const dashboardTextureCache = new WeakMap<ResLike, THREE.CanvasTexture>();
const keypadTextureCache = new WeakMap<ResLike, THREE.CanvasTexture>();

function dashboardTexture(res: ResLike): THREE.CanvasTexture {
  const cached = dashboardTextureCache.get(res);
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 80;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#060a12';
  ctx.fillRect(0, 0, 128, 80);
  ctx.fillStyle = '#2a6fb0';
  ctx.fillRect(6, 8, 116, 14);
  ctx.fillStyle = '#5ea8c9';
  ctx.fillRect(6, 28, 70, 10);
  ctx.fillRect(6, 42, 50, 10);
  ctx.fillRect(6, 56, 90, 10);
  ctx.fillStyle = '#8fd9ff';
  ctx.fillRect(84, 28, 38, 38);
  const tex = new THREE.CanvasTexture(c);
  dashboardTextureCache.set(res, tex);
  return tex;
}

function keypadTexture(res: ResLike): THREE.CanvasTexture {
  const cached = keypadTextureCache.get(res);
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 160;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#eef1f5';
  ctx.fillRect(0, 0, 128, 160);
  ctx.fillStyle = '#20242b';
  ctx.font = '600 20px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let i = 0;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const cx = 24 + col * 40;
      const cy = 30 + row * 40;
      ctx.strokeStyle = '#9aa3ad';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(cx - 16, cy - 16, 32, 32);
      ctx.fillText(String(i + 1), cx, cy);
      i++;
    }
  }
  const tex = new THREE.CanvasTexture(c);
  keypadTextureCache.set(res, tex);
  return tex;
}


// ------------------------------------------------------------------ glass

/** Transmission is a real extra render pass — only worth it above `balanced`. */
export function glassMaterial(highTier: boolean): THREE.Material {
  if (highTier) {
    return new THREE.MeshPhysicalMaterial({
      color: 0xcfe8ff,
      transparent: true,
      opacity: 0.25,
      transmission: 0.85,
      roughness: 0.05,
      metalness: 0,
      thickness: 0.05,
      ior: 1.5,
    });
  }
  return new THREE.MeshStandardMaterial({
    color: 0xcfe8ff,
    transparent: true,
    opacity: 0.22,
    roughness: 0.1,
    metalness: 0.1,
  });
}

// ------------------------------------------------------------------ props

export function buildSignagePanel(
  scene: THREE.Scene,
  res: ResLike,
  opts: { x: number; y: number; z: number; rotY: number; text: string; accent: number; ring?: boolean }
): void {
  const group = new THREE.Group();
  group.position.set(opts.x, opts.y, opts.z);
  group.rotation.y = opts.rotY;

  const backing = new THREE.Mesh(
    res.g(new THREE.BoxGeometry(1.8, 0.5, 0.06)),
    res.m(new THREE.MeshStandardMaterial({ color: 0x0a0d13, roughness: 0.6, metalness: 0.3 }))
  );
  backing.castShadow = true;
  group.add(backing);

  // Dark faceplate, with the room name set in real SDF type on top of it —
  // this used to be a canvas texture of the whole panel, which went soft as
  // soon as you stood next to a sign.
  const face = new THREE.Mesh(
    res.g(new THREE.PlaneGeometry(1.72, 0.42)),
    res.m(new THREE.MeshStandardMaterial({ color: 0x0a0d13, roughness: 0.45, metalness: 0.25 }))
  );
  face.position.z = 0.035;
  group.add(face);

  const label = createLabel(res, {
    text: opts.text.toUpperCase(),
    size: 0.17,
    color: 0xeaf6ff,
    letterSpacing: 0.06,
    maxWidth: 1.6,
    anchorX: 'center',
    anchorY: 'middle',
  });
  label.position.set(opts.ring ? 0.12 : 0, 0, 0.045);
  group.add(label);

  if (opts.ring) {
    const ring = new THREE.Mesh(
      res.g(new THREE.TorusGeometry(0.22, 0.035, 10, 28)),
      res.m(new THREE.MeshBasicMaterial({ color: opts.accent, toneMapped: false }))
    );
    ring.position.set(-1.15, 0, 0.05);
    group.add(ring);
  }

  scene.add(group);
}

// A furnished 11-room HQ calls buildDeskCluster/buildConferenceTable/
// buildServerRacks dozens of times. Every one of those calls used to build
// brand-new BufferGeometry + Material objects for shapes that are pixel-
// identical every time (a desk leg is a desk leg) — that's what actually
// crashed the renderer once room count/furniture density grew past the
// original 4-5 room maps: hundreds of redundant unique GPU buffer uploads
// for shapes that could all share one. Geometry/material sharing across many
// meshes is the normal Three.js pattern for exactly this case (it's what
// instancing is *for*), and it's safe to cache per-`res`: `Res.g()`/`.m()`
// are Set-based, so tracking the same shared object from many call sites
// still disposes it exactly once when the scene tears down.
interface DeskGeometrySet {
  top: THREE.BufferGeometry;
  leg: THREE.BufferGeometry;
  monitor: THREE.BufferGeometry;
  stand: THREE.BufferGeometry;
  seat: THREE.BufferGeometry;
  back: THREE.BufferGeometry;
  chairLeg: THREE.BufferGeometry;
  tower: THREE.BufferGeometry;
  woodMat: THREE.Material;
  legMat: THREE.Material;
  chairMat: THREE.Material;
  monitorMat: THREE.Material;
}
const deskSetCache = new WeakMap<ResLike, DeskGeometrySet>();

function getDeskSet(res: ResLike): DeskGeometrySet {
  const cached = deskSetCache.get(res);
  if (cached) return cached;

  const woodMat = res.m(new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.6, metalness: 0.05 }));
  applySurface(woodMat, woodSurface(0x8a6a45), 1.5, 0.9);
  const legMat = res.m(new THREE.MeshStandardMaterial({ color: 0x2c2620, roughness: 0.5, metalness: 0.4 }));
  const chairMat = res.m(new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.7, metalness: 0.1 }));
  const monitorMat = res.m(new THREE.MeshBasicMaterial({ map: res.t(dashboardTexture(res)), toneMapped: false }));

  const set: DeskGeometrySet = {
    top: res.g(new THREE.BoxGeometry(0.95, 0.05, 0.55)),
    leg: res.g(new THREE.BoxGeometry(0.05, 0.72, 0.05)),
    monitor: res.g(new THREE.BoxGeometry(0.38, 0.24, 0.02)),
    stand: res.g(new THREE.BoxGeometry(0.04, 0.14, 0.04)),
    seat: res.g(new THREE.BoxGeometry(0.42, 0.06, 0.42)),
    back: res.g(new THREE.BoxGeometry(0.42, 0.5, 0.06)),
    chairLeg: res.g(new THREE.CylinderGeometry(0.03, 0.03, 0.46, 8)),
    tower: res.g(new THREE.BoxGeometry(0.16, 0.36, 0.32)),
    woodMat,
    legMat,
    chairMat,
    monitorMat,
  };
  deskSetCache.set(res, set);
  return set;
}

export function buildDeskCluster(scene: THREE.Scene, res: ResLike, opts: { x: number; z: number; rotY: number }): void {
  const s = getDeskSet(res);

  const group = new THREE.Group();
  group.position.set(opts.x, 0, opts.z);
  group.rotation.y = opts.rotY;

  const top = new THREE.Mesh(s.top, s.woodMat);
  top.position.y = 0.73;
  top.castShadow = true;
  top.receiveShadow = true;
  group.add(top);

  for (const [lx, lz] of [
    [-0.42, -0.22],
    [0.42, -0.22],
    [-0.42, 0.22],
    [0.42, 0.22],
  ] as [number, number][]) {
    const leg = new THREE.Mesh(s.leg, s.legMat);
    leg.position.set(lx, 0.36, lz);
    leg.castShadow = true;
    group.add(leg);
  }

  const monitor = new THREE.Mesh(s.monitor, s.monitorMat);
  monitor.position.set(0, 1.0, -0.18);
  monitor.rotation.x = -0.05;
  group.add(monitor);

  const stand = new THREE.Mesh(s.stand, s.legMat);
  stand.position.set(0, 0.86, -0.18);
  group.add(stand);

  const seat = new THREE.Mesh(s.seat, s.chairMat);
  seat.position.set(0, 0.46, 0.55);
  seat.castShadow = true;
  group.add(seat);

  const back = new THREE.Mesh(s.back, s.chairMat);
  back.position.set(0, 0.72, 0.74);
  group.add(back);

  const chairLeg = new THREE.Mesh(s.chairLeg, s.legMat);
  chairLeg.position.set(0, 0.23, 0.55);
  group.add(chairLeg);

  const tower = new THREE.Mesh(s.tower, s.legMat);
  tower.position.set(0.4, 0.18, 0.05);
  tower.castShadow = true;
  group.add(tower);

  scene.add(group);
}

export function buildReceptionCounter(scene: THREE.Scene, res: ResLike, opts: { x: number; z: number; rotY: number }): void {
  const counterMat = res.m(new THREE.MeshStandardMaterial({ color: 0x14181f, roughness: 0.5, metalness: 0.3 }));
  applySurface(counterMat, metalSurface(0x14181f), 1.5, 0.6);
  const topMat = res.m(new THREE.MeshStandardMaterial({ color: 0xd8dde3, roughness: 0.3, metalness: 0.1 }));
  const padMat = res.m(new THREE.MeshStandardMaterial({ color: 0xe8ebef, roughness: 0.35, metalness: 0.15 }));

  const group = new THREE.Group();
  group.position.set(opts.x, 0, opts.z);
  group.rotation.y = opts.rotY;

  const body = new THREE.Mesh(res.g(new THREE.BoxGeometry(2.2, 0.9, 0.5)), counterMat);
  body.position.y = 0.45;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const top = new THREE.Mesh(res.g(new THREE.BoxGeometry(2.3, 0.05, 0.58)), topMat);
  top.position.y = 0.925;
  group.add(top);

  // Keypad pedestal — the counter's own child, placed just in front of it so
  // its position/orientation always tracks the counter with no extra math.
  const base = new THREE.Mesh(res.g(new THREE.CylinderGeometry(0.12, 0.14, 0.85, 10)), padMat);
  base.position.set(0, 0.425, 0.55);
  base.castShadow = true;
  group.add(base);

  const face = new THREE.Mesh(
    res.g(new THREE.BoxGeometry(0.32, 0.4, 0.06)),
    res.m(new THREE.MeshBasicMaterial({ map: res.t(keypadTexture(res)), toneMapped: false }))
  );
  face.position.set(0, 0.86, 0.66);
  face.rotation.x = -0.35;
  group.add(face);

  scene.add(group);
}

export function buildPottedPlant(scene: THREE.Scene, res: ResLike, opts: { x: number; z: number }): void {
  const potMat = res.m(new THREE.MeshStandardMaterial({ color: 0x6b4a34, roughness: 0.8, metalness: 0.05 }));
  const trunkMat = res.m(new THREE.MeshStandardMaterial({ color: 0x5a3d24, roughness: 0.85 }));
  const leafMat = res.m(new THREE.MeshStandardMaterial({ color: 0x2f6b3a, roughness: 0.7, side: THREE.DoubleSide }));

  const group = new THREE.Group();
  group.position.set(opts.x, 0, opts.z);

  const pot = new THREE.Mesh(res.g(new THREE.CylinderGeometry(0.22, 0.16, 0.32, 12)), potMat);
  pot.position.y = 0.16;
  pot.castShadow = true;
  pot.receiveShadow = true;
  group.add(pot);

  const trunk = new THREE.Mesh(res.g(new THREE.CylinderGeometry(0.03, 0.04, 0.5, 6)), trunkMat);
  trunk.position.y = 0.55;
  group.add(trunk);

  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(res.g(new THREE.PlaneGeometry(0.5, 0.12)), leafMat);
    const a = (i / 6) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 0.15, 0.85 + (i % 2) * 0.08, Math.sin(a) * 0.15);
    leaf.rotation.y = a;
    leaf.rotation.z = 0.3;
    group.add(leaf);
  }

  scene.add(group);
}

export function buildConferenceTable(
  scene: THREE.Scene,
  res: ResLike,
  opts: { x: number; z: number; length: number }
): void {
  const topMat = res.m(new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.35, metalness: 0.25 }));
  applySurface(topMat, woodSurface(0x2a2f38), 1.2, 0.7);

  const c = getConferenceSet(res);
  const len = Math.max(1.6, opts.length);
  const top = new THREE.Mesh(res.g(new THREE.BoxGeometry(len, 0.06, 1.1)), topMat);
  top.position.set(opts.x, 0.74, opts.z);
  top.castShadow = true;
  top.receiveShadow = true;
  scene.add(top);

  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(c.leg, c.legMat);
    leg.position.set(opts.x + side * (len / 2 - 0.15), 0.37, opts.z);
    leg.castShadow = true;
    scene.add(leg);
  }

  const seats = Math.max(2, Math.floor(len / 0.75));
  for (let i = 0; i < seats; i++) {
    const t = seats === 1 ? 0.5 : i / (seats - 1);
    const cx = opts.x - len / 2 + 0.4 + t * (len - 0.8);
    for (const side of [-1, 1]) {
      const seat = new THREE.Mesh(c.seat, c.chairMat);
      seat.position.set(cx, 0.46, opts.z + side * 0.75);
      scene.add(seat);

      const back = new THREE.Mesh(c.back, c.chairMat);
      back.position.set(cx, 0.68, opts.z + side * 0.93);
      scene.add(back);
    }
  }
}

interface ConferenceGeometrySet {
  leg: THREE.BufferGeometry;
  seat: THREE.BufferGeometry;
  back: THREE.BufferGeometry;
  legMat: THREE.Material;
  chairMat: THREE.Material;
}
const conferenceSetCache = new WeakMap<ResLike, ConferenceGeometrySet>();

function getConferenceSet(res: ResLike): ConferenceGeometrySet {
  const cached = conferenceSetCache.get(res);
  if (cached) return cached;
  const set: ConferenceGeometrySet = {
    leg: res.g(new THREE.BoxGeometry(0.08, 0.72, 0.9)),
    seat: res.g(new THREE.BoxGeometry(0.36, 0.06, 0.36)),
    back: res.g(new THREE.BoxGeometry(0.36, 0.4, 0.05)),
    legMat: res.m(new THREE.MeshStandardMaterial({ color: 0x14171c, roughness: 0.4, metalness: 0.5 })),
    chairMat: res.m(new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.7, metalness: 0.1 })),
  };
  conferenceSetCache.set(res, set);
  return set;
}

interface RackGeometrySet {
  rack: THREE.BufferGeometry;
  dot: THREE.BufferGeometry;
  rackMat: THREE.Material;
  dotMats: THREE.Material[];
}
const rackSetCache = new WeakMap<ResLike, RackGeometrySet>();

function getRackSet(res: ResLike): RackGeometrySet {
  const cached = rackSetCache.get(res);
  if (cached) return cached;
  const rackMat = res.m(new THREE.MeshStandardMaterial({ color: 0x14181f, roughness: 0.5, metalness: 0.6 }));
  applySurface(rackMat, metalSurface(0x14181f), 1.2, 0.8);
  const set: RackGeometrySet = {
    rack: res.g(new THREE.BoxGeometry(0.55, 1.9, 0.6)),
    dot: res.g(new THREE.SphereGeometry(0.02, 6, 6)),
    rackMat,
    dotMats: [0x4ade80, 0xfbbf24, 0x5eead4].map((c) =>
      res.m(new THREE.MeshBasicMaterial({ color: c, toneMapped: false }))
    ),
  };
  rackSetCache.set(res, set);
  return set;
}

export function buildServerRacks(scene: THREE.Scene, res: ResLike, room: RoomDef): void {
  const s = getRackSet(res);
  const count = 3;
  for (let i = 0; i < count; i++) {
    const x = room.center.x - room.size.w / 2 + 0.7 + i * 0.75;
    const z = room.center.z + room.size.d / 2 - 0.5;
    const rack = new THREE.Mesh(s.rack, s.rackMat);
    rack.position.set(x, 0.95, z);
    rack.castShadow = true;
    rack.receiveShadow = true;
    scene.add(rack);

    for (let d = 0; d < 4; d++) {
      const dot = new THREE.Mesh(s.dot, s.dotMats[d % s.dotMats.length]);
      dot.position.set(x - 0.2, 1.5 - d * 0.14, z - 0.31);
      scene.add(dot);
    }
  }
}

/** Central Operations' hero console — a raised podium ringed with small
 * status screens, the "heart of the building" anchor the reference facility
 * calls WS04. */
function buildHeroConsole(scene: THREE.Scene, res: ResLike, opts: { x: number; z: number; rotY: number }): void {
  const baseMat = res.m(new THREE.MeshStandardMaterial({ color: 0x161b22, roughness: 0.4, metalness: 0.5 }));
  applySurface(baseMat, metalSurface(0x161b22), 1.5, 0.7);

  const group = new THREE.Group();
  group.position.set(opts.x, 0, opts.z);
  group.rotation.y = opts.rotY;

  const base = new THREE.Mesh(res.g(new THREE.CylinderGeometry(1.1, 1.3, 0.9, 10)), baseMat);
  base.position.y = 0.45;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  const rim = new THREE.Mesh(res.g(new THREE.TorusGeometry(1.12, 0.04, 8, 24)), res.m(new THREE.MeshBasicMaterial({ color: 0x5ea8c9, toneMapped: false })));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.9;
  group.add(rim);

  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const face = new THREE.Mesh(
      res.g(new THREE.PlaneGeometry(0.4, 0.24)),
      res.m(new THREE.MeshBasicMaterial({ map: res.t(dashboardTexture(res)), toneMapped: false, side: THREE.DoubleSide }))
    );
    face.position.set(Math.sin(a) * 1.05, 0.8, Math.cos(a) * 1.05);
    face.rotation.y = a + Math.PI;
    group.add(face);
  }

  scene.add(group);
}

/** The Quantum Wing's optical bench — a long table with three instrument
 * mounts (Alice / Eve / Bob) linked by a glowing beam line, so the
 * source-intercept-receiver relationship reads spatially before anyone
 * reads a label. */
function buildOpticalBench(
  scene: THREE.Scene,
  res: ResLike,
  opts: { x: number; z: number; length: number; rotY: number }
): void {
  const tableMat = res.m(new THREE.MeshStandardMaterial({ color: 0x1c2229, roughness: 0.35, metalness: 0.6 }));
  applySurface(tableMat, metalSurface(0x1c2229), 1.5, 0.7);
  const legMat = res.m(new THREE.MeshStandardMaterial({ color: 0x14171c, roughness: 0.5, metalness: 0.4 }));
  const mountMat = res.m(new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.3, metalness: 0.7 }));

  const group = new THREE.Group();
  group.position.set(opts.x, 0, opts.z);
  group.rotation.y = opts.rotY;

  const len = Math.max(2, opts.length);
  const top = new THREE.Mesh(res.g(new THREE.BoxGeometry(len, 0.08, 1.0)), tableMat);
  top.position.y = 0.85;
  top.castShadow = true;
  top.receiveShadow = true;
  group.add(top);

  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(res.g(new THREE.BoxGeometry(0.1, 0.85, 0.7)), legMat);
    leg.position.set(side * (len / 2 - 0.15), 0.425, 0);
    leg.castShadow = true;
    group.add(leg);
  }

  const stationColors = [0x5ea8c9, 0xfca5a5, 0x8fd9ff]; // Alice, Eve, Bob
  const positions = [-len * 0.35, 0, len * 0.35];
  positions.forEach((px, i) => {
    const mount = new THREE.Mesh(res.g(new THREE.BoxGeometry(0.22, 0.22, 0.4)), mountMat);
    mount.position.set(px, 1.0, 0);
    mount.castShadow = true;
    group.add(mount);

    const glow = new THREE.Mesh(
      res.g(new THREE.SphereGeometry(0.05, 8, 6)),
      res.m(new THREE.MeshBasicMaterial({ color: stationColors[i], toneMapped: false }))
    );
    glow.position.set(px, 1.14, 0.15);
    group.add(glow);
  });

  const beam = new THREE.Mesh(
    res.g(new THREE.CylinderGeometry(0.015, 0.015, len * 0.75, 8)),
    res.m(new THREE.MeshBasicMaterial({ color: 0x8fd9ff, toneMapped: false }))
  );
  beam.rotation.z = Math.PI / 2;
  beam.position.set(0, 1.0, 0);
  group.add(beam);

  scene.add(group);
}

/** Engineering's hero machine — an industrial assembly/repair block with a
 * jointed arm, distinct from an office desk so the room reads as a
 * workshop rather than another bullpen. */
function buildMachineBlock(scene: THREE.Scene, res: ResLike, opts: { x: number; z: number; rotY: number }): void {
  const bodyMat = res.m(new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.5, metalness: 0.5 }));
  applySurface(bodyMat, metalSurface(0x8a6a3a), 1.2, 0.8);
  const armMat = res.m(new THREE.MeshStandardMaterial({ color: 0x2c2f36, roughness: 0.4, metalness: 0.6 }));

  const group = new THREE.Group();
  group.position.set(opts.x, 0, opts.z);
  group.rotation.y = opts.rotY;

  const body = new THREE.Mesh(res.g(new THREE.BoxGeometry(1.4, 1.1, 1.0)), bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const arm = new THREE.Mesh(res.g(new THREE.CylinderGeometry(0.08, 0.08, 0.9, 8)), armMat);
  arm.position.set(0, 1.35, 0);
  arm.rotation.z = 0.5;
  arm.castShadow = true;
  group.add(arm);

  const indicator = new THREE.Mesh(
    res.g(new THREE.SphereGeometry(0.04, 8, 6)),
    res.m(new THREE.MeshBasicMaterial({ color: 0xfbbf24, toneMapped: false }))
  );
  indicator.position.set(0.5, 1.0, 0.51);
  group.add(indicator);

  scene.add(group);
}

// ------------------------------------------------------------ room wiring

/** A point flush against one interior wall, with `rotY` set so a prop's
 * local +Z (its "front") faces inward, away from that wall. */
function wallSlot(room: RoomDef, edge: 'north' | 'south' | 'east' | 'west', inset: number) {
  const halfW = room.size.w / 2;
  const halfD = room.size.d / 2;
  switch (edge) {
    case 'north':
      return { x: room.center.x, z: room.center.z - halfD + inset, rotY: 0 };
    case 'south':
      return { x: room.center.x, z: room.center.z + halfD - inset, rotY: Math.PI };
    case 'west':
      return { x: room.center.x - halfW + inset, z: room.center.z, rotY: Math.PI / 2 };
    case 'east':
      return { x: room.center.x + halfW - inset, z: room.center.z, rotY: -Math.PI / 2 };
  }
}

/**
 * Dresses one furnished room. The "identity" props (signage, the reception
 * counter + keypad, the conference table) render at every quality tier —
 * dropping them on `balanced` would make the room look broken rather than
 * merely less decorated. `decorate` (the caller passes `profile().fillLights`)
 * gates only the secondary extras, mirroring how sceneWorld.ts already gates
 * scatterProps()/corner bounce lights.
 */
export function buildRoomFurniture(scene: THREE.Scene, res: ResLike, room: RoomDef, decorate: boolean): void {
  const signEdge: 'north' | 'south' | 'east' | 'west' = room.glassFront === 'north' ? 'south' : 'north';
  const sign = wallSlot(room, signEdge, 0.08);
  const label = room.signText ?? room.name;

  switch (room.furniture) {
    case 'reception': {
      buildSignagePanel(scene, res, {
        x: sign.x,
        y: 2.05,
        z: sign.z,
        rotY: sign.rotY,
        text: label,
        accent: 0x5ea8c9,
        ring: true,
      });
      // Shared with quantumHeist.ts's badge-kiosk interactable — this is
      // the single source of truth for where the counter actually sits.
      const counter = receptionCounterSlot(room);
      buildReceptionCounter(scene, res, { x: counter.x, z: counter.z, rotY: counter.rotY });
      if (decorate) {
        buildPottedPlant(scene, res, { x: room.center.x - room.size.w / 2 + 0.7, z: room.center.z - room.size.d / 2 + 0.7 });
        buildPottedPlant(scene, res, { x: room.center.x + room.size.w / 2 - 0.7, z: room.center.z - room.size.d / 2 + 0.7 });
      }
      break;
    }
    case 'bullpen': {
      buildSignagePanel(scene, res, { x: sign.x, y: 2.05, z: sign.z, rotY: sign.rotY, text: label, accent: 0x5ea8c9 });
      const rows = 2;
      const cols = 2;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = room.center.x + (c - (cols - 1) / 2) * (room.size.w / (cols + 0.6));
          const z = room.center.z + (r - (rows - 1) / 2) * (room.size.d / (rows + 0.6));
          buildDeskCluster(scene, res, { x, z, rotY: r === 0 ? 0 : Math.PI });
        }
      }
      if (decorate) {
        buildPottedPlant(scene, res, { x: room.center.x + room.size.w / 2 - 0.6, z: room.center.z + room.size.d / 2 - 0.6 });
      }
      break;
    }
    case 'conference': {
      buildSignagePanel(scene, res, { x: sign.x, y: 2.05, z: sign.z, rotY: sign.rotY, text: label, accent: 0x818cf8 });
      buildConferenceTable(scene, res, {
        x: room.center.x,
        z: room.center.z,
        length: Math.min(room.size.w, room.size.d) * 0.65,
      });
      if (decorate) {
        buildPottedPlant(scene, res, { x: room.center.x - room.size.w / 2 + 0.6, z: room.center.z + room.size.d / 2 - 0.6 });
      }
      break;
    }
    case 'vault': {
      buildSignagePanel(scene, res, { x: sign.x, y: 2.05, z: sign.z, rotY: sign.rotY, text: label, accent: 0xfb7185 });
      buildServerRacks(scene, res, room);
      break;
    }
    case 'central-ops': {
      // The spatial/narrative heart — a hero console ringed by workstations,
      // matching the "Central Operations as the heart of the building" rule.
      buildSignagePanel(scene, res, { x: sign.x, y: 2.15, z: sign.z, rotY: sign.rotY, text: label, accent: 0x5ea8c9, ring: true });
      buildHeroConsole(scene, res, { x: room.center.x, z: room.center.z, rotY: sign.rotY });
      const ringCount = 6;
      const ringRadius = Math.min(room.size.w, room.size.d) * 0.33;
      for (let i = 0; i < ringCount; i++) {
        const a = (i / ringCount) * Math.PI * 2;
        buildDeskCluster(scene, res, {
          x: room.center.x + Math.sin(a) * ringRadius,
          z: room.center.z + Math.cos(a) * ringRadius,
          rotY: a,
        });
      }
      if (decorate) {
        buildPottedPlant(scene, res, { x: room.center.x - room.size.w / 2 + 0.7, z: room.center.z - room.size.d / 2 + 0.7 });
        buildPottedPlant(scene, res, { x: room.center.x + room.size.w / 2 - 0.7, z: room.center.z - room.size.d / 2 + 0.7 });
      }
      break;
    }
    case 'foundations': {
      // Evidence-based training — collaboration tables rather than lecture rows.
      buildSignagePanel(scene, res, { x: sign.x, y: 2.05, z: sign.z, rotY: sign.rotY, text: label, accent: 0x7ea8c4 });
      buildConferenceTable(scene, res, { x: room.center.x - room.size.w * 0.18, z: room.center.z, length: room.size.w * 0.35 });
      buildConferenceTable(scene, res, { x: room.center.x + room.size.w * 0.22, z: room.center.z, length: room.size.w * 0.3 });
      if (decorate) {
        buildPottedPlant(scene, res, { x: room.center.x + room.size.w / 2 - 0.6, z: room.center.z + room.size.d / 2 - 0.6 });
      }
      break;
    }
    case 'crypto': {
      // Symmetric zone (west pair) + asymmetric/trust zone (east pair) —
      // different security concepts get different spatial apparatus.
      buildSignagePanel(scene, res, { x: sign.x, y: 2.05, z: sign.z, rotY: sign.rotY, text: label, accent: 0x5fb0a0 });
      buildDeskCluster(scene, res, { x: room.center.x - room.size.w * 0.22, z: room.center.z - room.size.d * 0.15, rotY: 0 });
      buildDeskCluster(scene, res, { x: room.center.x - room.size.w * 0.22, z: room.center.z + room.size.d * 0.15, rotY: Math.PI });
      buildDeskCluster(scene, res, { x: room.center.x + room.size.w * 0.22, z: room.center.z - room.size.d * 0.15, rotY: 0 });
      buildDeskCluster(scene, res, { x: room.center.x + room.size.w * 0.22, z: room.center.z + room.size.d * 0.15, rotY: Math.PI });
      if (decorate) {
        buildPottedPlant(scene, res, { x: room.center.x, z: room.center.z + room.size.d / 2 - 0.6 });
      }
      break;
    }
    case 'communications': {
      buildSignagePanel(scene, res, { x: sign.x, y: 2.05, z: sign.z, rotY: sign.rotY, text: label, accent: 0x9b8ad0 });
      buildServerRacks(scene, res, room);
      buildDeskCluster(scene, res, { x: room.center.x, z: room.center.z, rotY: sign.rotY + Math.PI });
      break;
    }
    case 'soc': {
      // A central trace/correlation table with an analyst ring around it —
      // investigation, not a decorative monitor wall.
      buildSignagePanel(scene, res, { x: sign.x, y: 2.05, z: sign.z, rotY: sign.rotY, text: label, accent: 0x6b7f94 });
      buildConferenceTable(scene, res, { x: room.center.x, z: room.center.z, length: Math.min(room.size.w, room.size.d) * 0.55 });
      const analystCount = 4;
      for (let i = 0; i < analystCount; i++) {
        const a = (i / analystCount) * Math.PI * 2 + 0.4;
        const r = Math.min(room.size.w, room.size.d) * 0.36;
        buildDeskCluster(scene, res, { x: room.center.x + Math.sin(a) * r, z: room.center.z + Math.cos(a) * r, rotY: a });
      }
      break;
    }
    case 'red-team': {
      // Authorise -> Target/Scope -> Operate stay physically separate:
      // access to the room never visually implies attack authority.
      buildSignagePanel(scene, res, { x: sign.x, y: 2.05, z: sign.z, rotY: sign.rotY, text: label, accent: 0xfca5a5 });
      buildConferenceTable(scene, res, { x: room.center.x + room.size.w * 0.15, z: room.center.z, length: room.size.w * 0.4 });
      buildDeskCluster(scene, res, { x: room.center.x - room.size.w * 0.28, z: room.center.z, rotY: -Math.PI / 2 });
      if (decorate) buildServerRacks(scene, res, room);
      break;
    }
    case 'engineering': {
      buildSignagePanel(scene, res, { x: sign.x, y: 2.05, z: sign.z, rotY: sign.rotY, text: label, accent: 0xd8934a });
      buildMachineBlock(scene, res, { x: room.center.x, z: room.center.z, rotY: 0 });
      buildDeskCluster(scene, res, { x: room.center.x - room.size.w * 0.3, z: room.center.z - room.size.d * 0.25, rotY: Math.PI / 2 });
      buildDeskCluster(scene, res, { x: room.center.x + room.size.w * 0.3, z: room.center.z - room.size.d * 0.25, rotY: -Math.PI / 2 });
      break;
    }
    case 'quantum': {
      // Alice -> optical path -> Eve intercept -> Bob, readable spatially
      // before anyone reads a label.
      buildSignagePanel(scene, res, { x: sign.x, y: 2.05, z: sign.z, rotY: sign.rotY, text: label, accent: 0x8fd9ff, ring: true });
      buildOpticalBench(scene, res, { x: room.center.x, z: room.center.z, length: room.size.w * 0.6, rotY: 0 });
      buildDeskCluster(scene, res, { x: room.center.x - room.size.w * 0.3, z: room.center.z + room.size.d * 0.28, rotY: Math.PI });
      buildDeskCluster(scene, res, { x: room.center.x + room.size.w * 0.3, z: room.center.z + room.size.d * 0.28, rotY: Math.PI });
      break;
    }
    case 'adv-compute': {
      buildSignagePanel(scene, res, { x: sign.x, y: 2.05, z: sign.z, rotY: sign.rotY, text: label, accent: 0x7ea87a });
      buildServerRacks(scene, res, room);
      buildDeskCluster(scene, res, { x: room.center.x, z: room.center.z, rotY: sign.rotY + Math.PI });
      break;
    }
  }
}
