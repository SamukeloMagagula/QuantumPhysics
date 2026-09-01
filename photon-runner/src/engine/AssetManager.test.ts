import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { assetManager } from './AssetManager';

/** Matches sceneWorld.ts's Res / sceneOfficeProps.ts's ResLike shape closely
 * enough for a fallback builder under test — assetManager only needs g()/m(). */
function testTracker() {
  return { g: <T>(x: T) => x, m: <T>(x: T) => x };
}

describe('assetManager', () => {
  beforeEach(() => assetManager.reset());

  it('uses the procedural fallback when no real asset is registered', async () => {
    assetManager.registerFallback('crate', () => new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));

    const obj = await assetManager.load('crate', testTracker());

    expect(obj).toBeInstanceOf(THREE.Object3D);
    expect(assetManager.hasRealAsset('crate')).toBe(false);
  });

  it('throws a clear error when neither an asset nor a fallback exists', async () => {
    await expect(assetManager.load('nothing-registered', testTracker())).rejects.toThrow(/no asset and no procedural fallback/);
  });

  it('registerAsset flips hasRealAsset() without requiring a load', () => {
    expect(assetManager.hasRealAsset('reception-desk')).toBe(false);
    assetManager.registerAsset('reception-desk', '/models/reception-desk.glb');
    expect(assetManager.hasRealAsset('reception-desk')).toBe(true);
  });

  it('load() caches and returns independent clones, not the same instance', async () => {
    assetManager.registerFallback('plant', () => new THREE.Group());

    const a = await assetManager.load('plant', testTracker());
    const b = await assetManager.load('plant', testTracker());

    expect(a).not.toBe(b);
    expect(a).toBeInstanceOf(THREE.Object3D);
  });

  it('re-registering an asset drops the stale cache entry', async () => {
    assetManager.registerFallback('desk', () => new THREE.Group());
    await assetManager.load('desk', testTracker());

    assetManager.registerAsset('desk', '/models/desk.glb');

    expect(assetManager.hasRealAsset('desk')).toBe(true);
  });
});
