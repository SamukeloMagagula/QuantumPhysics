/**
 * Networked counterpart to quantumHeist.ts: same GameEngine/World/Humanoid
 * rendering and the same HeistGame contract HeistScreen.tsx already drives,
 * but the local player's actions go over the wire to heistService.ts (via
 * heistRoutes.ts) instead of mutating quantumHeistLogic.ts state directly,
 * and every other seat is a real remote player rendered from polled
 * positions rather than a client-side bot.
 *
 * The rules themselves (GameState) are never computed here — the server is
 * the single source of truth, exactly mirroring how quantumHeist.ts never
 * re-derives BB84 math the server already owns for QKD multiplayer.
 */
import * as THREE from 'three';
import { GameEngine, Game } from './GameEngine';
import { createHumanoid, Humanoid } from './sceneCharacter';
import { createWorld, World, MarkerHandle, FirstPersonView } from './sceneWorld';
import { getAppearance, randomAppearance } from './characterAppearance';
import { MapDef, RoomDef, getMap, isWalkable, receptionKioskPosition, roomContaining } from './sceneMaps';
import { accessRegistry } from './engine/Access';
import { VectorSpringSimulator, RelativeSpringSimulator } from './springs';
import { INTERACT_RADIUS, REPEATABLE, StationDef, TerminalKind, scoredStations, stationsFor } from './quantumHeistStations';
import { CRISIS_INFO, CrisisKind, REACH } from './quantumHeistLogic';
import type { CameraMode, HeistGame, HeistUiState, TaskView, ActiveTerminal, CommsMessage } from './quantumHeist';
import { createHeistVoice, HeistVoice } from './heistVoice';

const MOVE_SPEED = 4.4;
const SPRINT_SPEED = 7.0;
const EYE_HEIGHT = 1.6;
export const BODY_PAD = 0.5;
const POLL_MS = 900;
const POSITION_POST_MS = 220;
const TICK_MS = 1000;

interface RemoteSeat {
  seatIndex: number;
  codename: string;
  kind: 'human' | 'computer';
  alive: boolean;
  isYou: boolean;
  x: number;
  z: number;
  facing: number;
  walking: boolean;
}

interface RoomState {
  code: string;
  phase: 'lobby' | 'play' | 'ended';
  mapId: string;
  isHost: boolean;
  yourSeatIndex: number | null;
  yourCodename: string | null;
  you: { codename: string; role: 'crew' | 'eve'; alive: boolean } | null;
  seats: RemoteSeat[];
  keyProgress: number;
  channelNoise: number;
  killCooldown: number;
  canKillNow: boolean;
  crisis: { kind: CrisisKind; secondsLeft: number; held: number; required: number } | null;
  meeting: {
    reason: { kind: 'body'; victim: string; reporter: string } | { kind: 'alarm'; caller: string };
    secondsLeft: number;
    votes: Record<string, string>;
    yourVote: string | null;
    result: { ejected: string | null; wasEve: boolean } | null;
  } | null;
  outcome: { winner: 'crew' | 'eve'; reason: string; eveId: string; youWon: boolean } | null;
  comms: { from: string; text: string }[];
}

async function api(path: string, body?: unknown): Promise<RoomState> {
  const res = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

interface RemoteWalker {
  humanoid: Humanoid;
  target: THREE.Vector3;
  facing: RelativeSpringSimulator;
}

export interface HeistNetworkOptions {
  code: string;
}

export function createQuantumHeistNetwork(opts: HeistNetworkOptions): HeistGame {
  const code = opts.code;

  let engine: GameEngine | null = null;
  let world: World | null = null;
  let player: Humanoid | null = null;
  let map: MapDef = getMap('relay');
  let stations: StationDef[] = stationsFor(map);
  let scored: StationDef[] = scoredStations(stations);
  let totalTasks = 1;
  // Zone-gated access (see engine/Access.ts) — mirrors quantumHeist.ts's
  // singleplayer wiring exactly, just re-derived once the server tells us
  // which map the host picked (see poll(), below) instead of at
  // construction time. There's only ever one locally-controlled operative
  // per running instance, so a constant local id is all `accessRegistry`
  // needs — it isn't the server's notion of identity.
  const LOCAL_ACTOR_ID = 'local';
  let vaultRoom: RoomDef | null = null;
  let badgeKiosk: { x: number; z: number } | null = null;

  let room: RoomState | null = null;
  const remotes = new Map<string, RemoteWalker>();
  const stationMarkers = new Map<string, MarkerHandle>();

  const playerPos = new THREE.Vector3();
  let moveX = 0;
  let moveZ = 0;
  let sprinting = false;
  const velocitySpring = new VectorSpringSimulator(0.12, 5.8);
  const facingSpring = new RelativeSpringSimulator(0.05, 9);
  let cameraMode: CameraMode = 'third';

  let activeTerminal: ActiveTerminal | null = null;
  let toast: string | null = null;
  let toastTimer = 0;
  let posAccum = 0;
  let tickAccum = 0;
  let mapReady = false;
  let error: string | null = null;
  let pollTimer: number | null = null;
  let voice: HeistVoice | null = null;
  let micMuted = false;

  const subscribers = new Set<(s: HeistUiState) => void>();

  const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
  const showToast = (m: string) => {
    toast = m;
    toastTimer = 3.6;
  };

  const nearestStation = (): StationDef | null => {
    let best: StationDef | null = null;
    let bestD = INTERACT_RADIUS;
    for (const s of stations) {
      const d = dist(playerPos, s);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  };

  const atEmergency = () => dist(playerPos, map.meeting) < INTERACT_RADIUS;

  const atBadgeKiosk = (): boolean =>
    !!badgeKiosk &&
    !!vaultRoom &&
    !accessRegistry.canEnter(LOCAL_ACTOR_ID, vaultRoom.id) &&
    dist(playerPos, badgeKiosk) < INTERACT_RADIUS;

  const killTarget = (): RemoteSeat | null => {
    if (!room?.you || room.you.role !== 'eve' || !room.you.alive || !room.canKillNow) return null;
    for (const s of room.seats) {
      if (s.isYou || !s.alive) continue;
      if (dist(playerPos, s) < REACH) return s;
    }
    return null;
  };

  const crisisConsoleHere = (): string | null => {
    if (!room?.crisis) return null;
    for (const s of stations) {
      if (dist(playerPos, s) < INTERACT_RADIUS) return s.id;
    }
    return null;
  };

  function currentPrompt(): HeistUiState['prompt'] {
    if (!room || room.phase !== 'play' || activeTerminal || !room.you?.alive) return null;
    if (crisisConsoleHere()) return { kind: 'fix', label: 'Stabilise the channel' };
    if (atEmergency() && !room.crisis) return { kind: 'emergency', label: 'Call emergency meeting' };
    if (atBadgeKiosk()) return { kind: 'badge', label: 'Register visitor badge' };
    const s = nearestStation();
    if (s) return { kind: 'station', label: s.label };
    return null;
  }

  function tasksView(): TaskView[] {
    return scored.map((s) => ({
      id: s.id,
      label: s.label,
      hint: s.hint,
      done: false, // per-station completion isn't tracked networked — only aggregate keyProgress is
      room: roomContaining(map, s.x, s.z)?.name ?? '',
    }));
  }

  function snapshot(): HeistUiState {
    const r = room;
    const you = r?.you;
    const roomEl = roomContaining(map, playerPos.x, playerPos.z);
    const crisisInfo = r?.crisis ? CRISIS_INFO[r.crisis.kind] : null;

    return {
      mapId: map.id,
      mapName: map.name,
      phase: r ? (r.you ? 'play' : 'briefing') : 'briefing',
      you: you ?? { codename: r?.yourCodename ?? '', role: 'crew', alive: true },
      operatives: (r?.seats ?? []).map((s) => ({ codename: s.codename, alive: s.alive, isYou: s.isYou })),
      keyProgress: r?.keyProgress ?? 0,
      channelNoise: r?.channelNoise ?? 0,
      tasks: tasksView(),
      tasksDone: Math.round((r?.keyProgress ?? 0) * scored.length),
      tasksTotal: scored.length,
      currentRoom: roomEl?.name ?? 'Corridor',
      prompt: currentPrompt(),
      activeTerminal,
      killCooldown: r?.killCooldown ?? 0,
      canKillNow: !!killTarget(),
      canSabotage: !!you && you.role === 'eve' && you.alive && r?.phase === 'play' && !r.crisis,
      crisis:
        r?.crisis && crisisInfo
          ? {
              kind: r.crisis.kind,
              label: crisisInfo.label,
              blurb: crisisInfo.blurb,
              secondsLeft: r.crisis.secondsLeft,
              held: r.crisis.held,
              required: r.crisis.required,
            }
          : null,
      blackout: r?.crisis?.kind === 'blackout',
      meeting: r?.meeting
        ? {
            reason:
              r.meeting.reason.kind === 'body'
                ? `${r.meeting.reason.reporter} found ${r.meeting.reason.victim} compromised`
                : `${r.meeting.reason.caller} hit the alarm`,
            secondsLeft: r.meeting.secondsLeft,
            votes: r.meeting.votes,
            yourVote: r.meeting.yourVote,
            candidates: r.seats.filter((s) => s.alive).map((s) => ({ codename: s.codename, isYou: s.isYou })),
            result: r.meeting.result,
          }
        : null,
      outcome: r?.outcome ? { winner: r.outcome.winner, reason: r.outcome.reason as never, eveId: r.outcome.eveId, youWon: r.outcome.youWon } : null,
      comms: (r?.comms ?? []).map((c): CommsMessage => ({ from: c.from, text: c.text, isYou: c.from === r?.yourCodename })),
      toast: toast ?? error,
      blips: (r?.seats ?? [])
        .filter((s) => s.alive)
        .map((s) => ({ id: s.codename, x: s.isYou ? playerPos.x : s.x, z: s.isYou ? playerPos.z : s.z, isYou: s.isYou, kind: 'operative' as const })),
      objectives: scored.map((s) => ({ x: s.x, z: s.z, done: false, color: `#${s.color.toString(16).padStart(6, '0')}` })),
      tutorial: null,
      cameraMode,
      voiceStatus: voice?.status ?? 'idle',
      micMuted,
    };
  }

  function emit(): void {
    const snap = snapshot();
    subscribers.forEach((cb) => cb(snap));
  }

  function refreshMarkers(): void {
    if (!world) return;
    stationMarkers.forEach((m) => world!.removeMarker(m));
    stationMarkers.clear();
    if (room?.phase !== 'play') return;
    // Which specific consoles a live crisis requires isn't exposed over the
    // wire (only counts) — station markers stay plain 'task' pins in MP.
    for (const s of stations) {
      stationMarkers.set(s.id, world.spawnMarker(new THREE.Vector3(s.x, 0, s.z), s.color, 'task'));
    }
  }

  function firstPersonView(): FirstPersonView | undefined {
    return cameraMode === 'first' ? { eyeHeight: EYE_HEIGHT, facing: facingSpring.position } : undefined;
  }

  function syncVisibility(): void {
    if (player) player.group.visible = !!room?.you?.alive && cameraMode !== 'first';
  }

  function ensureRemote(seat: RemoteSeat): RemoteWalker {
    let w = remotes.get(seat.codename);
    if (!w) {
      const humanoid = createHumanoid(0x9a8f7d, { appearance: randomAppearance(), rimGlow: false });
      humanoid.group.position.set(seat.x, 0, seat.z);
      engine?.scene.add(humanoid.group);
      w = { humanoid, target: new THREE.Vector3(seat.x, 0, seat.z), facing: new RelativeSpringSimulator(0.05, 9) };
      remotes.set(seat.codename, w);
    }
    return w;
  }

  function syncRemotes(): void {
    if (!room) return;
    const seen = new Set<string>();
    for (const s of room.seats) {
      if (s.isYou || s.kind !== 'human') continue; // computer seats are inert placeholders in MP
      seen.add(s.codename);
      const w = ensureRemote(s);
      w.humanoid.group.visible = s.alive;
      w.target.set(s.x, 0, s.z);
      w.facing.target = s.facing;
    }
    for (const [codename, w] of remotes) {
      if (!seen.has(codename)) {
        engine?.scene.remove(w.humanoid.group);
        w.humanoid.dispose();
        remotes.delete(codename);
      }
    }
  }

  function stepRemotes(dt: number): void {
    for (const w of remotes.values()) {
      const to = new THREE.Vector3().subVectors(w.target, w.humanoid.group.position);
      to.y = 0;
      const moving = to.length() > 0.05;
      w.humanoid.setWalking(moving);
      if (moving) {
        w.humanoid.group.position.addScaledVector(to, Math.min(1, dt * 8));
      }
      w.facing.advance(dt);
      w.humanoid.faceDirection(w.facing.position);
      w.humanoid.update(dt);
    }
  }

  async function poll(): Promise<void> {
    try {
      const data = await api(`/api/heist/room/${code}`);
      const before = room;
      room = data;
      error = null;
      if (!mapReady || before?.mapId !== data.mapId) {
        map = getMap(data.mapId);
        stations = stationsFor(map);
        scored = scoredStations(stations);
        totalTasks = scored.length;
        mapReady = true;

        accessRegistry.reset();
        vaultRoom = map.rooms.find((r) => r.furniture === 'vault') ?? null;
        const receptionRoom = map.rooms.find((r) => r.furniture === 'reception') ?? null;
        if (vaultRoom) accessRegistry.restrict(vaultRoom.id);
        badgeKiosk = receptionRoom ? receptionKioskPosition(receptionRoom) : null;
      }
      syncRemotes();
      if (before?.phase !== data.phase || before?.crisis !== data.crisis) refreshMarkers();
      if (!voice && data.yourSeatIndex != null) {
        voice = createHeistVoice(code, data.yourSeatIndex);
        void voice.start();
      }
      emit();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Connection lost — retrying…';
      emit();
    }
  }

  async function act(action: Record<string, unknown>): Promise<void> {
    try {
      const data = await api(`/api/heist/room/${code}/act`, { action });
      room = data;
      error = null;
      emit();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Action failed.';
      emit();
    }
  }

  return {
    id: 'quantum-heist-network',
    title: 'Quantum Heist Online',

    subscribe(cb) {
      subscribers.add(cb);
      cb(snapshot());
      return () => subscribers.delete(cb);
    },

    start() {
      // The room already transitioned to 'play' when the host started it —
      // this briefing beat is purely local, so just clear it.
      emit();
    },

    completeTerminal(stationId) {
      const s = stations.find((x) => x.id === stationId);
      if (!s) return;
      activeTerminal = null;
      player?.wave();
      showToast(s.hint);
      void act({ type: 'completeTask' });
      refreshMarkers();
    },

    closeTerminal() {
      activeTerminal = null;
      emit();
    },

    sendComms(text) {
      void act({ type: 'comms', text });
    },

    kill() {
      const t = killTarget();
      if (!t) return;
      void act({ type: 'kill', targetCodename: t.codename, at: { x: t.x, z: t.z } });
      showToast(`${t.codename} compromised.`);
    },

    report() {
      // Corrupted-node discovery isn't networked yet — reporting is a no-op until then.
    },

    emergency() {
      void act({ type: 'emergency' });
    },

    sabotage(kind) {
      const n = CRISIS_INFO[kind].consoles;
      const sorted = [...scored].sort((a, b) => a.x - b.x);
      const consoleIds = n >= 2 ? [sorted[0].id, sorted[sorted.length - 1].id] : [sorted[Math.floor(sorted.length / 2)].id];
      void act({ type: 'sabotage', kind, consoleIds });
      showToast(`${CRISIS_INFO[kind].label} triggered.`);
    },

    vote(codename) {
      void act({ type: 'vote', accused: codename });
    },

    nextTutorialStep() {},
    skipTutorial() {},

    toggleCameraMode() {
      cameraMode = cameraMode === 'third' ? 'first' : 'third';
      syncVisibility();
      emit();
    },

    toggleMic() {
      if (!voice) return;
      micMuted = voice.toggleMute();
      emit();
    },

    restart() {
      // Multiplayer rooms don't restart in place — leave via onExit and host a new one.
    },

    init(e) {
      engine = e;
      world = createWorld(e.scene, e.camera, map);
      player = createHumanoid(0x7ea87a, { appearance: getAppearance() });
      playerPos.set(map.meeting.x, 0, map.meeting.z + 2);
      player.group.position.copy(playerPos);
      e.scene.add(player.group);
      world.updateCamera(playerPos, 1);
      poll();
      pollTimer = window.setInterval(poll, POLL_MS);
      emit();
    },

    update(dt) {
      if (!world || !player) return;

      if (toastTimer > 0) {
        toastTimer -= dt;
        if (toastTimer <= 0) toast = null;
      }

      const you = room?.you;
      const canMove = room?.phase === 'play' && !activeTerminal && (!you || you.alive);

      if (canMove) {
        const len = Math.hypot(moveX, moveZ);
        const nx = len > 1 ? moveX / len : moveX;
        const nz = len > 1 ? moveZ / len : moveZ;
        const speed = sprinting ? SPRINT_SPEED : MOVE_SPEED;
        velocitySpring.target.set(nx * speed, -nz * speed);
        velocitySpring.advance(dt);

        if (velocitySpring.position.lengthSq() > 1e-4) {
          const tx = playerPos.x + velocitySpring.position.x * dt;
          const tz = playerPos.z + velocitySpring.position.y * dt;
          // See accessRegistry setup above — a no-op on maps with no vault room.
          if (isWalkable(map, tx, playerPos.z, BODY_PAD) && accessRegistry.canEnter(LOCAL_ACTOR_ID, roomContaining(map, tx, playerPos.z)?.id ?? null)) {
            playerPos.x = tx;
          }
          if (isWalkable(map, playerPos.x, tz, BODY_PAD) && accessRegistry.canEnter(LOCAL_ACTOR_ID, roomContaining(map, playerPos.x, tz)?.id ?? null)) {
            playerPos.z = tz;
          }
        }

        if (nx !== 0 || nz !== 0) {
          facingSpring.target = Math.atan2(nx, -nz);
          player.setWalking(true);
          player.setSprinting(sprinting);
        } else {
          player.setWalking(false);
          player.setSprinting(false);
        }
        facingSpring.advance(dt);
        player.faceDirection(facingSpring.position);
      } else {
        velocitySpring.target.set(0, 0);
        velocitySpring.advance(dt);
        player.setWalking(false);
        player.setSprinting(false);
      }
      player.group.position.copy(playerPos);
      player.update(dt);

      stepRemotes(dt);

      if (voice && room) {
        const others = room.seats.filter((s) => !s.isYou && s.kind === 'human');
        voice.updateSeats(others, playerPos.x, playerPos.z, you?.role === 'eve');
      }

      // Standing on a crisis console repairs it — throttled to avoid a POST every frame.
      const here = crisisConsoleHere();
      if (here && you?.alive) void act({ type: 'holdConsole', consoleId: here });

      posAccum += dt;
      if (posAccum >= POSITION_POST_MS / 1000 && room?.yourSeatIndex != null) {
        posAccum = 0;
        fetch(`/api/heist/room/${code}/position`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            updates: [
              {
                seatIndex: room.yourSeatIndex,
                x: playerPos.x,
                z: playerPos.z,
                facing: facingSpring.position,
                walking: velocitySpring.position.lengthSq() > 1e-4,
              },
            ],
          }),
        }).catch(() => {});
      }

      // Only the host advances the shared clock (kill cooldown, crisis timers) —
      // letting every client tick would multiply elapsed time by player count.
      if (room?.isHost && room.phase === 'play') {
        tickAccum += dt;
        if (tickAccum >= TICK_MS / 1000) {
          const elapsed = tickAccum;
          tickAccum = 0;
          void act({ type: 'tick', dt: elapsed });
        }
      }

      world.update(dt);
      world.updateCamera(playerPos, dt, velocitySpring.position, firstPersonView());
    },

    setMoveVector(x, z, sprint = false) {
      moveX = x;
      moveZ = z;
      sprinting = sprint;
    },

    interact() {
      if (!room || room.phase !== 'play' || activeTerminal || !room.you?.alive) return;

      if (atEmergency() && !room.crisis) {
        void act({ type: 'emergency' });
        return;
      }

      if (atBadgeKiosk() && vaultRoom) {
        accessRegistry.grant(LOCAL_ACTOR_ID, vaultRoom.id);
        showToast(`Badge issued — ${vaultRoom.name} clearance granted.`);
        emit();
        return;
      }

      const station = nearestStation();
      if (station) {
        activeTerminal = { stationId: station.id, kind: station.kind, label: station.label, hint: station.hint };
        emit();
      }
    },

    dispose() {
      if (pollTimer !== null) window.clearInterval(pollTimer);
      pollTimer = null;
      voice?.dispose();
      voice = null;
      player?.dispose();
      remotes.forEach((w) => w.humanoid.dispose());
      remotes.clear();
      world?.dispose();
      player = null;
      world = null;
      engine = null;
      subscribers.clear();
    },
  };
}
