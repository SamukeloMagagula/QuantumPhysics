import { describe, expect, it } from 'vitest';
import { FONT_URL } from './sceneText';
import { PROFILES } from './sceneQuality';

describe('scene font', () => {
  it('is served from the app, not a CDN', () => {
    // troika-three-text's default is to fetch a font from jsdelivr at runtime.
    // That would mean in-world signage silently failing to render offline, and
    // a network round-trip before the first sign appears, so the font is
    // bundled in public/. If this ever points at an absolute URL again, that
    // regression is back.
    expect(FONT_URL.startsWith('/')).toBe(true);
    expect(FONT_URL).not.toMatch(/^https?:/);
  });

  it('uses a format troika can actually decode', () => {
    // Troika converts .woff via its bundled woff2otf, but explicitly does not
    // support .woff2 — pointing this at a .woff2 renders no text at all.
    expect(FONT_URL).toMatch(/\.(woff|ttf|otf)$/);
    expect(FONT_URL).not.toMatch(/\.woff2$/);
  });
});

describe('quality tiers', () => {
  it('keeps the expensive new passes off the tier meant for weak hardware', () => {
    // Reflections re-render the whole scene from the mirrored camera and SMAA
    // costs more than FXAA; `balanced` exists precisely to avoid that class of
    // work, so both must stay off there.
    expect(PROFILES.balanced.reflections).toBe(false);
    expect(PROFILES.balanced.smaa).toBe(false);
  });

  it('enables them above balanced', () => {
    for (const tier of ['high', 'ultra'] as const) {
      expect(PROFILES[tier].reflections).toBe(true);
      expect(PROFILES[tier].smaa).toBe(true);
    }
  });
});
