import { afterEach, expect, it, test } from 'vitest';
import { discoverRoom, explorerRank, nextRank, rankFor, readExplored, saveExplored } from './worldExploration';
import { WORLD_ZONES } from './worldLayout';
afterEach(() => localStorage.clear());
it('awards each room once, including after restoring saved exploration', () => {
  const first = discoverRoom([], 'ops');
  expect(discoverRoom(first, 'ops')).toBe(first);
  saveExplored(first);
  expect(discoverRoom(readExplored(), 'ops')).toEqual(['ops']);
  expect(discoverRoom(readExplored(), 'crypto-lab')).toEqual(['ops', 'crypto-lab']);
});
it('ignores corrupt, duplicated and unknown saved room IDs', () => {
  localStorage.setItem('quantum-campus:explored:v1', '["ops","ops","not-a-room",null]');
  expect(readExplored()).toEqual(['ops']);
  localStorage.setItem('quantum-campus:explored:v1', '{broken');
  expect(readExplored()).toEqual([]);
});
it('earns the final rank only after discovering the whole campus', () => {
  expect(explorerRank(0)).toBe('New Recruit');
  expect(explorerRank(3)).toBe('Signal Scout');
  expect(explorerRank(8)).toBe('Field Explorer');
  expect(explorerRank(13)).not.toBe('Campus Pathfinder');
  expect(explorerRank(15)).toBe('Campus Pathfinder');
});

test('ranks climb with medals and always point at the next goal', () => {
  expect(rankFor(0).medal).toBe('recruit');
  expect(rankFor(3).medal).toBe('bronze');
  expect(rankFor(8).medal).toBe('silver');
  expect(rankFor(WORLD_ZONES.length).medal).toBe('gold');
  expect(nextRank(0)?.name).toBe('Signal Scout');
  expect(nextRank(7)?.places).toBe(8);
  expect(nextRank(WORLD_ZONES.length)).toBeUndefined();
});
