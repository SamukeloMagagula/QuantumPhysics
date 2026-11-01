import type { Door, Room, RoomId } from './pqRooms';
import type { Poly, StationKind, Vec2 } from './pqScene';

/** Traced against the generated 1536 x 1024 backgrounds. Keep floor space
 * conservative: players stay in front of the baked-in desks and chairs. */
const rect = (x: number, y: number, w: number, h: number): Poly => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];
const point = (x: number, y: number): Vec2 => ({ x, y });

interface IllustratedRoom {
  id: RoomId;
  name: string;
  file: string;
  floor: Poly;
  entrance: Poly;
  apron?: Poly;
  obstacles: Poly[];
  spawn: Vec2;
  station: StationKind;
  stationLabel: string;
  stationPoint: Vec2;
  stationAnchor: Vec2;
  seat: Vec2;
  route: Vec2[];
  facilityPoint: Vec2;
  secured?: boolean;
}

const defs: IllustratedRoom[] = [
  {
    id: 'crypto-lab',
    name: 'Cryptography Lab',
    file: 'cryptography-lab.png',
    floor: rect(0.22, 0.38, 0.55, 0.225),
    entrance: rect(0.45, 0.59, 0.065, 0.31),
    apron: rect(0.4, 0.855, 0.19, 0.1),
    obstacles: [rect(0.19, 0.34, 0.025, 0.245), rect(0.775, 0.31, 0.16, 0.29)],
    spawn: point(0.48, 0.895),
    station: 'campaign',
    stationLabel: 'Open the investigation workstation',
    stationPoint: point(0.51, 0.405),
    stationAnchor: point(0.52, 0.2),
    seat: point(0.5, 0.32),
    route: [point(0.36, 0.53), point(0.65, 0.53)],
    facilityPoint: point(701 / 1448, 236 / 1086),
  },
  {
    id: 'comms-centre',
    name: 'Communications Centre',
    file: 'communications-centre.png',
    floor: rect(0.215, 0.49, 0.58, 0.17),
    entrance: rect(0.385, 0.645, 0.23, 0.3),
    obstacles: [rect(0.05, 0.48, 0.12, 0.17), rect(0.8, 0.45, 0.14, 0.21)],
    spawn: point(0.5, 0.86),
    station: 'attack',
    stationLabel: 'Open the QKD attack console',
    stationPoint: point(0.5, 0.515),
    stationAnchor: point(0.51, 0.285),
    seat: point(0.5, 0.425),
    route: [point(0.36, 0.59), point(0.65, 0.59)],
    facilityPoint: point(1060 / 1448, 236 / 1086),
  },
  {
    id: 'soc-room',
    name: 'Security Operations Centre',
    file: 'security-operations-centre.png',
    floor: rect(0.255, 0.385, 0.515, 0.32),
    entrance: rect(0.395, 0.69, 0.2, 0.25),
    obstacles: [rect(0.075, 0.375, 0.165, 0.285), rect(0.79, 0.37, 0.16, 0.33)],
    spawn: point(0.5, 0.865),
    station: 'forensics',
    stationLabel: 'Review channel forensics',
    stationPoint: point(0.51, 0.425),
    stationAnchor: point(0.5, 0.225),
    seat: point(0.27, 0.325),
    route: [point(0.37, 0.57), point(0.65, 0.57)],
    facilityPoint: point(1240 / 1448, 442 / 1086),
    secured: true,
  },
  {
    id: 'engineering-room',
    name: 'Engineering Workshop',
    file: 'engineering-workshop.png',
    floor: rect(0.295, 0.41, 0.455, 0.295),
    entrance: rect(0.38, 0.69, 0.235, 0.25),
    obstacles: [rect(0.07, 0.35, 0.19, 0.345), rect(0.79, 0.32, 0.16, 0.37)],
    spawn: point(0.5, 0.865),
    station: 'hardware',
    stationLabel: 'Diagnose hardware at the workbench',
    stationPoint: point(0.47, 0.45),
    stationAnchor: point(0.47, 0.27),
    seat: point(0.37, 0.345),
    route: [point(0.38, 0.57), point(0.65, 0.57)],
    facilityPoint: point(155 / 1448, 655 / 1086),
    secured: true,
  },
  {
    id: 'quantum-wing',
    name: 'Quantum Wing',
    file: 'quantum-wing.png',
    floor: rect(0.305, 0.405, 0.395, 0.29),
    entrance: rect(0.38, 0.68, 0.215, 0.265),
    obstacles: [rect(0.04, 0.25, 0.235, 0.44), rect(0.745, 0.25, 0.21, 0.44)],
    spawn: point(0.5, 0.865),
    station: 'hardware',
    stationLabel: 'Investigate the optical hardware',
    stationPoint: point(0.37, 0.5),
    stationAnchor: point(0.19, 0.415),
    seat: point(0.49, 0.34),
    route: [point(0.42, 0.61), point(0.64, 0.61)],
    facilityPoint: point(490 / 1448, 688 / 1086),
    secured: true,
  },
];

export const GENERATED_ENTRANCES: Door[] = defs.map(d => ({
  id: `facility-${d.id}`,
  to: d.id,
  label: d.name,
  anchor: d.facilityPoint,
  approach: d.facilityPoint,
  hitRadius: 0.024,
  requiresAccess: d.secured,
}));

export const GENERATED_ROOMS: Room[] = defs.map((d, i) => ({
  id: d.id,
  name: d.name,
  kicker: 'Phantom Q · research wing',
  art: { kind: 'image', src: `/pq/rooms/${d.file}`, aspect: 3 / 2 },
  actorScale: 1.05,
  floor: { walk: d.floor, walks: [d.entrance, ...(d.apron ? [d.apron] : [])], obstacles: d.obstacles },
  spawn: d.spawn,
  doors: [{ id: `${d.id}-facility`, to: 'facility', label: 'Facility', anchor: d.spawn, approach: d.spawn, hitRadius: 0.035 }],
  hotspots: [
    {
      id: `${d.id}-station`,
      station: d.station,
      anchor: d.stationAnchor,
      approach: d.stationPoint,
      hitRadius: 0.035,
      kicker: d.name,
      title: d.stationLabel,
      label: d.stationLabel,
    },
  ],
  npcs: [
    {
      id: `${d.id}-analyst`,
      name: ['Amina', 'Petrov', 'Marchetti', 'Adeyinka', 'Song'][i],
      look: i,
      seat: { pos: d.seat, facing: 'ne', clipY: null, chair: false },
      path: [],
      speed: 0,
      dwell: 3,
      rest: 14,
      lines: ['The station is ready when you are.'],
    },
    { id: `${d.id}-technician`, name: 'Technician', look: i + 5, seat: null, path: d.route, speed: 0.025, dwell: 3, rest: 14, lines: [] },
  ],
  depthLayers: [],
  glows: [],
}));
