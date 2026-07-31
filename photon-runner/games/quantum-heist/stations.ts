import { MapDef } from '../lab/maps';

/** What kind of interaction a console opens. */
export type TerminalKind =
  | 'sequence'
  | 'align'
  | 'sift'
  | 'sample'
  | 'power'
  | 'comms';

export interface StationDef {
  id: string;
  label: string;
  hint: string;
  kind: TerminalKind;
  x: number;
  z: number;
  color: number;
}

/** The eight consoles, in slot order. A map supplies where each one stands. */
const TEMPLATE: Omit<StationDef, 'x' | 'z'>[] = [
  {
    id: 'prime-source',
    label: 'Prime photon source',
    hint: 'Alice picks a fresh random bit and basis for every pulse.',
    kind: 'sequence',
    color: 0xe0a565,
  },
  {
    id: 'calibrate-polarizer',
    label: 'Calibrate polarizer',
    hint: 'The two filters must sit exactly 45 degrees apart or the key is noise.',
    kind: 'align',
    color: 0xe0a565,
  },
  {
    id: 'align-detector',
    label: 'Align detector',
    hint: 'Bob picks his measuring basis at random, blind to what Alice chose.',
    kind: 'align',
    color: 0x8fbf85,
  },
  {
    id: 'log-detections',
    label: 'Log detections',
    hint: 'Timestamp every click so both ends can pair up their pulses later.',
    kind: 'sequence',
    color: 0x8fbf85,
  },
  {
    id: 'sift-bases',
    label: 'Sift bases',
    hint: 'Bases get announced in the clear; mismatched pulses are thrown away.',
    kind: 'sift',
    color: 0xc4a07a,
  },
  {
    id: 'sample-qber',
    label: 'Sample error rate',
    hint: 'Compare a slice of the key aloud. Too many errors means someone is tapping.',
    kind: 'sample',
    color: 0xc4a07a,
  },
  {
    id: 'route-power',
    label: 'Route power',
    hint: 'The detectors are cryogenic — they drop out if the bay browns out.',
    kind: 'power',
    color: 0xd8b45c,
  },
  {
    id: 'comms',
    label: 'Comms relay',
    hint: 'Send a line to the other operatives. Everything here is public.',
    kind: 'comms',
    color: 0xd6cdbb,
  },
];

/** Bind the console list onto a map's slot positions. */
export function stationsFor(map: MapDef): StationDef[] {
  return TEMPLATE.map((t, i) => {
    const slot = map.slots[i];
    return { ...t, x: slot.x, z: slot.z };
  });
}

/** Comms stays usable all round; the rest are one-and-done. */
export const REPEATABLE: ReadonlySet<string> = new Set(['comms']);

export function scoredStations(stations: StationDef[]): StationDef[] {
  return stations.filter((s) => !REPEATABLE.has(s.id));
}

export const INTERACT_RADIUS = 1.6;
export const WITNESS_RADIUS = 8;
