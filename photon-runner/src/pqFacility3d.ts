import * as THREE from 'three';
import type { RoomId } from './pqRooms';

/**
 * Ten rooms, built from the `docs/3d-reference-v1` reference sheets: real
 * internal width/depth/ceiling-height in metres, and furniture placed the
 * way each sheet's top plan lays it out. One shared kit of prop builders
 * (desk, workstation cluster, server cabinet, reception desk, door) keeps
 * every room's geometry proportioned the same way the reference sheets'
 * reusable assets are, rather than each room inventing its own furniture.
 */

export type Facility3DRoomId = Extract<
  RoomId,
  | 'ops'
  | 'quantum-wing'
  | 'server-hall'
  | 'soc-room'
  | 'crypto-lab'
  | 'engineering-room'
  | 'cryogenics-lab'
  | 'power-control-room'
  | 'secure-archive'
  | 'comms-centre'
>;

export const ROOM3D_IDS: Facility3DRoomId[] = [
  'ops',
  'quantum-wing',
  'server-hall',
  'soc-room',
  'crypto-lab',
  'engineering-room',
  'cryogenics-lab',
  'power-control-room',
  'secure-archive',
  'comms-centre',
];

export const ROOM3D_LABELS: Record<Facility3DRoomId, string> = {
  ops: 'Headquarters',
  'quantum-wing': 'Quantum Wing',
  'server-hall': 'Server Hall',
  'soc-room': 'Security Operations Centre',
  'crypto-lab': 'Cryptography Lab',
  'engineering-room': 'Engineering Workshop',
  'cryogenics-lab': 'Cryogenics Laboratory',
  'power-control-room': 'Power Control Room',
  'secure-archive': 'Secure Archive',
  'comms-centre': 'Communications Centre',
};

interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
}

interface DoorGap {
  /** Which wall the door sits in. */
  wall: 'N' | 'S' | 'E' | 'W';
  /** Centre of the opening, metres along that wall, measured from its start. */
  at: number;
  width: number;
}

interface Furniture {
  place(group: THREE.Group, mats: Kit): void;
  /** Footprint added to the collision list, room-local metres. */
  solid?: Rect;
}

interface RoomSpec3D {
  /** Internal width (E-W) and depth (N-S), metres — matches each sheet's top plan. */
  w: number;
  d: number;
  wallH: number;
  doors: DoorGap[];
  furniture: Furniture[];
  spawn: [number, number];
}

// ---------------------------------------------------------------------------
// Shared material kit + primitives
// ---------------------------------------------------------------------------

interface Kit {
  wall: THREE.Material;
  floor: THREE.Material;
  steel: THREE.Material;
  dark: THREE.Material;
  oak: THREE.Material;
  fabric: THREE.Material;
  screen: THREE.Material;
  cyan: THREE.Material;
  green: THREE.Material;
  doorLeaf: THREE.Material;
  doorFrame: THREE.Material;
  leaf: THREE.Material;
  pot: THREE.Material;
  all: THREE.Material[];
}

function makeKit(): Kit {
  const std = (color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...opts });
  const kit: Kit = {
    wall: std(0xcfd6dc),
    floor: std(0xb7bec5, { roughness: 0.75 }),
    steel: std(0x2b3542, { metalness: 0.55, roughness: 0.4 }),
    dark: std(0x171d26, { metalness: 0.3, roughness: 0.5 }),
    oak: std(0xc19a66, { roughness: 0.5 }),
    fabric: std(0x9aa2ab, { roughness: 0.9 }),
    screen: std(0x0b2a44, { emissive: 0x2f8fd6, emissiveIntensity: 1.1, roughness: 0.3 }),
    cyan: std(0x56caff, { emissive: 0x1c8fd4, emissiveIntensity: 0.9, roughness: 0.3 }),
    green: std(0x63e39a, { emissive: 0x2aa563, emissiveIntensity: 0.9, roughness: 0.3 }),
    doorLeaf: std(0x38455a, { roughness: 0.5 }),
    doorFrame: std(0xe6e9ec, { roughness: 0.6 }),
    leaf: std(0x3f8f52, { roughness: 0.8 }),
    pot: std(0x8b8378, { roughness: 0.85 }),
    all: [],
  };
  kit.all = [
    kit.wall, kit.floor, kit.steel, kit.dark, kit.oak, kit.fabric, kit.screen,
    kit.cyan, kit.green, kit.doorLeaf, kit.doorFrame, kit.leaf, kit.pot,
  ];
  return kit;
}

function box(
  group: THREE.Group,
  x: number, y: number, z: number,
  w: number, h: number, d: number,
  m: THREE.Material,
  rotY = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotY;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

// ---------------------------------------------------------------------------
// Reusable furniture — proportioned from docs/3d-reference-v1/prop-*.png
// ---------------------------------------------------------------------------

/** Standard analyst desk: 1.6 x 0.8m, 0.75m top height. */
function desk(x: number, z: number, rotY = 0): Furniture {
  return {
    solid: { x, z, w: 1.6, d: 0.8 },
    place(group, mats) {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = rotY;
      box(g, 0, 0.735, 0, 1.6, 0.03, 0.8, mats.oak);
      for (const lx of [-0.72, 0.72]) box(g, lx, 0.36, 0.32, 0.06, 0.72, 0.06, mats.steel);
      box(g, 0, 0.4, 0, 1.4, 0.16, 0.5, mats.dark);
      group.add(g);
    },
  };
}

/** Four-person workstation cluster: 3.2 x 1.6m, two facing desk pairs. */
function workstationCluster(x: number, z: number, rotY = 0): Furniture {
  return {
    solid: { x, z, w: 3.2, d: 1.6 },
    place(group, mats) {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = rotY;
      for (const side of [-0.4, 0.4]) {
        box(g, 0, 0.735, side * 0.8, 3.2, 0.03, 0.8, mats.oak);
        for (const lx of [-1.4, -0.05, 0.05, 1.4]) box(g, lx, 0.36, side * 0.65, 0.06, 0.72, 0.06, mats.steel);
        box(g, 0, 1.1, side * 0.78, 3.2, 0.5, 0.02, mats.fabric);
        for (const mx of [-1.1, -0.35, 0.35, 1.1]) {
          box(g, mx, 1.15, side * 0.72, 0.55, 0.35, 0.03, mats.screen);
        }
      }
      group.add(g);
    },
  };
}

/** Server cabinet: 0.6 x 1.0m footprint, 2.0m tall, perforated front + LEDs. */
function serverCabinet(x: number, z: number, rotY = 0): Furniture {
  return {
    solid: { x, z, w: 0.6, d: 1.0 },
    place(group, mats) {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = rotY;
      box(g, 0, 1.0, 0, 0.6, 2.0, 1.0, mats.dark);
      for (let i = 0; i < 6; i++) {
        const m = i % 2 === 0 ? mats.cyan : mats.green;
        box(g, 0, 0.35 + i * 0.28, 0.51, 0.5, 0.05, 0.02, m);
      }
      group.add(g);
    },
  };
}

function serverRackRow(x: number, z: number, count: number, spacing: number, rotY = 0, axis: 'x' | 'z' = 'x'): Furniture[] {
  const out: Furniture[] = [];
  for (let i = 0; i < count; i++) {
    const off = (i - (count - 1) / 2) * spacing;
    const [px, pz] = axis === 'x' ? [x + off, z] : [x, z + off];
    out.push(serverCabinet(px, pz, rotY));
  }
  return out;
}

/** Reception-style L desk, used anywhere a wide console counter is drawn: 2.4 x 0.9m. */
function counterDesk(x: number, z: number, rotY = 0): Furniture {
  return {
    solid: { x, z, w: 2.4, d: 0.9 },
    place(group, mats) {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = rotY;
      box(g, 0, 0.75, 0, 2.4, 0.05, 0.9, mats.oak);
      box(g, 0, 0.37, 0, 2.2, 0.7, 0.7, mats.dark);
      group.add(g);
    },
  };
}

/** Wall-mounted monitor bank — a row of screens at eye height, plus a console beneath. */
function monitorWall(x: number, z: number, count: number, rotY = 0): Furniture {
  return {
    place(group, mats) {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = rotY;
      const totalW = count * 1.5;
      for (let i = 0; i < count; i++) {
        const sx = (i - (count - 1) / 2) * 1.5;
        box(g, sx, 1.9, 0, 1.4, 0.85, 0.05, mats.screen);
      }
      box(g, 0, 0.4, 0.55, totalW - 0.4, 0.8, 0.5, mats.dark);
      group.add(g);
    },
  };
}

/** Glass-fronted component cabinet — simplified as a dark case with lit shelves. */
function cabinet(x: number, z: number, w = 0.9, d = 0.5, h = 1.9, rotY = 0): Furniture {
  return {
    solid: { x, z, w, d },
    place(group, mats) {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = rotY;
      box(g, 0, h / 2, 0, w, h, d, mats.steel);
      for (let i = 0; i < 3; i++) box(g, 0, 0.4 + i * 0.5, d / 2 + 0.005, w - 0.1, 0.02, 0.02, mats.cyan);
      group.add(g);
    },
  };
}

/** Long optics/engineering bench with small equipment boxes on top. */
function longBench(x: number, z: number, w: number, d: number, rotY = 0): Furniture {
  return {
    solid: { x, z, w, d },
    place(group, mats) {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = rotY;
      box(g, 0, 0.85, 0, w, 0.05, d, mats.steel);
      box(g, 0, 0.42, 0, w - 0.1, 0.8, d - 0.1, mats.dark);
      const along = w >= d;
      const n = Math.max(3, Math.round((along ? w : d) / 0.5));
      for (let i = 0; i < n; i++) {
        const t = (i / (n - 1) - 0.5) * ((along ? w : d) - 0.3);
        const ex = along ? t : 0;
        const ez = along ? 0 : t;
        box(g, ex, 0.92, ez, 0.16, 0.12, 0.16, mats.cyan);
      }
      group.add(g);
    },
  };
}

/** Round or board meeting table with a ring of simple chairs. */
function meetingTable(x: number, z: number, w: number, d: number, seats: number): Furniture {
  return {
    solid: { x, z, w: w + 0.9, d: d + 0.9 },
    place(group, mats) {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      box(g, 0, 0.75, 0, w, 0.05, d, mats.oak);
      box(g, 0, 0.37, 0, w - 0.3, 0.7, d - 0.3, mats.dark);
      for (let i = 0; i < seats; i++) {
        const t = (i / seats) * Math.PI * 2;
        const rx = Math.cos(t) * (w / 2 + 0.5);
        const rz = Math.sin(t) * (d / 2 + 0.5);
        box(g, rx, 0.45, rz, 0.42, 0.42, 0.42, mats.dark);
      }
      group.add(g);
    },
  };
}

/** Cryogenics/engineering cylindrical tank. */
function tank(x: number, z: number, r = 0.5, h = 1.8): Furniture {
  return {
    solid: { x, z, w: r * 2, d: r * 2 },
    place(group, mats) {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 20), mats.steel);
      mesh.position.set(x, h / 2, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    },
  };
}

/** Filing cabinet row — used by the Secure Archive's east/west walls. */
function filingRow(x: number, z: number, count: number, axis: 'x' | 'z', rotY = 0): Furniture[] {
  const out: Furniture[] = [];
  for (let i = 0; i < count; i++) {
    const off = (i - (count - 1) / 2) * 0.65;
    const [px, pz] = axis === 'x' ? [x + off, z] : [x, z + off];
    out.push(cabinet(px, pz, 0.6, 0.45, 1.9, rotY));
  }
  return out;
}

function plant(x: number, z: number): Furniture {
  return {
    place(group, mats) {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.35, 12), mats.pot);
      pot.position.y = 0.175;
      pot.castShadow = true;
      g.add(pot);
      const foliage = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 0), mats.leaf);
      foliage.position.y = 0.75;
      foliage.castShadow = true;
      g.add(foliage);
      group.add(g);
    },
  };
}

// ---------------------------------------------------------------------------
// Room specs — dimensions and layout taken from each sheet's top plan.
// ---------------------------------------------------------------------------

const ROOM3D_SPECS: Record<Facility3DRoomId, RoomSpec3D> = {
  ops: {
    w: 16, d: 12, wallH: 3.2,
    doors: [{ wall: 'S', at: 8, width: 3 }, { wall: 'E', at: 6, width: 1.1 }, { wall: 'W', at: 6, width: 1.1 }],
    spawn: [8, 9],
    furniture: [
      monitorWall(8, 0.3, 3),
      cabinet(8 - 2.2, 0.3, 0.9, 0.5, 1.9),
      cabinet(8 + 2.2, 0.3, 0.9, 0.5, 1.9),
      workstationCluster(8, 5.4),
      meetingTable(8, 9, 3.2, 1.4, 8),
      plant(1, 0.8), plant(15, 0.8), plant(1, 11.2), plant(15, 11.2),
    ],
  },
  'quantum-wing': {
    w: 12, d: 10, wallH: 3.2,
    doors: [{ wall: 'S', at: 6, width: 1.1 }],
    spawn: [6, 8.5],
    furniture: [
      cabinet(2, 0.4, 1.4, 0.6, 1.6), counterDesk(5.2, 0.6), cabinet(9, 0.4, 1.6, 0.6, 1.9),
      longBench(1.6, 5, 1.0, 6.4, 0),
      longBench(10.4, 5, 1.0, 6.4, 0),
      plant(1, 9), plant(11, 9),
    ],
  },
  'server-hall': {
    w: 12, d: 14, wallH: 3.2,
    doors: [{ wall: 'S', at: 6, width: 2.4 }],
    spawn: [6, 12.5],
    furniture: [
      ...serverRackRow(2.4, 4, 6, 1.6, 0, 'z'),
      ...serverRackRow(9.6, 4, 6, 1.6, 0, 'z'),
      cabinet(3, 0.6, 1.0, 0.7, 2.0), cabinet(5, 0.6, 1.0, 0.7, 2.0),
      cabinet(7, 0.6, 1.0, 0.7, 2.0), cabinet(9, 0.6, 1.0, 0.7, 2.0),
      counterDesk(10.6, 1.2),
    ],
  },
  'soc-room': {
    w: 12, d: 10, wallH: 3.2,
    doors: [{ wall: 'S', at: 6, width: 1.1 }],
    spawn: [6, 8.5],
    furniture: [
      monitorWall(6, 0.3, 4),
      cabinet(6 - 3.4, 0.3, 0.9, 0.5, 1.9), cabinet(6 + 3.4, 0.3, 0.9, 0.5, 1.9),
      longBench(3.2, 3.6, 2.4, 0.9, 0), longBench(8.2, 3.6, 2.4, 0.9, 0),
      counterDesk(1.4, 7), counterDesk(10.6, 7),
      plant(1, 1), plant(11, 1),
    ],
  },
  'crypto-lab': {
    w: 10, d: 8, wallH: 3.2,
    doors: [{ wall: 'S', at: 5, width: 1.1 }],
    spawn: [5, 6.6],
    furniture: [
      desk(2.2, 0.9, Math.PI), serverCabinet(5, 0.9), desk(7.8, 0.9, Math.PI),
      cabinet(0.6, 4, 0.6, 1.6, 1.9, Math.PI / 2),
      cabinet(9.4, 4, 0.6, 1.6, 1.9, -Math.PI / 2),
      meetingTable(5, 4, 1.6, 0.9, 4),
      plant(0.8, 7.2), plant(9.2, 7.2),
    ],
  },
  'engineering-room': {
    w: 12, d: 10, wallH: 3.2,
    doors: [{ wall: 'S', at: 6, width: 1.1 }],
    spawn: [6, 8.5],
    furniture: [
      longBench(6, 0.6, 8, 1.0, 0),
      longBench(0.6, 5, 1.0, 6, 0),
      longBench(11.4, 5, 1.0, 6, 0),
    ],
  },
  'cryogenics-lab': {
    w: 12, d: 10, wallH: 3.2,
    doors: [{ wall: 'S', at: 6, width: 1.1 }],
    spawn: [6, 8.5],
    furniture: [
      tank(2, 1, 0.7, 2.2), counterDesk(6, 0.9), cabinet(9.6, 0.9, 1.4, 0.6, 1.9),
      tank(10, 4.4, 0.5, 1.7), tank(10, 5.6, 0.5, 1.7), tank(10, 6.8, 0.5, 1.7),
      meetingTable(5, 5, 1.6, 0.9, 4),
      cabinet(1.4, 8.6, 0.6, 0.6, 1.6),
    ],
  },
  'power-control-room': {
    w: 12, d: 10, wallH: 3.2,
    doors: [{ wall: 'W', at: 5, width: 1.1 }],
    spawn: [6, 8.5],
    furniture: [
      ...serverRackRow(2.6, 0.8, 4, 1.1, 0, 'x'),
      ...serverRackRow(9.4, 0.8, 4, 1.1, 0, 'x'),
      ...serverRackRow(1.0, 4.5, 5, 1.1, Math.PI / 2, 'z'),
      ...serverRackRow(11.0, 4.5, 5, 1.1, -Math.PI / 2, 'z'),
      counterDesk(4.4, 4.6), counterDesk(6.8, 4.6),
    ],
  },
  'secure-archive': {
    w: 10, d: 8.8, wallH: 3.2,
    doors: [{ wall: 'S', at: 5, width: 1.1 }],
    spawn: [5, 7.4],
    furniture: [
      counterDesk(5, 0.9),
      ...filingRow(1.2, 4.4, 8, 'z', Math.PI / 2),
      ...filingRow(8.8, 4.4, 8, 'z', -Math.PI / 2),
      cabinet(5, 3.6, 1.4, 0.5, 1.4),
    ],
  },
  'comms-centre': {
    w: 12, d: 10, wallH: 3.2,
    doors: [{ wall: 'S', at: 6, width: 1.1 }],
    spawn: [6, 8.5],
    furniture: [
      monitorWall(6, 0.3, 3),
      cabinet(6 - 2.6, 0.3, 0.8, 0.5, 1.9), cabinet(6 + 2.6, 0.3, 0.8, 0.5, 1.9),
      workstationCluster(6, 3.4),
      ...serverRackRow(1.2, 5, 5, 1.4, Math.PI / 2, 'z'),
      counterDesk(10.4, 4),
      plant(0.8, 8.8), plant(11.2, 8.8),
    ],
  },
};

// ---------------------------------------------------------------------------
// Room shell + assembly
// ---------------------------------------------------------------------------

/** Splits a wall into up to three segments so a door leaves a real gap. */
function buildWallWithGaps(
  group: THREE.Group,
  wallLenAxis: number,
  wallH: number,
  gaps: DoorGap[],
  wallName: DoorGap['wall'],
  place: (along: number, len: number) => void,
) {
  const spans = gaps.filter((g) => g.wall === wallName).sort((a, b) => a.at - b.at);
  let cursor = 0;
  for (const gap of spans) {
    const start = gap.at - gap.width / 2;
    if (start > cursor) place((cursor + start) / 2, start - cursor);
    cursor = gap.at + gap.width / 2;
  }
  if (cursor < wallLenAxis) place((cursor + wallLenAxis) / 2, wallLenAxis - cursor);
  void wallH;
}

function buildDoorMarker(group: THREE.Group, x: number, z: number, rotY: number, mats: Kit) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  box(g, 0, 1.1, 0, 1.1, 2.2, 0.08, mats.doorFrame);
  box(g, -0.15, 1.05, 0.02, 0.7, 2.0, 0.05, mats.doorLeaf);
  group.add(g);
}

export interface Facility3DWorld {
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  canStand(x: number, z: number): boolean;
  avatar: THREE.Group;
  spawn: [number, number];
  animate(time: number, walking: boolean): void;
  dispose(): void;
}

export function build3DRoom(scene: THREE.Scene, id: Facility3DRoomId): Facility3DWorld {
  const spec = ROOM3D_SPECS[id];
  const mats = makeKit();

  const root = new THREE.Group();
  root.position.set(-spec.w / 2, 0, -spec.d / 2);
  scene.add(root);

  const floorGeo = new THREE.PlaneGeometry(spec.w, spec.d);
  const floor = new THREE.Mesh(floorGeo, mats.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(spec.w / 2, 0, spec.d / 2);
  floor.receiveShadow = true;
  root.add(floor);

  const wallT = 0.2;
  buildWallWithGaps(root, spec.w, spec.wallH, spec.doors, 'N', (along, len) =>
    box(root, along, spec.wallH / 2, 0, len, spec.wallH, wallT, mats.wall));
  buildWallWithGaps(root, spec.w, spec.wallH, spec.doors, 'S', (along, len) =>
    box(root, along, spec.wallH / 2, spec.d, len, spec.wallH, wallT, mats.wall));
  buildWallWithGaps(root, spec.d, spec.wallH, spec.doors, 'W', (along, len) =>
    box(root, 0, spec.wallH / 2, along, wallT, spec.wallH, len, mats.wall));
  buildWallWithGaps(root, spec.d, spec.wallH, spec.doors, 'E', (along, len) =>
    box(root, spec.w, spec.wallH / 2, along, wallT, spec.wallH, len, mats.wall));

  for (const gap of spec.doors) {
    const [x, z, rotY] =
      gap.wall === 'N' ? [gap.at, 0, 0] :
      gap.wall === 'S' ? [gap.at, spec.d, 0] :
      gap.wall === 'W' ? [0, gap.at, Math.PI / 2] :
      [spec.w, gap.at, Math.PI / 2];
    buildDoorMarker(root, x, z, rotY, mats);
  }

  const solids: Rect[] = [];
  for (const f of spec.furniture) {
    f.place(root, mats);
    if (f.solid) solids.push(f.solid);
  }

  const hemi = new THREE.HemisphereLight(0xdfeeff, 0x3a4048, 1.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff3df, 2.4);
  sun.position.set(spec.w * 0.3, spec.wallH * 3, spec.d * 0.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const half = Math.max(spec.w, spec.d);
  sun.shadow.camera.left = -half; sun.shadow.camera.right = half;
  sun.shadow.camera.top = half; sun.shadow.camera.bottom = -half;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);

  const avatar = new THREE.Group();
  scene.add(avatar);
  const suit = new THREE.MeshStandardMaterial({ color: 0x294868, roughness: 0.6 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc99573, roughness: 0.7 });
  const gear = new THREE.MeshStandardMaterial({ color: 0x101924, roughness: 0.5 });
  box(avatar, 0, 1.0, 0, 0.45, 0.65, 0.28, suit);
  box(avatar, 0, 1.54, 0, 0.3, 0.34, 0.3, skin);
  box(avatar, 0, 1.7, 0, 0.32, 0.1, 0.32, gear);
  const legs = [-0.13, 0.13].map((x) => box(avatar, x, 0.36, 0, 0.17, 0.7, 0.22, gear));
  const arms = [-0.31, 0.31].map((x) => box(avatar, x, 1, 0, 0.13, 0.6, 0.18, suit));

  const [sx, sz] = spec.spawn;
  avatar.position.set(sx - spec.w / 2, 0, sz - spec.d / 2);

  const radius = 0.32;
  const minX = -spec.w / 2 + wallT + radius, maxX = spec.w / 2 - wallT - radius;
  const minZ = -spec.d / 2 + wallT + radius, maxZ = spec.d / 2 - wallT - radius;

  function canStand(x: number, z: number): boolean {
    if (x < minX || x > maxX || z < minZ || z > maxZ) return false;
    const rx = x + spec.w / 2, rz = z + spec.d / 2;
    return !solids.some((s) => Math.abs(rx - s.x) < s.w / 2 + radius && Math.abs(rz - s.z) < s.d / 2 + radius);
  }

  return {
    bounds: { minX, maxX, minZ, maxZ },
    canStand,
    avatar,
    spawn: [sx - spec.w / 2, sz - spec.d / 2],
    animate(time, walking) {
      legs.forEach((leg, i) => { leg.rotation.x = walking ? Math.sin(time * 9 + i * Math.PI) * 0.35 : 0; });
      arms.forEach((arm, i) => { arm.rotation.x = walking ? -Math.sin(time * 9 + i * Math.PI) * 0.25 : 0; });
    },
    dispose() {
      root.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
      avatar.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
      mats.all.forEach((m) => m.dispose());
      suit.dispose(); skin.dispose(); gear.dispose();
      sun.shadow.dispose();
      scene.remove(root, hemi, sun, avatar);
    },
  };
}
