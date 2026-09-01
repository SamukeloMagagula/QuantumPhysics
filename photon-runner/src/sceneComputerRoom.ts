import * as THREE from 'three';
import { Game, GameEngine } from './GameEngine';
import { Humanoid, createHumanoid } from './sceneCharacter';
import { getAppearance } from './characterAppearance';
import { Res } from './sceneWorld';
import { buildDeskCluster, buildPottedPlant, buildServerRacks } from './sceneOfficeProps';
import { applySurface, groundSurface, metalSurface, wallSurface } from './sceneTextures';
import { createLabel } from './sceneText';
import { interactionRegistry } from './engine/Interaction';
import { gameState } from './engine/GameState';
import { profile } from './sceneQuality';
import { VectorSpringSimulator } from './springs';

/**
 * The QKD facility: three isolated rooms off a corridor, laid out as the
 * protocol itself.
 *
 * Alice transmits from one end, Bob receives at the other, and Eve's tap
 * closet hangs off the middle of the fibre run between them — so walking the
 * building teaches the topology before a line of the protocol is explained.
 * The fibre is a real object overhead the whole way, with light pulses
 * running along it and a splice dropping into Eve's closet.
 *
 * Each room owns one stage of the loop:
 *   Eve   -> the attack console (run the hack)
 *   Bob   -> forensics (read the evidence, name the eavesdropper)
 *   Alice -> the hardware bench (fix what the attacks exploit)
 *
 * Art direction here is deliberate rather than incidental: each room has its
 * own colour temperature and materials, walls carry skirting, an accent band
 * and a cornice instead of being flat slabs, and ceilings are beams plus a
 * recessed light panel rather than one grey plane. Untextured boxes under
 * even ambient light is precisely what makes a 3D scene look unfinished.
 */

const WALL_H = 3.5;
const WALK_SPEED = 3.6;
const SPRINT_SPEED = 5.8;


/** Desk-local landmarks, matching buildDeskCluster's own layout. */
const SEAT_LOCAL_Z = 0.55;
const MONITOR_LOCAL_Z = -0.18;
export const APPROACH_LOCAL_Z = 1.5;

/** Interaction range on every station seat. */
export const SEAT_RANGE = 3.2;

export type StationKind = 'attack' | 'forensics' | 'hardware';

export const BODY_RADIUS = 0.42;

const STATION_TITLES: Record<StationKind, string> = {
  attack: 'ATTACK CONSOLE',
  forensics: 'FORENSICS',
  hardware: 'HARDWARE BENCH',
};

interface RoomDef {
  id: 'alice' | 'bob' | 'eve';
  title: string;
  subtitle: string;
  kind: StationKind;
  center: { x: number; z: number };
  size: { w: number; d: number };
  /** Drives practicals, accent band, signage and screen glow — the strongest
   * single cue that these are three different places. */
  accent: number;
  wall: number;
  floor: number;
  desk: { x: number; z: number; rotY: number };
}

export const ROOMS: RoomDef[] = [
  {
    id: 'alice',
    title: 'Alice',
    subtitle: 'Transmitter · hardware bench',
    kind: 'hardware',
    center: { x: -15, z: 0 },
    size: { w: 13, d: 11 },
    accent: 0xffa94d, // warm amber — the source end
    wall: 0x40382f,
    floor: 0x8a7f6d,
    desk: { x: -15, z: -1, rotY: 0 }, // approach lands on the corridor axis
  },
  {
    id: 'bob',
    title: 'Bob',
    subtitle: 'Receiver · forensics',
    kind: 'forensics',
    center: { x: 15, z: 0 },
    size: { w: 13, d: 11 },
    accent: 0x5ec8e8, // cool cyan — the detector end
    wall: 0x2e3a42,
    floor: 0x77828a,
    desk: { x: 15, z: -1, rotY: 0 },
  },
  {
    id: 'eve',
    title: 'Eve',
    subtitle: 'Line tap · attack console',
    kind: 'attack',
    center: { x: 0, z: 13 },
    size: { w: 10, d: 8 },
    accent: 0xf2545b, // red — the intrusion
    wall: 0x33272b,
    floor: 0x6b5a5c,
    desk: { x: 0, z: 14.6, rotY: 0 },
  },
];

/** Corridors as plain rectangles: the main run carries the fibre, the spur
 * drops south into Eve's closet.
 *
 * Both deliberately overrun the rooms they meet. `collides()` pads each
 * rectangle by the body radius independently, so two shapes that merely
 * touch leave a dead band 2*BODY_PAD wide that belongs to neither and the
 * player cannot cross — the doorway looks open and is impassable. The main
 * run reaches x=+-10 against room edges at +-8.5, and the spur starts at
 * z=0 against a main run that ends at z=2.25, so every junction overlaps by
 * well over 2*BODY_PAD. */
export const CORRIDORS = [
  { x: 0, z: 0, w: 20, d: 4.5 },
  { x: 0, z: 5.6, w: 4.5, d: 11.2 },
];

const FIBRE_Y = 2.95;

interface Station {
  room: RoomDef;
  labels: THREE.Object3D[];
}

function localToWorld(d: RoomDef['desk'], lx: number, lz: number): { x: number; z: number } {
  const c = Math.cos(d.rotY);
  const s = Math.sin(d.rotY);
  return { x: d.x + lx * c + lz * s, z: d.z - lx * s + lz * c };
}

const inRect = (x: number, z: number, r: { x: number; z: number; w: number; d: number }, pad: number) =>
  Math.abs(x - r.x) <= r.w / 2 - pad && Math.abs(z - r.z) <= r.d / 2 - pad;

/** Can a body of `pad` radius stand here? Rooms and corridors are padded
 * independently, so two rectangles that merely touch leave a dead band
 * neither covers — see the CORRIDORS comment. Exported so the layout's
 * connectivity is unit-tested rather than discovered by walking into a wall. */
export function isWalkableAt(x: number, z: number, pad = BODY_RADIUS): boolean {
  const inside =
    ROOMS.some((r) => inRect(x, z, { x: r.center.x, z: r.center.z, w: r.size.w, d: r.size.d }, pad)) ||
    CORRIDORS.some((c) => inRect(x, z, c, pad));
  if (!inside) return false;
  for (const r of ROOMS) {
    if (Math.abs(x - r.desk.x) < 1.1 + pad && Math.abs(z - r.desk.z) < 0.75 + pad) return false;
  }
  return true;
}

/** Where the player must stand to be offered a given room's seat. */
export function approachPoint(room: RoomDef): { x: number; z: number } {
  return localToWorld(room.desk, 0, APPROACH_LOCAL_Z);
}

export interface FacilityOptions {
  /** Fired when the player sits at a station, with the stage it opens. */
  onSit: (kind: StationKind, roomId: string) => void;
  onStand: () => void;
  onPromptChange: (label: string | null) => void;
}

export interface FacilityGame extends Game {
  standUp(): void;
  isSeated(): boolean;
}

export function createComputerRoom(opts: FacilityOptions): FacilityGame {
  let res: Res | null = null;
  let humanoid: Humanoid | null = null;
  let camera: THREE.PerspectiveCamera | null = null;
  let clock = 0;

  const stations: Station[] = ROOMS.map((room) => ({ room, labels: [] }));
  let pulses: THREE.Mesh[] = [];

  const playerPos = new THREE.Vector3(0, 0, 0);
  let facing = 0;
  let moveX = 0;
  let moveZ = 0;
  let sprinting = false;
  let lastPromptId: string | null = null;
  let seated: RoomDef | null = null;
  /** The camera starts at the engine origin; lerping from there is a visible
   * fly-in, so the first frame snaps and the rest ease. */
  let camPlaced = false;

  const lookAhead = new VectorSpringSimulator(0.35, 3.4);
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();

  const collides = (x: number, z: number): boolean => !isWalkableAt(x, z);

  // ---------------------------------------------------------------- build

  /** A wall plus skirting, an accent band and a cornice. Three bands rather
   * than one flat slab is the cheapest thing that reads as designed. */
  function buildWall(
    scene: THREE.Scene,
    r: Res,
    mats: { wall: THREE.Material; trim: THREE.Material; accent: THREE.Material },
    w: number,
    d: number,
    x: number,
    z: number
  ): void {
    const wall = new THREE.Mesh(r.g(new THREE.BoxGeometry(w, WALL_H, d)), mats.wall);
    wall.position.set(x, WALL_H / 2, z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    scene.add(wall);

    const horizontal = w > d;
    const along = horizontal ? w : d;
    const thin = (horizontal ? d : w) + 0.06;
    const bandGeo = (h: number) =>
      r.g(horizontal ? new THREE.BoxGeometry(along, h, thin) : new THREE.BoxGeometry(thin, h, along));

    const skirting = new THREE.Mesh(bandGeo(0.16), mats.trim);
    skirting.position.set(x, 0.08, z);
    scene.add(skirting);

    const band = new THREE.Mesh(bandGeo(0.05), mats.accent);
    band.position.set(x, 1.25, z);
    scene.add(band);

    const cornice = new THREE.Mesh(bandGeo(0.12), mats.trim);
    cornice.position.set(x, WALL_H - 0.1, z);
    scene.add(cornice);
  }

  function buildRoomShell(scene: THREE.Scene, r: Res, room: RoomDef): void {
    const q = profile();
    const { w, d } = room.size;
    const { x: cx, z: cz } = room.center;

    const floorMat = r.m(new THREE.MeshStandardMaterial({ color: room.floor, roughness: 0.58, metalness: 0.1 }));
    applySurface(floorMat, groundSurface(room.floor, room.wall), 5, 1);
    const floor = new THREE.Mesh(r.g(new THREE.PlaneGeometry(w, d)), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0, cz);
    floor.receiveShadow = true;
    scene.add(floor);

    const wallMat = r.m(new THREE.MeshStandardMaterial({ color: room.wall, roughness: 0.82, metalness: 0.08 }));
    applySurface(wallMat, wallSurface(room.wall), 2.4, 1);
    const trimMat = r.m(new THREE.MeshStandardMaterial({ color: 0x14171b, roughness: 0.5, metalness: 0.35 }));
    const accentMat = r.m(
      new THREE.MeshStandardMaterial({
        color: room.accent,
        emissive: new THREE.Color(room.accent),
        emissiveIntensity: 0.6,
        roughness: 0.4,
      })
    );
    const mats = { wall: wallMat, trim: trimMat, accent: accentMat };

    // Walls, leaving a gap on whichever side the corridor arrives from.
    const t = 0.32;
    const doorway = 4.6;
    const openSouth = cz < 6; // Alice and Bob open onto the main run
    const openNorth = room.id === 'eve'; // Eve's closet opens back up the spur
    const openEast = room.id === 'alice';
    const openWest = room.id === 'bob';

    // north / south walls
    for (const [sz, isOpen] of [
      [-1, openNorth],
      [1, openSouth && room.id === 'eve'],
    ] as [number, boolean][]) {
      const zPos = cz + sz * (d / 2);
      if (!isOpen) {
        buildWall(scene, r, mats, w + t, t, cx, zPos);
      } else {
        const half = (w + t - doorway) / 2;
        buildWall(scene, r, mats, half, t, cx - doorway / 2 - half / 2, zPos);
        buildWall(scene, r, mats, half, t, cx + doorway / 2 + half / 2, zPos);
      }
    }
    if (room.id !== 'eve') {
      buildWall(scene, r, mats, w + t, t, cx, cz + d / 2);
    }

    // east / west walls
    for (const [sx, isOpen] of [
      [-1, openWest],
      [1, openEast],
    ] as [number, boolean][]) {
      const xPos = cx + sx * (w / 2);
      if (!isOpen) {
        buildWall(scene, r, mats, t, d + t, xPos, cz);
      } else {
        const half = (d + t - doorway) / 2;
        buildWall(scene, r, mats, t, half, xPos, cz - doorway / 2 - half / 2);
        buildWall(scene, r, mats, t, half, xPos, cz + doorway / 2 + half / 2);
      }
    }

    // Ceiling: dark plane, then beams and a recessed emissive panel. Far more
    // convincing than one flat surface, for three extra boxes.
    const ceilMat = r.m(new THREE.MeshStandardMaterial({ color: 0x1a1e23, roughness: 0.92 }));
    const ceiling = new THREE.Mesh(r.g(new THREE.PlaneGeometry(w, d)), ceilMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(cx, WALL_H - 0.01, cz);
    ceiling.castShadow = false;
    ceiling.receiveShadow = true;
    scene.add(ceiling);

    const beamMat = r.m(new THREE.MeshStandardMaterial({ color: 0x23272d, roughness: 0.55, metalness: 0.45 }));
    applySurface(beamMat, metalSurface(0x23272d), 2, 0.8);
    for (const bz of [-d / 4, d / 4]) {
      const beam = new THREE.Mesh(r.g(new THREE.BoxGeometry(w, 0.18, 0.3)), beamMat);
      beam.position.set(cx, WALL_H - 0.18, cz + bz);
      scene.add(beam);
    }

    const panelMat = r.m(new THREE.MeshBasicMaterial({ color: 0xeef6ff, toneMapped: false }));
    const panel = new THREE.Mesh(r.g(new THREE.BoxGeometry(w * 0.45, 0.06, 0.5)), panelMat);
    panel.position.set(cx, WALL_H - 0.15, cz);
    scene.add(panel);

    // Practicals in the room's own colour — what stops every space reading
    // as the same grey box.
    // Two lights per room, no more. Three.js forward-renders every light in
    // every material shader, so light count multiplies fragment cost across
    // the whole scene — four per room plus corridors put this facility at
    // ~16 and tanked the frame rate. One bright practical carries the room;
    // one accent wash carries its identity. Reach is what matters more than
    // count: at decay 2 the intensity has to be high enough to still be
    // doing something at the far wall.
    const main = new THREE.PointLight(0xf2f6ff, 46, Math.max(w, d) * 2.2, 2);
    main.position.set(cx, WALL_H - 0.55, cz);
    scene.add(main);

    const tint = new THREE.PointLight(room.accent, 20, Math.max(w, d) * 1.3, 2);
    tint.position.set(cx, 1.9, cz - d / 2 + 1.4);
    scene.add(tint);

    if (q.fillLights) {
      buildPottedPlant(scene, r, { x: cx - w / 2 + 1, z: cz + d / 2 - 1.2 });
    }

    // Cable tray and wall cabinets — the clutter that makes a room look used
    // rather than modelled.
    const trayMat = r.m(new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.48, metalness: 0.58 }));
    applySurface(trayMat, metalSurface(0x3a3f46), 2, 0.8);
    const tray = new THREE.Mesh(r.g(new THREE.BoxGeometry(w - 1.4, 0.14, 0.34)), trayMat);
    tray.position.set(cx, WALL_H - 0.78, cz - d / 2 + 0.4);
    scene.add(tray);

    for (const sx of [-1, 1]) {
      const cabinet = new THREE.Mesh(r.g(new THREE.BoxGeometry(1.1, 1.5, 0.5)), trayMat);
      cabinet.position.set(cx + sx * (w / 2 - 1.1), 0.75, cz - d / 2 + 0.5);
      cabinet.castShadow = true;
      cabinet.receiveShadow = true;
      scene.add(cabinet);
    }

    // Signage, lit in the room's accent.
    const sign = createLabel(r, {
      text: room.title.toUpperCase(),
      size: 0.44,
      color: room.accent,
      letterSpacing: 0.16,
      outline: 0.014,
    });
    sign.position.set(cx, 2.4, cz - d / 2 + 0.24);
    scene.add(sign);

    const sub = createLabel(r, {
      text: room.subtitle,
      size: 0.15,
      color: 0xbcc8d4,
      letterSpacing: 0.05,
    });
    sub.position.set(cx, 2.05, cz - d / 2 + 0.24);
    scene.add(sub);
  }

  function buildCorridors(scene: THREE.Scene, r: Res): void {
    const floorMat = r.m(new THREE.MeshStandardMaterial({ color: 0x5d636b, roughness: 0.6, metalness: 0.12 }));
    applySurface(floorMat, groundSurface(0x5d636b, 0x4a4f56), 4, 1);
    const ceilMat = r.m(new THREE.MeshStandardMaterial({ color: 0x181c21, roughness: 0.92 }));
    const wallMat = r.m(new THREE.MeshStandardMaterial({ color: 0x2b3037, roughness: 0.84, metalness: 0.08 }));
    applySurface(wallMat, wallSurface(0x2b3037), 2.4, 1);
    const trimMat = r.m(new THREE.MeshStandardMaterial({ color: 0x14171b, roughness: 0.5, metalness: 0.35 }));
    const guideMat = r.m(new THREE.MeshBasicMaterial({ color: 0x7fd8ff, toneMapped: false }));

    for (const c of CORRIDORS) {
      const floor = new THREE.Mesh(r.g(new THREE.PlaneGeometry(c.w, c.d)), floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(c.x, 0, c.z);
      floor.receiveShadow = true;
      scene.add(floor);

      const ceiling = new THREE.Mesh(r.g(new THREE.PlaneGeometry(c.w, c.d)), ceilMat);
      ceiling.rotation.x = Math.PI / 2;
      ceiling.position.set(c.x, WALL_H - 0.01, c.z);
      ceiling.castShadow = false;
      scene.add(ceiling);

      // A lit guide strip down the floor — leads the eye between rooms and
      // does more for legibility than signage would.
      const horizontal = c.w > c.d;
      const strip = new THREE.Mesh(
        r.g(horizontal ? new THREE.PlaneGeometry(c.w - 0.6, 0.16) : new THREE.PlaneGeometry(0.16, c.d - 0.6)),
        guideMat
      );
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(c.x, 0.014, c.z);
      scene.add(strip);

      const t = 0.3;
      if (horizontal) {
        for (const sz of [-1, 1]) {
          const seg = new THREE.Mesh(r.g(new THREE.BoxGeometry(c.w, WALL_H, t)), wallMat);
          seg.position.set(c.x, WALL_H / 2, c.z + sz * (c.d / 2));
          seg.castShadow = true;
          seg.receiveShadow = true;
          scene.add(seg);
          const skirt = new THREE.Mesh(r.g(new THREE.BoxGeometry(c.w, 0.16, t + 0.06)), trimMat);
          skirt.position.set(c.x, 0.08, c.z + sz * (c.d / 2));
          scene.add(skirt);
        }
      } else {
        for (const sx of [-1, 1]) {
          const seg = new THREE.Mesh(r.g(new THREE.BoxGeometry(t, WALL_H, c.d)), wallMat);
          seg.position.set(c.x + sx * (c.w / 2), WALL_H / 2, c.z);
          seg.castShadow = true;
          seg.receiveShadow = true;
          scene.add(seg);
        }
      }

      const lamp = new THREE.PointLight(0xdce8f5, 12, 14, 2);
      lamp.position.set(c.x, WALL_H - 0.5, c.z);
      scene.add(lamp);
    }
  }

  /** The fibre run: Alice -> Bob overhead, with a splice dropping into Eve's
   * closet. Pulses travel it continuously, so the channel is something you
   * can watch rather than an abstraction in a menu. */
  function buildFibre(scene: THREE.Scene, r: Res): void {
    const conduitMat = r.m(new THREE.MeshStandardMaterial({ color: 0x2f353c, roughness: 0.42, metalness: 0.7 }));
    applySurface(conduitMat, metalSurface(0x2f353c), 3, 0.8);

    const span = 30;
    const conduit = new THREE.Mesh(r.g(new THREE.CylinderGeometry(0.07, 0.07, span, 10)), conduitMat);
    conduit.rotation.z = Math.PI / 2;
    conduit.position.set(0, FIBRE_Y, 0);
    scene.add(conduit);

    for (let x = -13; x <= 13; x += 4.5) {
      const hanger = new THREE.Mesh(r.g(new THREE.BoxGeometry(0.06, 0.5, 0.06)), conduitMat);
      hanger.position.set(x, FIBRE_Y + 0.28, 0);
      scene.add(hanger);
    }

    // The tap: a splice box on the run, with a drop line into Eve's closet.
    const tapMat = r.m(
      new THREE.MeshStandardMaterial({ color: 0xf2545b, emissive: 0xf2545b, emissiveIntensity: 0.8, roughness: 0.4 })
    );
    const splice = new THREE.Mesh(r.g(new THREE.BoxGeometry(0.5, 0.3, 0.3)), tapMat);
    splice.position.set(0, FIBRE_Y, 0);
    scene.add(splice);

    const drop = new THREE.Mesh(r.g(new THREE.CylinderGeometry(0.045, 0.045, 13, 8)), conduitMat);
    drop.rotation.x = Math.PI / 2;
    drop.position.set(0, FIBRE_Y - 0.12, 6.5);
    scene.add(drop);

    const pulseMat = r.m(new THREE.MeshBasicMaterial({ color: 0x9fe8ff, toneMapped: false }));
    pulses = [];
    for (let i = 0; i < 7; i++) {
      const p = new THREE.Mesh(r.g(new THREE.SphereGeometry(0.075, 10, 8)), pulseMat);
      p.position.set(-15, FIBRE_Y, 0);
      scene.add(p);
      pulses.push(p);
    }
  }

  function buildStation(scene: THREE.Scene, r: Res, st: Station): void {
    const room = st.room;
    buildDeskCluster(scene, r, room.desk);

    const mon = localToWorld(room.desk, 0, MONITOR_LOCAL_Z);
    const screenMat = r.m(
      new THREE.MeshBasicMaterial({ color: new THREE.Color(room.accent).multiplyScalar(0.4), toneMapped: false })
    );
    const glow = new THREE.Mesh(r.g(new THREE.PlaneGeometry(0.62, 0.36)), screenMat);
    glow.position.set(mon.x, 1.0, mon.z);
    glow.rotation.y = room.desk.rotY;
    scene.add(glow);

    const name = createLabel(r, {
      text: STATION_TITLES[room.kind],
      size: 0.13,
      color: room.accent,
      maxWidth: 2.4,
      outline: 0.012,
    });
    name.position.set(mon.x, 1.6, mon.z);
    name.rotation.y = room.desk.rotY;
    scene.add(name);

    const hint = createLabel(r, { text: 'press E to sit', size: 0.08, color: 0x9fb1c4, maxWidth: 2.4 });
    hint.position.set(mon.x, 1.44, mon.z);
    hint.rotation.y = room.desk.rotY;
    scene.add(hint);

    st.labels = [name, hint];

    // Alice gets the optical bench she's named for; Bob gets detector racks.
    // Same prop budget, a different story per room.
    if (room.kind === 'hardware') {
      const benchMat = r.m(new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.34, metalness: 0.72 }));
      applySurface(benchMat, metalSurface(0x2a2f36), 2, 0.8);
      const bench = new THREE.Mesh(r.g(new THREE.BoxGeometry(5.2, 0.16, 1.2)), benchMat);
      bench.position.set(room.center.x, 0.92, room.center.z - 2.8);
      bench.castShadow = true;
      bench.receiveShadow = true;
      scene.add(bench);
      for (const lx of [-2.4, 2.4]) {
        const leg = new THREE.Mesh(r.g(new THREE.BoxGeometry(0.16, 0.92, 1.0)), benchMat);
        leg.position.set(room.center.x + lx, 0.46, room.center.z - 2.8);
        scene.add(leg);
      }
      const optMat = r.m(new THREE.MeshStandardMaterial({ color: 0x8f979f, roughness: 0.28, metalness: 0.88 }));
      const emitMat = r.m(
        new THREE.MeshStandardMaterial({ color: room.accent, emissive: room.accent, emissiveIntensity: 1.5, roughness: 0.3 })
      );
      for (let i = 0; i < 4; i++) {
        const post = new THREE.Mesh(r.g(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 10)), optMat);
        post.position.set(room.center.x - 1.8 + i * 1.2, 1.15, room.center.z - 2.8);
        scene.add(post);
        const cell = new THREE.Mesh(r.g(new THREE.BoxGeometry(0.22, 0.26, 0.06)), i === 0 ? emitMat : optMat);
        cell.position.set(room.center.x - 1.8 + i * 1.2, 1.38, room.center.z - 2.8);
        scene.add(cell);
      }
    } else if (room.kind === 'forensics') {
      buildServerRacks(scene, r, {
        id: `${room.id}-rack`,
        name: 'Detectors',
        color: room.accent,
        center: { x: room.center.x, z: room.center.z - 3.4 },
        size: { w: 6, d: 1.6 },
      });
    }
  }

  function sit(room: RoomDef): void {
    seated = room;
    const seat = localToWorld(room.desk, 0, SEAT_LOCAL_Z);
    playerPos.set(seat.x, 0, seat.z);
    facing = room.desk.rotY + Math.PI;
    humanoid?.setWalking(false);
    humanoid?.setSprinting(false);
    humanoid?.setSeated(true);
    humanoid?.faceDirection(facing);
    humanoid?.group.position.set(playerPos.x, 0, playerPos.z);
    const st = stations.find((s) => s.room.id === room.id);
    for (const l of st?.labels ?? []) l.visible = false;
    gameState.set('EXPERIMENT');
    opts.onPromptChange(null);
    lastPromptId = null;
    opts.onSit(room.kind, room.id);
  }

  return {
    id: 'qkd-facility',
    title: 'QKD Facility',

    init(engine: GameEngine) {
      const scene = engine.scene;
      camera = engine.camera;
      res = new Res();

      scene.background = new THREE.Color(0x090c10);
      scene.fog = new THREE.FogExp2(0x090c10, 0.016);

      // A cool ambient base under a warm key gives the facility a colour axis
      // to sit on; flat white ambient is exactly what reads as "grey".
      scene.add(new THREE.HemisphereLight(0x8fa8c4, 0x1b1f24, 0.5));
      const key = new THREE.DirectionalLight(0xfff1dd, 1.4);
      key.position.set(10, 16, 9);
      key.castShadow = true;
      const q = profile();
      key.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
      key.shadow.camera.left = -30;
      key.shadow.camera.right = 30;
      key.shadow.camera.top = 30;
      key.shadow.camera.bottom = -30;
      key.shadow.camera.far = 70;
      key.shadow.bias = -0.0008;
      key.shadow.normalBias = 0.03;
      scene.add(key);

      buildCorridors(scene, res);
      for (const room of ROOMS) buildRoomShell(scene, res, room);
      buildFibre(scene, res);
      for (const st of stations) buildStation(scene, res, st);

      humanoid = createHumanoid(0x5ea8c9, { appearance: getAppearance() });
      humanoid.group.position.copy(playerPos);
      humanoid.faceDirection(facing);
      scene.add(humanoid.group);

      gameState.set('EXPLORATION');

      for (const room of ROOMS) {
        const approach = approachPoint(room);
        interactionRegistry.register({
          id: `seat-${room.id}`,
          name: room.title,
          description: room.subtitle,
          prompt: `Sit at ${room.title}'s ${STATION_TITLES[room.kind].toLowerCase()}`,
          position: approach,
          range: SEAT_RANGE,
          priority: 1,
          canInteract: () => seated === null,
          onInteract: () => sit(room),
        });
      }
    },

    update(dt: number) {
      if (!humanoid || !camera) return;
      clock += dt;

      // Pulses running Alice -> Bob along the fibre.
      pulses.forEach((p, i) => {
        const t = (clock * 0.28 + i / pulses.length) % 1;
        p.position.x = -15 + t * 30;
      });

      if (seated) {
        const d = seated.desk;
        const eye = localToWorld(d, 0, 2.15);
        const look = localToWorld(d, 0, MONITOR_LOCAL_Z);
        camPos.set(eye.x, 1.75, eye.z);
        camLook.set(look.x, 1.15, look.z);
        if (camPlaced) camera.position.lerp(camPos, Math.min(dt * 4, 1));
        else camera.position.copy(camPos);
        camPlaced = true;
        camera.lookAt(camLook);
        humanoid.update(dt);
        return;
      }

      const len = Math.hypot(moveX, moveZ);
      const moving = len > 0.001;
      if (moving) {
        const nx = moveX / len;
        const nz = moveZ / len;
        // 'w' maps to z += 1 (see keyboardMovement.ts), but the chase camera
        // sits at +z looking toward -z, so forward on screen is -z.
        facing = Math.atan2(nx, -nz);
        const speed = sprinting ? SPRINT_SPEED : WALK_SPEED;
        const stepX = nx * speed * dt;
        const stepZ = -nz * speed * dt;
        if (!collides(playerPos.x + stepX, playerPos.z + stepZ)) {
          playerPos.x += stepX;
          playerPos.z += stepZ;
        } else if (!collides(playerPos.x + stepX, playerPos.z)) {
          playerPos.x += stepX;
        } else if (!collides(playerPos.x, playerPos.z + stepZ)) {
          playerPos.z += stepZ;
        }
      }

      humanoid.setWalking(moving);
      humanoid.setSprinting(moving && sprinting);
      humanoid.faceDirection(facing);
      humanoid.group.position.set(playerPos.x, 0, playerPos.z);
      humanoid.update(dt);

      lookAhead.target.set(Math.sin(facing) * (moving ? 1.2 : 0), Math.cos(facing) * (moving ? 1.2 : 0));
      lookAhead.advance(dt);
      const ax = playerPos.x + lookAhead.position.x;
      const az = playerPos.z + lookAhead.position.y;
      camPos.set(ax * 0.85, 11, az + 8.5);
      if (camPlaced) camera.position.lerp(camPos, Math.min(dt * 3.2, 1));
      else camera.position.copy(camPos);
      camPlaced = true;
      camera.lookAt(ax * 0.85, 0.9, az + 0.2);

      const nearest = interactionRegistry.nearestAvailable(
        { x: playerPos.x, z: playerPos.z },
        { actorId: 'player' },
        facing
      );
      const id = nearest?.id ?? null;
      if (id !== lastPromptId) {
        lastPromptId = id;
        opts.onPromptChange(nearest ? nearest.prompt : null);
      }
    },

    setMoveVector(x: number, z: number, sprint = false) {
      if (seated) return;
      moveX = x;
      moveZ = z;
      sprinting = sprint;
    },

    interact() {
      if (seated) return;
      const nearest = interactionRegistry.nearestAvailable(
        { x: playerPos.x, z: playerPos.z },
        { actorId: 'player' },
        facing
      );
      if (!nearest) return;
      interactionRegistry.interact(nearest.id, { x: playerPos.x, z: playerPos.z }, { actorId: 'player' });
    },

    standUp() {
      if (!seated) return;
      const room = seated;
      seated = null;
      moveX = 0;
      moveZ = 0;
      const out = localToWorld(room.desk, 0, APPROACH_LOCAL_Z + 0.4);
      playerPos.set(out.x, 0, out.z);
      humanoid?.setSeated(false);
      const st = stations.find((s) => s.room.id === room.id);
      for (const l of st?.labels ?? []) l.visible = true;
      facing = room.desk.rotY;
      humanoid?.faceDirection(facing);
      humanoid?.group.position.set(playerPos.x, 0, playerPos.z);
      gameState.set('EXPLORATION');
      opts.onStand();
    },

    isSeated() {
      return seated !== null;
    },

    dispose() {
      for (const room of ROOMS) interactionRegistry.unregister(`seat-${room.id}`);
      humanoid?.dispose();
      res?.dispose();
      res = null;
      humanoid = null;
      camera = null;
      seated = null;
      pulses = [];
    },
  };
}
