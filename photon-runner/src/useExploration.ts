import { useEffect, useState } from 'react';
import { play } from './sound';
import { discoverRoom, rankFor, readExplored, saveExplored, type ExplorerRank } from './worldExploration';
import type { WorldZone } from './worldLayout';

/**
 * Discovering places: reaching a room's clear centre records it once, shows a
 * short toast, and celebrates crossing into a new explorer rank.
 */
export function useExploration(active: boolean, room: WorldZone | undefined, atCentre: boolean) {
  const [explored, setExplored] = useState(readExplored);
  const [discovery, setDiscovery] = useState<string | null>(null);
  const [rankUp, setRankUp] = useState<ExplorerRank | null>(null);

  useEffect(() => {
    if (!active || !room || !atCentre || explored.includes(room.id)) return;
    const next = discoverRoom(explored, room.id);
    setExplored(next);
    saveExplored(next);
    setDiscovery(room.name);
    const after = rankFor(next.length);
    if (after.name !== rankFor(explored.length).name) {
      setRankUp(after);
      play('rankUp');
    } else play('discover');
    // Keyed on the room's id, not the object, which is rebuilt as the player moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, room?.id, atCentre, explored]);

  useEffect(() => {
    if (!discovery) return;
    const timeout = window.setTimeout(() => setDiscovery(null), 3500);
    return () => window.clearTimeout(timeout);
  }, [discovery]);

  useEffect(() => {
    if (!rankUp) return;
    const timeout = window.setTimeout(() => setRankUp(null), 6000);
    return () => window.clearTimeout(timeout);
  }, [rankUp]);

  return { explored, discovery, rankUp, dismissRankUp: () => setRankUp(null) };
}
