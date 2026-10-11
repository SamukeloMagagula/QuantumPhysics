import { afterEach, expect, it } from 'vitest';
import { discoverRoom, explorerRank, readExplored, saveExplored } from './worldExploration';
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
  expect(explorerRank(14)).toBe('Campus Pathfinder');
});
