import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  configureCharacterModel,
  hasCharacterModel,
  pickClip,
  resetCharacterModelCache,
} from './characterModel';

const clip = (name: string) => new THREE.AnimationClip(name, 1, []);

describe('character model config', () => {
  afterEach(() => {
    configureCharacterModel(null);
    resetCharacterModelCache();
  });

  it('reports no model until one is configured', () => {
    expect(hasCharacterModel()).toBe(false);
    configureCharacterModel({ url: '/models/operative.glb' });
    expect(hasCharacterModel()).toBe(true);
  });

  it('ships with no model configured, so every scene uses the procedural rig', () => {
    // Guards the deliberate decision not to bundle a third-party character:
    // if this ever fails, someone wired an asset in and the licensing needs
    // checking before it ships.
    expect(hasCharacterModel()).toBe(false);
  });
});

describe('pickClip', () => {
  it('matches a clip by alias, case-insensitively and as a substring', () => {
    const clips = [clip('Armature|mixamo.com|Layer0'), clip('Walking'), clip('Idle_Loop')];
    expect(pickClip(clips, 'walk')?.name).toBe('Walking');
    expect(pickClip(clips, 'idle')?.name).toBe('Idle_Loop');
  });

  it('honours alias order — an earlier alias wins over a later one', () => {
    // 'run' is tried before 'jog', so a rig with both resolves to the run.
    const clips = [clip('Jogging'), clip('Running')];
    expect(pickClip(clips, 'run')?.name).toBe('Running');
  });

  it('lets an explicit override take precedence over the built-in aliases', () => {
    const clips = [clip('Walking'), clip('CustomStroll')];
    expect(pickClip(clips, 'walk', { walk: ['CustomStroll'] })?.name).toBe('CustomStroll');
  });

  it('returns null when a rig has no clip for that state', () => {
    expect(pickClip([clip('Walking')], 'celebrate')).toBeNull();
  });

  it('falls back to a lone unnamed clip for idle rather than freezing', () => {
    // COLLADA2GLTF exports (and Khronos' own CesiumMan sample) ship one clip
    // with an empty name, which matches no alias — without this the rig would
    // load and never move.
    const unnamed = [clip('')];
    expect(pickClip(unnamed, 'idle')).toBe(unnamed[0]);
    // It is still not a walk cycle, so it must not masquerade as one.
    expect(pickClip(unnamed, 'walk')).toBeNull();
  });

  it('maps every gesture the procedural rig supports', () => {
    // The skeletal path has to cover the same gesture vocabulary as
    // sceneCharacter.ts, or a gesture silently does nothing on a real model.
    const clips = [
      clip('Waving'),
      clip('Jump'),
      clip('Pointing'),
      clip('Victory'),
      clip('Defeat'),
      clip('HitReaction'),
    ];
    for (const g of ['wave', 'jump', 'point', 'celebrate', 'dismay', 'flinch'] as const) {
      expect(pickClip(clips, g), `no clip matched for gesture "${g}"`).not.toBeNull();
    }
  });
});
