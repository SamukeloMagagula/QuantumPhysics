/**
 * QKD attack simulation — the model behind the hacking console.
 *
 * You are Eve on a fiber BB84 link. Alice and Bob are running an exchange;
 * you want as much of the sifted key as you can take without being caught.
 * There are two independent ways to get caught, and the whole game lives in
 * the tension between them:
 *
 *   1. QBER. Alice and Bob periodically sacrifice part of the key to compare
 *      bits. Push the error rate past the abort threshold and they burn the
 *      key and walk. Intercept-resend is the loud attack that lives here.
 *   2. Alarms. Everything else. Decoy-state statistics, detector current
 *      monitoring, optical isolators logging back-reflections. The "quiet"
 *      attacks cost no QBER at all, but each one is defeated by a specific
 *      countermeasure — and a target that has that countermeasure sees you.
 *
 * So the loop is: scan the target, find which countermeasures are missing,
 * and build an attack out of whatever it can't detect. The physics is real;
 * every attack modelled here is one that has actually been demonstrated
 * against deployed QKD hardware.
 *
 * Everything in this module is pure and deterministic given an `rng`, which
 * is what makes the whole game testable.
 */

export type Rng = () => number;

export type AttackMode = 'intercept' | 'beamsplit' | 'blind' | 'trojan' | 'timeshift';

export interface AttackInfo {
  mode: AttackMode;
  label: string;
  /** One-line pitch shown in the console. */
  blurb: string;
  /** What stops it — shown after a scan so the player can plan. */
  counteredBy: string;
}

export const ATTACKS: Record<AttackMode, AttackInfo> = {
  intercept: {
    mode: 'intercept',
    label: 'intercept-resend',
    blurb: 'Measure each photon and resend. Learns the most per pulse, but guessing the basis wrong corrupts the bit — loud.',
    counteredBy: 'Nothing stops it, but it always costs QBER (~25% at full rate).',
  },
  beamsplit: {
    mode: 'beamsplit',
    label: 'photon-number splitting',
    blurb: 'Siphon one photon off multi-photon pulses and hold it until the bases are announced. Zero errors — Bob never sees it.',
    counteredBy: 'Decoy states: the transmission statistics stop adding up.',
  },
  blind: {
    mode: 'blind',
    label: 'detector blinding',
    blurb: "Saturate Bob's avalanche photodiodes into linear mode, then trigger clicks at will. You control his results entirely.",
    counteredBy: 'Detector current monitoring: the blinding illumination is visible.',
  },
  trojan: {
    mode: 'trojan',
    label: 'trojan-horse probe',
    blurb: "Inject light into Alice's encoder and read the back-reflection to learn her basis before Bob does.",
    counteredBy: 'An optical isolator on the source, which logs the probe.',
  },
  timeshift: {
    mode: 'timeshift',
    label: 'time-shift',
    blurb: "Exploit a timing mismatch between Bob's two detectors to bias which one fires.",
    counteredBy: 'Well-matched detector efficiencies — nothing to exploit.',
  },
};

export interface Target {
  id: string;
  name: string;
  blurb: string;
  /** Mean photon number of the source. Higher = more multi-photon pulses. */
  mu: number;
  /** Decoy-state protocol in use — defeats photon-number splitting. */
  decoyStates: boolean;
  /** Detector current is monitored — defeats blinding. */
  detectorMonitoring: boolean;
  /** Optical isolator on Alice's source — defeats the trojan probe. */
  opticalIsolator: boolean;
  /** 0..1 efficiency mismatch between Bob's detectors — enables time-shift. */
  detectorMismatch: number;
  /** Sampled QBER at or above this and they abort the key. */
  abortQBER: number;
  /** Pulses in the whole exchange. */
  totalRounds: number;
  /** Bob compares a sample of bits this often. */
  sampleEvery: number;
  /** Fraction of the sifted key you must steal to call it a win. */
  keyGoal: number;
}

export const TARGETS: Target[] = [
  {
    id: 'testbed',
    name: 'University Testbed',
    blurb: 'A lab bench with no hardening at all. Everything works here — learn the tools.',
    mu: 0.6,
    decoyStates: false,
    detectorMonitoring: false,
    opticalIsolator: false,
    detectorMismatch: 0.4,
    abortQBER: 0.11,
    totalRounds: 4000,
    sampleEvery: 500,
    keyGoal: 0.3,
  },
  {
    id: 'metro',
    name: 'Metro Bank Link',
    blurb: 'Commercial gear. Decoy states are on, so the free photon-splitting attack is off the table.',
    mu: 0.45,
    decoyStates: true,
    detectorMonitoring: false,
    opticalIsolator: false,
    detectorMismatch: 0.3,
    abortQBER: 0.11,
    totalRounds: 5000,
    sampleEvery: 500,
    keyGoal: 0.35,
  },
  {
    id: 'gov',
    name: 'Government Trunk',
    blurb: 'Monitored detectors and decoy states. The quiet attacks are mostly gone — you will have to spend QBER.',
    mu: 0.4,
    decoyStates: true,
    detectorMonitoring: true,
    opticalIsolator: false,
    detectorMismatch: 0.25,
    abortQBER: 0.09,
    totalRounds: 6000,
    sampleEvery: 400,
    keyGoal: 0.4,
  },
  {
    id: 'blacksite',
    name: 'Blacksite Uplink',
    blurb: 'Everything hardened, tight abort threshold, and they sample often. Thread the needle.',
    mu: 0.3,
    decoyStates: true,
    detectorMonitoring: true,
    opticalIsolator: true,
    detectorMismatch: 0.12,
    abortQBER: 0.08,
    totalRounds: 8000,
    sampleEvery: 300,
    keyGoal: 0.45,
  },
];

export function getTarget(id: string): Target | null {
  return TARGETS.find((t) => t.id === id) ?? null;
}

/** An attack that is currently running, at `fraction` of full strength. */
export interface Armed {
  mode: AttackMode;
  /** 0..1 — how much of the pulse train it is applied to. */
  fraction: number;
}

export type SessionStatus = 'active' | 'caught' | 'extracted' | 'exhausted';

export interface AttackState {
  target: Target;
  round: number;
  /** Bits that survived basis sifting. */
  sifted: number;
  /** Sifted bits that came out wrong for Bob. */
  errors: number;
  /** Sifted bits you actually know the value of. */
  stolen: number;
  /** 0..1; at 1 a countermeasure has positively identified you. */
  alarm: number;
  armed: Armed[];
  status: SessionStatus;
  /** QBER from each of Bob's sample checks so far. */
  samples: number[];
  /** Why the session ended, if it has. */
  ending: string | null;
}

export function createSession(target: Target): AttackState {
  return {
    target,
    round: 0,
    sifted: 0,
    errors: 0,
    stolen: 0,
    alarm: 0,
    armed: [],
    status: 'active',
    samples: [],
    ending: null,
  };
}

/** Fraction of pulses containing more than one photon, for a Poissonian
 * source of mean photon number mu: 1 - P(0) - P(1). This is the entire
 * resource photon-number splitting feeds on. */
export function multiPhotonFraction(mu: number): number {
  return 1 - Math.exp(-mu) * (1 + mu);
}

const armedFraction = (armed: Armed[], mode: AttackMode): number =>
  armed.find((a) => a.mode === mode)?.fraction ?? 0;

/**
 * True when the trojan probe is actually reading Alice's basis — which turns
 * intercept-resend from the loudest attack into a silent one, because Eve
 * stops having to guess. This synergy is the game's main "aha": on a target
 * with no optical isolator, pairing the two lets you take the whole key at
 * almost no QBER.
 */
export function trojanActive(armed: Armed[], target: Target): boolean {
  return !target.opticalIsolator && armedFraction(armed, 'trojan') > 0;
}

/** Expected error rate imposed on Bob's sifted bits. */
export function errorRate(armed: Armed[], target: Target): number {
  const informed = trojanActive(armed, target);
  // Guessing the basis wrong (half the time) randomises Bob's result, which
  // is wrong half of *those* — 25% per intercepted pulse. Knowing the basis
  // in advance removes the guess, and with it the errors.
  const intercept = armedFraction(armed, 'intercept') * (informed ? 0.0 : 0.25);
  const shift = armedFraction(armed, 'timeshift') * target.detectorMismatch * 0.2;
  // Splitting, blinding and the probe itself never corrupt a bit.
  return Math.min(0.5, intercept + shift);
}

/** Expected fraction of sifted bits whose value you end up knowing. */
export function knowledgeRate(armed: Armed[], target: Target): number {
  const informed = trojanActive(armed, target);
  // Without the probe you only learn the bit when your basis happened to
  // match; with it, every intercepted pulse is readable.
  const intercept = armedFraction(armed, 'intercept') * (informed ? 1 : 0.5);
  const split = armedFraction(armed, 'beamsplit') * multiPhotonFraction(target.mu);
  const blind = armedFraction(armed, 'blind');
  const shift = armedFraction(armed, 'timeshift') * target.detectorMismatch * 0.5;
  return Math.min(1, intercept + split + blind + shift);
}

/**
 * Alarm accrued per round. This is the detection channel that has nothing to
 * do with QBER: each quiet attack is invisible in the error rate but visible
 * to one specific countermeasure, and only if the target actually has it.
 */
export function alarmRate(armed: Armed[], target: Target): number {
  let rate = 0;
  if (target.decoyStates) rate += armedFraction(armed, 'beamsplit') * 0.0016;
  if (target.detectorMonitoring) rate += armedFraction(armed, 'blind') * 0.0022;
  if (target.opticalIsolator) rate += armedFraction(armed, 'trojan') * 0.003;
  return rate;
}

export interface StepEvent {
  round: number;
  kind: 'sample' | 'caught' | 'complete';
  text: string;
}

export interface StepResult {
  state: AttackState;
  events: StepEvent[];
}

/**
 * Advances the exchange by `rounds` pulses. Bob's periodic sampling, the
 * abort check and the alarm check all happen in here, so the console just
 * renders whatever comes back.
 */
export function stepExchange(state: AttackState, rounds: number, rng: Rng = Math.random): StepResult {
  if (state.status !== 'active') return { state, events: [] };

  const t = state.target;
  const events: StepEvent[] = [];
  let { round, sifted, errors, stolen, alarm } = state;
  const samples = [...state.samples];
  let status: SessionStatus = state.status;
  let ending: string | null = null;

  const pErr = errorRate(state.armed, t);
  const pKnow = knowledgeRate(state.armed, t);
  const pAlarm = alarmRate(state.armed, t);

  const limit = Math.min(rounds, t.totalRounds - round);

  for (let i = 0; i < limit; i++) {
    round++;

    // Alice and Bob picked the same basis half the time; the rest is discarded.
    if (rng() < 0.5) {
      sifted++;
      if (rng() < pErr) errors++;
      if (rng() < pKnow) stolen++;
    }

    alarm = Math.min(1, alarm + pAlarm);
    if (alarm >= 1) {
      status = 'caught';
      ending = 'A countermeasure positively identified the attack. The link was torn down.';
      events.push({ round, kind: 'caught', text: 'ALARM — attack signature identified' });
      break;
    }

    // Bob's periodic sacrifice of key bits to measure the error rate.
    if (round % t.sampleEvery === 0 && sifted > 0) {
      const qber = errors / sifted;
      samples.push(qber);
      events.push({
        round,
        kind: 'sample',
        text: `sample @ ${round}: QBER ${(qber * 100).toFixed(2)}% (abort ${(t.abortQBER * 100).toFixed(0)}%)`,
      });
      if (qber >= t.abortQBER) {
        status = 'caught';
        ending = 'Sampled QBER crossed the abort threshold. Alice and Bob discarded the key.';
        events.push({ round, kind: 'caught', text: 'ABORT — error rate above threshold' });
        break;
      }
    }
  }

  if (status === 'active' && round >= t.totalRounds) {
    status = 'exhausted';
    ending = 'The exchange finished. Whatever you had banked is what you got.';
    events.push({ round, kind: 'complete', text: 'exchange complete' });
  }

  return {
    state: { ...state, round, sifted, errors, stolen, alarm, samples, status, ending },
    events,
  };
}

/** Current running QBER as Bob would measure it. */
export function currentQBER(s: AttackState): number {
  return s.sifted ? s.errors / s.sifted : 0;
}

/** Fraction of the sifted key you know — what you're actually scored on. */
export function keyFraction(s: AttackState): number {
  return s.sifted ? s.stolen / s.sifted : 0;
}

export function isWin(s: AttackState): boolean {
  return (s.status === 'extracted' || s.status === 'exhausted') && keyFraction(s) >= s.target.keyGoal;
}

/** Bank what you have and end the session while still undetected. */
export function extract(s: AttackState): AttackState {
  if (s.status !== 'active') return s;
  return {
    ...s,
    status: 'extracted',
    ending: `Pulled out at round ${s.round} with ${(keyFraction(s) * 100).toFixed(1)}% of the sifted key.`,
  };
}

/** Arms an attack, replacing any existing setting for that mode. Fraction is
 * clamped to 0..1; arming at 0 disarms. */
export function arm(s: AttackState, mode: AttackMode, fraction: number): AttackState {
  const f = Math.max(0, Math.min(1, fraction));
  const rest = s.armed.filter((a) => a.mode !== mode);
  return { ...s, armed: f === 0 ? rest : [...rest, { mode, fraction: f }] };
}

export function disarm(s: AttackState, mode: AttackMode): AttackState {
  return { ...s, armed: s.armed.filter((a) => a.mode !== mode) };
}

/** Countermeasures the scan reveals, as console lines. */
export function scanReport(t: Target): string[] {
  const mp = multiPhotonFraction(t.mu) * 100;
  return [
    `TARGET    ${t.name}`,
    `PROTOCOL  BB84 · weak coherent source · mu=${t.mu.toFixed(2)}`,
    `PULSES    ${t.totalRounds} · Bob samples every ${t.sampleEvery}`,
    `ABORT     QBER >= ${(t.abortQBER * 100).toFixed(0)}%`,
    `MULTI-PH  ${mp.toFixed(1)}% of pulses carry >1 photon`,
    '',
    `decoy states .......... ${t.decoyStates ? 'PRESENT  — photon-splitting will be seen' : 'ABSENT   — photon-splitting is free'}`,
    `detector monitoring ... ${t.detectorMonitoring ? 'PRESENT  — blinding will be seen' : 'ABSENT   — blinding is free'}`,
    `optical isolator ...... ${t.opticalIsolator ? 'PRESENT  — trojan probe will be seen' : 'ABSENT   — trojan probe is free'}`,
    `detector mismatch ..... ${(t.detectorMismatch * 100).toFixed(0)}%${t.detectorMismatch > 0.2 ? '      — time-shift is viable' : '      — time-shift is weak'}`,
    '',
    `GOAL      steal ${(t.keyGoal * 100).toFixed(0)}% of the sifted key`,
  ];
}
