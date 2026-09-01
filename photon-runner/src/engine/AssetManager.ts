import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

/**
 * Real GLTF loading with a mandatory procedural fallback.
 *
 * No .glb/.gltf files exist in this repo today — every asset id currently
 * resolves through its fallback builder. That's the point: content can
 * register a real asset URL the moment one exists (`registerAsset`) and the
 * game switches to it automatically, with zero call-site changes anywhere
 * that already calls `assetManager.load(id, ...)`. Until then, or if a load
 * ever fails (404, corrupt file, CORS), the fallback keeps the scene intact
 * instead of leaving a hole where a building/prop/character should be.
 */

export interface ResourceTracker {
  g<T extends THREE.BufferGeometry>(x: T): T;
  m<T extends THREE.Material>(x: T): T;
}

export type ProceduralFallback = (res: ResourceTracker) => THREE.Object3D;

class AssetManagerImpl {
  private manifest = new Map<string, string>();
  private fallbacks = new Map<string, ProceduralFallback>();
  private cache = new Map<string, THREE.Object3D>();
  private gltfLoader: GLTFLoader | null = null;
  private dracoLoader: DRACOLoader | null = null;

  private loader(): GLTFLoader {
    if (!this.gltfLoader) {
      this.dracoLoader = new DRACOLoader();
      // Standard public decoder bundle — same path three.js's own examples
      // use. Only ever fetched if a registered asset is actually Draco-
      // compressed, which none are yet.
      this.dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
      this.gltfLoader = new GLTFLoader();
      this.gltfLoader.setDRACOLoader(this.dracoLoader);
    }
    return this.gltfLoader;
  }

  /** Point an asset id at a real file. Call this once real assets exist —
   * everything that already calls `load(id, ...)` picks it up automatically. */
  registerAsset(id: string, url: string): void {
    this.manifest.set(id, url);
    this.cache.delete(id); // a re-registration should not serve a stale cache
  }

  /** The procedural builder to use when `id` has no real asset, or its load
   * fails. Every asset id that anything calls `load()` on must have one of
   * these registered — it's the safety net, not an afterthought. */
  registerFallback(id: string, fallback: ProceduralFallback): void {
    this.fallbacks.set(id, fallback);
  }

  hasRealAsset(id: string): boolean {
    return this.manifest.has(id);
  }

  /** Resolves to a fresh, independent clone every call — callers own their
   * instance and can transform/dispose it without affecting anyone else who
   * loaded the same id. */
  async load(id: string, res: ResourceTracker): Promise<THREE.Object3D> {
    const cached = this.cache.get(id);
    if (cached) return cached.clone(true);

    const url = this.manifest.get(id);
    if (url) {
      try {
        const gltf = await this.loader().loadAsync(url);
        this.cache.set(id, gltf.scene);
        return gltf.scene.clone(true);
      } catch (err) {
        console.warn(`AssetManager: "${id}" failed to load from ${url}, using procedural fallback`, err);
      }
    }

    const fallback = this.fallbacks.get(id);
    if (!fallback) {
      throw new Error(`AssetManager: no asset and no procedural fallback registered for "${id}"`);
    }
    const built = fallback(res);
    this.cache.set(id, built);
    return built.clone(true);
  }

  /** Test-only. */
  reset(): void {
    this.manifest.clear();
    this.fallbacks.clear();
    this.cache.clear();
  }
}

export const assetManager = new AssetManagerImpl();
