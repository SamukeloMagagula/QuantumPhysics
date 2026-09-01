/**
 * Generalized world-interaction system. An `Interactable` describes itself
 * declaratively — name, prompt, range, what happens — so future content
 * (the Phase 5 photon/polarization/Alice/Bob/Eve education stations, and
 * eventually storyline triggers) can be *defined*, not hand-wired into the
 * render loop each time.
 *
 * This does not replace the existing Quantum Heist task/console/terminal
 * flow (quantumHeist.ts, quantumHeistStations.ts) — those are tested and
 * working. It's the uniform registry new interactables register into; a
 * scene can optionally bridge an old-style station into this system (see
 * `registerInteractable` call sites) without rewriting how it already works.
 */

export interface InteractionContext {
  actorId: string;
}

export interface Interactable {
  id: string;
  name: string;
  description: string;
  /** Shown next to the "[E] ..." prompt. */
  prompt: string;
  position: { x: number; z: number };
  /** World units; how close `actorId` must be for `canInteract`/`interact`. */
  range: number;
  /** Breaks a near-tie in `nearestAvailable` against a lower-priority item
   * at similar range/facing — mirrors the reference facility's interaction
   * scorer (`PQInteractionDetector.cs`), where every interactable carries a
   * `Priority` used the same way. Defaults to 0 when omitted. */
  priority?: number;
  /** Optional extra gate beyond distance (e.g. a one-shot demo already played). */
  canInteract?: (ctx: InteractionContext) => boolean;
  onInteract: (ctx: InteractionContext) => void;
}

function distance(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** How much weight facing gets in `nearestAvailable`'s scoring, in the same
 * units as `priority * 10` and raw distance. 2.0 matches the reference's
 * own `facingWeight` default, tuned so a couple of world-units of extra
 * distance still beats a facing bonus, but among similarly-close items the
 * one you're actually looking at wins. */
const DEFAULT_FACING_WEIGHT = 2;

/** Dot of the actor's forward unit vector with the unit direction toward
 * `target` — in [-1, 1], 1 when facing it dead-on. `actorFacing` uses the
 * same sin/cos convention as every humanoid controller in this codebase
 * (sceneWorld.ts/sceneCampus.ts/sceneCharacter.ts): x = sin(facing), z =
 * cos(facing). Returns 0 (no facing bonus, no penalty) when facing is
 * unknown or the actor is standing on top of the target. */
function facingAlignment(
  actorPos: { x: number; z: number },
  target: { x: number; z: number },
  actorFacing: number | undefined,
): number {
  if (actorFacing === undefined) return 0;
  const dx = target.x - actorPos.x;
  const dz = target.z - actorPos.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-4) return 0;
  const fx = Math.sin(actorFacing);
  const fz = Math.cos(actorFacing);
  return (dx / len) * fx + (dz / len) * fz;
}

class InteractionRegistryImpl {
  private items = new Map<string, Interactable>();

  register(item: Interactable): void {
    this.items.set(item.id, item);
  }

  unregister(id: string): void {
    this.items.delete(id);
  }

  get(id: string): Interactable | undefined {
    return this.items.get(id);
  }

  all(): Interactable[] {
    return [...this.items.values()];
  }

  /** Best interactable actually in range of `actorPos`, respecting
   * `canInteract` — what a HUD binds its "[E] Interact" prompt to.
   *
   * Ranked by the reference facility's own scorer: `priority*10 - distance
   * + facing*facingWeight`. Pass the actor's facing angle (radians, same
   * sin/cos convention as `sceneWorld.ts`'s `updateCamera`/humanoid
   * controllers) so two stations at similar range resolve toward whichever
   * one the player is actually looking at, rather than flickering between
   * them. Omitting `actorFacing` (or leaving every `priority` at its
   * default of 0) reduces this to plain nearest-in-range, so existing call
   * sites that don't pass a facing keep their prior behavior exactly. */
  nearestAvailable(
    actorPos: { x: number; z: number },
    ctx: InteractionContext,
    actorFacing?: number,
  ): Interactable | null {
    let best: Interactable | null = null;
    let bestScore = -Infinity;
    for (const item of this.items.values()) {
      const d = distance(item.position, actorPos);
      if (d > item.range) continue;
      if (item.canInteract && !item.canInteract(ctx)) continue;
      const score =
        (item.priority ?? 0) * 10 - d + facingAlignment(actorPos, item.position, actorFacing) * DEFAULT_FACING_WEIGHT;
      if (score > bestScore) {
        best = item;
        bestScore = score;
      }
    }
    return best;
  }

  /** Runs `onInteract` if `id` exists and is currently interactable from
   * `actorPos`. Returns whether it actually fired. */
  interact(id: string, actorPos: { x: number; z: number }, ctx: InteractionContext): boolean {
    const item = this.items.get(id);
    if (!item) return false;
    if (distance(item.position, actorPos) > item.range) return false;
    if (item.canInteract && !item.canInteract(ctx)) return false;
    item.onInteract(ctx);
    return true;
  }

  /** Test-only. */
  reset(): void {
    this.items.clear();
  }
}

export const interactionRegistry = new InteractionRegistryImpl();
