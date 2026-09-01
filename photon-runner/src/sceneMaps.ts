import { Role } from './sceneTypes';

export interface RoomDef {
  id: string;
  name: string;
  color: number;
  center: { x: number; z: number };
  size: { w: number; d: number };
  /** Office dressing to place in this room, if any — see sceneOfficeProps.ts. */
  furniture?:
    | 'reception'
    | 'bullpen'
    | 'conference'
    | 'vault'
    | 'central-ops'
    | 'foundations'
    | 'crypto'
    | 'communications'
    | 'soc'
    | 'red-team'
    | 'engineering'
    | 'quantum'
    | 'adv-compute';
  /** Wall-panel text for a furnished room; defaults to `name` when omitted. */
  signText?: string;
  /** Which edge, if any, renders as glazing instead of an opaque wall. */
  glassFront?: 'north' | 'south' | 'east' | 'west';
  /** Polished, low-roughness floor that picks up the environment and the
   * room's own lamps — for a room whose look carries the map. Honoured only
   * above the `balanced` tier. */
  reflectiveFloor?: boolean;
}

export interface CorridorDef {
  x: number;
  z: number;
  w: number;
  d: number;
}

export interface VentDef {
  id: string;
  x: number;
  z: number;
  links: string[];
}

export interface SensorDef {
  id: string;
  x: number;
  z: number;
}

export interface StationSlot {
  id: string;
  x: number;
  z: number;
}

/** Material palette — this is what makes a map feel like a place. */
export interface MapPalette {
  /** Scene background + fog. */
  air: number;
  floor: number;
  floorAccent: number;
  wall: number;
  wallTop: number;
  /** Warm practical lights rather than neon. */
  lamp: number;
  lampIntensity: number;
  ambientSky: number;
  ambientGround: number;
  /** Sun/key light colour. */
  sun: number;
}

export interface MapDef {
  id: string;
  name: string;
  blurb: string;
  /** Short line describing the layout's tactical shape. */
  shape: string;
  palette: MapPalette;
  rooms: RoomDef[];
  corridors: CorridorDef[];
  vents: VentDef[];
  sensors: SensorDef[];
  playfield: { xMin: number; xMax: number; zMin: number; zMax: number };
  /** Where the fiber runs, drawn overhead. */
  fiber: { from: [number, number]; to: [number, number] };
  /** Eve's tap point and her offline crack console. */
  tap: { x: number; z: number };
  crack: { x: number; z: number };
  meeting: { x: number; z: number };
  /** Eight station anchor points; the game maps its task list onto these. */
  slots: StationSlot[];
  spawn: Record<Role, { x: number; z: number }>;
}

// ---------------------------------------------------------------------------
// Palettes — all earthy. Concrete, rust, timber, sodium lamps; no neon voids.
// ---------------------------------------------------------------------------

const PALETTE_STATION: MapPalette = {
  air: 0x121013,
  floor: 0x6b6259, // poured concrete
  floorAccent: 0x554d45,
  wall: 0x4a423b,
  wallTop: 0xb2703a, // rusted steel capping
  lamp: 0xffb457, // sodium
  lampIntensity: 11,
  ambientSky: 0x8a7f70,
  ambientGround: 0x2a231d,
  sun: 0xffe2b8,
};

const PALETTE_GREENHOUSE: MapPalette = {
  air: 0x0f130f,
  floor: 0x5d6350, // mossy stone
  floorAccent: 0x474d3c,
  wall: 0x3e4638,
  wallTop: 0x7f9a5a, // planted trough
  lamp: 0xd8f0a0, // grow lamps
  lampIntensity: 10,
  ambientSky: 0x9fb187,
  ambientGround: 0x22281c,
  sun: 0xf2ffd9,
};

const PALETTE_MINE: MapPalette = {
  air: 0x14100c,
  floor: 0x63523f, // packed earth
  floorAccent: 0x4c3d2d,
  wall: 0x453728,
  wallTop: 0xc8873f, // timber shoring
  lamp: 0xffa03c, // tungsten
  lampIntensity: 12,
  ambientSky: 0x8b7355,
  ambientGround: 0x241b12,
  sun: 0xffd9a0,
};

const PALETTE_ARRAY: MapPalette = {
  air: 0x0a0d13,
  floor: 0x6b625a, // warm brushed-titanium deck
  floorAccent: 0x554e46,
  wall: 0x454039,
  wallTop: 0x5ea8c9, // cyan hull capping — the accent that reads as "orbital"
  lamp: 0x8fd9ff, // cool orbital lighting
  lampIntensity: 10,
  ambientSky: 0x7a93ad,
  ambientGround: 0x1c2229,
  sun: 0xcfe8ff,
};

// ---------------------------------------------------------------------------
// Map 1 — Relay Station. A closed ring: two wings joined top and bottom.
// Learn-the-game map: symmetric, short sightlines, everything two-approach.
// ---------------------------------------------------------------------------

const RELAY: MapDef = {
  id: 'relay',
  name: 'Relay Station',
  blurb: 'A concrete repeater station on the trunk line. Symmetric and easy to read.',
  shape: 'Closed ring · 5 rooms · 3 vents',
  palette: PALETTE_STATION,
  rooms: [
    { id: 'transmitter', name: 'Transmitter Bay', color: 0xd98c3f, center: { x: -10, z: -12 }, size: { w: 8, d: 9 } },
    { id: 'receiver', name: 'Receiver Bay', color: 0x7ea87a, center: { x: 10, z: -12 }, size: { w: 8, d: 9 } },
    { id: 'fiber-hall', name: 'Fiber Hall', color: 0xb08a6a, center: { x: 0, z: -22 }, size: { w: 20, d: 6 } },
    { id: 'core', name: 'Control Room', color: 0xc9bda8, center: { x: 0, z: -12 }, size: { w: 7, d: 7 } },
    { id: 'power-bay', name: 'Generator Bay', color: 0xc4903c, center: { x: 0, z: -2 }, size: { w: 20, d: 6 } },
  ],
  corridors: [
    { x: -8, z: -17.75, w: 3, d: 4.9 },
    { x: 8, z: -17.75, w: 3, d: 4.9 },
    { x: -8, z: -6.25, w: 3, d: 4.9 },
    { x: 8, z: -6.25, w: 3, d: 4.9 },
    { x: -4.75, z: -12, w: 4.9, d: 3 },
    { x: 4.75, z: -12, w: 4.9, d: 3 },
    { x: 0, z: -17.25, w: 3, d: 5.9 },
    { x: 0, z: -6.75, w: 3, d: 5.9 },
  ],
  vents: [
    { id: 'v-fiber', x: -6, z: -22, links: ['v-core', 'v-power'] },
    { id: 'v-core', x: 2, z: -11, links: ['v-fiber', 'v-power'] },
    { id: 'v-power', x: -6, z: -2, links: ['v-fiber', 'v-core'] },
  ],
  sensors: [
    { id: 'west', x: -8, z: -17.75 },
    { id: 'east', x: 8, z: -17.75 },
  ],
  playfield: { xMin: -16, xMax: 16, zMin: -27, zMax: 3 },
  fiber: { from: [-10, -22], to: [10, -22] },
  tap: { x: 0, z: -21 },
  crack: { x: 7, z: -2 },
  meeting: { x: 0, z: -12 },
  slots: [
    { id: 's1', x: -12, z: -14 },
    { id: 's2', x: -12, z: -10 },
    { id: 's3', x: 12, z: -14 },
    { id: 's4', x: 12, z: -10 },
    { id: 's5', x: -6, z: -23 },
    { id: 's6', x: 6, z: -22 },
    { id: 's7', x: -3, z: -2 },
    { id: 's8', x: -2, z: -13.5 },
  ],
  spawn: { alice: { x: -10, z: -12 }, bob: { x: 10, z: -12 }, eve: { x: 0, z: -12 } },
};

// ---------------------------------------------------------------------------
// Map 2 — Greenhouse. A cross/hub layout: one big central atrium with four
// arms. Long sightlines through the middle, but the arms are blind — you can
// be watched crossing and invisible at the ends.
// ---------------------------------------------------------------------------

const GREENHOUSE: MapDef = {
  id: 'greenhouse',
  name: 'Greenhouse',
  blurb: 'A converted botany dome. Wide open middle, blind arms — easy to be seen crossing.',
  shape: 'Central hub · 5 rooms · 4 vents',
  palette: PALETTE_GREENHOUSE,
  rooms: [
    { id: 'atrium', name: 'Atrium', color: 0xa8c07a, center: { x: 0, z: -12 }, size: { w: 12, d: 12 } },
    { id: 'seed', name: 'Seed Vault', color: 0x8fae6b, center: { x: 0, z: -25 }, size: { w: 10, d: 7 } },
    { id: 'pump', name: 'Pump House', color: 0xc4a55e, center: { x: 0, z: 1 }, size: { w: 10, d: 7 } },
    { id: 'west', name: 'West Propagation', color: 0xd98c3f, center: { x: -14, z: -12 }, size: { w: 8, d: 9 } },
    { id: 'east', name: 'East Propagation', color: 0x7ea87a, center: { x: 14, z: -12 }, size: { w: 8, d: 9 } },
  ],
  corridors: [
    { x: 0, z: -19.75, w: 3, d: 5.9 },
    { x: 0, z: -4.25, w: 3, d: 5.9 },
    { x: -8, z: -12, w: 6.4, d: 3 },
    { x: 8, z: -12, w: 6.4, d: 3 },
  ],
  vents: [
    { id: 'v-n', x: -3, z: -25, links: ['v-w', 'v-e'] },
    { id: 'v-s', x: 3, z: 1, links: ['v-w', 'v-e'] },
    { id: 'v-w', x: -14, z: -9, links: ['v-n', 'v-s'] },
    { id: 'v-e', x: 14, z: -15, links: ['v-n', 'v-s'] },
  ],
  sensors: [
    { id: 'north', x: 0, z: -19.75 },
    { id: 'south', x: 0, z: -4.25 },
  ],
  playfield: { xMin: -20, xMax: 20, zMin: -31, zMax: 7 },
  fiber: { from: [0, -25], to: [0, 1] },
  tap: { x: 0, z: -15 },
  crack: { x: 14, z: -9 },
  meeting: { x: 0, z: -12 },
  slots: [
    { id: 's1', x: -16, z: -14 },
    { id: 's2', x: -16, z: -10 },
    { id: 's3', x: 16, z: -14 },
    { id: 's4', x: 16, z: -10 },
    { id: 's5', x: -3, z: -23 },
    { id: 's6', x: 3, z: -23 },
    { id: 's7', x: -3, z: 1 },
    { id: 's8', x: -4, z: -12 },
  ],
  spawn: { alice: { x: -14, z: -12 }, bob: { x: 14, z: -12 }, eve: { x: 0, z: -12 } },
};

// ---------------------------------------------------------------------------
// Map 3 — Deep Cut. A long asymmetric mine gallery. One main drift with side
// chambers; the vents are the only fast way back, so timing alibis matter more.
// ---------------------------------------------------------------------------

const MINE: MapDef = {
  id: 'mine',
  name: 'Deep Cut',
  blurb: 'A timbered mine gallery. Long and asymmetric — alibis live and die on timing.',
  shape: 'Linear gallery · 6 rooms · 3 vents',
  palette: PALETTE_MINE,
  rooms: [
    { id: 'winding', name: 'Winding House', color: 0xc8873f, center: { x: -16, z: -10 }, size: { w: 9, d: 10 } },
    { id: 'upper', name: 'Upper Drift', color: 0xb2764a, center: { x: -5, z: -16 }, size: { w: 10, d: 8 } },
    { id: 'lower', name: 'Lower Drift', color: 0xa88b5a, center: { x: -5, z: -3 }, size: { w: 10, d: 8 } },
    { id: 'sump', name: 'Sump Junction', color: 0xd0bda0, center: { x: 6, z: -10 }, size: { w: 9, d: 10 } },
    { id: 'face', name: 'Working Face', color: 0xd98c3f, center: { x: 17, z: -16 }, size: { w: 9, d: 8 } },
    { id: 'store', name: 'Powder Store', color: 0x9c7a4e, center: { x: 17, z: -3 }, size: { w: 9, d: 8 } },
  ],
  corridors: [
    { x: -10.75, z: -13.5, w: 3.9, d: 3 },
    { x: -10.75, z: -6, w: 3.9, d: 2 },
    { x: 0.75, z: -13.5, w: 3.9, d: 3 },
    { x: 0.75, z: -6, w: 3.9, d: 2 },
    { x: 11.5, z: -13.5, w: 4.4, d: 3 },
    { x: 11.5, z: -6, w: 4.4, d: 2 },
    { x: 17, z: -9.5, w: 3, d: 7.4 },
  ],
  vents: [
    { id: 'v-head', x: -16, z: -7, links: ['v-junction', 'v-face'] },
    { id: 'v-junction', x: 6, z: -13, links: ['v-head', 'v-face'] },
    { id: 'v-face', x: 17, z: -18, links: ['v-head', 'v-junction'] },
  ],
  sensors: [
    { id: 'upper-gate', x: -10.75, z: -13.5 },
    { id: 'lower-gate', x: 0.75, z: -13.5 },
  ],
  playfield: { xMin: -23, xMax: 24, zMin: -23, zMax: 4 },
  fiber: { from: [-16, -10], to: [17, -10] },
  tap: { x: 6, z: -7 },
  crack: { x: 17, z: -3 },
  meeting: { x: 6, z: -10 },
  slots: [
    { id: 's1', x: -18, z: -12 },
    { id: 's2', x: -18, z: -8 },
    { id: 's3', x: -7, z: -18 },
    { id: 's4', x: -2, z: -18 },
    { id: 's5', x: -7, z: -1 },
    { id: 's6', x: 19, z: -18 },
    { id: 's7', x: 19, z: -1 },
    { id: 's8', x: 4, z: -12 },
  ],
  spawn: { alice: { x: -16, z: -10 }, bob: { x: 17, z: -16 }, eve: { x: 6, z: -10 } },
};

// ---------------------------------------------------------------------------
// Map 4 — Meridian Array. A 3x3 grid of rooms (a dense lattice of corridors,
// not a single loop) plus three outlying spur rooms. Every interior room has
// at least two ways out, so there's rarely just one route to cut off — the
// biggest, mazi­est facility of the four.
// ---------------------------------------------------------------------------

const MERIDIAN: MapDef = {
  id: 'meridian',
  name: 'Meridian Array',
  blurb: 'A sprawling orbital relay platform. A dense grid of corridors means there is always another way around.',
  shape: 'Grid + spurs · 12 rooms · 5 vents',
  palette: PALETTE_ARRAY,
  rooms: [
    { id: 'docking', name: 'Docking Bay', color: 0x8fa8c4, center: { x: -15, z: -26 }, size: { w: 10, d: 9 } },
    { id: 'command', name: 'Command Deck', color: 0xc9bda8, center: { x: 0, z: -26 }, size: { w: 10, d: 9 } },
    { id: 'comms', name: 'Comms Relay', color: 0xd6cdbb, center: { x: 15, z: -26 }, size: { w: 10, d: 9 } },
    { id: 'cryo', name: 'Cryo-Detector Bay', color: 0x7ea8c4, center: { x: -15, z: -13 }, size: { w: 10, d: 9 } },
    { id: 'core', name: 'Photon Array Core', color: 0xe0a565, center: { x: 0, z: -13 }, size: { w: 10, d: 9 } },
    { id: 'observation', name: 'Observation Deck', color: 0x9fb1c7, center: { x: 15, z: -13 }, size: { w: 10, d: 9 } },
    { id: 'power', name: 'Power Distribution', color: 0xd8b45c, center: { x: -15, z: 0 }, size: { w: 10, d: 9 } },
    { id: 'galley', name: 'Galley', color: 0xb0916a, center: { x: 0, z: 0 }, size: { w: 10, d: 9 } },
    { id: 'fabrication', name: 'Fabrication Bay', color: 0xa0a8ac, center: { x: 15, z: 0 }, size: { w: 10, d: 9 } },
    { id: 'archive', name: 'Archive Vault', color: 0x7a8fa0, center: { x: -28, z: -13 }, size: { w: 8, d: 7 } },
    { id: 'eva-prep', name: 'EVA Prep', color: 0x6b7f94, center: { x: -15, z: -39 }, size: { w: 8, d: 7 } },
    { id: 'signal-junction', name: 'Signal Junction', color: 0xc4a07a, center: { x: 15, z: 13 }, size: { w: 7, d: 6 } },
  ],
  corridors: [
    // grid — horizontal (within each row)
    { x: -7.5, z: -26, w: 7.4, d: 4 },
    { x: 7.5, z: -26, w: 7.4, d: 4 },
    { x: -7.5, z: -13, w: 7.4, d: 4 },
    { x: 7.5, z: -13, w: 7.4, d: 4 },
    { x: -7.5, z: 0, w: 7.4, d: 4 },
    { x: 7.5, z: 0, w: 7.4, d: 4 },
    // grid — vertical (within each column)
    { x: -15, z: -19.5, w: 4, d: 6.4 },
    { x: -15, z: -6.5, w: 4, d: 6.4 },
    { x: 0, z: -19.5, w: 4, d: 6.4 },
    { x: 0, z: -6.5, w: 4, d: 6.4 },
    { x: 15, z: -19.5, w: 4, d: 6.4 },
    { x: 15, z: -6.5, w: 4, d: 6.4 },
    // spurs
    { x: -22, z: -13, w: 6.4, d: 4 },
    { x: -15, z: -33, w: 4, d: 7.4 },
    { x: 15, z: 7.25, w: 4, d: 7.9 },
  ],
  vents: [
    { id: 'v-core', x: 3, z: -10, links: ['v-archive', 'v-observation'] },
    { id: 'v-observation', x: 12, z: -11, links: ['v-core', 'v-fabrication'] },
    { id: 'v-fabrication', x: 12, z: -2, links: ['v-observation', 'v-power'] },
    { id: 'v-power', x: -12, z: -3, links: ['v-fabrication', 'v-archive'] },
    { id: 'v-archive', x: -26, z: -11, links: ['v-power', 'v-core'] },
  ],
  sensors: [
    { id: 'north-gate', x: 0, z: -19.5 },
    { id: 'west-gate', x: -7.5, z: -13 },
    { id: 'south-gate', x: 0, z: -6.5 },
  ],
  playfield: { xMin: -36, xMax: 24, zMin: -46, zMax: 20 },
  fiber: { from: [0, -13], to: [-15, -13] },
  tap: { x: -7, z: -13 },
  crack: { x: -28, z: -13 },
  meeting: { x: 0, z: -13 },
  slots: [
    { id: 's1', x: -2, z: -15 },
    { id: 's2', x: 2, z: -11 },
    { id: 's3', x: -18, z: -15 },
    { id: 's4', x: -12, z: -11 },
    { id: 's5', x: 15, z: 13 },
    { id: 's6', x: -15, z: 2 },
    { id: 's7', x: 15, z: -24 },
    { id: 's8', x: 17, z: -1 },
  ],
  spawn: { alice: { x: 0, z: -13 }, bob: { x: -15, z: -13 }, eve: { x: -7.5, z: -13 } },
};

// ---------------------------------------------------------------------------
// Map 5 — Quantum Engineers HQ. The full canonical 11-department facility —
// Reception, Central Operations, Foundations, Cryptography, Communications,
// SOC, Red Team, Engineering, Quantum Wing, Advanced Compute, Secure Core —
// laid out at the exact room centers/sizes/adjacencies of the reference
// facility spec this design is drawn from. Central Operations is the spatial
// heart (matching its real-world role), with every department reachable
// through the same transition graph as the reference.
// ---------------------------------------------------------------------------

const PALETTE_HQ: MapPalette = {
  air: 0x0b0e14,
  floor: 0x7a6e5e, // warm tile
  floorAccent: 0x5c5245,
  wall: 0x38352f, // warm-neutral charcoal, not literal navy — keeps the palette test's "red >= blue" rule
  wallTop: 0x49b8d6, // cyan trim — the "Quantum Engineers" brand accent
  lamp: 0xeaf6ff, // cool office fluorescent
  lampIntensity: 9,
  ambientSky: 0x7a8fa8,
  ambientGround: 0x1c222c,
  sun: 0xdff2ff,
};

const HQ: MapDef = {
  id: 'hq',
  name: 'Quantum Engineers HQ',
  blurb: 'The full facility — Reception through Secure Core. Eleven departments, one persistent headquarters.',
  shape: 'Canonical 11-department HQ · 11 rooms · 6 vents',
  palette: PALETTE_HQ,
  rooms: [
    {
      id: 'reception',
      name: 'Reception / Identity',
      color: 0xc9a87a,
      center: { x: 0, z: -17 },
      size: { w: 12, d: 8 },
      furniture: 'reception',
      signText: 'Quantum Engineers',
      glassFront: 'north',
      // The lobby is the one room whose whole job is to look expensive —
      // glass front, lit signage, polished floor catching both.
      reflectiveFloor: true,
    },
    {
      id: 'central-ops',
      name: 'Central Operations',
      color: 0x5ea8c9,
      center: { x: 0, z: 0 },
      size: { w: 18, d: 14 },
      furniture: 'central-ops',
      signText: 'Central Operations',
    },
    {
      id: 'foundations',
      name: 'Training & Foundations',
      color: 0x7ea8c4,
      center: { x: -18, z: 0 },
      size: { w: 14, d: 12 },
      furniture: 'foundations',
      signText: 'Foundations',
    },
    {
      id: 'communications',
      name: 'Communications',
      color: 0x9b8ad0,
      center: { x: 0, z: 17 },
      size: { w: 14, d: 10 },
      furniture: 'communications',
      signText: 'Communications',
    },
    {
      id: 'crypto',
      name: 'Cryptography Lab',
      color: 0x5fb0a0,
      center: { x: -18, z: 17 },
      size: { w: 14, d: 12 },
      furniture: 'crypto',
      signText: 'Cryptography Lab',
    },
    {
      id: 'soc',
      name: 'Security Operations Centre',
      color: 0x6b7f94,
      center: { x: 20, z: 9 },
      size: { w: 16, d: 12 },
      furniture: 'soc',
      signText: 'SOC',
    },
    {
      id: 'red-team',
      name: 'Red Team Operations',
      color: 0xd0645a,
      center: { x: 39, z: 9 },
      size: { w: 16, d: 12 },
      furniture: 'red-team',
      signText: 'Red Team',
    },
    {
      id: 'engineering',
      name: 'Engineering',
      color: 0xd8934a,
      center: { x: -19, z: -15 },
      size: { w: 16, d: 14 },
      furniture: 'engineering',
      signText: 'Engineering',
    },
    {
      id: 'quantum',
      name: 'Quantum Wing',
      color: 0x8a7fd0,
      center: { x: -39, z: -15 },
      size: { w: 18, d: 14 },
      furniture: 'quantum',
      signText: 'Quantum Wing',
    },
    {
      id: 'adv-compute',
      name: 'Advanced Compute',
      color: 0x7ea87a,
      center: { x: -35, z: 12 },
      size: { w: 14, d: 12 },
      furniture: 'adv-compute',
      signText: 'Advanced Compute',
    },
    {
      id: 'secure-core',
      name: 'Secure Core',
      color: 0x3a3a3f,
      center: { x: -53, z: 0 },
      size: { w: 12, d: 10 },
      furniture: 'vault',
      signText: 'Secure Core',
    },
  ],
  // Every transition below is the reference facility's exact size +2 in both
  // dimensions (1 unit added on each side). The reference numbers were sized
  // for a real navmesh, where two adjacent shapes touching at a shared edge
  // is a normal doorway; our isWalkable() pads room and corridor rectangles
  // independently by the body radius, so an exact touch becomes a 1-unit gap
  // neither shape covers once padded — confirmed by sceneMaps.test.ts, which
  // requires every room to stay reachable once BODY_PAD is applied. The
  // rooms themselves keep their exact canonical sizes; only the connective
  // corridors get roomier.
  corridors: [
    { x: 0, z: -10, w: 6, d: 8 }, // T0 — Reception <-> Central Ops
    { x: -10, z: 0, w: 4, d: 6 }, // OPS_FND
    { x: 0, z: 9.5, w: 6, d: 7 }, // OPS_COMM
    { x: -9, z: 17, w: 6, d: 6 }, // CRYPTO_COMM
    { x: 10.5, z: 5, w: 5, d: 6 }, // T1A — Ops <-> SOC
    { x: 9.5, z: 13.5, w: 7, d: 5 }, // T1B — Comms <-> SOC
    { x: 29.5, z: 9, w: 5, d: 6 }, // T2 — SOC <-> Red Team
    { x: -18, z: -7, w: 6, d: 4 }, // T3 — Foundations <-> Engineering
    { x: -28.5, z: -15, w: 5, d: 6 }, // T4_Q — Engineering <-> Quantum <-> spine
    { x: -29, z: -3.5, w: 4, d: 21 }, // T4_SPINE — Engineering/Quantum <-> Advanced Compute
    { x: -44.5, z: 0, w: 7, d: 12 }, // T5_VEST — Secure Core vestibule
    { x: -44.5, z: -6.5, w: 5, d: 5 }, // Q_T5 — Quantum <-> Secure Core vestibule
    { x: -44.5, z: 7.5, w: 4, d: 7 }, // ADV_T5_V
    { x: -43.25, z: 10, w: 4.5, d: 4 }, // ADV_T5_H — Advanced Compute <-> Secure Core vestibule
  ],
  vents: [
    { id: 'v-fnd', x: -18, z: -3, links: ['v-eng', 'v-qtm'] },
    { id: 'v-eng', x: -19, z: -18, links: ['v-fnd', 'v-qtm'] },
    { id: 'v-qtm', x: -35, z: -18, links: ['v-fnd', 'v-eng'] },
    { id: 'v-adv', x: -32, z: 15, links: ['v-core'] },
    { id: 'v-core', x: -50, z: 3, links: ['v-adv', 'v-rt'] },
    { id: 'v-rt', x: 36, z: 6, links: ['v-core'] },
  ],
  sensors: [
    { id: 't0', x: 0, z: -10 },
    { id: 't1a', x: 10.5, z: 5 },
    { id: 't2', x: 29.5, z: 9 },
  ],
  playfield: { xMin: -62, xMax: 50, zMin: -25, zMax: 26 },
  fiber: { from: [-9, 0], to: [9, 0] },
  tap: { x: 0, z: 17 },
  crack: { x: 39, z: 9 },
  meeting: { x: 0, z: 0 },
  slots: [
    { id: 's1', x: -6, z: -3 },
    { id: 's2', x: 6, z: 3 },
    { id: 's3', x: -18, z: -3 },
    { id: 's4', x: -3, z: 19 },
    { id: 's5', x: -14, z: 20 },
    { id: 's6', x: 16, z: 6 },
    { id: 's7', x: -15, z: -18 },
    { id: 's8', x: -35, z: 9 },
  ],
  spawn: { alice: { x: -18, z: 12 }, bob: { x: 0, z: 14 }, eve: { x: 20, z: 9 } },
};

/**
 * The reference facility's own room dimensions, applied uniformly: HQ's 11
 * rooms cover roughly double the total floor area of any other map here
 * (Meridian Array's 12 rooms included) — a real cost, not just a bigger
 * number. Confirmed live: at the default "high" quality tier, the
 * full-size version of this map crashed the renderer outright (not the
 * usual slow-frame stall — an actual lost WebGL context), reproducibly,
 * independent of furniture density; only dropping to "balanced" survived.
 * Scaling every coordinate down keeps 100% of the reference's room graph,
 * adjacencies, names and relative proportions — the part that actually
 * matters for "matching it" — while bringing total geometry back into a
 * budget this renderer handles safely on the default tier. `BODY_PAD`
 * (character radius, real-world meters) does not scale with the map, so the
 * corridor overlap margins added above keep a comfortable safety margin
 * rather than shrinking to nothing.
 */
const HQ_SCALE = 1;

function scaleMapDef(map: MapDef, factor: number): MapDef {
  const s = (n: number) => n * factor;
  const sPt = (p: { x: number; z: number }) => ({ x: s(p.x), z: s(p.z) });
  return {
    ...map,
    rooms: map.rooms.map((r) => ({ ...r, center: sPt(r.center), size: { w: s(r.size.w), d: s(r.size.d) } })),
    // Corridor *positions* scale with everything else, but width/depth stay
    // at their original, already-BODY_PAD-validated size: those margins were
    // sized to survive isWalkable's fixed (real-world, non-scaling)
    // BODY_PAD, so shrinking them by `factor` too would shrink the safety
    // margin below what a fixed body radius needs — confirmed by rerunning
    // sceneMaps.test.ts, which caught exactly this the first time.
    corridors: map.corridors.map((c) => ({ x: s(c.x), z: s(c.z), w: c.w, d: c.d })),
    vents: map.vents.map((v) => ({ ...v, x: s(v.x), z: s(v.z) })),
    sensors: map.sensors.map((se) => ({ ...se, x: s(se.x), z: s(se.z) })),
    playfield: {
      xMin: s(map.playfield.xMin),
      xMax: s(map.playfield.xMax),
      zMin: s(map.playfield.zMin),
      zMax: s(map.playfield.zMax),
    },
    fiber: {
      from: [s(map.fiber.from[0]), s(map.fiber.from[1])],
      to: [s(map.fiber.to[0]), s(map.fiber.to[1])],
    },
    tap: sPt(map.tap),
    crack: sPt(map.crack),
    meeting: sPt(map.meeting),
    slots: map.slots.map((sl) => ({ ...sl, x: s(sl.x), z: s(sl.z) })),
    spawn: {
      alice: sPt(map.spawn.alice),
      bob: sPt(map.spawn.bob),
      eve: sPt(map.spawn.eve),
    },
  };
}

export const MAPS: MapDef[] = [RELAY, GREENHOUSE, MINE, MERIDIAN, scaleMapDef(HQ, HQ_SCALE)];

export function getMap(id: string): MapDef {
  return MAPS.find((m) => m.id === id) ?? RELAY;
}

export function roomContaining(map: MapDef, x: number, z: number): RoomDef | null {
  for (const room of map.rooms) {
    if (
      Math.abs(x - room.center.x) <= room.size.w / 2 &&
      Math.abs(z - room.center.z) <= room.size.d / 2
    ) {
      return room;
    }
  }
  return null;
}

/**
 * Walkability with an inset: `pad` shrinks every room/corridor so a body of
 * that radius can never overlap the wall geometry. This is what stops limbs
 * poking through walls — the character simply can't get close enough.
 */
export function isWalkable(map: MapDef, x: number, z: number, pad = 0): boolean {
  for (const r of map.rooms) {
    if (
      Math.abs(x - r.center.x) <= r.size.w / 2 - pad &&
      Math.abs(z - r.center.z) <= r.size.d / 2 - pad
    ) {
      return true;
    }
  }
  for (const c of map.corridors) {
    if (Math.abs(x - c.x) <= c.w / 2 - pad && Math.abs(z - c.z) <= c.d / 2 - pad) return true;
  }
  return false;
}

/**
 * A point flush against one interior wall of `room`, `inset` world units in
 * from it, with `rotY` set so a prop's local +Z ("front") faces inward. The
 * one piece of placement math both `sceneOfficeProps.ts` (which renders a
 * prop there) and `quantumHeist.ts` (which needs the exact same point for
 * an interact trigger) share, so the two can never drift apart.
 */
export function wallSlotPosition(
  room: RoomDef,
  edge: 'north' | 'south' | 'east' | 'west',
  inset: number,
): { x: number; z: number; rotY: number } {
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

/** The reception counter's own wall slot — the edge opposite its signage,
 * inset 28% of the room's shorter span. Matches `buildRoomFurniture`'s
 * `'reception'` case in `sceneOfficeProps.ts` exactly. */
export function receptionCounterSlot(room: RoomDef): { x: number; z: number; rotY: number } {
  const signEdge: 'north' | 'south' | 'east' | 'west' = room.glassFront === 'north' ? 'south' : 'north';
  return wallSlotPosition(room, signEdge, Math.min(room.size.w, room.size.d) * 0.28);
}

/** World position of the reception badge-kiosk keypad — 0.55 units in
 * front of the reception counter, matching the keypad pedestal's local
 * offset in `buildReceptionCounter` (`sceneOfficeProps.ts`). This is the
 * single source of truth `quantumHeist.ts`/`quantumHeistNetwork.ts` use to
 * place the badge interactable, so it always lines up with the rendered
 * prop rather than an independently-guessed coordinate. */
export function receptionKioskPosition(room: RoomDef): { x: number; z: number } {
  const counter = receptionCounterSlot(room);
  return {
    x: counter.x + Math.sin(counter.rotY) * 0.55,
    z: counter.z + Math.cos(counter.rotY) * 0.55,
  };
}
