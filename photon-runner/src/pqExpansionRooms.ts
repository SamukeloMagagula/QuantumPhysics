import type { Door, ImageProp, Room, RoomId } from './pqRooms';
import type { Poly, StationKind, Vec2 } from './pqScene';

const rect = (x: number, y: number, w: number, h: number): Poly => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];
const point = (x: number, y: number): Vec2 => ({ x, y });
const base = '/pq/expansion-v1/';
const defs: {
  id: RoomId;
  name: string;
  parent: RoomId;
  parentPoint: Vec2;
  floor: Poly;
  entrance?: Poly;
  spawn: Vec2;
  station: StationKind;
  console: Vec2;
  approach: Vec2;
  seat: Vec2;
  prop: ImageProp;
}[] = [
  {
    id: 'server-hall',
    name: 'Server Hall',
    parent: 'comms-centre',
    parentPoint: point(0.7, 0.62),
    floor: rect(0.3, 0.42, 0.38, 0.37),
    entrance: rect(0.4, 0.77, 0.2, 0.13),
    spawn: point(0.5, 0.86),
    station: 'rack',
    console: point(0.62, 0.27),
    approach: point(0.6, 0.45),
    seat: point(0.62, 0.37),
    prop: {
      id: 'network-rack',
      src: base + 'detail-network-rack.png',
      box: [0.28, 0.46, 0.13, 0.195],
      footprint: rect(0.31, 0.61, 0.07, 0.04),
      depth: 0.65,
    },
  },
  {
    id: 'cryogenics-lab',
    name: 'Cryogenics Lab',
    parent: 'quantum-wing',
    parentPoint: point(0.65, 0.65),
    floor: rect(0.34, 0.49, 0.39, 0.3),
    entrance: rect(0.4, 0.77, 0.2, 0.13),
    spawn: point(0.5, 0.86),
    station: 'hardware',
    console: point(0.56, 0.29),
    approach: point(0.56, 0.52),
    seat: point(0.56, 0.4),
    prop: {
      id: 'optics-case',
      src: base + 'detail-optics-case.png',
      box: [0.65, 0.65, 0.065, 0.0975],
      footprint: rect(0.655, 0.71, 0.055, 0.035),
      depth: 0.745,
    },
  },
  {
    id: 'secure-archive',
    name: 'Secure Archive',
    parent: 'crypto-lab',
    parentPoint: point(0.69, 0.54),
    floor: rect(0.29, 0.4, 0.41, 0.28),
    entrance: rect(0.4, 0.66, 0.2, 0.23),
    spawn: point(0.5, 0.85),
    station: 'forensics',
    console: point(0.51, 0.23),
    approach: point(0.51, 0.43),
    seat: point(0.49, 0.35),
    prop: {
      id: 'access-terminal',
      src: base + 'detail-access-terminal.png',
      box: [0.6, 0.47, 0.09, 0.135],
      footprint: rect(0.63, 0.58, 0.035, 0.025),
      depth: 0.605,
    },
  },
  {
    id: 'power-control-room',
    name: 'Power Control Room',
    parent: 'engineering-room',
    parentPoint: point(0.68, 0.65),
    floor: rect(0.22, 0.46, 0.54, 0.36),
    spawn: point(0.5, 0.48),
    station: 'hardware',
    console: point(0.6, 0.31),
    approach: point(0.61, 0.49),
    seat: point(0.72, 0.49),
    prop: {
      id: 'maintenance-cart',
      src: base + 'detail-maintenance-cart.png',
      box: [0.23, 0.56, 0.11, 0.165],
      footprint: rect(0.24, 0.685, 0.085, 0.045),
      depth: 0.73,
    },
  },
];

/** Side passages from existing wings; each has a reciprocal exit. */
export const EXPANSION_LINKS: { from: RoomId; door: Door }[] = defs.map(d => ({
  from: d.parent,
  door: {
    id: `${d.parent}-${d.id}`,
    to: d.id,
    label: d.name,
    anchor: d.parentPoint,
    approach: d.parentPoint,
    hitRadius: 0.025,
    requiresAccess: true,
  },
}));

export const EXPANSION_ROOMS: Room[] = defs.map((d, i) => ({
  id: d.id,
  name: d.name,
  kicker: 'Phantom Q · facility expansion',
  art: { kind: 'image', src: base + d.id + '.png', aspect: 3 / 2 },
  actorScale: 1.05,
  floor: { walk: d.floor, walks: d.entrance ? [d.entrance] : [], obstacles: [d.prop.footprint] },
  spawn: d.spawn,
  doors: [
    {
      id: `${d.id}-${d.parent}`,
      to: d.parent,
      label: 'Return to connected wing',
      anchor: d.id === 'power-control-room' ? point(0.5, 0.3) : d.spawn,
      approach: d.spawn,
      hitRadius: 0.035,
    },
  ],
  hotspots: [
    {
      id: `${d.id}-console`,
      station: d.station,
      anchor: d.console,
      approach: d.approach,
      hitRadius: 0.035,
      kicker: d.name,
      title: 'Inspect facility systems',
      label: 'Inspect facility systems',
    },
  ],
  imageProps: [d.prop],
  npcs: [
    {
      id: `${d.id}-operator`,
      name: ['Idowu', 'Song', 'Amina', 'Rasmussen'][i],
      look: i + 2,
      seat: { pos: d.seat, facing: 'ne', clipY: null, chair: d.id === 'power-control-room' },
      path: [],
      speed: 0,
      dwell: 3,
      rest: 12,
      lines: ['Systems are ready for inspection.'],
    },
    {
      id: `${d.id}-technician`,
      name: 'Technician',
      look: i + 6,
      seat: null,
      path: [point(0.44, 0.58), point(0.57, 0.58)],
      speed: 0.025,
      dwell: 3,
      rest: 12,
      lines: [],
    },
  ],
  depthLayers: [],
  glows: [{ poly: rect(d.console.x - 0.018, d.console.y - 0.012, 0.036, 0.024), phase: i }],
}));
