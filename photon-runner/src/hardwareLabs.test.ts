import { describe, expect, it } from 'vitest';
import { LABS, abnormalReadings, getLab, gradeLab, labsForTrack } from './hardwareLabs';

describe('lab catalogue', () => {
  it('ships both tracks', () => {
    expect(labsForTrack('optics').length).toBeGreaterThan(0);
    expect(labsForTrack('pc').length).toBeGreaterThan(0);
  });

  it('gives every lab a reachable correct answer', () => {
    for (const lab of LABS) {
      expect(lab.faults.some((f) => f.id === lab.correctFaultId), `${lab.id} fault`).toBe(true);
      expect(lab.fixes.some((f) => f.id === lab.correctFixId), `${lab.id} fix`).toBe(true);
    }
  });

  it('offers real alternatives, not a single obvious answer', () => {
    for (const lab of LABS) {
      expect(lab.faults.length, `${lab.id}`).toBeGreaterThanOrEqual(3);
      expect(lab.fixes.length, `${lab.id}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('explains every candidate fault, including the wrong ones', () => {
    // The wrong answers have to teach too — that is where the reasoning is.
    for (const lab of LABS) {
      for (const f of lab.faults) {
        expect(f.why.length, `${lab.id}/${f.id}`).toBeGreaterThan(20);
      }
    }
  });

  it('always leaves an instrument trail pointing at the fault', () => {
    for (const lab of LABS) {
      expect(abnormalReadings(lab).length, `${lab.id}`).toBeGreaterThan(0);
    }
  });

  it('has unique ids', () => {
    expect(new Set(LABS.map((l) => l.id)).size).toBe(LABS.length);
  });

  it('getLab finds a lab and returns null for an unknown id', () => {
    expect(getLab('dark-counts')?.track).toBe('optics');
    expect(getLab('nope')).toBeNull();
  });
});

describe('gradeLab', () => {
  const lab = getLab('dark-counts')!;

  it('passes only when the fault and the fix are both right', () => {
    const r = gradeLab(lab, { faultId: 'tec', fixId: 'restore-tec' });
    expect(r.passed).toBe(true);
  });

  it('fails the right fix chosen for the wrong reason', () => {
    // Landing on the correct repair by luck is not understanding, so the
    // lab deliberately does not award it.
    const r = gradeLab(lab, { faultId: 'fibre', fixId: 'restore-tec' });
    expect(r.fixCorrect).toBe(true);
    expect(r.faultCorrect).toBe(false);
    expect(r.passed).toBe(false);
  });

  it('fails a correct diagnosis with the wrong repair', () => {
    const r = gradeLab(lab, { faultId: 'tec', fixId: 'raise-bias' });
    expect(r.faultCorrect).toBe(true);
    expect(r.passed).toBe(false);
  });

  it('returns the reasoning for whichever fault was chosen', () => {
    expect(gradeLab(lab, { faultId: 'fibre', fixId: null }).faultNote).toMatch(/attenuation/i);
    expect(gradeLab(lab, { faultId: null, fixId: null }).faultNote).toMatch(/no fault/i);
  });
});

describe('the optics labs back the console\'s attacks', () => {
  it('teaches why photon-number splitting is possible at all', () => {
    // The multiphoton lab is the physical cause of the beamsplit attack in
    // qkdAttack.ts — if this drifts apart from that, the two stop agreeing.
    const lab = getLab('multiphoton')!;
    expect(lab.lesson).toMatch(/multi-photon/i);
    expect(lab.lesson).toMatch(/decoy/i);
    expect(lab.readings.some((r) => r.label.includes('Mean photon number'))).toBe(true);
  });

  it('teaches that an optics fault can masquerade as an eavesdropper', () => {
    const lab = getLab('polariser-drift')!;
    expect(lab.faults.some((f) => f.id === 'eve')).toBe(true);
    expect(lab.correctFaultId).not.toBe('eve');
  });
});
