/**
 * Imperative scene registry: `SceneManager.load("QuantumLab")` is meant to
 * really work from anywhere — game code, engine systems, or a future
 * storyline script — not just be a name for what React's local state
 * already does.
 *
 * It does not replace App.tsx's rendering. Every existing screen (home,
 * qkd-attack, qkd-lobby, campaign scenes, ...) registers itself as a
 * scene with the exact same id it already used, and App.tsx renders whatever
 * `SceneManager` says is current instead of owning that state itself. That
 * keeps every existing navigation path and its test coverage intact while
 * making scene transitions a real, addressable API surface.
 */

export interface SceneDef<TParams = void> {
  id: string;
  /** Fired when this scene becomes the active one. */
  onLoad?: (params: TParams) => void;
  /** Fired when navigating away from this scene. */
  onUnload?: () => void;
}

export interface SceneTransition {
  id: string;
  params: unknown;
}

type Listener = (transition: SceneTransition) => void;

class SceneManagerImpl {
  private scenes = new Map<string, SceneDef<unknown>>();
  private current: string | null = null;
  private currentParams: unknown = undefined;
  private listeners = new Set<Listener>();

  /** Registering an already-registered id replaces its definition — lets a
   * screen re-register (e.g. on hot reload) without needing an `unregister`. */
  register<TParams>(def: SceneDef<TParams>): void {
    this.scenes.set(def.id, def as SceneDef<unknown>);
  }

  load<TParams>(id: string, params?: TParams): void {
    if (!this.scenes.has(id)) {
      console.warn(`SceneManager: "${id}" is not registered — ignoring load()`);
      return;
    }
    const prevDef = this.current ? this.scenes.get(this.current) : undefined;
    prevDef?.onUnload?.();

    this.current = id;
    this.currentParams = params;
    this.scenes.get(id)!.onLoad?.(params);

    const transition: SceneTransition = { id, params };
    this.listeners.forEach((fn) => fn(transition));
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  get currentScene(): string | null {
    return this.current;
  }

  get currentSceneParams(): unknown {
    return this.currentParams;
  }

  isRegistered(id: string): boolean {
    return this.scenes.has(id);
  }

  /** Test-only: drop every registration and current-scene state. */
  reset(): void {
    this.scenes.clear();
    this.current = null;
    this.currentParams = undefined;
  }
}

export const SceneManager = new SceneManagerImpl();
