/**
 * Hardware diagnosis labs — two tracks.
 *
 * `optics` covers the QKD bench itself (source, polarisers, fibre,
 * detectors, timing). It matters because every attack in the console works
 * by exploiting a physical property of this kit: photon-number splitting
 * only exists because a weak coherent source sometimes emits two photons;
 * blinding only works because an avalanche photodiode can be pushed into
 * linear mode. Fixing the bench is the other half of understanding the
 * attack.
 *
 * `pc` covers ordinary workstation hardware — the IT-support skills a
 * student needs regardless of the quantum layer.
 *
 * A lab is a diagnosis exercise, not a click-the-part exercise: you read
 * symptoms and instrument readings, choose the fault, then choose the fix.
 * Picking the right fix for the wrong reason still fails, which is the
 * point.
 */

export type LabTrack = 'optics' | 'pc';

export interface Reading {
  label: string;
  value: string;
  /** Flags the reading as out of spec — the actual diagnostic signal. */
  abnormal?: boolean;
}

export interface Fault {
  id: string;
  label: string;
  /** Shown after the answer, whether right or wrong. */
  why: string;
}

export interface Fix {
  id: string;
  label: string;
}

export interface HardwareLab {
  id: string;
  track: LabTrack;
  title: string;
  /** What the user reports — deliberately vaguer than the instruments. */
  symptom: string;
  readings: Reading[];
  faults: Fault[];
  fixes: Fix[];
  correctFaultId: string;
  correctFixId: string;
  /** Teaching payload, shown once the lab is complete. */
  lesson: string;
}

export const LABS: HardwareLab[] = [
  {
    id: 'dark-counts',
    track: 'optics',
    title: 'Detector dark counts',
    symptom: 'The link reports a 9% error rate with no traffic on it. Alice has not sent anything.',
    readings: [
      { label: 'APD temperature', value: '-12 °C (spec: -30 °C)', abnormal: true },
      { label: 'Dark count rate', value: '4200 /s (spec: <800 /s)', abnormal: true },
      { label: 'Bias voltage', value: '52.1 V (nominal)' },
      { label: 'Fibre attenuation', value: '0.21 dB/km (nominal)' },
    ],
    faults: [
      { id: 'tec', label: 'Detector cooling has failed', why: 'A warm avalanche photodiode fires on thermally generated carriers, not photons.' },
      { id: 'fibre', label: 'Fibre has excess loss', why: 'Attenuation is in spec at 0.21 dB/km, so the fibre is fine.' },
      { id: 'laser', label: 'Source power drifted', why: 'The errors appear with no traffic at all, so the source is not involved.' },
    ],
    fixes: [
      { id: 'restore-tec', label: 'Repair the thermo-electric cooler and re-cool to -30 °C' },
      { id: 'raise-bias', label: 'Raise the bias voltage to force more clicks' },
      { id: 'swap-fibre', label: 'Replace the fibre span' },
    ],
    correctFaultId: 'tec',
    correctFixId: 'restore-tec',
    lesson:
      'Dark counts are detector clicks with no photon behind them, and they land in a random basis — so they look exactly like channel errors and push QBER up on an idle link. Cooling is what suppresses them. Raising the bias would have made it worse.',
  },
  {
    id: 'polariser-drift',
    track: 'optics',
    title: 'Polariser misalignment',
    symptom: "QBER sits at a steady 11% and will not settle, but only in the diagonal basis.",
    readings: [
      { label: 'QBER, rectilinear basis', value: '1.1% (nominal)' },
      { label: 'QBER, diagonal basis', value: '10.9%', abnormal: true },
      { label: 'Half-wave plate angle', value: '24.1° (spec: 22.5°)', abnormal: true },
      { label: 'Dark count rate', value: '610 /s (nominal)' },
    ],
    faults: [
      { id: 'hwp', label: 'The half-wave plate has drifted off 22.5°', why: 'A 1.6° error only skews the basis that plate defines, which is exactly the asymmetry seen.' },
      { id: 'eve', label: 'An eavesdropper is intercepting', why: 'Intercept-resend damages both bases roughly equally — it would not spare the rectilinear one.' },
      { id: 'detector', label: 'A detector has failed', why: 'Both detectors are clicking at nominal dark rates.' },
    ],
    fixes: [
      { id: 'realign', label: 'Re-align the half-wave plate to 22.5° and re-calibrate' },
      { id: 'abort', label: 'Declare an intrusion and burn the key' },
      { id: 'swap-apd', label: 'Swap the avalanche photodiode' },
    ],
    correctFaultId: 'hwp',
    correctFixId: 'realign',
    lesson:
      'A basis-asymmetric error rate is the signature of an optics fault, not an attacker. Eve has no way to damage one basis and leave the other clean — so before crying intrusion, check the alignment. Burning a good key costs you the session for nothing.',
  },
  {
    id: 'multiphoton',
    track: 'optics',
    title: 'Source running hot',
    symptom: 'The link works perfectly, but a security audit flags it as vulnerable to photon-number splitting.',
    readings: [
      { label: 'Mean photon number', value: 'mu = 0.85 (spec: 0.1 - 0.5)', abnormal: true },
      { label: 'Multi-photon pulse fraction', value: '20.5%', abnormal: true },
      { label: 'QBER', value: '0.9% (nominal)' },
      { label: 'Decoy states', value: 'disabled', abnormal: true },
    ],
    faults: [
      { id: 'mu', label: 'Source intensity is too high for a weak coherent source', why: 'At mu = 0.85 a fifth of the pulses carry more than one photon, and every one of those is a free copy for an attacker.' },
      { id: 'noise', label: 'Excess channel noise', why: 'QBER is 0.9% — the channel is quiet.' },
      { id: 'align', label: 'Polariser misalignment', why: 'Both bases are clean.' },
    ],
    fixes: [
      { id: 'lower-mu', label: 'Attenuate the source to mu = 0.3 and enable decoy states' },
      { id: 'raise-mu', label: 'Raise intensity further to improve the key rate' },
      { id: 'ignore', label: 'Accept it — QBER is fine' },
    ],
    correctFaultId: 'mu',
    correctFixId: 'lower-mu',
    lesson:
      'This is the fault that makes photon-number splitting possible in the console. A multi-photon pulse lets an attacker keep one photon and forward the rest, learning the bit without causing a single error — which is why a clean QBER proves nothing here. Decoy states are what expose it.',
  },
  {
    id: 'no-post',
    track: 'pc',
    title: 'Workstation will not POST',
    symptom: 'The station is dead. Fans spin for a second, then everything stops. No display, no beep.',
    readings: [
      { label: 'PSU 12V rail', value: '11.94 V (nominal)' },
      { label: 'PSU 5V standby', value: '5.02 V (nominal)' },
      { label: 'CPU socket power', value: '8-pin EPS not seated', abnormal: true },
      { label: 'RAM slots populated', value: 'A2, B2 (correct pairing)' },
    ],
    faults: [
      { id: 'eps', label: 'The CPU power connector is not seated', why: 'Standby power is present, so the PSU is alive — but the CPU rail never comes up, which stops POST before any beep.' },
      { id: 'psu', label: 'Power supply has failed', why: 'Both measured rails are within spec.' },
      { id: 'ram', label: 'Memory is mis-installed', why: 'A2/B2 is the correct dual-channel pairing, and bad RAM usually still POSTs with a beep code.' },
    ],
    fixes: [
      { id: 'seat-eps', label: 'Seat the 8-pin EPS connector fully and retry' },
      { id: 'swap-psu', label: 'Replace the power supply' },
      { id: 'reseat-ram', label: 'Reseat the memory' },
    ],
    correctFaultId: 'eps',
    correctFixId: 'seat-eps',
    lesson:
      'Fans spinning proves the PSU is delivering standby and 12V, so "no power" is the wrong diagnosis. A missing CPU rail halts the board before it can even beep. Measure before replacing — swapping a good PSU costs money and fixes nothing.',
  },
  {
    id: 'thermal',
    track: 'pc',
    title: 'Throttling under load',
    symptom: 'The station is fine at idle but crawls whenever it runs the exchange simulation.',
    readings: [
      { label: 'CPU idle temperature', value: '41 °C (nominal)' },
      { label: 'CPU load temperature', value: '99 °C', abnormal: true },
      { label: 'Clock under load', value: '1.2 GHz (base 3.4 GHz)', abnormal: true },
      { label: 'Case intake fans', value: '2 of 2 spinning' },
      { label: 'Cooler mount pressure', value: 'one corner standoff loose', abnormal: true },
    ],
    faults: [
      { id: 'mount', label: 'The CPU cooler is not making even contact', why: 'A loose corner lifts the cold plate, so heat never reaches the heatsink — idle is fine because idle produces almost none.' },
      { id: 'fans', label: 'Case airflow has failed', why: 'Both intake fans are running.' },
      { id: 'cpu', label: 'The processor is faulty', why: 'It clocks correctly until it hits its thermal limit, which is protection working, not failure.' },
    ],
    fixes: [
      { id: 'remount', label: 'Re-seat the cooler with fresh paste and even standoff pressure' },
      { id: 'more-fans', label: 'Add more case fans' },
      { id: 'swap-cpu', label: 'Replace the processor' },
    ],
    correctFaultId: 'mount',
    correctFixId: 'remount',
    lesson:
      'Thermal throttling is the CPU protecting itself, so the chip is the last thing to suspect. Idle-fine / load-hot points at heat transfer, not airflow: if the cold plate is not flat against the die, no amount of case fans will help.',
  },
];

export function labsForTrack(track: LabTrack): HardwareLab[] {
  return LABS.filter((l) => l.track === track);
}

export function getLab(id: string): HardwareLab | null {
  return LABS.find((l) => l.id === id) ?? null;
}

export interface LabAttempt {
  faultId: string | null;
  fixId: string | null;
}

export interface LabResult {
  faultCorrect: boolean;
  fixCorrect: boolean;
  /** Both halves right — the fix alone is not a pass. */
  passed: boolean;
  /** Why the chosen fault was or wasn't the fault. */
  faultNote: string;
}

export function gradeLab(lab: HardwareLab, attempt: LabAttempt): LabResult {
  const faultCorrect = attempt.faultId === lab.correctFaultId;
  const fixCorrect = attempt.fixId === lab.correctFixId;
  const chosen = lab.faults.find((f) => f.id === attempt.faultId);
  return {
    faultCorrect,
    fixCorrect,
    passed: faultCorrect && fixCorrect,
    faultNote: chosen?.why ?? 'No fault selected.',
  };
}

/** The readings a student should actually be reading — used to score how
 * well the evidence supports the diagnosis, and to hint when they stall. */
export function abnormalReadings(lab: HardwareLab): Reading[] {
  return lab.readings.filter((r) => r.abnormal);
}
