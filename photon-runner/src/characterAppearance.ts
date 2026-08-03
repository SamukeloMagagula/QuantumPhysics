const STORAGE_KEY = 'photon-runner:characterAppearance';

export type HairStyle = 'buzz' | 'short' | 'messy' | 'ponytail' | 'bun' | 'afro' | 'long' | 'mohawk';
export type Outfit = 'jumpsuit' | 'hoodie' | 'labcoat' | 'tactical' | 'varsity' | 'street';
export type Accessory = 'none' | 'cap' | 'visor' | 'glasses' | 'headphones' | 'beanie' | 'mask' | 'earpiece';
export type Build = 'slim' | 'average' | 'broad';

export interface CharacterAppearance {
  skinTone: string;
  hairStyle: HairStyle;
  hairColor: string;
  outfit: Outfit;
  outfitPrimary: string;
  outfitSecondary: string;
  accessory: Accessory;
  accentColor: string;
  build: Build;
  height: number; // 0.92 – 1.08 multiplier
  nickname: string;
}

export const SKIN_TONES = [
  '#f8d9c0', '#eec1a2', '#d9a179', '#c1855c', '#9c6644', '#7a4b30', '#54331f', '#3b2417',
];

export const HAIR_COLORS = [
  '#1c1917', '#3f2a1d', '#6b4423', '#a16207', '#d4a017', '#e5e7eb', '#7c3aed', '#0ea5e9', '#e11d48', '#16a34a',
];

export const OUTFIT_COLORS = [
  '#0ea5e9', '#22c55e', '#f43f5e', '#a855f7', '#f59e0b', '#14b8a6',
  '#ec4899', '#64748b', '#1e293b', '#f8fafc', '#84cc16', '#fb7185',
];

export const ACCENT_PALETTE = ['#facc15', '#f472b6', '#38bdf8', '#a3e635', '#fb923c', '#e879f9', '#2dd4bf', '#fca5a5'];

export const HAIR_STYLES: { id: HairStyle; label: string }[] = [
  { id: 'buzz', label: 'Buzz' },
  { id: 'short', label: 'Short' },
  { id: 'messy', label: 'Messy' },
  { id: 'ponytail', label: 'Ponytail' },
  { id: 'bun', label: 'Bun' },
  { id: 'afro', label: 'Afro' },
  { id: 'long', label: 'Long' },
  { id: 'mohawk', label: 'Mohawk' },
];

export const OUTFITS: { id: Outfit; label: string; blurb: string }[] = [
  { id: 'jumpsuit', label: 'Jumpsuit', blurb: 'Lab-issue coveralls' },
  { id: 'hoodie', label: 'Hoodie', blurb: 'Hood up, stay unseen' },
  { id: 'labcoat', label: 'Lab Coat', blurb: 'Certified researcher' },
  { id: 'tactical', label: 'Tactical', blurb: 'Vest and straps' },
  { id: 'varsity', label: 'Varsity', blurb: 'Campus quantum club' },
  { id: 'street', label: 'Street', blurb: 'Tee and jacket' },
];

export const ACCESSORIES: { id: Accessory; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'cap', label: 'Cap' },
  { id: 'visor', label: 'Visor' },
  { id: 'glasses', label: 'Glasses' },
  { id: 'headphones', label: 'Headphones' },
  { id: 'beanie', label: 'Beanie' },
  { id: 'mask', label: 'Mask' },
  { id: 'earpiece', label: 'Earpiece' },
];

export const BUILDS: { id: Build; label: string }[] = [
  { id: 'slim', label: 'Slim' },
  { id: 'average', label: 'Average' },
  { id: 'broad', label: 'Broad' },
];

export const DEFAULT_APPEARANCE: CharacterAppearance = {
  skinTone: SKIN_TONES[2],
  hairStyle: 'short',
  hairColor: HAIR_COLORS[1],
  outfit: 'jumpsuit',
  outfitPrimary: OUTFIT_COLORS[0],
  outfitSecondary: OUTFIT_COLORS[8],
  accessory: 'none',
  accentColor: ACCENT_PALETTE[0],
  build: 'average',
  height: 1,
  nickname: '',
};

/** Deterministic pseudo-random appearance, for the "Randomize" button. */
export function randomAppearance(): CharacterAppearance {
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
  return {
    skinTone: pick(SKIN_TONES),
    hairStyle: pick(HAIR_STYLES).id,
    hairColor: pick(HAIR_COLORS),
    outfit: pick(OUTFITS).id,
    outfitPrimary: pick(OUTFIT_COLORS),
    outfitSecondary: pick(OUTFIT_COLORS),
    accessory: pick(ACCESSORIES).id,
    accentColor: pick(ACCENT_PALETTE),
    build: pick(BUILDS).id,
    height: 0.94 + Math.random() * 0.12,
    nickname: '',
  };
}

function clampHeight(v: unknown): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 1;
  return Math.min(1.08, Math.max(0.92, n));
}

export function getAppearance(): CharacterAppearance {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_APPEARANCE;
    const parsed = JSON.parse(raw) as Partial<CharacterAppearance>;
    const merged = { ...DEFAULT_APPEARANCE, ...parsed };
    return { ...merged, height: clampHeight(merged.height) };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function saveAppearance(appearance: CharacterAppearance): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appearance));
  } catch {
    // Appearance just won't persist across reloads this session.
  }
}
