import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAppearance,
  saveAppearance,
  randomAppearance,
  DEFAULT_APPEARANCE,
  SKIN_TONES,
  HAIR_STYLES,
  OUTFITS,
  ACCESSORIES,
  BUILDS,
  ALICE_APPEARANCE,
  BOB_APPEARANCE,
  EVE_APPEARANCE,
  ROLE_APPEARANCES,
} from './characterAppearance';

beforeEach(() => {
  localStorage.clear();
});

describe('getAppearance', () => {
  it('defaults when nothing saved', () => {
    expect(getAppearance()).toEqual(DEFAULT_APPEARANCE);
  });

  it('falls back to defaults when localStorage throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('unavailable');
    });
    expect(getAppearance()).toEqual(DEFAULT_APPEARANCE);
    spy.mockRestore();
  });
});

describe('saveAppearance', () => {
  it('persists and round-trips a full custom appearance', () => {
    const custom = {
      ...DEFAULT_APPEARANCE,
      skinTone: SKIN_TONES[5],
      hairStyle: 'afro' as const,
      hairColor: '#e5e7eb',
      outfit: 'labcoat' as const,
      outfitPrimary: '#a855f7',
      outfitSecondary: '#0ea5e9',
      accessory: 'headphones' as const,
      accentColor: '#f472b6',
      build: 'broad' as const,
      height: 1.05,
      nickname: 'Q',
    };
    saveAppearance(custom);
    expect(getAppearance()).toEqual(custom);
  });

  it('merges partial saved data over defaults (forward/backward compatible)', () => {
    localStorage.setItem('photon-runner:characterAppearance', JSON.stringify({ hairStyle: 'bun' }));
    const got = getAppearance();
    expect(got.hairStyle).toBe('bun');
    expect(got.outfit).toBe(DEFAULT_APPEARANCE.outfit); // unspecified fields fall back
  });

  it('clamps an out-of-range height instead of trusting it', () => {
    localStorage.setItem('photon-runner:characterAppearance', JSON.stringify({ height: 99 }));
    expect(getAppearance().height).toBe(1.08);
    localStorage.setItem('photon-runner:characterAppearance', JSON.stringify({ height: -5 }));
    expect(getAppearance().height).toBe(0.92);
  });

  it('fails silently when localStorage throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    expect(() => saveAppearance(DEFAULT_APPEARANCE)).not.toThrow();
    spy.mockRestore();
  });
});

describe('role identity presets', () => {
  const presets = { alice: ALICE_APPEARANCE, bob: BOB_APPEARANCE, eve: EVE_APPEARANCE };

  it('each preset only uses values the UI can actually render', () => {
    for (const a of Object.values(presets)) {
      expect(SKIN_TONES).toContain(a.skinTone);
      expect(HAIR_STYLES.map((h) => h.id)).toContain(a.hairStyle);
      expect(OUTFITS.map((o) => o.id)).toContain(a.outfit);
      expect(ACCESSORIES.map((x) => x.id)).toContain(a.accessory);
      expect(BUILDS.map((b) => b.id)).toContain(a.build);
      expect(a.height).toBeGreaterThanOrEqual(0.92);
      expect(a.height).toBeLessThanOrEqual(1.08);
    }
  });

  it('carries its own name — these are meant to be shown, unlike the player\'s own appearance', () => {
    expect(ALICE_APPEARANCE.nickname).toBe('Alice');
    expect(BOB_APPEARANCE.nickname).toBe('Bob');
    expect(EVE_APPEARANCE.nickname).toBe('Eve');
  });

  it('are visually distinct from each other (no two roles share an outfit+hair combination)', () => {
    const signature = (a: typeof ALICE_APPEARANCE) => `${a.outfit}:${a.hairStyle}:${a.accessory}`;
    const signatures = new Set(Object.values(presets).map(signature));
    expect(signatures.size).toBe(3);
  });

  it('ROLE_APPEARANCES maps each Role id to its matching preset', () => {
    expect(ROLE_APPEARANCES.alice).toBe(ALICE_APPEARANCE);
    expect(ROLE_APPEARANCES.bob).toBe(BOB_APPEARANCE);
    expect(ROLE_APPEARANCES.eve).toBe(EVE_APPEARANCE);
  });
});

describe('randomAppearance', () => {
  it('only ever picks values the UI can render', () => {
    for (let i = 0; i < 40; i++) {
      const a = randomAppearance();
      expect(SKIN_TONES).toContain(a.skinTone);
      expect(HAIR_STYLES.map((h) => h.id)).toContain(a.hairStyle);
      expect(OUTFITS.map((o) => o.id)).toContain(a.outfit);
      expect(ACCESSORIES.map((x) => x.id)).toContain(a.accessory);
      expect(BUILDS.map((b) => b.id)).toContain(a.build);
      expect(a.height).toBeGreaterThanOrEqual(0.92);
      expect(a.height).toBeLessThanOrEqual(1.08);
    }
  });
});
