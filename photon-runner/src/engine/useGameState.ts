import { useSyncExternalStore } from 'react';
import { GameState, gameState } from './GameState';

/** React binding for the framework-agnostic `gameState` store — kept in its
 * own file so `GameState.ts` itself has zero React dependency and stays
 * usable from plain game/engine code. */
export function useGameState(): GameState {
  return useSyncExternalStore(
    (onChange) => gameState.subscribe(onChange),
    () => gameState.current
  );
}
