import * as THREE from 'three';
import { GameEngine, Game } from './GameEngine';
import { createHumanoid, Humanoid } from './sceneCharacter';
import { createWorld, World, MarkerHandle } from './sceneWorld';
import { getAppearance, randomAppearance } from './characterAppearance';
import { MapDef, getMap, isWalkable, roomContaining } from './sceneMaps';
import { VectorSpringSimulator, RelativeSpringSimulator } from './springs';
import {
  TutorialState,
  TutorialStep,
  TutorialTrigger,
  advanceTutorial,
  currentStep,
  finishTutorial,
  initialTutorial,
  tutorialProgress,
} from './quantumHeistTutorial';
import { INTERACT_RADIUS, REPEATABLE, StationDef, TerminalKind, scoredStations, stationsFor } from './quantumHeistStations';
import {
  CRISIS_INFO,
  CrisisKind,
  GameState,
  Operative,
  REACH,
  aliveOf,
  botVote,
  callEmergency,
  canCompromise,
  castVote,
  compromise,
  completeTask,
  createGame,
  holdCrisisConsole,
  reportBody,
  resolveMeeting,
  startCrisis,
  tickCooldown,
  tickCrisis,
  votingComplete,
} from './quantumHeistLogic';

const MOVE_SPEED = 4.4;
const SPRINT_SPEED = 7.0;
const BOT_SPEED = 3.2;
const BODY_RADIUS = 1.7;
const WITNESS_RADIUS = 8;

/** Body half-width — movement is clamped by this so limbs never enter a wall. */
export const BODY_PAD = 0.5;

export type { CrisisKind };
export type { Outcome } from './quantumHeistLogic';

export interface TaskView {
  id: string;
  label: string;
  hint: string;
  done: boolean;
  room: string;
}

export interface CommsMessage {
  from: string;
  text: string;
  isYou: boolean;
}

export interface ActiveTerminal {
  stationId: string;
  kind: TerminalKind;
  label: string;
  hint: string;
}

export interface TutorialView {
  step: TutorialStep;
  index: number;
  total: number;
  manual: boolean;
}

export type PromptKind = 'station' | 'vent' | 'report' | 'emergency' | 'fix';

export interface HeistUiState {
  mapId: string;
  mapName: string;
  phase: GameState['phase'];
  you: { codename: string; role: Operative['role']; alive: boolean };
  operatives: { codename: string; alive: boolean; isYou: boolean }[];
  keyProgress: number;
  channelNoise: number;
  tasks: TaskView[];
  tasksDone: number;
  tasksTotal: number;
  currentRoom: string;
  prompt: { kind: PromptKind; label: string } | null;
  activeTerminal: ActiveTerminal | null;
  /** Eve only. */
  killCooldown: number;
  canKillNow: boolean;
  canSabotage: boolean;
  crisis: { kind: CrisisKind; label: string; blurb: string; secondsLeft: number; held: number; required: number } | null;
  blackout: boolean;
  meeting: {
    reason: string;
    secondsLeft: number;
    votes: Record<string, string>;
    yourVote: string | null;
    candidates: { codename: string; isYou: boolean }[];
    result: { ejected: string | null; wasEve: boolean } | null;
  } | null;
  outcome: (GameState['outcome'] & { youWon: boolean }) | null;
  comms: CommsMessage[];
  toast: string | null;
  blips: { id: string; x: number; z: number; isYou: boolean; kind: 'operative' | 'body' | 'mentor' }[];
  objectives: { x: number; z: number; done: boolean; color: string }[];
  tutorial: TutorialView | null;
}

export interface HeistGame extends Game {
  subscribe(cb: (s: HeistUiState) => void): () => void;
  start(): void;
  completeTerminal(stationId: string): void;
  closeTerminal(): void;
  sendComms(text: string): void;
  kill(): void;
  report(): void;
  emergency(): void;
  sabotage(kind: CrisisKind): void;
  vote(codename: string): void;
  nextTutorialStep(): void;
  skipTutorial(): void;
  restart(): void;
}

interface Walker {
  humanoid: Humanoid;
  pos: THREE.Vector3;
  target: THREE.Vector3;
  waitFor: number;
  facing: RelativeSpringSimulator;
}

interface Bot extends Walker {
  operative: Operative;
}

const BOT_LINES = [
  'Detector bank is green my side.',
  'Sifting now, hold the line.',
  'Where was everyone just then?',
  'I was in the generator bay.',
  'Sample looks clean from here.',
  'Someone was near the fiber.',
];

export interface HeistOptions {
  mapId?: string;
  tutorial?: boolean;
}

export function createQuantumHeist(opts: HeistOptions = {}): HeistGame {
  const map: MapDef = getMap(opts.mapId ?? 'relay');
  const stations = stationsFor(map);
  const scored = scoredStations(stations);

  let engine: GameEngine | null = null;
  let world: World | null = null;
  let player: Humanoid | null = null;
  let mentor: Walker | null = null;

  let g: GameState = createGame();
  let tutorial: TutorialState = initialTutorial(opts.tutorial ?? false);

  const playerPos = new THREE.Vector3(map.meeting.x, 0, map.meeting.z + 2);
  let moveX = 0;
  let moveZ = 0;
  let sprinting = false;
  let hasMoved = false;
  const velocitySpring = new VectorSpringSimulator(0.12, 5.8);
  const facingSpring = new RelativeSpringSimulator(0.05, 9);

  let bots: Bot[] = [];
  const stationMarkers = new Map<string, MarkerHandle>();
  const bodyMarkers = new Map<string, MarkerHandle>();

  let doneTasks = new Set<string>();
  let activeTerminal: ActiveTerminal | null = null;
  let comms: CommsMessage[] = [];
  let toast: string | null = null;
  let toastTimer = 0;
  let emitAccum = 0;
  const suspicion: Record<string, number> = {};
  let botVotesQueued = false;

  const subscribers = new Set<(s: HeistUiState) => void>();

  const isEve = () => g.you.role === 'eve';
  const youAlive = () => g.operatives.find((o) => o.id === g.you.id)!.alive;
  const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

  const showToast = (m: string) => {
    toast = m;
    toastTimer = 3.6;
  };

  function teach(event: TutorialTrigger['kind']): void {
    if (!tutorial.active) return;
    const before = tutorial.index;
    tutorial = advanceTutorial(tutorial, event);
    if (tutorial.index !== before) {
      moveMentorToFocus();
      emit();
    }
  }

  function focusPoint(step: TutorialStep | null): { x: number; z: number } {
    if (!step?.focus) return { x: playerPos.x, z: playerPos.z };
    if (step.focus === 'tap') return map.tap;
    if (step.focus === 'meeting') return map.meeting;
    if (step.focus === 'nearest-station') {
      const s = stations.find((st) => !doneTasks.has(st.id)) ?? stations[0];
      return { x: s.x, z: s.z };
    }
    return { x: playerPos.x, z: playerPos.z };
  }

  function moveMentorToFocus(): void {
    if (!mentor) return;
    const f = focusPoint(currentStep(tutorial));
    mentor.target.set(f.x + 1.3, 0, f.z + 0.9);
  }

  const tutorialPaused = () => !!currentStep(tutorial)?.pause;

  const nearestStation = (): StationDef | null => {
    let best: StationDef | null = null;
    let bestD = INTERACT_RADIUS;
    for (const s of stations) {
      if (doneTasks.has(s.id) && !REPEATABLE.has(s.id)) continue;
      const d = dist(playerPos, s);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  };

  const nearestVent = () => map.vents.find((v) => dist(playerPos, v) < 1.3) ?? null;
  const nearestBody = () => g.nodes.find((n) => !n.reported && dist(playerPos, n) < BODY_RADIUS) ?? null;
  const atEmergency = () => dist(playerPos, map.meeting) < INTERACT_RADIUS;

  /** The living crewmate Eve is close enough to compromise. */
  const killTarget = (): Bot | null => {
    if (!isEve() || !youAlive()) return null;
    for (const b of bots) {
      if (!b.operative.alive || b.operative.role !== 'crew') continue;
      if (dist(playerPos, b.pos) < REACH && canCompromise(g, g.you.id, b.operative.id)) return b;
    }
    return null;
  };

  /** Which crisis console the player is standing on, if any. */
  const crisisConsoleHere = (): string | null => {
    if (!g.crisis) return null;
    for (const id of g.crisis.required) {
      const s = stations.find((x) => x.id === id);
      if (s && dist(playerPos, s) < INTERACT_RADIUS) return id;
    }
    return null;
  };

  function currentPrompt(): HeistUiState['prompt'] {
    if (g.phase !== 'play' || activeTerminal || !youAlive()) return null;
    const fix = crisisConsoleHere();
    if (fix) return { kind: 'fix', label: 'Stabilise the channel' };
    if (nearestBody()) return { kind: 'report', label: 'Report corrupted node' };
    if (atEmergency() && !g.crisis) return { kind: 'emergency', label: 'Call emergency meeting' };
    if (isEve() && nearestVent()) return { kind: 'vent', label: 'Enter vent' };
    const s = nearestStation();
    if (s) return { kind: 'station', label: s.label };
    return null;
  }

  function snapshot(): HeistUiState {
    const room = roomContaining(map, playerPos.x, playerPos.z);
    const me = g.operatives.find((o) => o.id === g.you.id)!;
    const crisisInfo = g.crisis ? CRISIS_INFO[g.crisis.kind] : null;

    return {
      mapId: map.id,
      mapName: map.name,
      phase: g.phase,
      you: { codename: g.you.id, role: g.you.role, alive: me.alive },
      operatives: g.operatives.map((o) => ({ codename: o.id, alive: o.alive, isYou: o.isYou })),
      keyProgress: g.keyProgress,
      channelNoise: g.channelNoise,
      tasks: scored.map((s) => ({
        id: s.id,
        label: s.label,
        hint: s.hint,
        done: doneTasks.has(s.id),
        room: roomContaining(map, s.x, s.z)?.name ?? '',
      })),
      tasksDone: scored.filter((s) => doneTasks.has(s.id)).length,
      tasksTotal: scored.length,
      currentRoom: room?.name ?? 'Corridor',
      prompt: currentPrompt(),
      activeTerminal,
      killCooldown: g.killCooldown,
      canKillNow: !!killTarget(),
      canSabotage: isEve() && me.alive && g.phase === 'play' && !g.crisis,
      crisis:
        g.crisis && crisisInfo
          ? {
              kind: g.crisis.kind,
              label: crisisInfo.label,
              blurb: crisisInfo.blurb,
              secondsLeft: Math.max(0, Math.ceil(g.crisis.secondsLeft)),
              held: g.crisis.held.length,
              required: g.crisis.required.length,
            }
          : null,
      blackout: g.crisis?.kind === 'blackout',
      meeting: g.meeting
        ? {
            reason:
              g.meeting.reason.kind === 'body'
                ? `${g.meeting.reason.reporter} found ${g.meeting.reason.victim} compromised`
                : `${g.meeting.reason.caller} hit the alarm`,
            secondsLeft: Math.max(0, Math.ceil(g.meeting.secondsLeft)),
            votes: g.meeting.votes,
            yourVote: g.meeting.votes[g.you.id] ?? null,
            candidates: aliveOf(g).map((o) => ({ codename: o.id, isYou: o.isYou })),
            result: g.meeting.result,
          }
        : null,
      outcome: g.outcome ? { ...g.outcome, youWon: g.outcome.winner === (isEve() ? 'eve' : 'crew') } : null,
      comms,
      toast,
      blips: [
        { id: g.you.id, x: playerPos.x, z: playerPos.z, isYou: true, kind: 'operative' as const },
        ...bots
          .filter((b) => b.operative.alive)
          .map((b) => ({ id: b.operative.id, x: b.pos.x, z: b.pos.z, isYou: false, kind: 'operative' as const })),
        ...g.nodes
          .filter((n) => !n.reported)
          .map((n) => ({ id: `body-${n.id}`, x: n.x, z: n.z, isYou: false, kind: 'body' as const })),
        ...(mentor ? [{ id: 'mentor', x: mentor.pos.x, z: mentor.pos.z, isYou: false, kind: 'mentor' as const }] : []),
      ],
      objectives: scored.map((s) => ({
        x: s.x,
        z: s.z,
        done: doneTasks.has(s.id),
        color: `#${s.color.toString(16).padStart(6, '0')}`,
      })),
      tutorial: (() => {
        const step = currentStep(tutorial);
        if (!step) return null;
        const { total } = tutorialProgress(tutorial);
        return { step, index: tutorial.index, total, manual: step.trigger.kind === 'continue' };
      })(),
    };
  }

  function emit(): void {
    const snap = snapshot();
    subscribers.forEach((cb) => cb(snap));
  }

  // ------------------------------------------------------------- scene sync

  function refreshMarkers(): void {
    if (!world) return;
    stationMarkers.forEach((m) => world!.removeMarker(m));
    stationMarkers.clear();
    bodyMarkers.forEach((m) => world!.removeMarker(m));
    bodyMarkers.clear();
    if (g.phase !== 'play') return;

    for (const s of stations) {
      if (doneTasks.has(s.id) && !REPEATABLE.has(s.id)) continue;
      const isCrisisConsole = g.crisis?.required.includes(s.id) && !g.crisis.held.includes(s.id);
      stationMarkers.set(
        s.id,
        world.spawnMarker(new THREE.Vector3(s.x, 0, s.z), isCrisisConsole ? 0xfb7185 : s.color, isCrisisConsole ? 'hostile' : 'task')
      );
    }
    for (const n of g.nodes) {
      if (n.reported) continue;
      bodyMarkers.set(n.id, world.spawnMarker(new THREE.Vector3(n.x, 0, n.z), 0xfb7185, 'hostile'));
    }
  }

  function syncBotVisibility(): void {
    for (const b of bots) b.humanoid.group.visible = b.operative.alive;
    if (player) player.group.visible = youAlive();
  }

  function apply(next: GameState): void {
    const before = g;
    g = next;
    if (before.phase !== g.phase || before.nodes.length !== g.nodes.length || before.crisis !== g.crisis) {
      refreshMarkers();
    }
    syncBotVisibility();
    emit();
  }

  // ------------------------------------------------------------- walkers

  function stepWalker(w: Walker, speed: number, dt: number): boolean {
    const to = new THREE.Vector3().subVectors(w.target, w.pos);
    to.y = 0;
    if (to.length() < 0.35) {
      w.humanoid.setWalking(false);
      w.humanoid.update(dt);
      w.humanoid.group.position.copy(w.pos);
      return true;
    }
    to.normalize();
    const next = w.pos.clone().addScaledVector(to, speed * dt);
    if (isWalkable(map, next.x, next.z, BODY_PAD)) w.pos.copy(next);
    else if (isWalkable(map, next.x, w.pos.z, BODY_PAD)) w.pos.x = next.x;
    else if (isWalkable(map, w.pos.x, next.z, BODY_PAD)) w.pos.z = next.z;
    else return true;

    w.humanoid.setWalking(true);
    w.facing.target = Math.atan2(to.x, to.z);
    w.facing.advance(dt);
    w.humanoid.faceDirection(w.facing.position);
    w.humanoid.group.position.copy(w.pos);
    w.humanoid.update(dt);
    return false;
  }

  function botWaypoint(bot: Bot): THREE.Vector3 {
    // Bots prioritise a running crisis — the crew visibly rallies to it.
    if (g.crisis && bot.operative.role === 'crew') {
      const id = g.crisis.required.find((r) => !g.crisis!.held.includes(r));
      const s = id ? stations.find((x) => x.id === id) : null;
      if (s) return new THREE.Vector3(s.x, 0, s.z);
    }
    const s = stations[Math.floor(Math.random() * stations.length)];
    return new THREE.Vector3(s.x, 0, s.z);
  }

  function updateBots(dt: number): void {
    for (const bot of bots) {
      if (!bot.operative.alive) continue;

      if (g.phase === 'meeting' || g.phase === 'ended') {
        bot.target.set(map.meeting.x, 0, map.meeting.z - 1.6);
        stepWalker(bot, BOT_SPEED, dt);
        continue;
      }

      if (bot.waitFor > 0) {
        bot.waitFor -= dt;
        bot.humanoid.setWalking(false);
        bot.humanoid.update(dt);
        continue;
      }

      const arrived = stepWalker(bot, BOT_SPEED, dt);
      if (arrived) {
        bot.waitFor = 1.2 + Math.random() * 2.4;
        bot.target = botWaypoint(bot);

        // Crew bots contribute to tasks and to fixing crises.
        if (bot.operative.role === 'crew') {
          if (g.crisis) {
            const here = g.crisis.required.find((r) => {
              const s = stations.find((x) => x.id === r);
              return s && dist(bot.pos, s) < INTERACT_RADIUS;
            });
            if (here) apply(holdCrisisConsole(g, here));
          } else if (Math.random() < 0.3) {
            apply(completeTask(g, scored.length * 2)); // bots work at half a player's rate
          }
        }

        if (Math.random() < 0.12 && comms.length < 40) {
          comms = [
            ...comms,
            { from: bot.operative.id, text: BOT_LINES[Math.floor(Math.random() * BOT_LINES.length)], isYou: false },
          ];
        }
      }

      // Bots find bodies too — that's what makes hiding one matter.
      const body = g.nodes.find((n) => !n.reported && dist(bot.pos, n) < BODY_RADIUS);
      if (body && bot.operative.role === 'crew') {
        showToast(`${bot.operative.id} found ${body.id}.`);
        apply(reportBody(g, body.id, bot.operative.id));
        return;
      }

      // An Eve bot makes her own moves.
      if (bot.operative.role === 'eve' && g.phase === 'play') {
        if (g.killCooldown <= 0) {
          const victim = bots.find(
            (o) => o.operative.alive && o.operative.role === 'crew' && dist(bot.pos, o.pos) < REACH
          );
          const youNear = youAlive() && dist(bot.pos, playerPos) < REACH && g.you.role === 'crew';
          if (youNear && Math.random() < 0.5) {
            apply(compromise(g, g.you.id, { x: playerPos.x, z: playerPos.z }));
            showToast('Your key share was burned. You are a ghost — keep working.');
            return;
          }
          if (victim) {
            apply(compromise(g, victim.operative.id, { x: victim.pos.x, z: victim.pos.z }));
            return;
          }
        }
        if (!g.crisis && Math.random() < 0.004) {
          const kinds: CrisisKind[] = ['decoherence', 'blackout', 'keypurge'];
          const kind = kinds[Math.floor(Math.random() * kinds.length)];
          apply(startCrisis(g, kind, pickCrisisConsoles(kind)));
          showToast(`${CRISIS_INFO[kind].label} — the channel is failing.`);
          return;
        }
      }
    }
  }

  function pickCrisisConsoles(kind: CrisisKind): string[] {
    const n = CRISIS_INFO[kind].consoles;
    // Pick from opposite ends of the map so a two-console fix needs two people.
    const sorted = [...scored].sort((a, b) => a.x - b.x);
    return n >= 2 ? [sorted[0].id, sorted[sorted.length - 1].id] : [sorted[Math.floor(sorted.length / 2)].id];
  }

  function updateSuspicion(dt: number): void {
    if (g.phase !== 'play') return;
    const actors = [
      { id: g.you.id, pos: playerPos, alive: youAlive() },
      ...bots.map((b) => ({ id: b.operative.id, pos: b.pos, alive: b.operative.alive })),
    ].filter((a) => a.alive);

    for (const n of g.nodes) {
      if (n.reported) continue;
      for (const a of actors) {
        if (dist(a.pos, n) < WITNESS_RADIUS) suspicion[a.id] = Math.min(100, (suspicion[a.id] ?? 0) + dt * 6);
      }
    }
  }

  function runBotVotes(): void {
    if (botVotesQueued || !g.meeting) return;
    botVotesQueued = true;
    let next = g;
    for (const b of bots) {
      if (!b.operative.alive) continue;
      next = castVote(next, b.operative.id, botVote(next, b.operative.id, suspicion));
    }
    apply(next);
  }

  function spawnCast(): void {
    if (!engine) return;
    const roleColor = g.you.role === 'eve' ? 0xfb7185 : 0x7ea87a;
    player = createHumanoid(roleColor, { appearance: getAppearance() });
    player.group.position.copy(playerPos);
    engine.scene.add(player.group);

    bots = g.operatives
      .filter((o) => !o.isYou)
      .map((operative, i) => {
        const humanoid = createHumanoid(0x9a8f7d, { appearance: randomAppearance(), rimGlow: false });
        const angle = (i / 5) * Math.PI * 2;
        const pos = new THREE.Vector3(
          map.meeting.x + Math.cos(angle) * 1.8,
          0,
          map.meeting.z + Math.sin(angle) * 1.8
        );
        humanoid.group.position.copy(pos);
        engine!.scene.add(humanoid.group);
        return {
          operative,
          humanoid,
          pos,
          target: pos.clone(),
          waitFor: Math.random() * 2,
          facing: new RelativeSpringSimulator(0.05, 9),
        };
      });

    if (tutorial.active) {
      const h = createHumanoid(0xf2c078, {
        appearance: { ...randomAppearance(), outfit: 'labcoat', accessory: 'glasses' },
      });
      const pos = new THREE.Vector3(map.meeting.x + 1.6, 0, map.meeting.z + 1.4);
      h.group.position.copy(pos);
      engine.scene.add(h.group);
      mentor = { humanoid: h, pos, target: pos.clone(), waitFor: 0, facing: new RelativeSpringSimulator(0.05, 9) };
    }
  }

  return {
    id: 'quantum-heist',
    title: 'Quantum Heist',

    subscribe(cb) {
      subscribers.add(cb);
      cb(snapshot());
      return () => subscribers.delete(cb);
    },

    start() {
      if (g.phase !== 'briefing') return;
      apply({ ...g, phase: 'play' });
    },

    completeTerminal(stationId) {
      const s = stations.find((x) => x.id === stationId);
      if (!s || g.phase !== 'play') return;
      if (!REPEATABLE.has(s.id)) doneTasks.add(s.id);
      activeTerminal = null;
      player?.wave();
      showToast(s.hint);
      teach('complete-task');
      apply(completeTask(g, scored.length));
      refreshMarkers();
    },

    closeTerminal() {
      activeTerminal = null;
      emit();
    },

    sendComms(text) {
      const clean = text.trim().slice(0, 90);
      if (!clean) return;
      comms = [...comms, { from: g.you.id, text: clean, isYou: true }];
      teach('open-comms');
      emit();
    },

    kill() {
      const t = killTarget();
      if (!t) return;
      apply(compromise(g, t.operative.id, { x: t.pos.x, z: t.pos.z }));
      showToast(`${t.operative.id} compromised.`);
    },

    report() {
      const body = nearestBody();
      if (!body) return;
      apply(reportBody(g, body.id, g.you.id));
    },

    emergency() {
      apply(callEmergency(g, g.you.id));
    },

    sabotage(kind) {
      if (!isEve()) return;
      apply(startCrisis(g, kind, pickCrisisConsoles(kind)));
      showToast(`${CRISIS_INFO[kind].label} triggered.`);
    },

    vote(codename) {
      if (g.phase !== 'meeting') return;
      apply(castVote(g, g.you.id, codename));
      runBotVotes();
      teach('vote-cast');
    },

    nextTutorialStep() {
      teach('continue');
    },

    skipTutorial() {
      tutorial = finishTutorial(tutorial);
      if (mentor && engine) {
        engine.scene.remove(mentor.humanoid.group);
        mentor.humanoid.dispose();
        mentor = null;
      }
      emit();
    },

    restart() {
      g = createGame();
      tutorial = initialTutorial(false);
      doneTasks = new Set();
      comms = [];
      activeTerminal = null;
      botVotesQueued = false;
      Object.keys(suspicion).forEach((k) => delete suspicion[k]);
      playerPos.set(map.meeting.x, 0, map.meeting.z + 2);

      if (engine) {
        if (player) {
          engine.scene.remove(player.group);
          player.dispose();
        }
        bots.forEach((b) => {
          engine!.scene.remove(b.humanoid.group);
          b.humanoid.dispose();
        });
        if (mentor) {
          engine.scene.remove(mentor.humanoid.group);
          mentor.humanoid.dispose();
          mentor = null;
        }
        spawnCast();
        refreshMarkers();
      }
      emit();
    },

    init(e) {
      engine = e;
      world = createWorld(e.scene, e.camera, map);
      spawnCast();
      moveMentorToFocus();
      refreshMarkers();
      world.updateCamera(playerPos, 1);
      emit();
    },

    update(dt) {
      if (!world || !player) return;

      if (toastTimer > 0) {
        toastTimer -= dt;
        if (toastTimer <= 0) toast = null;
      }

      const frozen = tutorialPaused();
      const canMove = g.phase === 'play' && !activeTerminal && !frozen;

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
          if (isWalkable(map, tx, playerPos.z, BODY_PAD)) playerPos.x = tx;
          if (isWalkable(map, playerPos.x, tz, BODY_PAD)) playerPos.z = tz;
        }

        if (nx !== 0 || nz !== 0) {
          facingSpring.target = Math.atan2(nx, -nz);
          player.setWalking(true);
          player.setSprinting(sprinting);
          if (!hasMoved) {
            hasMoved = true;
            teach('move');
          }
        } else {
          player.setWalking(false);
          player.setSprinting(false);
        }
        facingSpring.advance(dt);
        player.faceDirection(facingSpring.position);
      } else if (g.phase === 'meeting' || g.phase === 'ended') {
        velocitySpring.target.set(0, 0);
        velocitySpring.advance(dt);
        player.setSprinting(false);
        const to = new THREE.Vector3(map.meeting.x, 0, map.meeting.z + 1.6).sub(playerPos);
        to.y = 0;
        if (to.length() > 0.25) {
          to.normalize();
          playerPos.addScaledVector(to, MOVE_SPEED * 0.7 * dt);
          player.setWalking(true);
          facingSpring.target = Math.atan2(to.x, to.z);
          facingSpring.advance(dt);
          player.faceDirection(facingSpring.position);
        } else {
          player.setWalking(false);
        }
      } else {
        velocitySpring.target.set(0, 0);
        velocitySpring.advance(dt);
        player.setWalking(false);
        player.setSprinting(false);
      }
      player.group.position.copy(playerPos);
      player.update(dt);

      if (mentor) {
        const arrived = stepWalker(mentor, BOT_SPEED * 0.9, dt);
        if (arrived) {
          const toPlayer = new THREE.Vector3().subVectors(playerPos, mentor.pos);
          if (toPlayer.length() > 0.1) {
            mentor.facing.target = Math.atan2(toPlayer.x, toPlayer.z);
          }
          mentor.facing.advance(dt);
          mentor.humanoid.faceDirection(mentor.facing.position);
        }
      }

      if (!frozen) {
        updateBots(dt);
        updateSuspicion(dt);
      }

      if (g.phase === 'play' && !frozen) {
        let next = tickCooldown(g, dt);
        next = tickCrisis(next, dt);
        // Standing on a crisis console repairs it.
        const here = crisisConsoleHere();
        if (here && youAlive()) next = holdCrisisConsole(next, here);
        if (next !== g) apply(next);
      }

      if (g.phase === 'meeting' && g.meeting && !g.meeting.result) {
        const secondsLeft = g.meeting.secondsLeft - dt;
        if (secondsLeft <= 0 || votingComplete(g)) {
          botVotesQueued = false;
          apply(resolveMeeting({ ...g, meeting: { ...g.meeting, secondsLeft: 0 } }));
        } else {
          g = { ...g, meeting: { ...g.meeting, secondsLeft } };
        }
      }

      if (tutorial.active && nearestStation()) teach('reach-station');

      emitAccum += dt;
      if (emitAccum >= 0.12) {
        emitAccum = 0;
        emit();
      }

      world.update(dt);
      world.updateCamera(playerPos, dt, velocitySpring.position);
    },

    setMoveVector(x, z, sprint = false) {
      moveX = x;
      moveZ = z;
      sprinting = sprint;
    },

    interact() {
      if (g.phase !== 'play' || activeTerminal || tutorialPaused() || !youAlive()) return;

      const body = nearestBody();
      if (body) {
        apply(reportBody(g, body.id, g.you.id));
        return;
      }

      if (atEmergency() && !g.crisis) {
        apply(callEmergency(g, g.you.id));
        return;
      }

      if (isEve()) {
        const vent = nearestVent();
        if (vent) {
          const targetId = vent.links[Math.floor(Math.random() * vent.links.length)];
          const target = map.vents.find((v) => v.id === targetId);
          if (target) {
            world?.popVent(vent.id);
            world?.popVent(target.id);
            playerPos.set(target.x, 0, target.z);
            showToast('You slip through the vent.');
            emit();
          }
          return;
        }
      }

      const station = nearestStation();
      if (station) {
        activeTerminal = {
          stationId: station.id,
          kind: station.kind,
          label: station.label,
          hint: station.hint,
        };
        teach('open-terminal');
        emit();
      }
    },

    dispose() {
      player?.dispose();
      mentor?.humanoid.dispose();
      bots.forEach((b) => b.humanoid.dispose());
      world?.dispose();
      bots = [];
      player = null;
      mentor = null;
      world = null;
      engine = null;
      subscribers.clear();
    },
  };
}
