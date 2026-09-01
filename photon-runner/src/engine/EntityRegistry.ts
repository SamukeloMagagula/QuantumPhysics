import { Role, ROLES } from '../sceneTypes';

export { ROLES };

/**
 * What each role is actually responsible for doing, as data rather than
 * something buried in a component. Existing gameplay logic
 * (qkdEngine.ts's BB84 simulation, quantumHeist.ts's task/role handling)
 * keeps owning the real mechanics — this is the uniform, addressable
 * description of "what Alice/Bob/Eve are for" that a HUD, a tutorial, or a
 * future storyline script can read without knowing which subsystem
 * implements it.
 */
export interface RoleResponsibility {
  id: string;
  label: string;
}

export const ROLE_RESPONSIBILITIES: Record<Role, RoleResponsibility[]> = {
  alice: [
    { id: 'send-photons', label: 'Send photons' },
    { id: 'choose-basis', label: 'Choose basis' },
    { id: 'generate-states', label: 'Generate quantum states' },
  ],
  bob: [
    { id: 'receive-photons', label: 'Receive photons' },
    { id: 'choose-basis', label: 'Choose measurement basis' },
    { id: 'generate-key', label: 'Generate key' },
  ],
  eve: [
    { id: 'intercept', label: 'Intercept photons' },
    { id: 'measure', label: 'Measure photons' },
    { id: 'introduce-errors', label: 'Potentially introduce detectable errors' },
  ],
};

export interface GameEntity {
  id: string;
  role: Role;
  isLocalPlayer: boolean;
  position: { x: number; z: number };
  alive: boolean;
}

/** Live registry of Alice/Bob/Eve (and any future role) entities currently
 * in a scene. First-class and addressable by id/role, deliberately NOT
 * re-implementing BB84 or heist task logic — see the file docstring. */
class EntityRegistryImpl {
  private entities = new Map<string, GameEntity>();
  private listeners = new Set<() => void>();

  spawn(entity: GameEntity): void {
    this.entities.set(entity.id, entity);
    this.notify();
  }

  update(id: string, patch: Partial<Omit<GameEntity, 'id'>>): void {
    const e = this.entities.get(id);
    if (!e) return;
    Object.assign(e, patch);
    this.notify();
  }

  despawn(id: string): void {
    if (this.entities.delete(id)) this.notify();
  }

  get(id: string): GameEntity | undefined {
    return this.entities.get(id);
  }

  byRole(role: Role): GameEntity[] {
    return [...this.entities.values()].filter((e) => e.role === role);
  }

  all(): GameEntity[] {
    return [...this.entities.values()];
  }

  responsibilitiesFor(role: Role): RoleResponsibility[] {
    return ROLE_RESPONSIBILITIES[role];
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    this.listeners.forEach((fn) => fn());
  }

  /** Test-only. */
  reset(): void {
    this.entities.clear();
  }
}

export const entityRegistry = new EntityRegistryImpl();
