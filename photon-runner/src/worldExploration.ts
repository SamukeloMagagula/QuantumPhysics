import { WORLD_ZONES, type CampusZoneId } from './worldLayout';
const KEY = 'quantum-campus:explored:v1';
export function readExplored(): CampusZoneId[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(value) ? [...new Set(value.filter((id): id is CampusZoneId => WORLD_ZONES.some(z => z.id === id)))] : [];
  } catch { return []; }
}
export function discoverRoom(visited: CampusZoneId[], id: CampusZoneId): CampusZoneId[] {
  return visited.includes(id) ? visited : [...visited, id];
}
export function saveExplored(visited: CampusZoneId[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(visited)); } catch { /* This visit still counts in memory. */ }
}
export type MedalTier = 'recruit' | 'bronze' | 'silver' | 'gold';
export interface ExplorerRank { name: string; places: number; medal: MedalTier }
/** The explorer ladder, lowest first. Each step is earned by discovering places. */
export const EXPLORER_RANKS: ExplorerRank[] = [
  { name: 'New Recruit', places: 0, medal: 'recruit' },
  { name: 'Signal Scout', places: 3, medal: 'bronze' },
  { name: 'Field Explorer', places: 8, medal: 'silver' },
  { name: 'Campus Pathfinder', places: WORLD_ZONES.length, medal: 'gold' },
];
export function rankFor(count: number): ExplorerRank {
  return [...EXPLORER_RANKS].reverse().find(r => count >= r.places)!;
}
/** The next rank up, or undefined once the top is reached. */
export function nextRank(count: number): ExplorerRank | undefined {
  return EXPLORER_RANKS.find(r => r.places > count);
}
export function explorerRank(count: number): string {
  return rankFor(count).name;
}
