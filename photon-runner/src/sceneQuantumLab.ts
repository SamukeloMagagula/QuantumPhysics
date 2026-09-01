import * as THREE from 'three';
import { Game, GameEngine } from './GameEngine';
import { Res } from './sceneWorld';
import { applySurface, groundSurface, metalSurface, wallSurface } from './sceneTextures';
import { fresnelRimMaterial } from './sceneShaders';
import { createDustField, createSparkleBurst, Burst, DustField } from './sceneParticles';
import { createHumanoid, Humanoid } from './sceneCharacter';
import { getAppearance } from './characterAppearance';
import { profile } from './sceneQuality';
import { VectorSpringSimulator } from './springs';
import { interactionRegistry } from './engine/Interaction';
import { gameState } from './engine/GameState';
import { stationDiagramTexture, STATION_TITLES, StationKind } from './sceneHologramContent';

/**
 * The walkable Quantum Lab interior: five teaching stations (Photon,
 * Polarization, Alice, Bob, Eve) you walk up to and interact with, each
 * popping up a diegetic in-world hologram panel with a canvas-drawn diagram
 * — not an HTML modal over the game. A physical "quantum channel" conduit
 * runs Alice -> Eve -> Bob so the interception concept reads spatially, not
 * just as text. A sixth station bridges to the existing, much deeper
 * QuantumPhenomenaLab orbit-camera sandbox for players who want to actually
 * run the simulation rather than read about it.
 */

const ROOM_W = 22;
const ROOM_D = 18;
const WALL_H = 3.6;
const PLAYER_PAD = 0.4;
const WALK_SPEED = 3.6;
const SPRINT_SPEED = 6.0;

interface Station {
  id: string;
  kind: StationKind | 'simulator';
  position: { x: number; z: number };
}

const STATIONS: Station[] = [
  { id: 'photon', kind: 'photon', position: { x: 0, z: 6.5 } },
  { id: 'polarization', kind: 'polarization', position: { x: 0, z: -7 } },
  { id: 'alice', kind: 'alice', position: { x: -7.5, z: 0 } },
  { id: 'eve', kind: 'eve', position: { x: 0, z: 0 } },
  { id: 'bob', kind: 'bob', position: { x: 7.5, z: 0 } },
  { id: 'simulator', kind: 'simulator', position: { x: 0, z: -7 - 3.2 } },
];

function collides(x: number, z: number): boolean {
  const halfW = ROOM_W / 2 - PLAYER_PAD;
  const halfD = ROOM_D / 2 - PLAYER_PAD;
  return Math.abs(x) > halfW || Math.abs(z) > halfD;
}

function buildRoom(scene: THREE.Scene, res: Res): void {
  const floorMaps = groundSurface(0x565f68, 0x454c53, undefined, 5);
  const floorMat = res.m(new THREE.MeshStandardMaterial({ color: 0x565f68, roughness: 0.85, metalness: 0.08 }));
  applySurface(floorMat, floorMaps, 8, 1);
  const floor = new THREE.Mesh(res.g(new THREE.PlaneGeometry(ROOM_W, ROOM_D)), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const wallMaps = wallSurface(0x2c3138);
  const wallMat = res.m(new THREE.MeshStandardMaterial({ color: 0x2c3138, roughness: 0.9, metalness: 0.05 }));
  applySurface(wallMat, wallMaps, 2, 1);

  const addWall = (w: number, d: number, x: number, z: number) => {
    const wall = new THREE.Mesh(res.g(new THREE.BoxGeometry(w, WALL_H, d)), wallMat);
    wall.position.set(x, WALL_H / 2, z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    scene.add(wall);
  };
  addWall(ROOM_W + 0.6, 0.3, 0, -ROOM_D / 2);
  addWall(ROOM_W + 0.6, 0.3, 0, ROOM_D / 2);
  addWall(0.3, ROOM_D + 0.6, -ROOM_W / 2, 0);
  addWall(0.3, ROOM_D + 0.6, ROOM_W / 2, 0);

  // Ceiling — same downward-facing-plane trick as the Heist facilities: the
  // default overhead camera never sees its back face, but it closes the
  // room for anyone looking up at it.
  const ceilMat = res.m(new THREE.MeshStandardMaterial({ color: 0x14171c, roughness: 0.9 }));
  applySurface(ceilMat, wallMaps, 2, 1);
  const ceiling = new THREE.Mesh(res.g(new THREE.PlaneGeometry(ROOM_W, ROOM_D)), ceilMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = WALL_H - 0.01;
  ceiling.receiveShadow = true;
  ceiling.castShadow = false;
  scene.add(ceiling);

  for (const [x, z] of [
    [-6, -5],
    [6, -5],
    [-6, 5],
    [6, 5],
    [0, 0],
  ] as [number, number][]) {
    const fixture = new THREE.PointLight(0x9fd8ff, 3.2, 11, 2);
    fixture.position.set(x, WALL_H - 0.2, z);
    scene.add(fixture);
  }
}

function buildPedestal(scene: THREE.Scene, res: Res, x: number, z: number, color: number): THREE.Mesh {
  const podMat = res.m(new THREE.MeshStandardMaterial({ color: 0x1c2229, roughness: 0.4, metalness: 0.6 }));
  applySurface(podMat, metalSurface(0x1c2229), 1.2, 0.7);
  const pod = new THREE.Mesh(res.g(new THREE.CylinderGeometry(0.4, 0.5, 0.9, 14)), podMat);
  pod.position.set(x, 0.45, z);
  pod.castShadow = true;
  pod.receiveShadow = true;
  scene.add(pod);

  const orbMat = res.m(new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.1, roughness: 0.2 }));
  const orb = new THREE.Mesh(res.g(new THREE.IcosahedronGeometry(0.16, 1)), orbMat);
  orb.position.set(x, 1.05, z);
  scene.add(orb);

  const light = new THREE.PointLight(color, 1.6, 3.5, 2);
  light.position.set(x, 1.1, z);
  scene.add(light);

  return orb;
}

function buildChannelConduit(scene: THREE.Scene, res: Res): THREE.Mesh[] {
  const conduitMat = res.m(new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.5, metalness: 0.6 }));
  const conduit = new THREE.Mesh(res.g(new THREE.CylinderGeometry(0.04, 0.04, 15, 10)), conduitMat);
  conduit.rotation.z = Math.PI / 2;
  conduit.position.set(0, 1.05, 0);
  scene.add(conduit);

  const pulseMat = res.m(new THREE.MeshBasicMaterial({ color: 0x8fd9ff, toneMapped: false }));
  const pulses: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const p = new THREE.Mesh(res.g(new THREE.SphereGeometry(0.06, 10, 8)), pulseMat);
    p.position.set(-7.5, 1.05, 0);
    scene.add(p);
    pulses.push(p);
  }
  return pulses;
}

export interface QuantumLabOptions {
  onOpenSimulator: () => void;
  onStationChange: (title: string | null) => void;
  onPromptChange: (label: string | null) => void;
}

export function createQuantumLabWorld(opts: QuantumLabOptions): Game {
  let res: Res | null = null;
  let humanoid: Humanoid | null = null;
  let camera: THREE.PerspectiveCamera | null = null;
  let pulses: THREE.Mesh[] = [];
  let dust: DustField | null = null;
  let bursts: Burst[] = [];
  let sceneRef: THREE.Scene | null = null;

  const playerPos = new THREE.Vector3(0, 0, 8.5);
  let facing = Math.PI;
  let moveX = 0;
  let moveZ = 0;
  let sprinting = false;
  let lastPromptId: string | null = null;
  const lookAhead = new VectorSpringSimulator(0.35, 3.4);
  const camPos = new THREE.Vector3();
  let clock = 0;

  // Hologram panel: a translucent glass plane + a swappable diagram
  // texture, scaled/faded in over the station it's currently showing and
  // faded back out after a few seconds — genuinely part of the 3D scene,
  // not an HTML overlay.
  let panelGroup: THREE.Group | null = null;
  let panelMat: THREE.MeshBasicMaterial | null = null;
  let panelVisibleT = 0; // 0..1, target opacity/scale
  let panelTimer = 0;
  let activeStation: string | null = null;

  function showStation(kind: StationKind, x: number, z: number): void {
    if (!panelGroup || !panelMat) return;
    panelMat.map?.dispose();
    panelMat.map = stationDiagramTexture(kind);
    panelMat.needsUpdate = true;
    // Float the panel above its station, facing the room center so it
    // reads no matter which side the player approached from. The Eve
    // station sits exactly at the room center, so it needs its own fixed
    // facing rather than "look at the center" (which would be degenerate).
    panelGroup.position.set(x, 2.15, z);
    if (x === 0 && z === 0) panelGroup.lookAt(0, 2.15, 6.5);
    else panelGroup.lookAt(0, 2.15, 0);
    panelTimer = 6.5;
    activeStation = kind;
    opts.onStationChange(STATION_TITLES[kind]);

    if (sceneRef) {
      bursts.push(createSparkleBurst(sceneRef, new THREE.Vector3(x, 1.1, z), 0x8fd9ff));
    }
  }

  return {
    id: 'quantum-lab-interior',
    title: 'Quantum Lab',

    init(engine: GameEngine) {
      res = new Res();
      camera = engine.camera;
      const scene = engine.scene;
      sceneRef = scene;

      scene.background = new THREE.Color(0x070a10);
      scene.fog = new THREE.FogExp2(0x070a10, 0.035);
      scene.add(new THREE.HemisphereLight(0x5f7f9f, 0x11151a, 0.5));

      const key = new THREE.DirectionalLight(0xdfeeff, 0.6);
      key.position.set(6, 10, 4);
      key.castShadow = true;
      key.shadow.mapSize.set(profile().shadowMapSize, profile().shadowMapSize);
      scene.add(key);

      buildRoom(scene, res);
      buildPedestal(scene, res, -7.5, 0, 0x5ea8c9);
      buildPedestal(scene, res, 7.5, 0, 0x5ea8c9);
      buildPedestal(scene, res, 0, 0, 0xfca5a5);
      buildPedestal(scene, res, 0, 6.5, 0x8fd9ff);
      buildPedestal(scene, res, 0, -7, 0x8fd9ff);
      pulses = buildChannelConduit(scene, res);
      dust = createDustField(scene, res, {
        count: profile().fillLights ? 160 : 90,
        bounds: new THREE.Vector3(ROOM_W - 2, 2.6, ROOM_D - 2),
        center: new THREE.Vector3(0, 0.4, 0),
        color: 0x9fd8ff,
      });

      // A simple "advanced simulator" terminal, distinct from the teaching
      // pedestals, bridging to the existing full sandbox.
      const simMat = res.m(new THREE.MeshStandardMaterial({ color: 0x14171c, roughness: 0.4, metalness: 0.5 }));
      const sim = new THREE.Mesh(res.g(new THREE.BoxGeometry(1.2, 1.0, 0.6)), simMat);
      sim.position.set(0, 0.5, -10.2);
      sim.castShadow = true;
      scene.add(sim);

      // Hologram panel prop.
      panelGroup = new THREE.Group();
      panelMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, toneMapped: false, side: THREE.DoubleSide });
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.8), panelMat);
      panelGroup.add(panel);
      const frameMat = res.m(fresnelRimMaterial(0x5ea8c9, 0.95, 2.4));
      const frame = new THREE.Mesh(res.g(new THREE.PlaneGeometry(2.9, 2.05)), frameMat);
      frame.position.z = -0.01;
      panelGroup.add(frame);
      panelGroup.scale.setScalar(0.001);
      scene.add(panelGroup);

      humanoid = createHumanoid(0x5ea8c9, { appearance: getAppearance() });
      humanoid.group.position.copy(playerPos);
      humanoid.faceDirection(facing);
      scene.add(humanoid.group);

      gameState.set('EXPERIMENT');

      for (const s of STATIONS) {
        interactionRegistry.register({
          id: s.id,
          name: s.kind === 'simulator' ? 'Advanced Simulator' : STATION_TITLES[s.kind],
          description: s.kind === 'simulator' ? 'Open the full quantum optical bench.' : `Learn about ${STATION_TITLES[s.kind]}`,
          prompt: s.kind === 'simulator' ? 'Open advanced simulator' : `Examine ${STATION_TITLES[s.kind]}`,
          position: s.position,
          range: 2.3,
          onInteract: () => {
            if (s.kind === 'simulator') {
              opts.onOpenSimulator();
              return;
            }
            showStation(s.kind, s.position.x, s.position.z);
          },
        });
      }
    },

    update(dt: number) {
      if (!humanoid || !camera) return;
      clock += dt;

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
        if (!collides(playerPos.x + stepX, playerPos.z + stepZ)) {
          playerPos.x += stepX;
          playerPos.z += stepZ;
        } else if (!collides(playerPos.x + stepX, playerPos.z)) {
          playerPos.x += stepX;
        } else if (!collides(playerPos.x, playerPos.z + stepZ)) {
          playerPos.z += stepZ;
        }
      }

      humanoid.setWalking(moving);
      humanoid.setSprinting(moving && sprinting);
      humanoid.faceDirection(facing);
      humanoid.group.position.set(playerPos.x, 0, playerPos.z);
      humanoid.update(dt);

      lookAhead.target.set(Math.sin(facing) * (moving ? 1.2 : 0), Math.cos(facing) * (moving ? 1.2 : 0));
      lookAhead.advance(dt);
      const anchorX = playerPos.x + lookAhead.position.x;
      const anchorZ = playerPos.z + lookAhead.position.y;
      camPos.set(anchorX, 6.2, anchorZ + 6.4);
      camera.position.lerp(camPos, Math.min(dt * 3.4, 1));
      camera.lookAt(anchorX, 1.1, anchorZ);

      dust?.update(dt);
      if (bursts.length) bursts = bursts.filter((b) => b.update(dt));

      // Photon pulses travel Alice -> Eve -> Bob continuously — a physical,
      // always-running demonstration of "the channel," not just a diagram.
      pulses.forEach((p, i) => {
        const t = (clock * 0.35 + i / pulses.length) % 1;
        p.position.x = -7.5 + t * 15;
      });

      // Hologram show/hide.
      if (panelTimer > 0) {
        panelTimer -= dt;
        panelVisibleT = Math.min(1, panelVisibleT + dt * 5);
      } else {
        panelVisibleT = Math.max(0, panelVisibleT - dt * 3);
        if (panelVisibleT === 0) activeStation = null;
      }
      if (panelGroup && panelMat) {
        panelGroup.scale.setScalar(Math.max(0.001, panelVisibleT));
        panelMat.opacity = panelVisibleT;
      }
      if (!activeStation && opts) opts.onStationChange(null);

      const nearest = interactionRegistry.nearestAvailable({ x: playerPos.x, z: playerPos.z }, { actorId: 'player' }, facing);
      const id = nearest?.id ?? null;
      if (id !== lastPromptId) {
        lastPromptId = id;
        opts.onPromptChange(nearest ? nearest.prompt : null);
      }
    },

    dispose() {
      for (const s of STATIONS) interactionRegistry.unregister(s.id);
      humanoid?.dispose();
      panelMat?.map?.dispose();
      dust = null;
      bursts = [];
      sceneRef = null;
      res?.dispose();
      res = null;
      humanoid = null;
      camera = null;
      panelGroup = null;
      panelMat = null;
    },

    setMoveVector(x: number, z: number, sprint = false) {
      moveX = x;
      moveZ = z;
      sprinting = sprint;
    },

    interact() {
      const nearest = interactionRegistry.nearestAvailable({ x: playerPos.x, z: playerPos.z }, { actorId: 'player' }, facing);
      if (!nearest || !humanoid) return;
      facing = Math.atan2(nearest.position.x - playerPos.x, nearest.position.z - playerPos.z);
      humanoid.faceDirection(facing);
      humanoid.playGesture('point');
      interactionRegistry.interact(nearest.id, { x: playerPos.x, z: playerPos.z }, { actorId: 'player' });
    },
  };
}
