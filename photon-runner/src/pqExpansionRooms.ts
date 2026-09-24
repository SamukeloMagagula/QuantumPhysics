import type { Door, ImageProp, Room, RoomId } from './pqRooms';
import type { Poly, StationKind, Vec2 } from './pqScene';

const rect = (x: number, y: number, w: number, h: number): Poly =>
  [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const point = (x: number, y: number): Vec2 => ({ x, y });
const base = '/pq/expansion-v1/';
const defs: {
  id: RoomId; name: string; parent: RoomId; parentPoint: Vec2;
  floor: Poly; entrance?: Poly; spawn: Vec2; station: StationKind;
  console: Vec2; approach: Vec2; seat: Vec2; prop: ImageProp;
}[] = [
  {
    id: 'server-hall', name: 'Server Hall', parent: 'comms-centre', parentPoint: point(.70, .62),
    floor: rect(.30, .42, .38, .37), entrance: rect(.40, .77, .20, .13), spawn: point(.50, .86),
    station: 'rack', console: point(.62, .27), approach: point(.60, .45), seat: point(.62, .37),
    prop: { id: 'network-rack', src: base + 'detail-network-rack.png', box: [.28, .46, .13, .195],
      footprint: rect(.31, .61, .07, .04), depth: .65 },
  },
  {
    id: 'cryogenics-lab', name: 'Cryogenics Lab', parent: 'quantum-wing', parentPoint: point(.65, .65),
    floor: rect(.34, .49, .39, .30), entrance: rect(.40, .77, .20, .13), spawn: point(.50, .86),
    station: 'hardware', console: point(.56, .29), approach: point(.56, .52), seat: point(.56, .40),
    prop: { id: 'optics-case', src: base + 'detail-optics-case.png', box: [.65, .65, .065, .0975],
      footprint: rect(.655, .71, .055, .035), depth: .745 },
  },
  {
    id: 'secure-archive', name: 'Secure Archive', parent: 'crypto-lab', parentPoint: point(.69, .54),
    floor: rect(.29, .40, .41, .28), entrance: rect(.40, .66, .20, .23), spawn: point(.50, .85),
    station: 'forensics', console: point(.51, .23), approach: point(.51, .43), seat: point(.49, .35),
    prop: { id: 'access-terminal', src: base + 'detail-access-terminal.png', box: [.60, .47, .09, .135],
      footprint: rect(.63, .58, .035, .025), depth: .605 },
  },
  {
    id: 'power-control-room', name: 'Power Control Room', parent: 'engineering-room', parentPoint: point(.68, .65),
    floor: rect(.22, .46, .54, .36), spawn: point(.50, .48),
    station: 'hardware', console: point(.60, .31), approach: point(.61, .49), seat: point(.72, .49),
    prop: { id: 'maintenance-cart', src: base + 'detail-maintenance-cart.png', box: [.23, .56, .11, .165],
      footprint: rect(.24, .685, .085, .045), depth: .73 },
  },
];

/** Side passages from existing wings; each has a reciprocal exit. */
export const EXPANSION_LINKS: { from: RoomId; door: Door }[] = defs.map(d => ({
  from: d.parent,
  door: { id: `${d.parent}-${d.id}`, to: d.id, label: d.name,
    anchor: d.parentPoint, approach: d.parentPoint, hitRadius: .025, requiresAccess: true },
}));

export const EXPANSION_ROOMS: Room[] = defs.map((d, i) => ({
  id: d.id, name: d.name, kicker: 'Phantom Q · facility expansion',
  art: { kind: 'image', src: base + d.id + '.png', aspect: 3 / 2 },
  actorScale: 1.05,
  floor: { walk: d.floor, walks: d.entrance ? [d.entrance] : [], obstacles: [d.prop.footprint] },
  spawn: d.spawn,
  doors: [{ id: `${d.id}-${d.parent}`, to: d.parent, label: 'Return to connected wing',
    anchor: d.id === 'power-control-room' ? point(.50, .30) : d.spawn,
    approach: d.spawn, hitRadius: .035 }],
  hotspots: [{ id: `${d.id}-console`, station: d.station, anchor: d.console, approach: d.approach,
    hitRadius: .035, kicker: d.name, title: 'Inspect facility systems', label: 'Inspect facility systems' }],
  imageProps: [d.prop],
  npcs: [
    { id: `${d.id}-operator`, name: ['Idowu', 'Song', 'Amina', 'Rasmussen'][i], look: i + 2,
      seat: { pos: d.seat, facing: 'ne', clipY: null, chair: d.id === 'power-control-room' },
      path: [], speed: 0, dwell: 3, rest: 12, lines: ['Systems are ready for inspection.'] },
    { id: `${d.id}-technician`, name: 'Technician', look: i + 6, seat: null,
      path: [point(.44, .58), point(.57, .58)], speed: .025, dwell: 3, rest: 12, lines: [] },
  ],
  depthLayers: [],
  glows: [{ poly: rect(d.console.x - .018, d.console.y - .012, .036, .024), phase: i }],
}));
