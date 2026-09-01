import * as THREE from 'three';
import { CorridorDef, MapDef, RoomDef, roomContaining } from './sceneMaps';
import { applySurface, groundSurface, metalSurface, wallSurface } from './sceneTextures';
import { profile } from './sceneQuality';
import { VectorSpringSimulator } from './springs';
import { buildRoomFurniture, glassMaterial } from './sceneOfficeProps';
// `Text` must be imported by name, not just referenced — the DOM has its own
// global `Text` (a character-data node) that TypeScript resolves to instead.
import { Text } from 'troika-three-text';
import { createLabel } from './sceneText';

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

export class Res {
  private geoms = new Set<THREE.BufferGeometry>();
  private mats = new Set<THREE.Material>();
  private texs = new Set<THREE.Texture>();
  private misc = new Set<{ dispose(): void }>();

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
  /** Anything else that owns GPU resources and cleans up after itself — a
   * troika `Text`, whose glyph geometry and material are internal and so
   * can't go through `g()`/`m()`. Same lifetime as everything else here. */
  d<T extends { dispose(): void }>(x: T): T {
    this.misc.add(x);
    return x;
  }
  dispose(): void {
    this.geoms.forEach((x) => x.dispose());
    this.mats.forEach((x) => x.dispose());
    this.texs.forEach((x) => x.dispose());
    this.misc.forEach((x) => x.dispose());
    this.geoms.clear();
    this.mats.clear();
    this.texs.clear();
    this.misc.clear();
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

/** Floating room label. SDF glyphs rather than a stretched canvas, with a
 * dark outline so it stays readable against a bright floor; billboarded by
 * the caller so it always faces the camera the way the old sprite did. */
function nameplate(text: string, color: number, res: Res): Text {
  return createLabel(res, {
    text: text.toUpperCase(),
    size: 0.62,
    color,
    letterSpacing: 0.08,
    outline: 0.02,
  });
}

export function createWorld(scene: THREE.Scene, camera: THREE.PerspectiveCamera, map: MapDef): World {
  const res = new Res();
  const p = map.palette;

  scene.background = new THREE.Color(p.air);
  scene.fog = new THREE.FogExp2(p.air, 0.021);

  // The IBL environment now supplies most of the ambient fill, so the
  // hemisphere light is dialled back to a tint rather than a light source.
  // Lifted from 0.32: with the trim glare tamed, the rooms underneath it were
  // revealed to be genuinely underlit — walls were reading near-black and the
  // furniture had nothing to catch. This is the light that keeps a surface
  // facing away from the sun from going to pure shadow.
  scene.add(new THREE.HemisphereLight(p.ambientSky, p.ambientGround, 0.55));

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

  // Soffit tint — darker than the walls so the ceiling reads as underlit
  // rather than a duplicate wall.
  const ceilingColor = new THREE.Color(p.wall).multiplyScalar(0.6).getHex();
  const ceilingMat = res.m(new THREE.MeshStandardMaterial({ color: ceilingColor, roughness: 0.95, metalness: 0.02 }));
  applySurface(ceilingMat, wallMaps, 1.4, 1.1);

  // A plane facing -Y (rotation.x = +PI/2, the opposite of the floor's -PI/2)
  // is only visible to a camera looking *up* at it — the default chase cam
  // sits well above WALL_H looking down and only ever sees this plane's back
  // face, which a FrontSide material never renders, so today's top-down-ish
  // view is unaffected. First-person mode, which looks roughly horizontal/up
  // from inside the room, sees the front face and gets a real ceiling instead
  // of the black void that used to be up there. castShadow stays off so this
  // never blocks the sun from reaching the floor beneath it; the existing
  // per-room practical `lamp` PointLight (already near ceiling height) is
  // what actually lights its underside.
  const addCeiling = (w: number, d: number, x: number, z: number) => {
    const c = new THREE.Mesh(res.g(new THREE.PlaneGeometry(w, d)), ceilingMat);
    c.rotation.x = Math.PI / 2;
    c.position.set(x, WALL_H - 0.01, z);
    c.receiveShadow = true;
    c.castShadow = false;
    scene.add(c);
  };

  const floorFor = (w: number, d: number, color: number) => {
    const mat = res.m(new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0.03 }));
    // Tile by physical size so a big hall and a narrow corridor share a scale.
    applySurface(mat, groundMaps, Math.max(w, d) / 3.2, 1.25);
    res.t(mat.map!);
    res.t(mat.normalMap!);
    res.t(mat.roughnessMap!);
    return mat;
  };

  // ---- floors + ceilings ----
  for (const c of map.corridors) {
    const f = new THREE.Mesh(res.g(new THREE.PlaneGeometry(c.w, c.d)), floorFor(c.w, c.d, 0xbfb4a6));
    f.rotation.x = -Math.PI / 2;
    f.position.set(c.x, 0.002, c.z);
    f.receiveShadow = true;
    scene.add(f);
    addCeiling(c.w, c.d, c.x, c.z);
  }

  for (const room of map.rooms) {
    const mat = floorFor(room.size.w, room.size.d, 0xffffff);

    // "Polished floor" as a material property rather than a true mirror.
    //
    // This started as a real `Reflector`, and it was measured and backed out:
    // a Reflector re-renders the entire scene from the mirrored camera, so it
    // roughly doubles the frame cost of the map it's on — and this game's
    // default camera looks down from above, where a floor mirror mostly
    // reflects the dark ceiling and reads as almost nothing. All of the cost,
    // very little of the look. Dropping roughness and leaning on the IBL
    // environment instead gives polished stone catching the lamps and trim
    // from every angle, including the overhead one, for no extra passes.
    if (room.reflectiveFloor && profile().reflections) {
      mat.roughness = 0.18;
      mat.metalness = 0.42;
      mat.envMapIntensity = 1.8;
    }

    const f = new THREE.Mesh(res.g(new THREE.PlaneGeometry(room.size.w, room.size.d)), mat);
    f.rotation.x = -Math.PI / 2;
    f.position.set(room.center.x, 0, room.center.z);
    f.receiveShadow = true;
    scene.add(f);
    addCeiling(room.size.w, room.size.d, room.center.x, room.center.z);
  }

  // ---- walls with doorways carved where corridors land ----
  // The wall-top trim reads as lit signage, so it carries a modest emissive
  // of its own. It used to get there by being highly metallic instead, which
  // meant a mirror-sharp specular streak off the sun that shot past the bloom
  // threshold and smeared the whole frame in glare — bright, but uncontrolled,
  // and it drowned everything else in the room. A dialled-back metalness plus
  // an explicit emissive puts that brightness where it was wanted, at a level
  // the grade and bloom can actually work with.
  const capMat = res.m(
    new THREE.MeshStandardMaterial({
      color: p.wallTop,
      roughness: 0.62,
      metalness: 0.2,
      emissive: new THREE.Color(p.wallTop),
      emissiveIntensity: 0.35,
    })
  );
  applySurface(capMat, metalSurface(p.wallTop), 3, 1.0);

  const crateMat = res.m(new THREE.MeshStandardMaterial({ color: 0x5a4a36, roughness: 0.82, metalness: 0.08 }));
  applySurface(crateMat, metalSurface(0x5a4a36), 1.5, 0.7);
  const cableMat = res.m(new THREE.MeshStandardMaterial({ color: 0x1a1815, roughness: 0.75, metalness: 0.1 }));
  const mullionMat = res.m(new THREE.MeshStandardMaterial({ color: 0x1c2229, roughness: 0.4, metalness: 0.7 }));
  applySurface(mullionMat, metalSurface(0x1c2229), 1.5, 0.8);
  const glassMat = res.m(glassMaterial(profile().fillLights));

  function buildWalls(room: RoomDef, corridors: CorridorDef[]): void {
    const halfW = room.size.w / 2;
    const halfD = room.size.d / 2;
    const x0 = room.center.x - halfW;
    const x1 = room.center.x + halfW;
    const z0 = room.center.z - halfD;
    const z1 = room.center.z + halfD;
    const touch = 0.9; // how close a corridor must be to count as attached

    // Which edge (of the four place() calls below) the room wants glazed,
    // if any. north = z0 edge, south = z1 edge, west = x0 edge, east = x1 edge
    // — an arbitrary but consistent mapping, not real-world compass direction.
    const place = (sx: number, sz: number, px: number, pz: number, glass = false) => {
      if (glass) {
        const pane = new THREE.Mesh(res.g(new THREE.BoxGeometry(sx, WALL_H - 0.3, sz)), glassMat);
        pane.position.set(px, WALL_H / 2, pz);
        scene.add(pane);

        // Frame: sill, header, and a vertical mullion every ~1.4 units along
        // the pane's long axis so it reads as glazing, not a floating slab.
        const horiz = sx > sz;
        const len = horiz ? sx : sz;
        const frameBar = (bw: number, bh: number, bd: number, by: number) => {
          const bar = new THREE.Mesh(res.g(new THREE.BoxGeometry(bw, bh, bd)), mullionMat);
          bar.position.set(px, by, pz);
          bar.castShadow = true;
          scene.add(bar);
        };
        frameBar(horiz ? sx : WALL_T, 0.12, horiz ? WALL_T : sz, 0.06);
        frameBar(horiz ? sx : WALL_T, 0.12, horiz ? WALL_T : sz, WALL_H - 0.06);
        const bars = Math.max(1, Math.round(len / 1.4) - 1);
        for (let i = 1; i <= bars; i++) {
          const t = i / (bars + 1) - 0.5;
          const mx = horiz ? px + t * sx : px;
          const mz = horiz ? pz : pz + t * sz;
          const mullion = new THREE.Mesh(
            res.g(new THREE.BoxGeometry(horiz ? WALL_T * 0.6 : WALL_T, WALL_H - 0.3, horiz ? WALL_T : WALL_T * 0.6)),
            mullionMat
          );
          mullion.position.set(mx, WALL_H / 2, mz);
          mullion.castShadow = true;
          scene.add(mullion);
        }
      } else {
        const wall = new THREE.Mesh(res.g(new THREE.BoxGeometry(sx, WALL_H, sz)), wallMat);
        wall.position.set(px, WALL_H / 2, pz);
        wall.castShadow = true;
        wall.receiveShadow = true;
        scene.add(wall);
      }

      const cap = new THREE.Mesh(res.g(new THREE.BoxGeometry(sx * 1.02, 0.16, sz * 1.02)), capMat);
      cap.position.set(px, WALL_H + 0.08, pz);
      cap.castShadow = true;
      scene.add(cap);
    };

    // North & south walls run along x; holes come from corridors meeting them.
    for (const [zEdge, dir, side] of [
      [z0, -1, 'north'],
      [z1, 1, 'south'],
    ] as [number, number, RoomDef['glassFront']][]) {
      const holes = corridors
        .filter((c) => Math.abs((dir < 0 ? c.z + c.d / 2 : c.z - c.d / 2) - zEdge) < touch && c.w < c.d + 4)
        .map((c) => [c.x - c.w / 2, c.x + c.w / 2] as [number, number]);
      for (const [a, b] of solidRuns(x0, x1, holes)) {
        place(b - a + WALL_T, WALL_T, (a + b) / 2, zEdge, room.glassFront === side);
      }
    }

    // East & west walls run along z.
    for (const [xEdge, dir, side] of [
      [x0, -1, 'west'],
      [x1, 1, 'east'],
    ] as [number, number, RoomDef['glassFront']][]) {
      const holes = corridors
        .filter((c) => Math.abs((dir < 0 ? c.x + c.w / 2 : c.x - c.w / 2) - xEdge) < touch && c.d < c.w + 4)
        .map((c) => [c.z - c.d / 2, c.z + c.d / 2] as [number, number]);
      for (const [a, b] of solidRuns(z0, z1, holes)) {
        place(WALL_T, b - a + WALL_T, xEdge, (a + b) / 2, room.glassFront === side);
      }
    }
  }

  for (const room of map.rooms) buildWalls(room, map.corridors);

  // ---- room labels + practical lamps ----
  // Every room gets one mandatory practical lamp — fine at any room count
  // tested so far. Corner *bounce* lights are the genuinely optional extra,
  // and were adding without limit: at 11 rooms (this map's canonical size),
  // 22 bounce lights on top of 11 lamps reproducibly crashed the renderer at
  // the default "high" tier — not a slow frame, an actual lost WebGL
  // context — independent of furniture or room size (confirmed by testing
  // both with furniture removed and rooms scaled down; neither helped, and
  // dropping to "balanced" tier, which is the one place fillLights is
  // already off, was the only thing that survived). A hard cap on how many
  // *bounce* lights a single map may add keeps every existing smaller map's
  // lighting completely unaffected — they never come close to this ceiling —
  // while keeping a large map's total real-time light count in the range
  // this renderer has actually been proven to handle.
  // SDF labels are real meshes, not sprites — they need orienting toward the
  // camera every frame to keep the sprite behaviour they replaced.
  const billboards: Text[] = [];

  let bounceLightBudget = 16;
  for (const room of map.rooms) {
    // Furnished rooms get a wall-mounted signage panel (see buildRoomFurniture
    // below) instead of the plain floating nameplate sprite.
    if (!room.furniture) {
      const label = nameplate(room.name, room.color, res);
      label.position.set(room.center.x, 3.7, room.center.z);
      billboards.push(label);
      scene.add(label);
    }

    // One lamp intensity for every room only works if every room is the same
    // size. These aren't: HQ's Central Operations spans 18 where Relay's bays
    // span 8, and with physically-correct (decay 2) falloff the light reaching
    // a wall drops with the square of the distance — so the big rooms were
    // arriving at roughly a fifth of the wall brightness the small ones got,
    // which is why their walls read as black slabs. Scaling by the square of
    // the room's half-span holds wall illuminance roughly constant across
    // sizes; an 8-unit room lands on exactly the old value, so the four
    // original maps are unchanged.
    const halfSpan = Math.max(room.size.w, room.size.d) / 2;
    const sizeScale = Math.min(6, (halfSpan / 4) ** 2);
    const lamp = new THREE.PointLight(
      p.lamp,
      p.lampIntensity * 0.8 * sizeScale,
      Math.max(room.size.w, room.size.d) * 1.7,
      2
    );
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

    // Corner bounce lights — expensive, so only above the balanced tier,
    // and capped globally (see bounceLightBudget above) regardless of tier.
    if (profile().fillLights) {
      for (const [sx, sz] of [
        [-1, -1],
        [1, 1],
      ] as [number, number][]) {
        if (bounceLightBudget <= 0) break;
        bounceLightBudget--;
        // Same size scaling as the main practical above, for the same reason.
        const fill = new THREE.PointLight(
          p.lamp,
          p.lampIntensity * 0.22 * sizeScale,
          Math.max(room.size.w, room.size.d),
          2
        );
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

    // Office dressing (desks, reception counter, conference table, signage) —
    // the "identity" pieces render at every tier so a furnished room never
    // looks broken on `balanced`; only the secondary decorative extras inside
    // buildRoomFurniture are gated on fillLights.
    if (room.furniture) {
      buildRoomFurniture(scene, res, room, profile().fillLights);
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

      for (const b of billboards) b.quaternion.copy(camera.quaternion);

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

      // Per-room camera framing: pull back for a big room (Central Ops
      // spans 18), pull in tighter for a small one (Reception spans 8) —
      // the same idea as a per-room camera profile, but computed from each
      // room's own footprint instead of hand-authored per room, so every
      // map benefits automatically and a differently-sized new room never
      // needs a manual camera entry. 14 is the span most existing rooms
      // already use, i.e. camScale ≈ 1 for them — this is a refinement of
      // the existing framing, not a departure from it.
      const room = roomContaining(map, playerPos.x, playerPos.z);
      const roomSpan = room ? Math.max(room.size.w, room.size.d) : 14;
      const camScale = THREE.MathUtils.clamp(roomSpan / 14, 0.72, 1.55);

      const desired = new THREE.Vector3(anchorX * 0.6, 13.5 * camScale, anchorZ + 10 * camScale);
      camera.position.lerp(desired, Math.min(dt * 3.2, 1));
      camera.lookAt(anchorX * 0.6, 0.8, anchorZ + 0.5);
    },

    dispose() {
      res.dispose();
    },
  };
}
