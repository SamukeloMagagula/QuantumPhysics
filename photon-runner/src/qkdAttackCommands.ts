import {
  ATTACKS,
  AttackMode,
  AttackState,
  TARGETS,
  arm,
  createSession,
  currentQBER,
  disarm,
  errorRate,
  extract,
  getTarget,
  keyFraction,
  knowledgeRate,
  scanReport,
  stepExchange,
  Rng,
} from './qkdAttack';

/**
 * The console's command layer. Parsing and command execution are kept pure —
 * a command takes a state and returns a new state plus lines to print — so
 * the whole game can be played and asserted in tests without a terminal.
 */

export interface ConsoleState {
  session: AttackState | null;
  lines: Line[];
  history: string[];
}

export interface Line {
  text: string;
  tone?: 'normal' | 'dim' | 'good' | 'warn' | 'bad' | 'accent';
}

const dim = (text: string): Line => ({ text, tone: 'dim' });
const warn = (text: string): Line => ({ text, tone: 'warn' });
const bad = (text: string): Line => ({ text, tone: 'bad' });
const good = (text: string): Line => ({ text, tone: 'good' });
const accent = (text: string): Line => ({ text, tone: 'accent' });
const plain = (text: string): Line => ({ text });

const MODES = Object.keys(ATTACKS) as AttackMode[];

function isMode(x: string): x is AttackMode {
  return (MODES as string[]).includes(x);
}

/** `--frac=0.4` / `-f 0.4` / a bare trailing number all mean the same thing. */
export function parseFraction(args: string[]): number | null {
  for (const a of args) {
    const kv = a.match(/^--?(?:frac|fraction|f)=(.+)$/);
    if (kv) {
      const n = Number(kv[1]);
      return Number.isFinite(n) ? n : null;
    }
  }
  const bare = args.find((a) => !a.startsWith('-') && Number.isFinite(Number(a)));
  if (bare !== undefined) {
    const n = Number(bare);
    // Accept a percentage as well as a 0..1 fraction — "50" clearly means half.
    return n > 1 ? n / 100 : n;
  }
  return null;
}

export interface ParsedCommand {
  name: string;
  args: string[];
}

export function parseCommand(input: string): ParsedCommand | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/\s+/);
  return { name: parts[0].toLowerCase(), args: parts.slice(1) };
}

function statusLines(s: AttackState): Line[] {
  const t = s.target;
  const qber = currentQBER(s);
  const key = keyFraction(s);
  const bar = (v: number, max: number, width = 22) => {
    const filled = Math.max(0, Math.min(width, Math.round((v / max) * width)));
    return '#'.repeat(filled) + '-'.repeat(width - filled);
  };
  const lines: Line[] = [
    plain(`round   ${s.round} / ${t.totalRounds}    sifted ${s.sifted}`),
    (qber >= t.abortQBER * 0.8 ? warn : plain)(
      `QBER    ${(qber * 100).toFixed(2)}%  ${bar(qber, t.abortQBER)}  abort ${(t.abortQBER * 100).toFixed(0)}%`
    ),
    (key >= t.keyGoal ? good : plain)(
      `KEY     ${(key * 100).toFixed(1)}%  ${bar(key, 1)}  goal ${(t.keyGoal * 100).toFixed(0)}%`
    ),
    (s.alarm > 0.4 ? warn : plain)(`ALARM   ${(s.alarm * 100).toFixed(1)}%  ${bar(s.alarm, 1)}`),
  ];
  if (s.armed.length) {
    lines.push(plain(''));
    lines.push(dim('armed:'));
    for (const a of s.armed) {
      lines.push(dim(`  ${ATTACKS[a.mode].label.padEnd(24)} ${(a.fraction * 100).toFixed(0)}%`));
    }
    const pe = errorRate(s.armed, t);
    const pk = knowledgeRate(s.armed, t);
    lines.push(dim(`  -> +${(pe * 100).toFixed(2)}% QBER, +${(pk * 100).toFixed(1)}% of sifted bits known`));
  } else {
    lines.push(dim('armed: nothing — the link is running clean'));
  }
  return lines;
}

const HELP: Line[] = [
  accent('commands'),
  plain('  targets                 list links you can reach'),
  plain('  connect <id>            open a session against a target'),
  plain('  scan                    read the target\'s hardware and countermeasures'),
  plain('  attacks                 list the attack toolkit'),
  plain('  arm <attack> <frac>     run an attack at 0..1 (or a percentage)'),
  plain('  disarm <attack>         stop one attack'),
  plain('  run [pulses]            advance the exchange (default 500)'),
  plain('  status                  QBER, key, alarm, what is armed'),
  plain('  extract                 bank what you have and get out clean'),
  plain('  clear                   clear the screen'),
  plain(''),
  dim('  two ways to get caught: sampled QBER over the abort threshold,'),
  dim('  or an alarm from a countermeasure that sees your quiet attack.'),
];

/**
 * Runs one command. Pure: returns the next console state. `rng` is threaded
 * through so a test can drive a whole session deterministically.
 */
export function runCommand(state: ConsoleState, input: string, rng: Rng = Math.random): ConsoleState {
  const parsed = parseCommand(input);
  const echo: Line = { text: `> ${input}`, tone: 'accent' };
  if (!parsed) return state;

  const push = (...lines: Line[]): ConsoleState => ({
    ...state,
    lines: [...state.lines, echo, ...lines],
    history: [...state.history, input],
  });
  const pushWith = (session: AttackState | null, ...lines: Line[]): ConsoleState => ({
    session,
    lines: [...state.lines, echo, ...lines],
    history: [...state.history, input],
  });

  const s = state.session;
  const { name, args } = parsed;

  switch (name) {
    case 'help':
    case '?':
      return push(...HELP);

    case 'clear':
      return { ...state, lines: [], history: [...state.history, input] };

    case 'targets':
      return push(
        accent('reachable links'),
        ...TARGETS.map((t) =>
          plain(`  ${t.id.padEnd(12)} ${t.name.padEnd(22)} goal ${(t.keyGoal * 100).toFixed(0)}%  abort ${(t.abortQBER * 100).toFixed(0)}%`)
        ),
        dim('  connect <id> to begin')
      );

    case 'attacks':
      return push(
        accent('attack toolkit'),
        ...MODES.flatMap((m) => [
          plain(`  ${m.padEnd(11)} ${ATTACKS[m].label}`),
          dim(`              ${ATTACKS[m].blurb}`),
          dim(`              countered by: ${ATTACKS[m].counteredBy}`),
        ])
      );

    case 'connect': {
      const id = args[0];
      const target = id ? getTarget(id) : null;
      if (!target) return push(bad(`no such target: ${id ?? '(none)'} — try "targets"`));
      return pushWith(
        createSession(target),
        good(`connected to ${target.name}`),
        dim(target.blurb),
        dim('run "scan" before you touch anything.')
      );
    }

    case 'scan':
      if (!s) return push(bad('not connected — "connect <id>" first'));
      return push(accent('scan'), ...scanReport(s.target).map(plain));

    case 'arm': {
      if (!s) return push(bad('not connected — "connect <id>" first'));
      if (s.status !== 'active') return push(bad('session is over — "connect <id>" to start another'));
      const mode = args[0];
      if (!mode || !isMode(mode)) return push(bad(`unknown attack: ${mode ?? '(none)'} — try "attacks"`));
      const frac = parseFraction(args.slice(1));
      if (frac === null) return push(bad(`arm ${mode} <fraction> — e.g. "arm ${mode} 0.4" or "arm ${mode} 40"`));
      const next = arm(s, mode, frac);
      const pe = errorRate(next.armed, next.target);
      const pk = knowledgeRate(next.armed, next.target);
      const lines: Line[] = [
        good(`${ATTACKS[mode].label} armed at ${(Math.max(0, Math.min(1, frac)) * 100).toFixed(0)}%`),
        dim(`projected: +${(pe * 100).toFixed(2)}% QBER, +${(pk * 100).toFixed(1)}% of sifted bits known`),
      ];
      // Call out the countermeasure rather than letting them find out by losing.
      const seen =
        (mode === 'beamsplit' && next.target.decoyStates) ||
        (mode === 'blind' && next.target.detectorMonitoring) ||
        (mode === 'trojan' && next.target.opticalIsolator);
      if (seen) lines.push(warn(`warning: this target can see that attack — ${ATTACKS[mode].counteredBy}`));
      if (pe >= next.target.abortQBER) {
        lines.push(bad(`warning: that alone exceeds the abort threshold — you will be caught at the next sample.`));
      }
      return pushWith(next, ...lines);
    }

    case 'disarm': {
      if (!s) return push(bad('not connected'));
      const mode = args[0];
      if (!mode || !isMode(mode)) return push(bad(`unknown attack: ${mode ?? '(none)'}`));
      return pushWith(disarm(s, mode), dim(`${ATTACKS[mode].label} disarmed`));
    }

    case 'run': {
      if (!s) return push(bad('not connected — "connect <id>" first'));
      if (s.status !== 'active') return push(bad('session is over — "connect <id>" to start another'));
      const n = args[0] && Number.isFinite(Number(args[0])) ? Math.max(1, Math.floor(Number(args[0]))) : 500;
      const { state: next, events } = stepExchange(s, n, rng);
      const lines: Line[] = events.map((e) =>
        e.kind === 'caught' ? bad(`  ${e.text}`) : e.kind === 'complete' ? accent(`  ${e.text}`) : dim(`  ${e.text}`)
      );
      lines.push(...statusLines(next));
      if (next.status === 'caught') {
        lines.push(plain(''), bad('CAUGHT. ' + (next.ending ?? '')));
      } else if (next.status === 'exhausted') {
        const won = keyFraction(next) >= next.target.keyGoal;
        lines.push(
          plain(''),
          won
            ? good(`DONE — you took ${(keyFraction(next) * 100).toFixed(1)}% of the key, goal was ${(next.target.keyGoal * 100).toFixed(0)}%.`)
            : warn(`SHORT — ${(keyFraction(next) * 100).toFixed(1)}% of the key, needed ${(next.target.keyGoal * 100).toFixed(0)}%.`)
        );
      }
      return pushWith(next, ...lines);
    }

    case 'status':
      if (!s) return push(bad('not connected'));
      return push(...statusLines(s));

    case 'extract': {
      if (!s) return push(bad('not connected'));
      if (s.status !== 'active') return push(bad('session is already over'));
      const next = extract(s);
      const won = keyFraction(next) >= next.target.keyGoal;
      return pushWith(
        next,
        accent(next.ending ?? ''),
        won
          ? good(`Clean exit, goal met — ${(keyFraction(next) * 100).toFixed(1)}% of the key.`)
          : warn(`Clean exit, but short of the ${(next.target.keyGoal * 100).toFixed(0)}% goal.`)
      );
    }

    default:
      return push(bad(`unknown command: ${name} — try "help"`));
  }
}

export function initialConsole(): ConsoleState {
  return {
    session: null,
    lines: [
      accent('QKD ATTACK CONSOLE'),
      dim('BB84 links are only as good as the hardware at each end.'),
      dim('Type "help" for commands, "targets" to see what you can reach.'),
      plain(''),
    ],
    history: [],
  };
}
