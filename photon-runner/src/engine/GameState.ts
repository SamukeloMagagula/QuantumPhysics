/**
 * Centralized game-state machine. Framework-agnostic (no React import) so it
 * can be driven from anywhere — a React screen, an imperative game loop, or
 * later, storyline scripting — without any of those layers owning the truth
 * about "what mode is the game in right now."
 *
 * This is deliberately a flat enum + pub/sub, not a nested state chart: the
 * brief's own diagram (MAIN_MENU / LOADING / TUTORIAL / EXPLORATION /
 * EXPERIMENT / MISSION / COMBAT/CONFLICT / RESULTS / PAUSED) is a flat list,
 * and every consumer so far (HUD chrome, pause handling, analytics) only
 * ever needs "what state are we in," not a parent/child hierarchy.
 */

export type GameState =
  | 'MAIN_MENU'
  | 'LOADING'
  | 'TUTORIAL'
  | 'EXPLORATION'
  | 'EXPERIMENT'
  | 'MISSION'
  | 'CONFLICT'
  | 'RESULTS'
  | 'PAUSED';

export interface GameStateTransition {
  from: GameState;
  to: GameState;
  at: number;
}

type Listener = (transition: GameStateTransition) => void;

class GameStateStore {
  private state: GameState = 'MAIN_MENU';
  private listeners = new Set<Listener>();
  private history: GameStateTransition[] = [];

  get current(): GameState {
    return this.state;
  }

  /** Set a new state. No-ops (and does not notify) if it's already current —
   * callers can dispatch defensively without checking first. */
  set(next: GameState): void {
    if (next === this.state) return;
    const transition: GameStateTransition = { from: this.state, to: next, at: Date.now() };
    this.state = next;
    this.history.push(transition);
    if (this.history.length > 50) this.history.shift();
    this.listeners.forEach((fn) => fn(transition));
  }

  is(...states: GameState[]): boolean {
    return states.includes(this.state);
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Most recent transitions first — useful for debugging/telemetry. */
  recentHistory(): readonly GameStateTransition[] {
    return this.history;
  }

  /** Test-only: force back to the boot state without touching listeners. */
  reset(): void {
    this.state = 'MAIN_MENU';
    this.history = [];
  }
}

export const gameState = new GameStateStore();
