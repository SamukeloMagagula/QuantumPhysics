import type { Door, Room, RoomId } from './pqRooms';
import type { Poly, StationKind, Vec2 } from './pqScene';

/** Traced against the generated 1536 x 1024 backgrounds. Keep floor space
 * conservative: players stay in front of the baked-in desks and chairs. */
const rect = (x: number, y: number, w: number, h: number): Poly =>
  [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
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
    id: 'crypto-lab', name: 'Cryptography Lab', file: 'cryptography-lab.png',
    floor: rect(.22, .38, .55, .225), entrance: rect(.45, .59, .065, .31),
    apron: rect(.40, .855, .19, .10),
    obstacles: [rect(.19, .34, .025, .245), rect(.775, .31, .16, .29)],
    spawn: point(.48, .895), station: 'campaign', stationLabel: 'Open the investigation workstation',
    stationPoint: point(.51, .405), stationAnchor: point(.52, .20), seat: point(.50, .32),
    route: [point(.36, .53), point(.65, .53)], facilityPoint: point(701 / 1448, 236 / 1086),
  },
  {
    id: 'comms-centre', name: 'Communications Centre', file: 'communications-centre.png',
    floor: rect(.215, .49, .58, .17), entrance: rect(.385, .645, .23, .30),
    obstacles: [rect(.05, .48, .12, .17), rect(.80, .45, .14, .21)],
    spawn: point(.50, .86), station: 'attack', stationLabel: 'Open the QKD attack console',
    stationPoint: point(.50, .515), stationAnchor: point(.51, .285), seat: point(.50, .425),
    route: [point(.36, .59), point(.65, .59)], facilityPoint: point(1060 / 1448, 236 / 1086),
  },
  {
    id: 'soc-room', name: 'Security Operations Centre', file: 'security-operations-centre.png',
    floor: rect(.255, .385, .515, .32), entrance: rect(.395, .69, .20, .25),
    obstacles: [rect(.075, .375, .165, .285), rect(.79, .37, .16, .33)],
    spawn: point(.50, .865), station: 'forensics', stationLabel: 'Review channel forensics',
    stationPoint: point(.51, .425), stationAnchor: point(.50, .225), seat: point(.27, .325),
    route: [point(.37, .57), point(.65, .57)], facilityPoint: point(1240 / 1448, 442 / 1086), secured: true,
  },
  {
    id: 'engineering-room', name: 'Engineering Workshop', file: 'engineering-workshop.png',
    floor: rect(.295, .41, .455, .295), entrance: rect(.38, .69, .235, .25),
    obstacles: [rect(.07, .35, .19, .345), rect(.79, .32, .16, .37)],
    spawn: point(.50, .865), station: 'hardware', stationLabel: 'Diagnose hardware at the workbench',
    stationPoint: point(.47, .45), stationAnchor: point(.47, .27), seat: point(.37, .345),
    route: [point(.38, .57), point(.65, .57)], facilityPoint: point(155 / 1448, 655 / 1086), secured: true,
  },
  {
    id: 'quantum-wing', name: 'Quantum Wing', file: 'quantum-wing.png',
    floor: rect(.305, .405, .395, .29), entrance: rect(.38, .68, .215, .265),
    obstacles: [rect(.04, .25, .235, .44), rect(.745, .25, .21, .44)],
    spawn: point(.50, .865), station: 'hardware', stationLabel: 'Investigate the optical hardware',
    stationPoint: point(.37, .50), stationAnchor: point(.19, .415), seat: point(.49, .34),
    route: [point(.42, .61), point(.64, .61)], facilityPoint: point(490 / 1448, 688 / 1086), secured: true,
  },
];

export const GENERATED_ENTRANCES: Door[] = defs.map(d => ({
  id: `facility-${d.id}`, to: d.id, label: d.name,
  anchor: d.facilityPoint, approach: d.facilityPoint, hitRadius: .024,
  requiresAccess: d.secured,
}));

export const GENERATED_ROOMS: Room[] = defs.map((d, i) => ({
  id: d.id, name: d.name, kicker: 'Phantom Q · research wing',
  art: { kind: 'image', src: `/pq/rooms/${d.file}`, aspect: 3 / 2 },
  actorScale: 1.05,
  floor: { walk: d.floor, walks: [d.entrance, ...(d.apron ? [d.apron] : [])], obstacles: d.obstacles },
  spawn: d.spawn,
  doors: [{ id: `${d.id}-facility`, to: 'facility', label: 'Facility',
    anchor: d.spawn, approach: d.spawn, hitRadius: .035 }],
  hotspots: [{ id: `${d.id}-station`, station: d.station,
    anchor: d.stationAnchor, approach: d.stationPoint, hitRadius: .035,
    kicker: d.name, title: d.stationLabel, label: d.stationLabel }],
  npcs: [
    { id: `${d.id}-analyst`, name: ['Amina', 'Petrov', 'Marchetti', 'Adeyinka', 'Song'][i],
      look: i, seat: { pos: d.seat, facing: 'ne', clipY: null, chair: false },
      path: [], speed: 0, dwell: 3, rest: 14, lines: ['The station is ready when you are.'] },
    { id: `${d.id}-technician`, name: 'Technician', look: i + 5, seat: null,
      path: d.route, speed: .025, dwell: 3, rest: 14, lines: [] },
  ],
  depthLayers: [], glows: [],
}));
