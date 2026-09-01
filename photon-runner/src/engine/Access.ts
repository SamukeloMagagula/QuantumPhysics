/**
 * Zone-gated access, ported from the reference facility's
 * `PQAccessProfile`/`PQSecureDoor` pair. Every zone (in practice, a room
 * id — see `roomContaining` in `sceneMaps.ts`) is open by default; call
 * `restrict()` to lock one down for the current match, then `grant()` to
 * open it for a specific actor. Movement code treats a restricted zone the
 * actor hasn't been granted the same as a wall — see `quantumHeist.ts`/
 * `quantumHeistNetwork.ts`'s use of `isZoneOpen`.
 *
 * Unlike the reference (a per-player `MonoBehaviour` component), this is a
 * single module-level registry, because only one operative is ever locally
 * controlled per running `Game` instance — same reasoning as
 * `interactionRegistry`/`gameState`. `reset()` at the start of each match
 * (both restrictions and grants) means a new round never inherits who
 * badged into the vault last time.
 */

class AccessRegistryImpl {
  private restrictedZones = new Set<string>();
  private grants = new Map<string, Set<string>>();

  /** Lock a zone down — from here on, `canEnter` returns false for it
   * unless the actor has been explicitly `grant`ed access. */
  restrict(zone: string): void {
    this.restrictedZones.add(zone);
  }

  /** True for any zone that was never `restrict`ed, or one `actorId` has
   * been `grant`ed. `zone === null` (not inside any tracked room — e.g. a
   * corridor) is always open. */
  canEnter(actorId: string, zone: string | null): boolean {
    if (zone === null) return true;
    if (!this.restrictedZones.has(zone)) return true;
    return this.grants.get(actorId)?.has(zone) ?? false;
  }

  grant(actorId: string, zone: string): void {
    let set = this.grants.get(actorId);
    if (!set) {
      set = new Set();
      this.grants.set(actorId, set);
    }
    set.add(zone);
  }

  revoke(actorId: string, zone: string): void {
    this.grants.get(actorId)?.delete(zone);
  }

  isRestricted(zone: string): boolean {
    return this.restrictedZones.has(zone);
  }

  /** Test-only, and also called at the start of every match. */
  reset(): void {
    this.restrictedZones.clear();
    this.grants.clear();
  }
}

export const accessRegistry = new AccessRegistryImpl();
