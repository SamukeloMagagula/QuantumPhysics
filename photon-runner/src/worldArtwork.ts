import type { RoomId } from './pqRooms';

export interface RoomArtwork {
  src: string;
  /** Clear floor bounds in the original image, normalized to its dimensions. */
  floor: [number, number, number, number];
  entrance: [number, number];
}
const lab: RoomArtwork = { src: '/pq/rooms/cryptography-lab.png', floor: [.24, .39, .75, .59], entrance: [.46, .51] };
const comms: RoomArtwork = { src: '/pq/rooms/communications-centre.png', floor: [.24, .51, .76, .65], entrance: [.40, .59] };
const soc: RoomArtwork = { src: '/pq/rooms/security-operations-centre.png', floor: [.27, .41, .75, .69], entrance: [.41, .58] };
const server: RoomArtwork = { src: '/pq/expansion-v1/server-hall.png', floor: [.33, .45, .65, .76], entrance: [.42, .57] };

/** Original generated assets, unmodified. Departments without their own image
 * share an appropriate existing set instead of inventing a mismatched style. */
export const WORLD_ARTWORK: Record<Exclude<RoomId, 'facility'>, RoomArtwork> = {
  ops: comms,
  'crypto-lab': lab,
  'comms-centre': comms,
  'soc-room': soc,
  'engineering-room': { src: '/pq/rooms/engineering-workshop.png', floor: [.31, .44, .73, .68], entrance: [.40, .58] },
  'quantum-wing': { src: '/pq/rooms/quantum-wing.png', floor: [.33, .44, .68, .67], entrance: [.40, .57] },
  bullpen: soc,
  briefing: comms,
  breakroom: lab,
  server,
  'server-hall': server,
  'cryogenics-lab': { src: '/pq/expansion-v1/cryogenics-lab.png', floor: [.36, .52, .70, .76], entrance: [.42, .57] },
  'secure-archive': { src: '/pq/expansion-v1/secure-archive.png', floor: [.31, .43, .68, .67], entrance: [.42, .57] },
  'power-control-room': { src: '/pq/expansion-v1/power-control-room.png', floor: [.25, .49, .73, .79], entrance: [.43, .57] },
};
export const ART_TOP = 18;
export const ART_HEIGHT = 250 / 1.5;
export function artworkFor(id: RoomId): RoomArtwork { return WORLD_ARTWORK[id === 'facility' ? 'ops' : id]; }
