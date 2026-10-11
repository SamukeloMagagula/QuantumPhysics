import { WORLD_ZONES } from './worldLayout';
import type { RoomId } from './pqRooms';
const KEY = 'quantum-campus:explored:v1';
export function readExplored(): RoomId[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(value) ? [...new Set(value.filter((id): id is RoomId => WORLD_ZONES.some(z => z.id === id)))] : [];
  } catch { return []; }
}
export function discoverRoom(visited: RoomId[], id: RoomId): RoomId[] {
  return visited.includes(id) ? visited : [...visited, id];
}
export function saveExplored(visited: RoomId[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(visited)); } catch { /* This visit still counts in memory. */ }
}
export function explorerRank(count: number): string {
  return count >= 14 ? 'Campus Pathfinder' : count >= 8 ? 'Field Explorer' : count >= 3 ? 'Signal Scout' : 'New Recruit';
}
