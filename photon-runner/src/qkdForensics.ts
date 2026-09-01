import { AttackState, currentQBER } from './qkdAttack';
import { Rng } from './qkdAttack';

/**
 * Post-hack forensics: work out which of the three stations was the
 * eavesdropper.
 *
 * This is the lesson BB84 actually teaches, turned into the win condition.
 * Eve cannot copy a qubit (no-cloning), so to learn anything she must
 * measure — and measuring in the wrong basis, which she does half the time,
 * randomises the bit. That leaves three fingerprints in the data, and each
 * one is a different piece of the physics:
 *
 *   - QBER. Intercept-resend drives it to ~25%; honest stations sit at the
 *     channel's own noise floor.
 *   - Basis-match rate. An honest sifted key matches ~100% by construction
 *     (that is what sifting means). A resent key matches ~75%, because Eve's
 *     guess collided with Alice's only half the time.
 *   - Error shape. Channel noise is scattered at random. An intercepted
 *     stretch is clustered, because Eve taps a contiguous run of pulses.
 *
 * A station running a *quiet* attack (photon splitting, blinding) leaves no
 * QBER at all — so the report deliberately cannot prove it from error rate
 * alone, and the player has to read the other two columns. That is the point:
 * QBER catches the loud attack, not every attack.
 */

export type StationId = 'alice' | 'bob' | 'eve';

export const STATION_LABELS: Record<StationId, string> = {
  alice: 'Alice · transmitter',
  bob: 'Bob · receiver',
  eve: 'Eve · line tap',
};

export type ErrorShape = 'scattered' | 'clustered' | 'none';

export interface StationEvidence {
  station: StationId;
  /** Error rate attributable to this station's leg of the link. */
  qber: number;
  /** Fraction of sifted bits where the announced bases agreed. */
  basisMatch: number;
  errorShape: ErrorShape;
  /** Photons this station handled — context for how trustworthy the rest is. */
  sampled: number;
}

export interface ForensicReport {
  evidence: StationEvidence[];
  /** Who actually did it. Never shown until the player commits. */
  culprit: StationId;
  /** True when the attack left no QBER signature, so the error rate alone
   * cannot settle it — the interesting case. */
  quiet: boolean;
}

/** Channel noise floor: real links are never at exactly zero. */
const NOISE_FLOOR = 0.008;

function jitter(rng: Rng, spread: number): number {
  return (rng() - 0.5) * 2 * spread;
}

/**
 * Builds the report from a finished attack session. The culprit is always
 * `eve` when the player ran an attack — the player *is* Eve, and the
 * exercise is reading their own footprints the way a defender would.
 * With nothing armed the link is clean and there is no culprit to find,
 * which `quiet` and a zero-QBER row honestly reflect.
 */
export function buildReport(session: AttackState, rng: Rng = Math.random): ForensicReport {
  const qber = currentQBER(session);
  const loud = qber > NOISE_FLOOR * 2.5;
  const intercepted = session.armed.some((a) => a.mode === 'intercept' && a.fraction > 0);
  const informed = session.armed.some((a) => a.mode === 'trojan' && a.fraction > 0);

  // A trojan-assisted intercept never mismatches a basis, so it leaves the
  // clean 100% signature an honest station has — the hardest case to spot.
  const eveBasisMatch = intercepted && !informed ? 0.75 + jitter(rng, 0.02) : 1 - jitter(rng, 0.004);

  const evidence: StationEvidence[] = [
    {
      station: 'alice',
      qber: NOISE_FLOOR + jitter(rng, 0.004),
      basisMatch: 1 - Math.abs(jitter(rng, 0.005)),
      errorShape: 'scattered',
      sampled: session.sifted,
    },
    {
      station: 'bob',
      qber: NOISE_FLOOR + jitter(rng, 0.004),
      basisMatch: 1 - Math.abs(jitter(rng, 0.005)),
      errorShape: 'scattered',
      sampled: session.sifted,
    },
    {
      station: 'eve',
      qber,
      basisMatch: Math.max(0, Math.min(1, eveBasisMatch)),
      errorShape: loud ? 'clustered' : qber > 0 ? 'scattered' : 'none',
      sampled: session.sifted,
    },
  ];

  return { evidence, culprit: 'eve', quiet: !loud };
}

export interface Verdict {
  correct: boolean;
  accused: StationId;
  culprit: StationId;
  /** Teaching text — why the data did or didn't point where they pointed. */
  explanation: string;
}

export function judge(report: ForensicReport, accused: StationId): Verdict {
  const correct = accused === report.culprit;
  const eve = report.evidence.find((e) => e.station === 'eve')!;

  let explanation: string;
  if (correct && !report.quiet) {
    explanation =
      `Right. ${(eve.qber * 100).toFixed(1)}% QBER against a ~1% noise floor, errors arriving in ` +
      `clusters rather than scattered, and a ${(eve.basisMatch * 100).toFixed(0)}% basis match where an ` +
      `honest sifted key is ~100%. That 75% is the tell: Eve guessed the basis and got it wrong half the time.`;
  } else if (correct && report.quiet) {
    explanation =
      'Right — but note the error rate never gave it away. A photon-splitting or blinding attack ' +
      'copies the key without disturbing a single bit, which is exactly why QBER alone is not a ' +
      'sufficient defence, and why decoy states and detector monitoring exist.';
  } else if (!correct && report.quiet) {
    explanation =
      `Wrong, and understandably so: this attack left no QBER signature at all, so the error rate ` +
      `pointed nowhere. ${STATION_LABELS[report.culprit]} was the tap. Catching this one needs the ` +
      `hardware channel — decoy-state statistics or detector current — not the error rate.`;
  } else {
    explanation =
      `Wrong. ${STATION_LABELS[accused]} sat at the channel noise floor with a ~100% basis match — ` +
      `an honest station. ${STATION_LABELS[report.culprit]} was carrying ${(eve.qber * 100).toFixed(1)}% ` +
      `QBER with clustered errors.`;
  }

  return { correct, accused, culprit: report.culprit, explanation };
}

/** The single most incriminating column, used to sort the report so the
 * evidence reads in the order a defender would actually weigh it. */
export function suspicionScore(e: StationEvidence): number {
  const qberWeight = e.qber * 4;
  const basisWeight = (1 - e.basisMatch) * 2;
  const shapeWeight = e.errorShape === 'clustered' ? 0.5 : 0;
  return qberWeight + basisWeight + shapeWeight;
}
