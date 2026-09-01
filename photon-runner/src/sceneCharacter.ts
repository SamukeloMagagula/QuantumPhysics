import * as THREE from 'three';
import {
  Accessory,
  Build,
  CharacterAppearance,
  DEFAULT_APPEARANCE,
  HairStyle,
  Outfit,
} from './characterAppearance';
import { applySurface, fabricSurface, hairSurface, metalSurface, skinSurface } from './sceneTextures';
import { profile } from './sceneQuality';
import { AnimPhase, PhaseState, advancePhase, initialPhaseState } from './sceneAnimPhase';
import { createModelHumanoid, hasCharacterModel } from './characterModel';

/**
 * A human-proportioned articulated character built entirely from primitives —
 * no external rigs or assets. Roughly 7.5 heads tall with a real joint
 * hierarchy (hip → knee → ankle, shoulder → elbow → wrist), a sculpted face,
 * swappable hair, and layered clothing, so the walk cycle bends where a person
 * bends instead of swinging rigid sticks.
 */

// ---- skeletal landmarks (world units, figure is ~1.8 tall) ----
const ANKLE_Y = 0.08;
const KNEE_Y = 0.48;
const HIP_Y = 0.92;
const WAIST_Y = 1.06;
const CHEST_Y = 1.28;
const SHOULDER_Y = 1.42;
const NECK_Y = 1.5;
const HEAD_Y = 1.66;
const HEAD_R = 0.128;

const THIGH_LEN = HIP_Y - KNEE_Y;
const SHIN_LEN = KNEE_Y - ANKLE_Y;
const UPPER_ARM_LEN = 0.3;
const FOREARM_LEN = 0.28;

/** One-shot gestures — mutually exclusive; starting a new one cancels
 * whatever was already playing. Layered additively on top of whatever the
 * idle/walk base pose already set that frame, the same way `wave` always
 * worked; this just gives that pattern more members. */
export type Gesture = 'wave' | 'jump' | 'point' | 'celebrate' | 'dismay' | 'flinch';

export interface Humanoid {
  group: THREE.Group;
  setWalking(isWalking: boolean): void;
  setSprinting(isSprinting: boolean): void;
  update(dt: number): void;
  faceDirection(angle: number): void;
  /** Plays a one-shot gesture (used for interactions / taps / UI events). */
  playGesture(gesture: Gesture): void;
  /** Plays a one-shot gesture (used for interactions / taps). Alias for
   * `playGesture('wave')`, kept for existing call sites. */
  wave(): void;
  /** Looping talk animation (head nod + hand gesture) while true — combines
   * with idle/walk and with a one-shot gesture rather than replacing them. */
  setTalking(talking: boolean): void;
  /** Sit the figure down: hips drop to chair height, thighs go horizontal,
   * shins vertical, hands forward onto the desk. Replaces the idle/walk
   * cycle entirely while set. */
  setSeated(seated: boolean): void;
  dispose(): void;
}

export interface HumanoidOptions {
  accentColor?: number;
  appearance?: Partial<CharacterAppearance>;
  /** When true the figure gets a role-colored rim glow (used in-mission). */
  rimGlow?: boolean;
}

interface BuildSpec {
  shoulderW: number;
  chestD: number;
  waistScale: number;
  limbScale: number;
}

const BUILD_SPECS: Record<Build, BuildSpec> = {
  slim: { shoulderW: 0.155, chestD: 0.115, waistScale: 0.88, limbScale: 0.88 },
  average: { shoulderW: 0.175, chestD: 0.13, waistScale: 1, limbScale: 1 },
  broad: { shoulderW: 0.2, chestD: 0.15, waistScale: 1.14, limbScale: 1.14 },
};

const hex = (c: string, fallback: number): number => {
  const parsed = parseInt(c.replace('#', ''), 16);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/** Tracks every geometry/material this figure owns so dispose() can free them. */
class Resources {
  private geoms = new Set<THREE.BufferGeometry>();
  private mats = new Set<THREE.Material>();

  geom<T extends THREE.BufferGeometry>(g: T): T {
    this.geoms.add(g);
    return g;
  }

  mat<T extends THREE.Material>(m: T): T {
    this.mats.add(m);
    return m;
  }

  dispose(): void {
    this.geoms.forEach((g) => g.dispose());
    this.mats.forEach((m) => m.dispose());
    this.geoms.clear();
    this.mats.clear();
  }
}

export function createHumanoid(roleColor: number, options: HumanoidOptions = {}): Humanoid {
  const look: CharacterAppearance = { ...DEFAULT_APPEARANCE, ...(options.appearance ?? {}) };
  const accent = options.accentColor ?? hex(look.accentColor, roleColor);
  const spec = BUILD_SPECS[look.build] ?? BUILD_SPECS.average;
  const res = new Resources();

  const skinCol = hex(look.skinTone, 0xd9a179);
  const hairCol = hex(look.hairColor, 0x3f2a1d);
  const primary = hex(look.outfitPrimary, roleColor);
  const secondary = hex(look.outfitSecondary, 0x1e293b);

  // Every surface gets albedo + normal + roughness maps. The normal maps are
  // what stop these reading as flat primitives — skin gets pores, cloth gets
  // weave, hair gets strands that actually catch the key light.
  //
  // Skin specifically uses MeshPhysicalMaterial for two extra terms real skin
  // has and cloth/metal don't: `sheen` (the soft peach-fuzz micro-fringe that
  // catches grazing light at a silhouette's edge) and a faint `clearcoat`
  // (the thin oily highlight on a forehead/nose under a key light).
  const skinMat = res.mat(
    new THREE.MeshPhysicalMaterial({
      color: skinCol,
      roughness: 0.68,
      metalness: 0.02,
      sheen: 0.35,
      sheenRoughness: 0.8,
      sheenColor: new THREE.Color(skinCol).lerp(new THREE.Color(0xffe4c4), 0.5),
      clearcoat: 0.06,
      clearcoatRoughness: 0.6,
    })
  );
  applySurface(skinMat, skinSurface(skinCol), 1, 0.7);

  const hairMat = res.mat(new THREE.MeshStandardMaterial({ color: hairCol, roughness: 0.74, metalness: 0.06 }));
  applySurface(hairMat, hairSurface(hairCol), 1, 1.1);

  const primaryMat = res.mat(new THREE.MeshStandardMaterial({ color: primary, roughness: 0.78, metalness: 0.03 }));
  applySurface(primaryMat, fabricSurface(primary), 2.5, 1.2);

  const secondaryMat = res.mat(new THREE.MeshStandardMaterial({ color: secondary, roughness: 0.76, metalness: 0.04 }));
  applySurface(secondaryMat, fabricSurface(secondary, 'high', 4), 2.5, 1.2);
  const accentMat = res.mat(
    new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.55, roughness: 0.4 })
  );
  const darkMat = res.mat(new THREE.MeshStandardMaterial({ color: 0x2b2620, roughness: 0.55, metalness: 0.25 }));
  applySurface(darkMat, metalSurface(0x2b2620), 1.5, 0.9);
  const eyeWhiteMat = res.mat(new THREE.MeshStandardMaterial({ color: 0xf2f4f8, roughness: 0.14, metalness: 0.02 }));
  const irisMat = res.mat(new THREE.MeshStandardMaterial({ color: 0x2c1810, roughness: 0.1, metalness: 0.05 }));
  const sparkleMat = res.mat(new THREE.MeshBasicMaterial({ color: 0xffffff }));

  const root = new THREE.Group();
  const body = new THREE.Group(); // vertical bob + breathing live here
  root.add(body);

  const seg = profile().meshDetail;
  const capsule = (r: number, len: number, mat: THREE.Material) =>
    new THREE.Mesh(res.geom(new THREE.CapsuleGeometry(r, Math.max(0.001, len), Math.round(seg / 2), seg)), mat);

  // ---------------- torso ----------------
  const torso = new THREE.Group();
  torso.position.y = HIP_Y;
  body.add(torso);

  const pelvis = capsule(0.13 * spec.waistScale, 0.1, primaryMat);
  pelvis.position.y = 0.02;
  pelvis.scale.z = 0.78;
  torso.add(pelvis);

  const waist = capsule(0.125 * spec.waistScale, 0.16, primaryMat);
  waist.position.y = WAIST_Y - HIP_Y;
  waist.scale.z = 0.74;
  torso.add(waist);

  // Chest is scaled wider than deep so the silhouette reads as shoulders, not a barrel.
  const chest = capsule(0.15 * spec.waistScale, 0.22, primaryMat);
  chest.position.y = CHEST_Y - HIP_Y;
  chest.scale.set(spec.shoulderW / 0.15 / 1.05, 1, spec.chestD / 0.15);
  torso.add(chest);

  const neck = capsule(0.05, 0.08, skinMat);
  neck.position.y = NECK_Y - HIP_Y;
  torso.add(neck);

  // ---------------- head ----------------
  const headPivot = new THREE.Group();
  headPivot.position.y = NECK_Y - HIP_Y + 0.06;
  torso.add(headPivot);

  const head = new THREE.Mesh(res.geom(new THREE.SphereGeometry(HEAD_R, seg * 2, Math.round(seg * 1.6))), skinMat);
  head.position.y = HEAD_Y - NECK_Y - 0.06;
  head.scale.set(0.94, 1.08, 0.98);
  headPivot.add(head);

  // Jaw/chin taper — a second, smaller sphere low and forward.
  const jaw = new THREE.Mesh(res.geom(new THREE.SphereGeometry(HEAD_R * 0.76, Math.round(seg * 1.4), seg)), skinMat);
  jaw.position.set(0, head.position.y - 0.055, 0.012);
  jaw.scale.set(0.92, 0.8, 0.95);
  headPivot.add(jaw);

  const faceZ = HEAD_R * 0.9;
  const eyeY = head.position.y + 0.012;

  // Round eyes: white + iris + a small offset highlight dot for a catchlight
  // sparkle — the thing that makes a cartoon face read as alive.
  const eyes: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(side * 0.045, eyeY, faceZ * 0.72);
    const white = new THREE.Mesh(res.geom(new THREE.SphereGeometry(0.021, 12, 10)), eyeWhiteMat);
    white.scale.set(1, 0.72, 0.6);
    eye.add(white);
    const iris = new THREE.Mesh(res.geom(new THREE.SphereGeometry(0.011, 10, 8)), irisMat);
    iris.position.z = 0.014;
    iris.scale.z = 0.6;
    eye.add(iris);
    const sparkle = new THREE.Mesh(res.geom(new THREE.SphereGeometry(0.003, 6, 6)), sparkleMat);
    sparkle.position.set(-side * 0.004, 0.004, 0.02);
    eye.add(sparkle);
    headPivot.add(eye);
    eyes.push(eye);

    const brow = new THREE.Mesh(res.geom(new THREE.BoxGeometry(0.042, 0.008, 0.012)), hairMat);
    brow.position.set(side * 0.046, eyeY + 0.032, faceZ * 0.74);
    brow.rotation.z = side * 0.12;
    headPivot.add(brow);

    const ear = new THREE.Mesh(res.geom(new THREE.SphereGeometry(0.026, 10, 8)), skinMat);
    ear.position.set(side * HEAD_R * 0.92, eyeY - 0.004, 0);
    ear.scale.set(0.45, 1, 0.7);
    headPivot.add(ear);
  }

  const nose = new THREE.Mesh(res.geom(new THREE.SphereGeometry(0.019, 10, 8)), skinMat);
  nose.position.set(0, eyeY - 0.026, faceZ * 0.92);
  nose.scale.set(0.7, 0.9, 1.15);
  headPivot.add(nose);

  const mouth = new THREE.Mesh(res.geom(new THREE.BoxGeometry(0.042, 0.007, 0.01)), darkMat);
  mouth.position.set(0, eyeY - 0.062, faceZ * 0.82);
  headPivot.add(mouth);

  buildHair(look.hairStyle, headPivot, head.position.y, hairMat, res);

  // ---------------- limbs ----------------
  interface Arm {
    shoulder: THREE.Group;
    elbow: THREE.Group;
  }
  const arms: Record<'l' | 'r', Arm> = {} as Record<'l' | 'r', Arm>;

  for (const side of ['l', 'r'] as const) {
    const dir = side === 'l' ? -1 : 1;
    const shoulder = new THREE.Group();
    shoulder.position.set(dir * (spec.shoulderW + 0.02), SHOULDER_Y - HIP_Y, 0);
    torso.add(shoulder);

    const deltoid = new THREE.Mesh(res.geom(new THREE.SphereGeometry(0.055 * spec.limbScale, 12, 10)), primaryMat);
    shoulder.add(deltoid);

    const upper = capsule(0.042 * spec.limbScale, UPPER_ARM_LEN - 0.06, primaryMat);
    upper.position.y = -UPPER_ARM_LEN / 2;
    shoulder.add(upper);

    const elbow = new THREE.Group();
    elbow.position.y = -UPPER_ARM_LEN;
    shoulder.add(elbow);

    const fore = capsule(0.036 * spec.limbScale, FOREARM_LEN - 0.06, skinMat);
    fore.position.y = -FOREARM_LEN / 2;
    elbow.add(fore);

    const hand = new THREE.Mesh(res.geom(new THREE.SphereGeometry(0.045, 10, 8)), skinMat);
    hand.position.y = -FOREARM_LEN - 0.02;
    hand.scale.set(0.75, 1.15, 0.5);
    elbow.add(hand);

    arms[side] = { shoulder, elbow };
  }

  interface Leg {
    hip: THREE.Group;
    knee: THREE.Group;
    ankle: THREE.Group;
  }
  const legs: Record<'l' | 'r', Leg> = {} as Record<'l' | 'r', Leg>;

  // Pants always read as the secondary outfit color — a flat two-tone
  // shirt/pants look, independent of which outfit is equipped.
  const legMat = secondaryMat;

  for (const side of ['l', 'r'] as const) {
    const dir = side === 'l' ? -1 : 1;
    const hip = new THREE.Group();
    hip.position.set(dir * 0.075, 0, 0);
    torso.add(hip);

    const thigh = capsule(0.052 * spec.limbScale, THIGH_LEN - 0.09, legMat);
    thigh.position.y = -THIGH_LEN / 2;
    hip.add(thigh);

    const knee = new THREE.Group();
    knee.position.y = -THIGH_LEN;
    hip.add(knee);

    const shin = capsule(0.052 * spec.limbScale, SHIN_LEN - 0.09, legMat);
    shin.position.y = -SHIN_LEN / 2;
    knee.add(shin);

    const ankle = new THREE.Group();
    ankle.position.y = -SHIN_LEN;
    knee.add(ankle);

    // A simple rounded cap in the pants color, not a distinct shoe.
    const foot = new THREE.Mesh(res.geom(new THREE.SphereGeometry(0.052, 12, 8)), legMat);
    foot.position.set(0, -0.02, 0.03);
    foot.scale.set(0.9, 0.6, 1.2);
    ankle.add(foot);

    legs[side] = { hip, knee, ankle };
  }

  buildOutfit(look.outfit, {
    torso,
    headPivot,
    headY: head.position.y,
    arms,
    hipY: HIP_Y,
    spec,
    primaryMat,
    secondaryMat,
    accentMat,
    darkMat,
    res,
  });

  const acc = buildAccessory(look.accessory, head.position.y, accentMat, darkMat, hairMat, res);
  if (acc) headPivot.add(acc);

  if (options.rimGlow !== false) {
    const glowMat = res.mat(
      new THREE.MeshBasicMaterial({ color: roleColor, side: THREE.BackSide, transparent: true, opacity: 0.22 })
    );
    const glow = new THREE.Mesh(chest.geometry, glowMat);
    glow.scale.copy(chest.scale).multiplyScalar(1.22);
    chest.add(glow);

    const light = new THREE.PointLight(roleColor, 0.55, 3.5);
    light.position.y = CHEST_Y;
    body.add(light);
  }

  root.scale.setScalar(look.height);

  // Every solid part of the figure casts into the key light's shadow map.
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  // ---------------- animation ----------------
  let walkPhase = 0;
  let idleClock = 0;
  let moving = false;
  let sprinting = false;
  let phaseState: PhaseState = initialPhaseState();
  let blinkTimer = 2 + Math.random() * 3;
  let blinkT = 0;
  let gesture: Gesture | null = null;
  let gestureT = 0;
  let talking = false;
  let talkClock = 0;

  const GESTURE_DURATION: Record<Gesture, number> = {
    wave: 0.72,
    jump: 0.5,
    point: 0.85,
    celebrate: 1.2,
    dismay: 1.0,
    flinch: 0.35,
  };

  const lerp = THREE.MathUtils.lerp;

  // If a rigged character model has been configured (see characterModel.ts),
  // upgrade to it in place: the procedural body is built and returned
  // immediately so nothing waits on a network fetch, then swapped out for the
  // skinned mesh when the glTF resolves. Every method below forwards to the
  // skeletal rig once `skeletal` is set. With no model configured — the
  // default, and the case today — `hasCharacterModel()` is false and none of
  // this runs at all.
  let seatedPose = false;
  let skeletal: Humanoid | null = null;
  if (hasCharacterModel()) {
    void createModelHumanoid(roleColor).then((model) => {
      if (!model) return;
      root.children.slice().forEach((c) => {
        if (c !== model.group) c.visible = false;
      });
      root.add(model.group);
      skeletal = model;
    });
  }

  return {
    group: root,

    setWalking(isWalking) {
      moving = isWalking;
      skeletal?.setWalking(isWalking);
    },

    setSprinting(isSprinting) {
      sprinting = isSprinting;
      skeletal?.setSprinting(isSprinting);
    },

    playGesture(next) {
      gesture = next;
      gestureT = 1;
      skeletal?.playGesture(next);
    },

    wave() {
      gesture = 'wave';
      gestureT = 1;
      skeletal?.wave();
    },

    setTalking(next) {
      talking = next;
      if (!talking) talkClock = 0;
      skeletal?.setTalking(next);
    },

    setSeated(next) {
      seatedPose = next;
      skeletal?.setSeated?.(next);
    },

    update(dt) {
      // Once upgraded, the skeletal rig owns the pose entirely — the
      // procedural body below it is hidden, so its maths would be wasted work.
      if (skeletal) {
        skeletal.update(dt);
        return;
      }

      // Seated overrides the locomotion system outright — a walk cycle
      // blended under a chair reads as floating, not sitting.
      if (seatedPose) {
        idleClock += dt;
        const breathe = Math.sin(idleClock * 1.6) * 0.012;
        // Hips at chair height rather than standing height.
        body.position.y = -(HIP_Y - 0.5) + breathe;
        for (const side of ['l', 'r'] as const) {
          legs[side].hip.rotation.x = -Math.PI / 2;  // thighs forward, horizontal
          legs[side].knee.rotation.x = Math.PI / 2;  // shins straight down
          legs[side].ankle.rotation.x = 0;
          arms[side].shoulder.rotation.x = -0.62;    // reaching to the desk
          arms[side].elbow.rotation.x = -0.85;
        }
        torso.rotation.x = 0.12;
        headPivot.rotation.x = 0.06;
        return;
      }

      body.position.y = 0;
      idleClock += dt;
      phaseState = advancePhase(phaseState, dt, moving, sprinting);
      const phase: AnimPhase = phaseState.phase;
      const walking = phase === 'walk' || phase === 'sprint' || phase === 'startWalk' || phase === 'stopWalk';
      const sprintRate = phase === 'sprint' ? 1.35 : 1;

      // Blinking — a quick vertical squash of both eyes.
      blinkTimer -= dt;
      if (blinkTimer <= 0) {
        blinkT = 0.14;
        blinkTimer = 2.5 + Math.random() * 3.5;
      }
      if (blinkT > 0) {
        blinkT -= dt;
        const closed = Math.max(0, Math.sin((blinkT / 0.14) * Math.PI));
        eyes.forEach((e) => e.scale.setY(1 - closed * 0.92));
      } else {
        eyes.forEach((e) => e.scale.setY(1));
      }

      if (walking) {
        walkPhase += dt * 8.2 * sprintRate;
        const s = Math.sin(walkPhase);
        const c = Math.cos(walkPhase);

        const blendT =
          phase === 'startWalk'
            ? Math.min(1, phaseState.elapsed / 0.15)
            : phase === 'stopWalk'
              ? 1 - Math.min(1, phaseState.elapsed / 0.12)
              : 1;

        // Legs: hip drives the stride, knee only ever flexes backwards.
        legs.l.hip.rotation.x = s * 0.62 * sprintRate;
        legs.r.hip.rotation.x = -s * 0.62 * sprintRate;
        legs.l.knee.rotation.x = -Math.max(0, -s) * 0.95 - 0.06;
        legs.r.knee.rotation.x = -Math.max(0, s) * 0.95 - 0.06;
        legs.l.ankle.rotation.x = s * 0.18;
        legs.r.ankle.rotation.x = -s * 0.18;

        // Arms counter-swing the legs, elbows stay slightly bent.
        arms.l.shoulder.rotation.x = -s * 0.55;
        arms.r.shoulder.rotation.x = s * 0.55;
        arms.l.shoulder.rotation.z = 0.09;
        arms.r.shoulder.rotation.z = -0.09;
        arms.l.elbow.rotation.x = -0.3 - Math.max(0, -s) * 0.35;
        arms.r.elbow.rotation.x = -0.3 - Math.max(0, s) * 0.35;

        // Torso counter-rotates and the whole body bobs twice per stride.
        torso.rotation.y = -s * 0.1 * blendT;
        torso.rotation.x = 0.05 * blendT;
        body.position.y = Math.abs(c) * 0.035 * blendT;
        headPivot.rotation.y = s * 0.06 * blendT;
        headPivot.rotation.x = -0.03 * blendT;
      } else {
        walkPhase = 0;
        const breath = Math.sin(idleClock * 1.6);
        const sway = Math.sin(idleClock * 0.9);

        legs.l.hip.rotation.x = lerp(legs.l.hip.rotation.x, 0, 0.14);
        legs.r.hip.rotation.x = lerp(legs.r.hip.rotation.x, 0, 0.14);
        legs.l.knee.rotation.x = lerp(legs.l.knee.rotation.x, -0.05, 0.14);
        legs.r.knee.rotation.x = lerp(legs.r.knee.rotation.x, -0.05, 0.14);
        legs.l.ankle.rotation.x = lerp(legs.l.ankle.rotation.x, 0, 0.14);
        legs.r.ankle.rotation.x = lerp(legs.r.ankle.rotation.x, 0, 0.14);

        arms.l.shoulder.rotation.x = lerp(arms.l.shoulder.rotation.x, breath * 0.04, 0.1);
        arms.l.shoulder.rotation.z = lerp(arms.l.shoulder.rotation.z, 0.13, 0.1);
        arms.r.shoulder.rotation.z = lerp(arms.r.shoulder.rotation.z, -0.13, 0.1);
        arms.l.elbow.rotation.x = lerp(arms.l.elbow.rotation.x, -0.16, 0.1);
        arms.r.elbow.rotation.x = lerp(arms.r.elbow.rotation.x, -0.16, 0.1);

        torso.rotation.y = lerp(torso.rotation.y, sway * 0.035, 0.08);
        torso.rotation.x = lerp(torso.rotation.x, 0, 0.1);
        chest.scale.y = 1 + breath * 0.022; // breathing
        body.position.y = lerp(body.position.y, breath * 0.008, 0.1);
        headPivot.rotation.y = lerp(headPivot.rotation.y, sway * 0.12, 0.05);
        headPivot.rotation.x = lerp(headPivot.rotation.x, 0, 0.1);
      }

      // One-shot gesture overrides specific bones while it plays out —
      // additive on top of whatever idle/walk already set this frame (every
      // case below `lerp`s from the current, already-posed value rather than
      // assigning outright, so a gesture blends with idle sway/walk bob
      // instead of fighting it).
      if (gesture && gestureT > 0) {
        const duration = GESTURE_DURATION[gesture];
        gestureT = Math.max(0, gestureT - dt / duration);
        const p = 1 - gestureT; // 0 -> 1 progress through the gesture

        switch (gesture) {
          case 'wave': {
            const raise = Math.sin(Math.min(1, p * 1.6) * Math.PI * 0.5);
            arms.r.shoulder.rotation.x = lerp(arms.r.shoulder.rotation.x, -2.2 * raise, 0.4);
            arms.r.shoulder.rotation.z = lerp(arms.r.shoulder.rotation.z, -0.5 * raise, 0.4);
            arms.r.elbow.rotation.x = -0.5 + Math.sin(p * 22) * 0.45 * raise;
            break;
          }

          case 'jump': {
            // A cosmetic hop (this isn't a platformer with real gravity) —
            // an up-then-down arc with a knee tuck at the peak.
            const arc = Math.sin(Math.min(1, p) * Math.PI);
            body.position.y += arc * 0.3;
            legs.l.knee.rotation.x = lerp(legs.l.knee.rotation.x, -0.9 * arc, 0.5);
            legs.r.knee.rotation.x = lerp(legs.r.knee.rotation.x, -0.9 * arc, 0.5);
            arms.l.shoulder.rotation.x = lerp(arms.l.shoulder.rotation.x, -0.6 * arc, 0.4);
            arms.r.shoulder.rotation.x = lerp(arms.r.shoulder.rotation.x, -0.6 * arc, 0.4);
            break;
          }

          case 'point': {
            const extend = Math.sin(Math.min(1, p * 1.3) * Math.PI * 0.5);
            arms.r.shoulder.rotation.x = lerp(arms.r.shoulder.rotation.x, -1.35 * extend, 0.4);
            arms.r.shoulder.rotation.z = lerp(arms.r.shoulder.rotation.z, -0.28 * extend, 0.4);
            arms.r.elbow.rotation.x = lerp(arms.r.elbow.rotation.x, -0.1 * extend, 0.4);
            headPivot.rotation.x = lerp(headPivot.rotation.x, -0.12 * extend, 0.3);
            break;
          }

          case 'celebrate': {
            const raise = Math.sin(Math.min(1, p * 1.2) * Math.PI * 0.5);
            const bounce = Math.abs(Math.sin(p * Math.PI * 3)) * raise;
            arms.l.shoulder.rotation.x = lerp(arms.l.shoulder.rotation.x, -2.6 * raise, 0.4);
            arms.r.shoulder.rotation.x = lerp(arms.r.shoulder.rotation.x, -2.6 * raise, 0.4);
            arms.l.shoulder.rotation.z = lerp(arms.l.shoulder.rotation.z, 0.4 * raise, 0.4);
            arms.r.shoulder.rotation.z = lerp(arms.r.shoulder.rotation.z, -0.4 * raise, 0.4);
            body.position.y += bounce * 0.09;
            headPivot.rotation.x = lerp(headPivot.rotation.x, -0.18 * raise, 0.3);
            break;
          }

          case 'dismay': {
            const droop = Math.sin(Math.min(1, p * 1.1) * Math.PI * 0.5);
            torso.rotation.x = lerp(torso.rotation.x, 0.22 * droop, 0.3);
            headPivot.rotation.x = lerp(headPivot.rotation.x, 0.3 * droop, 0.3);
            arms.l.shoulder.rotation.z = lerp(arms.l.shoulder.rotation.z, 0.05 * droop, 0.3);
            arms.r.shoulder.rotation.z = lerp(arms.r.shoulder.rotation.z, -0.05 * droop, 0.3);
            body.position.y -= droop * 0.03;
            break;
          }

          case 'flinch': {
            const snap = Math.sin(Math.min(1, p * 3) * Math.PI); // quick out-and-back
            torso.rotation.x = lerp(torso.rotation.x, -0.18 * snap, 0.6);
            headPivot.rotation.x = lerp(headPivot.rotation.x, -0.12 * snap, 0.6);
            arms.l.elbow.rotation.x = lerp(arms.l.elbow.rotation.x, -0.4 * snap, 0.6);
            arms.r.elbow.rotation.x = lerp(arms.r.elbow.rotation.x, -0.4 * snap, 0.6);
            break;
          }
        }

        if (gestureT <= 0) gesture = null;
      }

      // Looping talk animation — a subtle head nod plus one hand gesturing,
      // independent of locomotion/gesture so it can combine with either.
      if (talking) {
        talkClock += dt;
        const nod = Math.sin(talkClock * 5.2);
        headPivot.rotation.x += nod * 0.045;
        headPivot.rotation.y += Math.sin(talkClock * 2.3) * 0.03;
        const handBeat = Math.max(0, Math.sin(talkClock * 4.1));
        arms.r.shoulder.rotation.x += -0.25 * handBeat;
        arms.r.elbow.rotation.x += -0.15 * handBeat;
      }
    },

    faceDirection(angle) {
      root.rotation.y = angle;
    },

    dispose() {
      skeletal?.dispose();
      skeletal = null;
      res.dispose();
    },
  };
}

// ---------------------------------------------------------------- hair

function buildHair(
  style: HairStyle,
  parent: THREE.Object3D,
  headY: number,
  mat: THREE.Material,
  res: Resources
): void {
  const add = (geo: THREE.BufferGeometry, x: number, y: number, z: number, scale?: THREE.Vector3) => {
    const m = new THREE.Mesh(res.geom(geo), mat);
    m.position.set(x, headY + y, z);
    if (scale) m.scale.copy(scale);
    parent.add(m);
    return m;
  };

  // Skull cap shared by most styles — a hemisphere hugging the cranium.
  const cap = (r: number, yScale: number, y = 0.012) => {
    const m = add(new THREE.SphereGeometry(r, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.62), 0, y, 0);
    m.scale.set(1, yScale, 1.02);
    return m;
  };

  switch (style) {
    case 'bald':
      // No hair mesh — the flat skin-colored scalp shows through.
      break;

    case 'buzz':
      cap(HEAD_R * 1.02, 0.9, 0.004);
      break;

    case 'short': {
      cap(HEAD_R * 1.06, 1.02);
      add(new THREE.BoxGeometry(0.15, 0.03, 0.03), 0, 0.072, HEAD_R * 0.82); // fringe
      break;
    }

    case 'messy': {
      cap(HEAD_R * 1.07, 1.04);
      const tufts: [number, number, number, number][] = [
        [-0.06, 0.11, 0.03, 0.5],
        [0.03, 0.125, -0.02, 0.62],
        [0.07, 0.1, 0.05, 0.45],
        [-0.02, 0.13, 0.06, 0.55],
      ];
      for (const [x, y, z, s] of tufts) {
        const t = add(new THREE.ConeGeometry(0.035, 0.075, 6), x, y, z);
        t.scale.setScalar(s + 0.6);
        t.rotation.set(Math.random() * 0.6 - 0.3, 0, Math.random() * 0.6 - 0.3);
      }
      break;
    }

    case 'ponytail': {
      cap(HEAD_R * 1.06, 1.02);
      const tie = add(new THREE.SphereGeometry(0.032, 10, 8), 0, 0.045, -HEAD_R * 0.95);
      tie.scale.set(1, 0.8, 1);
      const tail = add(new THREE.CapsuleGeometry(0.036, 0.2, 6, 10), 0, -0.045, -HEAD_R * 1.05);
      tail.rotation.x = -0.32;
      break;
    }

    case 'bun': {
      cap(HEAD_R * 1.06, 1.02);
      const bun = add(new THREE.SphereGeometry(0.062, 14, 12), 0, 0.105, -HEAD_R * 0.72);
      bun.scale.set(1, 0.92, 1);
      break;
    }

    case 'afro': {
      const a = add(new THREE.SphereGeometry(HEAD_R * 1.55, 20, 16), 0, 0.045, -0.008);
      a.scale.set(1.06, 1, 1.04);
      break;
    }

    case 'long': {
      cap(HEAD_R * 1.07, 1.03);
      for (const side of [-1, 1]) {
        const fall = add(
          new THREE.CapsuleGeometry(0.045, 0.22, 6, 10),
          side * HEAD_R * 0.92,
          -0.085,
          -0.01
        );
        fall.scale.z = 0.62;
      }
      const back = add(new THREE.CapsuleGeometry(0.075, 0.24, 6, 12), 0, -0.1, -HEAD_R * 0.62);
      back.scale.set(1.05, 1, 0.5);
      break;
    }

    case 'mohawk': {
      const base = add(new THREE.SphereGeometry(HEAD_R * 1.01, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), 0, 0.004, 0);
      base.scale.set(1, 0.85, 1);
      for (let i = 0; i < 5; i++) {
        const t = i / 4;
        const spike = add(new THREE.ConeGeometry(0.028, 0.11 + Math.sin(t * Math.PI) * 0.06, 6), 0, 0.115, (t - 0.5) * 0.17);
        spike.scale.x = 0.8;
      }
      break;
    }
  }
}

// ---------------------------------------------------------------- outfits

interface OutfitCtx {
  torso: THREE.Group;
  headPivot: THREE.Object3D;
  headY: number;
  arms: Record<'l' | 'r', { shoulder: THREE.Group; elbow: THREE.Group }>;
  hipY: number;
  spec: BuildSpec;
  primaryMat: THREE.Material;
  secondaryMat: THREE.Material;
  accentMat: THREE.Material;
  darkMat: THREE.Material;
  res: Resources;
}

function buildOutfit(outfit: Outfit, ctx: OutfitCtx): void {
  const { torso, headPivot, headY, arms, spec, primaryMat, secondaryMat, accentMat, darkMat, res } = ctx;
  const chestLocalY = CHEST_Y - HIP_Y;
  const waistLocalY = WAIST_Y - HIP_Y;

  const panel = (w: number, h: number, d: number, y: number, mat: THREE.Material, z = 0) => {
    const m = new THREE.Mesh(res.geom(new THREE.BoxGeometry(w, h, d)), mat);
    m.position.set(0, y, z);
    torso.add(m);
    return m;
  };

  switch (outfit) {
    case 'jumpsuit': {
      // Collar + a zip line down the chest.
      panel(spec.shoulderW * 2.05, 0.045, spec.chestD * 2.1, chestLocalY + 0.115, secondaryMat);
      panel(0.02, 0.3, 0.012, chestLocalY, accentMat, spec.chestD * 1.02);
      panel(spec.shoulderW * 2.1, 0.05, spec.chestD * 2.15, waistLocalY - 0.05, secondaryMat); // belt
      break;
    }

    case 'hoodie': {
      const hood = new THREE.Mesh(res.geom(new THREE.SphereGeometry(0.155, 16, 14, 0, Math.PI * 2, 0, Math.PI * 0.62)), secondaryMat);
      hood.position.set(0, headY + 0.02, -0.055);
      hood.scale.set(1.12, 1.05, 1.18);
      headPivot.add(hood);
      // Kangaroo pocket + drawstrings.
      panel(spec.shoulderW * 1.5, 0.11, spec.chestD * 2.2, waistLocalY - 0.02, secondaryMat, 0.012);
      for (const side of [-1, 1]) {
        const string = new THREE.Mesh(res.geom(new THREE.CapsuleGeometry(0.008, 0.11, 4, 6)), accentMat);
        string.position.set(side * 0.045, chestLocalY + 0.055, spec.chestD * 1.05);
        torso.add(string);
      }
      break;
    }

    case 'labcoat': {
      const coatMat = res.mat(new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.68 }));
      applySurface(coatMat, fabricSurface(0xf1f5f9), 2, 1);
      // Two open front panels + skirt below the waist.
      for (const side of [-1, 1]) {
        const front = new THREE.Mesh(res.geom(new THREE.BoxGeometry(0.115, 0.5, 0.03)), coatMat);
        front.position.set(side * 0.075, chestLocalY - 0.06, spec.chestD * 0.96);
        front.rotation.y = side * 0.12;
        torso.add(front);
      }
      const back = new THREE.Mesh(res.geom(new THREE.BoxGeometry(spec.shoulderW * 2.15, 0.62, 0.03)), coatMat);
      back.position.set(0, chestLocalY - 0.09, -spec.chestD * 0.98);
      torso.add(back);
      const skirtL = new THREE.Mesh(res.geom(new THREE.BoxGeometry(spec.shoulderW * 2.2, 0.22, spec.chestD * 2.05)), coatMat);
      skirtL.position.set(0, -0.14, 0);
      torso.add(skirtL);
      // Coat sleeves over the upper arms.
      for (const side of ['l', 'r'] as const) {
        const sleeve = new THREE.Mesh(res.geom(new THREE.CapsuleGeometry(0.05, 0.2, 6, 10)), coatMat);
        sleeve.position.y = -0.14;
        arms[side].shoulder.add(sleeve);
      }
      panel(0.055, 0.075, 0.012, chestLocalY + 0.03, accentMat, spec.chestD * 1.06); // ID badge
      break;
    }

    case 'tactical': {
      const vest = panel(spec.shoulderW * 2.12, 0.34, spec.chestD * 2.3, chestLocalY, secondaryMat);
      vest.scale.z = 1.02;
      for (const side of [-1, 1]) {
        panel(0.045, 0.09, 0.02, chestLocalY + 0.06, darkMat, spec.chestD * 1.16).position.x = side * 0.075;
      }
      panel(spec.shoulderW * 2.2, 0.055, spec.chestD * 2.35, waistLocalY - 0.055, darkMat); // utility belt
      panel(0.03, 0.03, 0.02, chestLocalY + 0.135, accentMat, spec.chestD * 1.18); // shoulder light
      break;
    }

    case 'varsity': {
      // Contrast sleeves + chest letter.
      const sleeveMat = secondaryMat;
      for (const side of ['l', 'r'] as const) {
        const sleeve = new THREE.Mesh(res.geom(new THREE.CapsuleGeometry(0.047, 0.2, 6, 10)), sleeveMat);
        sleeve.position.y = -0.14;
        arms[side].shoulder.add(sleeve);
      }
      panel(spec.shoulderW * 2.05, 0.04, spec.chestD * 2.1, chestLocalY + 0.115, secondaryMat); // collar
      panel(0.07, 0.09, 0.012, chestLocalY + 0.01, accentMat, spec.chestD * 1.04); // letter patch
      panel(spec.shoulderW * 2.05, 0.035, spec.chestD * 2.1, waistLocalY - 0.075, secondaryMat); // hem
      break;
    }

    case 'street': {
      // Open jacket over a tee: two front panels in secondary, chest stays primary.
      for (const side of [-1, 1]) {
        const flap = new THREE.Mesh(res.geom(new THREE.BoxGeometry(0.1, 0.42, 0.035)), secondaryMat);
        flap.position.set(side * 0.088, chestLocalY - 0.02, spec.chestD * 0.92);
        flap.rotation.y = side * 0.2;
        torso.add(flap);
      }
      const backPanel = new THREE.Mesh(
        res.geom(new THREE.BoxGeometry(spec.shoulderW * 2.15, 0.46, 0.035)),
        secondaryMat
      );
      backPanel.position.set(0, chestLocalY - 0.02, -spec.chestD * 0.96);
      torso.add(backPanel);
      for (const side of ['l', 'r'] as const) {
        const sleeve = new THREE.Mesh(res.geom(new THREE.CapsuleGeometry(0.048, 0.2, 6, 10)), secondaryMat);
        sleeve.position.y = -0.14;
        arms[side].shoulder.add(sleeve);
      }
      panel(0.09, 0.09, 0.012, chestLocalY + 0.02, accentMat, spec.chestD * 1.03); // graphic
      break;
    }
  }
}

// ---------------------------------------------------------------- accessories

function buildAccessory(
  kind: Accessory,
  headY: number,
  accentMat: THREE.Material,
  darkMat: THREE.Material,
  hairMat: THREE.Material,
  res: Resources
): THREE.Object3D | null {
  if (kind === 'none') return null;
  const g = new THREE.Group();
  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material) => new THREE.Mesh(res.geom(geo), mat);

  switch (kind) {
    case 'cap': {
      const crown = mesh(new THREE.SphereGeometry(HEAD_R * 1.08, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), accentMat);
      crown.position.y = headY + 0.02;
      crown.scale.y = 0.85;
      g.add(crown);
      const brim = mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.014, 16, 1, false, 0, Math.PI), accentMat);
      brim.position.set(0, headY + 0.022, 0.07);
      brim.rotation.y = Math.PI;
      g.add(brim);
      break;
    }
    case 'visor': {
      const band = mesh(new THREE.TorusGeometry(HEAD_R * 1.02, 0.014, 8, 20), darkMat);
      band.position.y = headY + 0.03;
      band.rotation.x = Math.PI / 2;
      g.add(band);
      const lens = mesh(new THREE.BoxGeometry(0.2, 0.05, 0.02), accentMat);
      lens.position.set(0, headY + 0.03, HEAD_R * 0.92);
      g.add(lens);
      break;
    }
    case 'glasses': {
      for (const side of [-1, 1]) {
        const rim = mesh(new THREE.TorusGeometry(0.032, 0.006, 8, 16), darkMat);
        rim.position.set(side * 0.045, headY + 0.012, HEAD_R * 0.86);
        g.add(rim);
      }
      const bridge = mesh(new THREE.BoxGeometry(0.03, 0.005, 0.005), darkMat);
      bridge.position.set(0, headY + 0.012, HEAD_R * 0.86);
      g.add(bridge);
      for (const side of [-1, 1]) {
        const arm = mesh(new THREE.BoxGeometry(0.005, 0.005, 0.1), darkMat);
        arm.position.set(side * 0.072, headY + 0.012, HEAD_R * 0.42);
        g.add(arm);
      }
      break;
    }
    case 'headphones': {
      const band = mesh(new THREE.TorusGeometry(HEAD_R * 1.12, 0.014, 8, 20, Math.PI), darkMat);
      band.position.y = headY + 0.03;
      band.rotation.z = -Math.PI / 2;
      band.rotation.y = Math.PI / 2;
      g.add(band);
      for (const side of [-1, 1]) {
        const cup = mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.03, 14), accentMat);
        cup.position.set(side * HEAD_R * 1.1, headY + 0.005, 0);
        cup.rotation.z = Math.PI / 2;
        g.add(cup);
      }
      break;
    }
    case 'beanie': {
      const b = mesh(new THREE.SphereGeometry(HEAD_R * 1.1, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.58), accentMat);
      b.position.y = headY + 0.018;
      b.scale.y = 0.95;
      g.add(b);
      const fold = mesh(new THREE.TorusGeometry(HEAD_R * 1.06, 0.022, 8, 20), accentMat);
      fold.position.y = headY + 0.025;
      fold.rotation.x = Math.PI / 2;
      g.add(fold);
      const pom = mesh(new THREE.SphereGeometry(0.032, 10, 8), hairMat);
      pom.position.y = headY + 0.14;
      g.add(pom);
      break;
    }
    case 'mask': {
      const m = mesh(new THREE.SphereGeometry(HEAD_R * 0.85, 14, 12, 0, Math.PI, 0, Math.PI * 0.75), accentMat);
      m.position.set(0, headY - 0.045, 0.022);
      m.rotation.y = -Math.PI / 2;
      m.scale.set(1.05, 0.85, 1.05);
      g.add(m);
      break;
    }
    case 'earpiece': {
      const bud = mesh(new THREE.SphereGeometry(0.022, 10, 8), accentMat);
      bud.position.set(HEAD_R * 1.02, headY + 0.005, 0.01);
      g.add(bud);
      const boom = mesh(new THREE.CapsuleGeometry(0.006, 0.09, 4, 6), darkMat);
      boom.position.set(HEAD_R * 0.86, headY - 0.035, 0.06);
      boom.rotation.set(0.4, 0, 0.6);
      g.add(boom);
      break;
    }
  }
  return g;
}
