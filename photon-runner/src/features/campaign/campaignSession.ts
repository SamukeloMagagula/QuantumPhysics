import { CampaignState, ChapterId, initialCampaign } from './campaignStory';

/**
 * The run in progress, held outside React.
 *
 * A stage used to live entirely inside CampaignPanel, which meant standing up
 * from Workstation 04 destroyed it — the chapter, the clock and every solved
 * task went with the unmount. That was fine while the whole campaign happened
 * at one desk. It is not fine now that some tasks are somewhere else in the
 * building: walking to the equipment row has to be a thing you do *during* a
 * stage, not something that throws the stage away.
 *
 * So the session lives here, and the panel is only a view of it. Sitting down
 * anywhere resumes exactly where you left off, and the clock keeps running
 * while you walk, because the walk is part of the run.
 */

export interface SessionResult {
  ms: number;
  underPar: boolean;
}

export interface CampaignSession {
  /** null when no stage is being played — the panel shows stage select. */
  stageId: ChapterId | null;
  state: CampaignState;
  /** Beat ids whose exercise has been completed this run. */
  solved: string[];
  /** Epoch ms the run started; 0 when idle. */
  startedAt: number;
  lastOutcome: { text: string; unsupported: boolean } | null;
  result: SessionResult | null;
}

export function emptySession(): CampaignSession {
  return {
    stageId: null,
    state: initialCampaign(),
    solved: [],
    startedAt: 0,
    lastOutcome: null,
    result: null,
  };
}

let current: CampaignSession = emptySession();
const listeners = new Set<() => void>();

export function getSession(): CampaignSession {
  return current;
}

/**
 * Replace the session. Identity changes on every write, so
 * `useSyncExternalStore` re-renders without a deep compare.
 */
export function setSession(next: CampaignSession): void {
  current = next;
  for (const fn of [...listeners]) fn();
}

export function updateSession(fn: (s: CampaignSession) => CampaignSession): void {
  setSession(fn(current));
}

export function resetSession(): void {
  setSession(emptySession());
}

export function subscribeSession(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** True while a stage is running and not yet cleared. */
export function isRunning(s: CampaignSession = current): boolean {
  return s.stageId !== null && s.result === null;
}

/** Elapsed run time, frozen once the stage is cleared. */
export function elapsedMs(s: CampaignSession, now: number): number {
  if (s.result) return s.result.ms;
  if (!s.startedAt) return 0;
  return Math.max(0, now - s.startedAt);
}
