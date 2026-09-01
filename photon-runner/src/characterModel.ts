import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
// Type-only, and it must stay that way: sceneCharacter.ts imports this module
// back (to upgrade a procedural rig in place), so a value import here would
// close a genuine runtime cycle between the two.
import type { Gesture, Humanoid } from './sceneCharacter';

/**
 * Skeletal-character pipeline: rigged glTF + `AnimationMixer`, wrapped in the
 * same `Humanoid` interface the procedural rig implements, so every call site
 * (`quantumHeist.ts`, `sceneCampus.ts`, `sceneQuantumLab.ts`) drives either
 * one without knowing which it got.
 *
 * There is deliberately no model file in the repo. The procedural rig — ~50
 * spheres, boxes and capsules with hand-written pose maths — is the single
 * biggest ceiling on how the game looks, and no amount of lighting work gets
 * past it; but a character model is a licensing decision, not a technical
 * one, so this is built and dormant rather than shipped with someone else's
 * asset baked in.
 *
 * To switch it on:
 *   1. Put a rigged, animated .glb in `public/models/` (Mixamo exports work
 *      directly, and its clip names are what CLIP_ALIASES below expects).
 *   2. Call `configureCharacterModel({ url: '/models/<file>.glb' })` once at
 *      startup, before any scene loads.
 * Anything that fails — missing file, no skeleton, no clips — falls back to
 * the procedural rig rather than dropping a character out of the world.
 */

export interface CharacterModelConfig {
  url: string;
  /** Uniform scale applied to the loaded model. Mixamo exports are in
   * centimetres, so a metre-scale world usually wants 0.01. */
  scale?: number;
  /** Extra clip-name mappings, merged over CLIP_ALIASES. */
  clips?: Partial<Record<AnimationState, string[]>>;
}

export type AnimationState = 'idle' | 'walk' | 'run' | Gesture | 'talk';

/**
 * Candidate clip names per state, tried in order and matched
 * case-insensitively against a substring of the clip's actual name. The
 * defaults cover Mixamo's own naming plus the obvious generic ones.
 */
const CLIP_ALIASES: Record<AnimationState, string[]> = {
  idle: ['idle', 'breathing', 'stand'],
  walk: ['walk'],
  run: ['run', 'jog', 'sprint'],
  wave: ['wave', 'waving'],
  jump: ['jump'],
  point: ['point', 'pointing'],
  celebrate: ['celebrate', 'victory', 'cheer', 'dance'],
  dismay: ['defeat', 'sad', 'disappoint', 'dying'],
  flinch: ['hit', 'flinch', 'impact', 'damage'],
  talk: ['talk', 'talking', 'conversation'],
};

let config: CharacterModelConfig | null = null;

export function configureCharacterModel(c: CharacterModelConfig | null): void {
  config = c;
}

export function hasCharacterModel(): boolean {
  return config !== null;
}

/** Resolved once per process — the same .glb is reused for every character
 * rather than refetched, and cloned per instance below. */
let sourcePromise: Promise<{ scene: THREE.Group; clips: THREE.AnimationClip[] } | null> | null = null;

function loadSource(): Promise<{ scene: THREE.Group; clips: THREE.AnimationClip[] } | null> {
  if (sourcePromise) return sourcePromise;
  if (!config) return Promise.resolve(null);

  const url = config.url;
  sourcePromise = new Promise((resolve) => {
    new GLTFLoader().load(
      url,
      (gltf) => resolve({ scene: gltf.scene, clips: gltf.animations }),
      undefined,
      () => resolve(null)
    );
  });
  return sourcePromise;
}

/** Test-only: drops the cached load so a new config takes effect. */
export function resetCharacterModelCache(): void {
  sourcePromise = null;
}

export function pickClip(
  clips: THREE.AnimationClip[],
  state: AnimationState,
  overrides?: Partial<Record<AnimationState, string[]>>
): THREE.AnimationClip | null {
  const names = [...(overrides?.[state] ?? []), ...CLIP_ALIASES[state]];
  for (const wanted of names) {
    const hit = clips.find((c) => c.name.toLowerCase().includes(wanted.toLowerCase()));
    if (hit) return hit;
  }
  // Plenty of real exports ship a single unnamed clip — COLLADA2GLTF does it,
  // and Khronos' own CesiumMan sample is exactly this. Name matching finds
  // nothing there, which would leave the character frozen in bind pose. Fall
  // back to the only clip available for the base idle state so the rig at
  // least moves; a named export still resolves properly above.
  if (state === 'idle' && clips.length === 1) return clips[0];
  return null;
}

/**
 * Builds a skeletal `Humanoid`, or resolves null if no model is configured or
 * the load failed — callers fall back to the procedural rig on null.
 *
 * The returned object is usable immediately: its group is populated
 * asynchronously once the glTF resolves, so a character never blocks a scene
 * from finishing its build.
 */
export async function createModelHumanoid(roleColor: number): Promise<Humanoid | null> {
  const source = await loadSource();
  if (!source || !config) return null;

  // SkeletonUtils.clone is the only correct way to duplicate a skinned mesh —
  // a plain .clone() shares the skeleton, so every character would animate in
  // lockstep off whichever mixer ran last.
  const { clone } = await import('three/examples/jsm/utils/SkeletonUtils.js');
  const model = clone(source.scene) as THREE.Group;
  model.scale.setScalar(config.scale ?? 1);
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });

  const group = new THREE.Group();
  group.add(model);

  const mixer = new THREE.AnimationMixer(model);
  const actions = new Map<AnimationState, THREE.AnimationAction>();
  for (const state of Object.keys(CLIP_ALIASES) as AnimationState[]) {
    const clip = pickClip(source.clips, state, config.clips);
    if (clip) actions.set(state, mixer.clipAction(clip));
  }

  let locomotion: AnimationState = 'idle';
  let current: THREE.AnimationAction | null = null;
  let oneShot: THREE.AnimationAction | null = null;
  let walking = false;
  let sprinting = false;
  let talking = false;

  const play = (state: AnimationState, fade = 0.25) => {
    const next = actions.get(state);
    if (!next || next === current) return;
    next.reset().fadeIn(fade).play();
    current?.fadeOut(fade);
    current = next;
  };

  const refreshLocomotion = () => {
    const want: AnimationState = walking ? (sprinting ? 'run' : 'walk') : talking ? 'talk' : 'idle';
    // Fall back down the chain when a rig lacks a given clip — a model with
    // no separate run still walks rather than freezing mid-stride.
    const resolved = actions.has(want) ? want : want === 'run' ? 'walk' : 'idle';
    if (resolved !== locomotion) {
      locomotion = resolved;
      play(resolved);
    }
  };

  refreshLocomotion();

  // Named rather than a method, so `wave()` can call it without relying on
  // `this` being bound to the returned object literal.
  const playGesture = (gesture: Gesture) => {
    const action = actions.get(gesture);
    if (!action) return;
    oneShot?.stop();
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.fadeIn(0.12).play();
    oneShot = action;
  };

  return {
    group,
    setWalking(v: boolean) {
      if (walking === v) return;
      walking = v;
      refreshLocomotion();
    },
    setSprinting(v: boolean) {
      if (sprinting === v) return;
      sprinting = v;
      refreshLocomotion();
    },
    setTalking(v: boolean) {
      if (talking === v) return;
      talking = v;
      refreshLocomotion();
    },
    setSeated(v: boolean) {
      // A rig with a real sit clip uses it; otherwise the closest honest
      // thing is to stop the walk cycle rather than fake a pose on a
      // skeleton whose proportions we don't control.
      const sitClip = actions.get('idle');
      if (v) {
        walking = false;
        sprinting = false;
        if (sitClip) play('idle');
      }
      refreshLocomotion();
    },
    faceDirection(angle: number) {
      group.rotation.y = angle;
    },
    playGesture,
    wave() {
      playGesture('wave');
    },
    update(dt: number) {
      mixer.update(dt);
      if (oneShot && !oneShot.isRunning()) {
        oneShot.fadeOut(0.2);
        oneShot = null;
      }
    },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
      group.removeFromParent();
      // Geometry and materials belong to the shared source glTF, so they are
      // deliberately NOT disposed here — the next character to spawn reuses
      // them. `roleColor` is unused for skinned models: identity comes from
      // the model's own materials rather than a tinted primitive.
      void roleColor;
    },
  };
}
