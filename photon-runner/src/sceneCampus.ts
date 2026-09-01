import * as THREE from 'three';
import { Game, GameEngine } from './GameEngine';
import { Res } from './sceneWorld';
import { applySurface, facadeSurface, groundSurface, metalSurface, woodSurface } from './sceneTextures';
import { buildSignagePanel } from './sceneOfficeProps';
import { createHumanoid, Gesture, Humanoid } from './sceneCharacter';
import { getAppearance, ROLE_APPEARANCES } from './characterAppearance';
import { Role, ROLES } from './sceneTypes';
import { profile } from './sceneQuality';
import { VectorSpringSimulator } from './springs';
import { interactionRegistry } from './engine/Interaction';
import { gameState } from './engine/GameState';
import { createDustField, DustField } from './sceneParticles';

/**
 * The exterior campus: an outdoor hub the player walks around in, with real
 * buildings whose doors are live `Interactable`s that hand off to existing
 * scenes (Quantum Lab -> the 3D sandbox, Security -> Quantum Heist, Research
 * Lab -> Security Labs, Server Room -> Quantum Intercept) via SceneManager.
 * Nothing here is Heist-specific — it doesn't use sceneWorld.ts's
 * MapDef/room/corridor system, which is purpose-built for indoor floor
 * plans; this is open terrain with simple building-footprint collision.
 */

interface CampusBuilding {
  id: string;
  label: string;
  center: { x: number; z: number };
  size: { w: number; d: number };
  height: number;
  color: number;
  doorSide: 'north' | 'south' | 'east' | 'west';
  destinationScene: string;
}

const BUILDINGS: CampusBuilding[] = [
  {
    id: 'quantum-lab',
    label: 'Quantum Lab',
    center: { x: 0, z: -26 },
    size: { w: 16, d: 11 },
    height: 6.2,
    color: 0x33404e,
    doorSide: 'south',
    destinationScene: 'quantum-lab-interior',
  },
  {
    id: 'security-building',
    label: 'Signals Intercept',
    center: { x: -16, z: -4 },
    size: { w: 10, d: 9 },
    height: 4.6,
    color: 0x40352d,
    doorSide: 'north',
    destinationScene: 'qkd-attack',
  },
  {
    id: 'research-lab',
    label: 'Research Lab',
    center: { x: 0, z: -4 },
    size: { w: 10, d: 9 },
    height: 4.6,
    color: 0x2f3a40,
    doorSide: 'north',
    destinationScene: 'labs',
  },
  {
    id: 'server-room',
    label: 'Server Room',
    center: { x: 16, z: -4 },
    size: { w: 10, d: 9 },
    height: 4.6,
    color: 0x2a2d34,
    doorSide: 'north',
    destinationScene: 'qkd-lobby',
  },
];

const PLAYER_PAD = 0.42;
const WALK_SPEED = 3.8;
const SPRINT_SPEED = 6.4;

function doorWorldPos(b: CampusBuilding): { x: number; z: number } {
  const halfW = b.size.w / 2;
  const halfD = b.size.d / 2;
  switch (b.doorSide) {
    case 'north':
      return { x: b.center.x, z: b.center.z - halfD - 0.9 };
    case 'south':
      return { x: b.center.x, z: b.center.z + halfD + 0.9 };
    case 'west':
      return { x: b.center.x - halfW - 0.9, z: b.center.z };
    case 'east':
      return { x: b.center.x + halfW + 0.9, z: b.center.z };
  }
}

function doorRotY(b: CampusBuilding): number {
  // A prop's local +Z faces this direction after rotation.y — same
  // convention as sceneOfficeProps.ts's wallSlot().
  switch (b.doorSide) {
    case 'north':
      return Math.PI;
    case 'south':
      return 0;
    case 'west':
      return -Math.PI / 2;
    case 'east':
      return Math.PI / 2;
  }
}

function buildTerrain(scene: THREE.Scene, res: Res): void {
  const grassMaps = groundSurface(0x3f5a3a, 0x35502f, undefined, 11);
  const grassMat = res.m(new THREE.MeshStandardMaterial({ color: 0x3f5a3a, roughness: 0.96, metalness: 0.02 }));
  applySurface(grassMat, grassMaps, 26, 1.1);

  const ground = new THREE.Mesh(res.g(new THREE.PlaneGeometry(140, 140)), grassMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
}

function buildRoad(scene: THREE.Scene, res: Res): void {
  const asphaltMaps = groundSurface(0x27282c, 0x1c1d20, undefined, 3);
  const asphaltMat = res.m(new THREE.MeshStandardMaterial({ color: 0x27282c, roughness: 0.85, metalness: 0.05 }));
  applySurface(asphaltMat, asphaltMaps, 10, 0.8);

  // Main east-west road along the south edge, plus a spur running north to
  // the campus entrance.
  const mainRoad = new THREE.Mesh(res.g(new THREE.PlaneGeometry(70, 6)), asphaltMat);
  mainRoad.rotation.x = -Math.PI / 2;
  mainRoad.position.set(0, 0.01, 16);
  mainRoad.receiveShadow = true;
  scene.add(mainRoad);

  const spur = new THREE.Mesh(res.g(new THREE.PlaneGeometry(5, 22)), asphaltMat);
  spur.rotation.x = -Math.PI / 2;
  spur.position.set(0, 0.01, 6);
  spur.receiveShadow = true;
  scene.add(spur);

  const stripeMat = res.m(new THREE.MeshBasicMaterial({ color: 0xd8d0b8 }));
  for (let i = -30; i <= 30; i += 6) {
    const stripe = new THREE.Mesh(res.g(new THREE.PlaneGeometry(2, 0.25)), stripeMat);
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(i, 0.015, 16);
    scene.add(stripe);
  }
}

function buildCourtyard(scene: THREE.Scene, res: Res): void {
  const paveMaps = groundSurface(0x8a8378, 0x6f6a5f, undefined, 21);
  const paveMat = res.m(new THREE.MeshStandardMaterial({ color: 0x8a8378, roughness: 0.8, metalness: 0.04 }));
  applySurface(paveMat, paveMaps, 8, 1);

  const plaza = new THREE.Mesh(res.g(new THREE.PlaneGeometry(20, 22)), paveMat);
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(0, 0.012, -12);
  plaza.receiveShadow = true;
  scene.add(plaza);

  // A small fountain — raised rim + a shallow blue disc reads as "water"
  // without any actual simulation.
  const rimMat = res.m(new THREE.MeshStandardMaterial({ color: 0x736b5c, roughness: 0.7, metalness: 0.1 }));
  const rim = new THREE.Mesh(res.g(new THREE.CylinderGeometry(2.1, 2.2, 0.42, 20)), rimMat);
  rim.position.set(0, 0.21, -12);
  rim.castShadow = true;
  rim.receiveShadow = true;
  scene.add(rim);

  const waterMat = res.m(
    new THREE.MeshStandardMaterial({ color: 0x2f6f8a, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.85 })
  );
  const water = new THREE.Mesh(res.g(new THREE.CylinderGeometry(1.85, 1.85, 0.05, 20)), waterMat);
  water.position.set(0, 0.4, -12);
  scene.add(water);

  const spoutMat = res.m(new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.4, metalness: 0.6 }));
  const spout = new THREE.Mesh(res.g(new THREE.CylinderGeometry(0.12, 0.16, 0.9, 10)), spoutMat);
  spout.position.set(0, 0.85, -12);
  spout.castShadow = true;
  scene.add(spout);
}

function buildTree(scene: THREE.Scene, res: Res, x: number, z: number, scale = 1): void {
  const trunkMat = res.m(new THREE.MeshStandardMaterial({ color: 0x4a3624, roughness: 0.9 }));
  const trunk = new THREE.Mesh(res.g(new THREE.CylinderGeometry(0.14, 0.2, 1.6, 7)), trunkMat);
  trunk.position.set(x, 0.8 * scale, z);
  trunk.scale.setScalar(scale);
  trunk.castShadow = true;
  scene.add(trunk);

  const leafMat = res.m(new THREE.MeshStandardMaterial({ color: 0x3f6b3a, roughness: 0.85 }));
  for (const [dy, r] of [
    [1.55, 1.05],
    [2.15, 0.78],
    [2.6, 0.5],
  ] as [number, number][]) {
    const clump = new THREE.Mesh(res.g(new THREE.IcosahedronGeometry(r, 0)), leafMat);
    clump.position.set(x, dy * scale, z);
    clump.scale.setScalar(scale);
    clump.castShadow = true;
    scene.add(clump);
  }
}

function buildStreetlight(scene: THREE.Scene, res: Res, x: number, z: number): void {
  const poleMat = res.m(new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.5, metalness: 0.6 }));
  applySurface(poleMat, metalSurface(0x2a2d31), 1.5, 0.7);

  const pole = new THREE.Mesh(res.g(new THREE.CylinderGeometry(0.06, 0.08, 3.4, 8)), poleMat);
  pole.position.set(x, 1.7, z);
  pole.castShadow = true;
  scene.add(pole);

  const armGeo = new THREE.BoxGeometry(0.7, 0.06, 0.06);
  const arm = new THREE.Mesh(res.g(armGeo), poleMat);
  arm.position.set(x + 0.35, 3.35, z);
  scene.add(arm);

  const bulbMat = res.m(new THREE.MeshBasicMaterial({ color: 0xffe9b0, toneMapped: false }));
  const bulb = new THREE.Mesh(res.g(new THREE.SphereGeometry(0.14, 12, 10)), bulbMat);
  bulb.position.set(x + 0.66, 3.28, z);
  scene.add(bulb);

  const light = new THREE.PointLight(0xffcf8a, 3.4, 9, 2);
  light.position.set(x + 0.66, 3.2, z);
  scene.add(light);
}

function buildBuilding(scene: THREE.Scene, res: Res, b: CampusBuilding): void {
  const facadeMaps = facadeSurface(b.color);
  const wallMat = res.m(new THREE.MeshStandardMaterial({ color: b.color, roughness: 0.6, metalness: 0.15 }));
  applySurface(wallMat, facadeMaps, Math.max(b.size.w, b.size.d) / 4, 0.9);
  // Windows glow: the facade albedo already isolates bright cells on a near-
  // black frame, so reusing it as the emissive map gives lit windows at
  // night without a second dedicated canvas.
  wallMat.emissiveMap = wallMat.map;
  wallMat.emissive = new THREE.Color(0xffffff);
  wallMat.emissiveIntensity = 0.85;

  const body = new THREE.Mesh(res.g(new THREE.BoxGeometry(b.size.w, b.height, b.size.d)), wallMat);
  body.position.set(b.center.x, b.height / 2, b.center.z);
  body.castShadow = true;
  body.receiveShadow = true;
  scene.add(body);

  const roofMat = res.m(new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.55, metalness: 0.4 }));
  applySurface(roofMat, metalSurface(0x1c1e22), 2, 0.8);
  const roof = new THREE.Mesh(
    res.g(new THREE.BoxGeometry(b.size.w * 1.04, 0.3, b.size.d * 1.04)),
    roofMat
  );
  roof.position.set(b.center.x, b.height + 0.15, b.center.z);
  roof.castShadow = true;
  scene.add(roof);

  // Door + entrance canopy + wall-mounted signage, all on doorSide.
  const doorGap = doorWorldPos(b);
  const rotY = doorRotY(b);
  const doorMat = res.m(new THREE.MeshStandardMaterial({ color: 0x0e1116, roughness: 0.3, metalness: 0.2 }));
  const door = new THREE.Mesh(res.g(new THREE.BoxGeometry(1.5, 2.4, 0.1)), doorMat);
  door.position.set(
    b.center.x + (doorGap.x - b.center.x) * 0.55,
    1.2,
    b.center.z + (doorGap.z - b.center.z) * 0.55
  );
  scene.add(door);

  const canopyMat = res.m(new THREE.MeshStandardMaterial({ color: 0x14171c, roughness: 0.5, metalness: 0.5 }));
  applySurface(canopyMat, woodSurface(0x14171c), 1.2, 0.6);
  const canopy = new THREE.Mesh(res.g(new THREE.BoxGeometry(2.4, 0.12, 1.6)), canopyMat);
  canopy.position.set(door.position.x, 2.7, door.position.z);
  canopy.rotation.y = rotY;
  canopy.castShadow = true;
  scene.add(canopy);

  buildSignagePanel(scene, res, {
    x: b.center.x,
    y: b.height + 0.9,
    z: b.center.z,
    rotY,
    text: b.label,
    accent: 0x5ea8c9,
    ring: true,
  });
}

/** Circle-vs-AABB against every building footprint, inflated by the
 * player's radius — the campus has no room/corridor graph to walk, just
 * open terrain with buildings you can't walk through. */
function collidesBuilding(x: number, z: number): boolean {
  for (const b of BUILDINGS) {
    const halfW = b.size.w / 2 + PLAYER_PAD;
    const halfD = b.size.d / 2 + PLAYER_PAD;
    if (Math.abs(x - b.center.x) < halfW && Math.abs(z - b.center.z) < halfD) return true;
  }
  return false;
}

interface NpcActor {
  humanoid: Humanoid;
  gestures: Gesture[];
  gestureIdx: number;
  gestureTimer: number;
}

const SHOWCASE_GESTURES: Gesture[] = ['wave', 'point', 'celebrate'];

/** Alice, Bob, and Eve standing outside the Quantum Lab as their actual,
 * named, recognizable selves — proof the new identity presets and gesture
 * system both work, without waiting on the full Phase 5 educational lab
 * build-out. Openly named here on purpose: unlike Quantum Heist, nothing
 * about who's who is secret in this context. */
function buildRoleShowcase(scene: THREE.Scene, res: Res): NpcActor[] {
  buildSignagePanel(scene, res, {
    x: 0,
    y: 2.1,
    z: -21.5,
    rotY: 0,
    text: 'Meet Alice, Bob & Eve',
    accent: 0x5ea8c9,
  });

  const spots: [Role, number][] = [
    ['alice', -2.4],
    ['bob', 0],
    ['eve', 2.4],
  ];

  return spots.map(([role, x], i) => {
    const humanoid = createHumanoid(ROLES[role].color, { appearance: ROLE_APPEARANCES[role] });
    humanoid.group.position.set(x, 0, -19.5);
    humanoid.faceDirection(Math.PI);
    scene.add(humanoid.group);
    return {
      humanoid,
      gestures: SHOWCASE_GESTURES,
      gestureIdx: i, // stagger so all three aren't waving in lockstep
      gestureTimer: 2 + i * 1.4,
    };
  });
}

export interface CampusOptions {
  onEnterBuilding: (sceneId: string) => void;
  onPromptChange: (label: string | null) => void;
}

export function createCampusWorld(opts: CampusOptions): Game {
  let res: Res | null = null;
  let humanoid: Humanoid | null = null;
  let camera: THREE.PerspectiveCamera | null = null;
  let npcs: NpcActor[] = [];
  let dust: DustField | null = null;

  const playerPos = new THREE.Vector3(0, 0, 20);
  let facing = Math.PI;
  let moveX = 0;
  let moveZ = 0;
  let sprinting = false;
  let lastPromptId: string | null = null;
  const lookAhead = new VectorSpringSimulator(0.35, 3.4);
  const camPos = new THREE.Vector3();

  return {
    id: 'campus',
    title: 'Research Campus',

    init(engine: GameEngine) {
      res = new Res();
      camera = engine.camera;
      const scene = engine.scene;

      scene.background = new THREE.Color(0x0d1420);
      scene.fog = new THREE.FogExp2(0x0d1420, 0.011);
      scene.add(new THREE.HemisphereLight(0x6c85a8, 0x1a2018, 0.55));

      const sun = new THREE.DirectionalLight(0xdfe8ff, 1.1);
      sun.position.set(24, 34, -10);
      sun.castShadow = true;
      sun.shadow.mapSize.set(profile().shadowMapSize, profile().shadowMapSize);
      const span = 46;
      sun.shadow.camera.left = -span;
      sun.shadow.camera.right = span;
      sun.shadow.camera.top = span;
      sun.shadow.camera.bottom = -span;
      sun.shadow.camera.far = 110;
      sun.shadow.bias = -0.0009;
      scene.add(sun);

      buildTerrain(scene, res);
      buildRoad(scene, res);
      buildCourtyard(scene, res);
      for (const b of BUILDINGS) buildBuilding(scene, res, b);

      const treeSpots: [number, number, number?][] = [
        [-11, -18], [11, -18], [-11, -6], [11, -6],
        [-24, -2], [24, -2], [-24, 10], [24, 10],
        [-9, -30, 0.85], [9, -30, 0.85],
      ];
      for (const [x, z, s] of treeSpots) buildTree(scene, res, x, z, s ?? 1);

      for (const x of [-24, -8, 8, 24]) buildStreetlight(scene, res, x, 13);

      npcs = buildRoleShowcase(scene, res);

      // Ambient drifting motes across the courtyard — the one thing every
      // scene was missing before: nothing airborne, just static geometry.
      // Same tier gate as scatterProps()/corner bounce lights: a purely
      // decorative particle count that costs a per-frame CPU loop should
      // shrink on `balanced`, not render identically on every device.
      dust = createDustField(scene, res, {
        count: profile().fillLights ? 260 : 150,
        bounds: new THREE.Vector3(48, 6, 40),
        center: new THREE.Vector3(0, 0.5, -6),
        color: 0xdff2ff,
      });

      humanoid = createHumanoid(0x5ea8c9, { appearance: getAppearance() });
      humanoid.group.position.copy(playerPos);
      humanoid.faceDirection(facing);
      scene.add(humanoid.group);

      gameState.set('EXPLORATION');

      for (const b of BUILDINGS) {
        const pos = doorWorldPos(b);
        interactionRegistry.register({
          id: b.id,
          name: b.label,
          description: `Enter ${b.label}`,
          prompt: `Enter ${b.label}`,
          position: pos,
          range: 2.4,
          onInteract: () => opts.onEnterBuilding(b.destinationScene),
        });
      }
    },

    update(dt: number) {
      if (!humanoid || !camera) return;

      const len = Math.hypot(moveX, moveZ);
      const moving = len > 0.001;
      if (moving) {
        const nx = moveX / len;
        const nz = moveZ / len;
        // 'w' maps to z += 1 (see keyboardMovement.ts), but the chase camera
        // sits at +z looking toward -z, so forward on screen is -z. Without
        // this negation 'w' walks the character backwards, toward the camera.
        facing = Math.atan2(nx, -nz);
        const speed = sprinting ? SPRINT_SPEED : WALK_SPEED;
        const stepX = nx * speed * dt;
        const stepZ = -nz * speed * dt;

        if (!collidesBuilding(playerPos.x + stepX, playerPos.z + stepZ)) {
          playerPos.x += stepX;
          playerPos.z += stepZ;
        } else if (!collidesBuilding(playerPos.x + stepX, playerPos.z)) {
          playerPos.x += stepX;
        } else if (!collidesBuilding(playerPos.x, playerPos.z + stepZ)) {
          playerPos.z += stepZ;
        }
      }

      humanoid.setWalking(moving);
      humanoid.setSprinting(moving && sprinting);
      humanoid.faceDirection(facing);
      humanoid.group.position.set(playerPos.x, 0, playerPos.z);
      humanoid.update(dt);

      lookAhead.target.set(Math.sin(facing) * (moving ? 1.4 : 0), Math.cos(facing) * (moving ? 1.4 : 0));
      lookAhead.advance(dt);
      const anchorX = playerPos.x + lookAhead.position.x;
      const anchorZ = playerPos.z + lookAhead.position.y;
      camPos.set(anchorX, 12.5, anchorZ + 9.5);
      camera.position.lerp(camPos, Math.min(dt * 3.2, 1));
      camera.lookAt(anchorX, 0.9, anchorZ);

      const nearest = interactionRegistry.nearestAvailable({ x: playerPos.x, z: playerPos.z }, { actorId: 'player' }, facing);
      const id = nearest?.id ?? null;
      if (id !== lastPromptId) {
        lastPromptId = id;
        opts.onPromptChange(nearest ? nearest.prompt : null);
      }

      dust?.update(dt);

      // The Alice/Bob/Eve showcase idles and periodically cycles through a
      // gesture each — a standing demo of the animation system, not just a
      // static prop.
      for (const npc of npcs) {
        npc.humanoid.update(dt);
        npc.gestureTimer -= dt;
        if (npc.gestureTimer <= 0) {
          npc.humanoid.playGesture(npc.gestures[npc.gestureIdx % npc.gestures.length]);
          npc.gestureIdx++;
          npc.gestureTimer = 4.5 + Math.random() * 2;
        }
      }
    },

    dispose() {
      for (const b of BUILDINGS) interactionRegistry.unregister(b.id);
      humanoid?.dispose();
      for (const npc of npcs) npc.humanoid.dispose();
      npcs = [];
      dust = null;
      res?.dispose();
      res = null;
      humanoid = null;
      camera = null;
    },

    setMoveVector(x: number, z: number, sprint = false) {
      moveX = x;
      moveZ = z;
      sprinting = sprint;
    },

    interact() {
      const nearest = interactionRegistry.nearestAvailable({ x: playerPos.x, z: playerPos.z }, { actorId: 'player' }, facing);
      if (!nearest || !humanoid) return;
      // Turn to face what's being interacted with before triggering it — a
      // character that keeps facing its last walk direction while reaching
      // for a door behind it reads as broken, not idle.
      facing = Math.atan2(nearest.position.x - playerPos.x, nearest.position.z - playerPos.z);
      humanoid.faceDirection(facing);
      humanoid.playGesture('point');
      interactionRegistry.interact(nearest.id, { x: playerPos.x, z: playerPos.z }, { actorId: 'player' });
    },
  };
}
