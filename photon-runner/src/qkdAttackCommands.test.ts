import { describe, expect, it } from 'vitest';
import { ConsoleState, initialConsole, parseFraction, runCommand } from './qkdAttackCommands';
import { keyFraction } from './qkdAttack';

function seeded(seed: number) {
  let h = seed >>> 0;
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

const text = (s: ConsoleState) => s.lines.map((l) => l.text).join('\n');
/** Play a script of commands against one deterministic RNG. */
const play = (cmds: string[], seed = 42): ConsoleState => {
  const rng = seeded(seed);
  return cmds.reduce((s, c) => runCommand(s, c, rng), initialConsole());
};

describe('parseFraction', () => {
  it('accepts --frac=, -f, and a bare 0..1 value', () => {
    expect(parseFraction(['--frac=0.4'])).toBeCloseTo(0.4);
    expect(parseFraction(['-f=0.25'])).toBeCloseTo(0.25);
    expect(parseFraction(['0.6'])).toBeCloseTo(0.6);
  });

  it('reads a bare value above 1 as a percentage', () => {
    expect(parseFraction(['40'])).toBeCloseTo(0.4);
  });

  it('returns null when there is no number to find', () => {
    expect(parseFraction([])).toBeNull();
    expect(parseFraction(['--wat'])).toBeNull();
  });
});

describe('console basics', () => {
  it('echoes the command that was run', () => {
    expect(text(play(['help']))).toContain('> help');
  });

  it('refuses attack commands before connecting', () => {
    for (const cmd of ['scan', 'run', 'status', 'arm intercept 0.5']) {
      expect(text(play([cmd])).toLowerCase()).toContain('not connected');
    }
  });

  it('rejects an unknown command and points at help', () => {
    expect(text(play(['frobnicate']))).toContain('unknown command');
  });

  it('clear empties the screen but keeps the session', () => {
    const s = play(['connect testbed', 'clear']);
    expect(s.lines).toHaveLength(0);
    expect(s.session).not.toBeNull();
  });

  it('connect rejects an unknown target', () => {
    expect(text(play(['connect nowhere']))).toContain('no such target');
  });
});

describe('scanning and arming', () => {
  it('scan reveals which countermeasures are present', () => {
    const out = text(play(['connect blacksite', 'scan']));
    expect(out).toContain('decoy states');
    expect(out).toContain('PRESENT');
    expect(out).toContain('optical isolator');
  });

  it('warns when the armed attack is one this target can see', () => {
    const out = text(play(['connect blacksite', 'arm beamsplit 1']));
    expect(out.toLowerCase()).toContain('this target can see that attack');
  });

  it('does not warn when the countermeasure is absent', () => {
    const out = text(play(['connect testbed', 'arm beamsplit 1']));
    expect(out.toLowerCase()).not.toContain('can see that attack');
  });

  it('warns when an armed attack alone would breach the abort threshold', () => {
    const out = text(play(['connect testbed', 'arm intercept 1']));
    expect(out.toLowerCase()).toContain('exceeds the abort threshold');
  });

  it('rejects an unknown attack name', () => {
    expect(text(play(['connect testbed', 'arm hyperbeam 1']))).toContain('unknown attack');
  });

  it('requires a fraction', () => {
    expect(text(play(['connect testbed', 'arm intercept']))).toContain('arm intercept <fraction>');
  });

  it('disarm removes an attack', () => {
    const s = play(['connect testbed', 'arm blind 0.5', 'disarm blind']);
    expect(s.session?.armed).toHaveLength(0);
  });
});

describe('playing a session through', () => {
  it('a clean run reaches the end without ever raising QBER', () => {
    const s = play(['connect testbed', 'run 4000']);
    expect(s.session?.status).toBe('exhausted');
    expect(s.session?.errors).toBe(0);
    expect(text(s)).toContain('SHORT'); // stole nothing, so the goal was missed
  });

  it('a full intercept gets caught on the error rate', () => {
    const s = play(['connect testbed', 'arm intercept 1', 'run 2000']);
    expect(s.session?.status).toBe('caught');
    expect(text(s)).toContain('CAUGHT');
    expect(text(s)).toContain('ABORT');
  });

  it('the trojan+intercept pairing wins the testbed outright', () => {
    // The intended "aha": with no isolator, reading Alice's basis first makes
    // intercept-resend silent, so the whole key comes out at zero QBER.
    const s = play(['connect testbed', 'scan', 'arm trojan 1', 'arm intercept 1', 'run 4000']);
    expect(s.session?.status).toBe('exhausted');
    expect(s.session && keyFraction(s.session)).toBeGreaterThan(0.9);
    expect(s.session?.errors).toBe(0);
    expect(text(s)).toContain('DONE');
  });

  it('the same pairing fails on the hardened target, which has an isolator', () => {
    const s = play(['connect blacksite', 'arm trojan 1', 'arm intercept 1', 'run 3000']);
    expect(s.session?.status).toBe('caught');
  });

  it('extract banks a clean partial result', () => {
    const s = play(['connect testbed', 'arm intercept 0.2', 'run 2000', 'extract']);
    expect(s.session?.status).toBe('extracted');
    expect(text(s)).toContain('Pulled out at round');
  });

  it('refuses further attacks once the session is over', () => {
    const s = play(['connect testbed', 'arm intercept 1', 'run 2000', 'arm blind 1']);
    expect(text(s)).toContain('session is over');
  });

  it('status reports QBER, key and alarm', () => {
    const out = text(play(['connect testbed', 'arm blind 0.5', 'run 500', 'status']));
    expect(out).toContain('QBER');
    expect(out).toContain('KEY');
    expect(out).toContain('ALARM');
  });
});
