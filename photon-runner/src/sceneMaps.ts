import { Role } from './sceneTypes';

export interface RoomDef {
  id: string;
  name: string;
  color: number;
  center: { x: number; z: number };
  size: { w: number; d: number };
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

export const MAPS: MapDef[] = [RELAY, GREENHOUSE, MINE];

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
