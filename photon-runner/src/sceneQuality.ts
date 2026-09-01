/**
 * Global graphics tier. Read by the engine, the world builder and the texture
 * library, so one setting scales everything that costs frames: render
 * resolution, shadow map size, post-processing passes, texture resolution and
 * geometry density.
 */

export type Tier = 'balanced' | 'high' | 'ultra' | 'uhd';

export interface QualityProfile {
  /** Device-pixel-ratio cap. Above 1 this is supersampling. */
  pixelRatio: number;
  shadowMapSize: number;
  /** Ambient occlusion sample count; 0 disables the pass. */
  aoSamples: number;
  bloom: boolean;
  /** Texture edge length for procedural PBR maps. */
  textureSize: 256 | 512 | 1024 | 2048;
  /** Radial segments for capsules/spheres on characters. */
  meshDetail: number;
  anisotropy: number;
  /** Extra point lights per room beyond the main practical. */
  fillLights: boolean;
  /** SMAA instead of FXAA — sharper on thin geometry, costs a little more. */
  smaa: boolean;
  /** Real mirrored floors. Each one re-renders the scene from the reflected
   * camera, so this is the single most expensive flag here — off on the tier
   * that exists to avoid exactly that. */
  reflections: boolean;
}

export const PROFILES: Record<Tier, QualityProfile> = {
  balanced: {
    pixelRatio: 1,
    shadowMapSize: 1024,
    aoSamples: 0,
    bloom: true,
    textureSize: 256,
    meshDetail: 12,
    anisotropy: 4,
    fillLights: false,
    smaa: false,
    reflections: false,
  },
  high: {
    pixelRatio: 2,
    shadowMapSize: 2048,
    aoSamples: 12,
    bloom: true,
    textureSize: 512,
    meshDetail: 24,
    anisotropy: 8,
    fillLights: true,
    smaa: true,
    reflections: true,
  },
  ultra: {
    // Supersamples well past the display, 4k shadows, dense AO.
    pixelRatio: 3,
    shadowMapSize: 4096,
    aoSamples: 32,
    bloom: true,
    textureSize: 1024,
    meshDetail: 40,
    anisotropy: 16,
    fillLights: true,
    smaa: true,
    reflections: true,
  },
  uhd: {
    // True 4K: on a 1080p window a pixelRatio of 4 renders a 3840-wide
    // buffer and downsamples it, which is what actually removes the soft,
    // aliased look — resolution is the one thing no amount of art direction
    // substitutes for. 2k procedural textures and 4k shadows to match, so
    // surfaces hold up when the resolution finally shows them.
    pixelRatio: 4,
    shadowMapSize: 4096,
    aoSamples: 32,
    bloom: true,
    textureSize: 2048,
    meshDetail: 48,
    anisotropy: 16,
    fillLights: true,
    smaa: true,
    reflections: true,
  },
};

export const TIER_INFO: Record<Tier, { label: string; blurb: string }> = {
  balanced: { label: 'Balanced', blurb: 'Native resolution, no ambient occlusion. Laptops and tablets.' },
  high: { label: 'High', blurb: '2× supersampling, 2k shadows, ambient occlusion. The default.' },
  ultra: { label: 'Ultra', blurb: '3× supersampling, 4k shadows, 32-sample AO, 1k textures. Will heat your GPU.' },
  uhd: { label: '4K', blurb: '4× supersampling (3840px from a 1080p window), 2k textures, 4k shadows. Needs a real GPU.' },
};

const STORAGE_KEY = 'quantum-lab:graphics';

function detect(): Tier {
  if (typeof navigator === 'undefined') return 'high';
  const cores = navigator.hardwareConcurrency ?? 4;
  const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  if (coarse || cores <= 4) return 'balanced';
  return 'high';
}

let current: Tier | null = null;

export function getTier(): Tier {
  if (current) return current;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'balanced' || raw === 'high' || raw === 'ultra' || raw === 'uhd') {
      current = raw;
      return current;
    }
  } catch {
    // fall through to detection
  }
  current = detect();
  return current;
}

export function setTier(t: Tier): void {
  current = t;
  try {
    localStorage.setItem(STORAGE_KEY, t);
  } catch {
    // Preference just won't persist.
  }
}

export function profile(): QualityProfile {
  return PROFILES[getTier()];
}
