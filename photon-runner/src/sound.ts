import { useSyncExternalStore } from 'react';

/**
 * Game sound effects, from the CC0 Kenney packs in public/assets/kenney.
 *
 * Sound is feedback, never information: everything a sound says is also on
 * screen, so muting (or a browser that blocks audio) loses nothing. It starts
 * quiet because this runs in classrooms, and the mute choice is remembered.
 */

const BASE = '/assets/kenney/';
const ui = (f: string) => `${BASE}interface-sounds/Audio/${f}.ogg`;
const digital = (f: string) => `${BASE}digital-audio/Audio/${f}.ogg`;
const impact = (f: string) => `${BASE}impact-sounds/Audio/${f}.ogg`;

/** Each sound lists variants (one is picked at random) and its own loudness. */
export const SOUNDS = {
  click: { files: [ui('click_002'), ui('click_003')], volume: 0.35 },
  open: { files: [ui('maximize_006')], volume: 0.5 },
  close: { files: [ui('minimize_006')], volume: 0.5 },
  step: { files: [0, 1, 2, 3, 4].map(i => impact(`footstep_concrete_00${i}`)), volume: 0.22 },
  sit: { files: [impact('impactSoft_medium_001')], volume: 0.55 },
  computerOn: { files: [digital('twoTone1')], volume: 0.45 },
  chat: { files: [ui('pluck_001'), ui('pluck_002')], volume: 0.6 },
  discover: { files: [ui('confirmation_002')], volume: 0.7 },
  rankUp: { files: [digital('powerUp7')], volume: 0.7 },
  win: { files: [ui('confirmation_004')], volume: 0.8 },
  caught: { files: [ui('error_006')], volume: 0.7 },
  warning: { files: [ui('glitch_002')], volume: 0.5 },
} as const;

export type SoundName = keyof typeof SOUNDS;

const KEY = 'quantum-campus:sound:v1';
/** Overall level under every sound; deliberately low for shared rooms. */
export const MASTER_VOLUME = 0.6;

function readMuted(): boolean {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}').muted === true; } catch { return false; }
}

let muted = readMuted();
const listeners = new Set<() => void>();
const cache = new Map<string, HTMLAudioElement>();

/** jsdom has no media playback, and tests should stay silent anyway. */
const canPlay = typeof Audio !== 'undefined' && !(typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent));

export function isMuted(): boolean { return muted; }

export function setMuted(next: boolean): void {
  muted = next;
  try { localStorage.setItem(KEY, JSON.stringify({ muted })); } catch { /* the choice still holds this session */ }
  listeners.forEach(l => l());
}

export function play(name: SoundName, loudness = 1): void {
  if (muted || !canPlay) return;
  const sound = SOUNDS[name];
  const file = sound.files[Math.floor(Math.random() * sound.files.length)];
  let base = cache.get(file);
  if (!base) { base = new Audio(file); base.preload = 'auto'; cache.set(file, base); }
  // A fresh copy per play so quick repeats (footsteps, clicks) can overlap.
  const instance = base.cloneNode() as HTMLAudioElement;
  instance.volume = Math.max(0, Math.min(1, sound.volume * loudness * MASTER_VOLUME));
  // Browsers refuse audio before the first interaction; that is fine to ignore.
  instance.play()?.catch(() => {});
}

export function useMuted(): [boolean, (muted: boolean) => void] {
  const value = useSyncExternalStore(l => { listeners.add(l); return () => { listeners.delete(l); }; }, isMuted);
  return [value, setMuted];
}
