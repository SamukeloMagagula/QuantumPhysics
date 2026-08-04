import * as THREE from 'three';
import { profile } from './sceneQuality';

/**
 * Procedural PBR texture library.
 *
 * Everything in this game was flat colour, which is why it read as untextured
 * primitives no matter how good the lighting got. Real surfaces need three
 * things: an albedo with tonal variation, a **normal map** so light catches
 * relief, and a **roughness map** so highlights break up instead of sitting as
 * one uniform sheen.
 *
 * All of it is generated at runtime from canvases — no binary assets to ship —
 * and cached by key, because a six-character cast asking for the same fabric
 * six times should pay for it once.
 */

export type Quality = 'medium' | 'high' | 'ultra';

const SIZE: Record<Quality, number> = { medium: 256, high: 512, ultra: 1024 };

/** Map the global graphics tier onto a texture resolution. */
function tierQuality(): Quality {
  const size = profile().textureSize;
  return size >= 1024 ? 'ultra' : size >= 512 ? 'high' : 'medium';
}

export interface SurfaceMaps {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
}

const cache = new Map<string, SurfaceMaps>();

/** Free every cached texture. Called when the whole app tears down. */
export function disposeTextureCache(): void {
  for (const s of cache.values()) {
    s.map.dispose();
    s.normalMap.dispose();
    s.roughnessMap.dispose();
  }
  cache.clear();
}

function canvas(size: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return { c, ctx: c.getContext('2d', { willReadFrequently: true })! };
}

/** Deterministic PRNG so a given surface looks the same every session. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function toTexture(c: HTMLCanvasElement, repeat: number, srgb: boolean): THREE.Texture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = profile().anisotropy;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Sobel-filter a grayscale height field into a tangent-space normal map.
 * This is what actually produces surface relief — weave, pores, grain — rather
 * than a picture of relief painted onto a flat plane.
 */
function heightToNormal(height: HTMLCanvasElement, strength: number): THREE.Texture {
  const size = height.width;
  const src = height.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, size, size).data;
  const out = new Uint8Array(size * size * 4);

  // Sample the red channel, wrapping at the edges so the map tiles seamlessly.
  const h = (x: number, y: number) => src[(((y + size) % size) * size + ((x + size) % size)) * 4] / 255;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tl = h(x - 1, y - 1);
      const t = h(x, y - 1);
      const tr = h(x + 1, y - 1);
      const l = h(x - 1, y);
      const r = h(x + 1, y);
      const bl = h(x - 1, y + 1);
      const b = h(x, y + 1);
      const br = h(x + 1, y + 1);

      const dx = tl + 2 * l + bl - (tr + 2 * r + br);
      const dy = tl + 2 * t + tr - (bl + 2 * b + br);

      const nx = dx * strength;
      const ny = dy * strength;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;

      const i = (y * size + x) * 4;
      out[i] = ((nx / len) * 0.5 + 0.5) * 255;
      out[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      out[i + 2] = ((nz / len) * 0.5 + 0.5) * 255;
      out[i + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(out, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = profile().anisotropy;
  tex.needsUpdate = true;
  return tex;
}

/** Grayscale canvas -> roughness map. Bright = rough, dark = glossy. */
function toRoughness(c: HTMLCanvasElement, repeat: number): THREE.Texture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  return t;
}

const hex = (n: number) => `#${(n >>> 0).toString(16).padStart(6, '0')}`;

// ---------------------------------------------------------------- surfaces

/**
 * Skin: mottled tone, pore relief, and a roughness break so foreheads and
 * cheeks catch light differently. Subtle on purpose — overdone pores read as
 * orange peel.
 */
export function skinSurface(color: number, q: Quality = tierQuality()): SurfaceMaps {
  const key = `skin:${color}:${q}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const size = SIZE[q];
  const rand = rng(color ^ 0x5f3a);

  // albedo — base tone with capillary mottling
  const { c: alb, ctx: a } = canvas(size);
  a.fillStyle = hex(color);
  a.fillRect(0, 0, size, size);
  for (let i = 0; i < size * 2; i++) {
    a.globalAlpha = 0.014 + rand() * 0.03;
    a.fillStyle = rand() > 0.55 ? '#c8705a' : '#f2c9a8';
    a.beginPath();
    a.arc(rand() * size, rand() * size, size * (0.01 + rand() * 0.05), 0, Math.PI * 2);
    a.fill();
  }
  a.globalAlpha = 1;

  // height — pores
  const { c: hgt, ctx: hc } = canvas(size);
  hc.fillStyle = '#808080';
  hc.fillRect(0, 0, size, size);
  const pores = size * 14;
  for (let i = 0; i < pores; i++) {
    const v = 96 + Math.floor(rand() * 60);
    hc.fillStyle = `rgb(${v},${v},${v})`;
    hc.beginPath();
    hc.arc(rand() * size, rand() * size, rand() * 1.6 + 0.4, 0, Math.PI * 2);
    hc.fill();
  }

  // roughness — cheeks glossier than the rest
  const { c: rgh, ctx: rc } = canvas(size);
  rc.fillStyle = '#8a8a8a';
  rc.fillRect(0, 0, size, size);
  for (let i = 0; i < 40; i++) {
    rc.globalAlpha = 0.16;
    rc.fillStyle = rand() > 0.5 ? '#6d6d6d' : '#a6a6a6';
    rc.beginPath();
    rc.arc(rand() * size, rand() * size, size * (0.05 + rand() * 0.15), 0, Math.PI * 2);
    rc.fill();
  }

  const out: SurfaceMaps = {
    map: toTexture(alb, 1, true),
    normalMap: heightToNormal(hgt, 0.55),
    roughnessMap: toRoughness(rgh, 1),
  };
  cache.set(key, out);
  return out;
}

/** Woven cloth: visible warp/weft relief. The workhorse for outfits. */
export function fabricSurface(color: number, q: Quality = tierQuality(), threadScale = 5): SurfaceMaps {
  const key = `fabric:${color}:${q}:${threadScale}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const size = SIZE[q];
  const rand = rng(color ^ 0x1b7d);
  const step = Math.max(3, Math.floor(size / (size / threadScale)));

  const { c: alb, ctx: a } = canvas(size);
  a.fillStyle = hex(color);
  a.fillRect(0, 0, size, size);

  const { c: hgt, ctx: hc } = canvas(size);
  hc.fillStyle = '#6b6b6b';
  hc.fillRect(0, 0, size, size);

  // Plain weave: alternate which thread sits on top per cell.
  for (let y = 0; y < size; y += step) {
    for (let x = 0; x < size; x += step) {
      const over = ((x / step) + (y / step)) % 2 === 0;
      hc.fillStyle = over ? '#c4c4c4' : '#4a4a4a';
      if (over) hc.fillRect(x, y, step, Math.max(1, step * 0.55));
      else hc.fillRect(x, y, Math.max(1, step * 0.55), step);

      // Thread-level tonal noise in the albedo keeps it from looking printed.
      a.globalAlpha = 0.05 + rand() * 0.06;
      a.fillStyle = rand() > 0.5 ? '#ffffff' : '#000000';
      a.fillRect(x, y, step, step);
    }
  }
  a.globalAlpha = 1;

  // Slubs — occasional thick threads, the thing that says "real cloth".
  for (let i = 0; i < size / 6; i++) {
    hc.fillStyle = '#d8d8d8';
    const y = Math.floor(rand() * size);
    hc.fillRect(0, y, size, 1);
  }

  const { c: rgh, ctx: rc } = canvas(size);
  rc.drawImage(hgt, 0, 0);
  rc.globalAlpha = 0.5;
  rc.fillStyle = '#b4b4b4';
  rc.fillRect(0, 0, size, size);

  const out: SurfaceMaps = {
    map: toTexture(alb, 3, true),
    normalMap: heightToNormal(hgt, 1.5),
    roughnessMap: toRoughness(rgh, 3),
  };
  cache.set(key, out);
  return out;
}

/** Hair: directional strand relief, low roughness along the strands. */
export function hairSurface(color: number, q: Quality = tierQuality()): SurfaceMaps {
  const key = `hair:${color}:${q}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const size = SIZE[q];
  const rand = rng(color ^ 0x2f91);

  const { c: alb, ctx: a } = canvas(size);
  a.fillStyle = hex(color);
  a.fillRect(0, 0, size, size);

  const { c: hgt, ctx: hc } = canvas(size);
  hc.fillStyle = '#707070';
  hc.fillRect(0, 0, size, size);

  // Strands running vertically; both maps get the same lines so the shading
  // and the relief agree.
  for (let i = 0; i < size * 1.5; i++) {
    const x = rand() * size;
    const w = 0.6 + rand() * 2.2;
    const shade = Math.floor(120 + rand() * 110);
    hc.strokeStyle = `rgb(${shade},${shade},${shade})`;
    hc.lineWidth = w;
    hc.beginPath();
    hc.moveTo(x, 0);
    hc.bezierCurveTo(x + (rand() - 0.5) * 20, size * 0.35, x + (rand() - 0.5) * 20, size * 0.7, x, size);
    hc.stroke();

    a.globalAlpha = 0.05 + rand() * 0.08;
    a.strokeStyle = rand() > 0.5 ? '#ffffff' : '#000000';
    a.lineWidth = w;
    a.beginPath();
    a.moveTo(x, 0);
    a.lineTo(x, size);
    a.stroke();
  }
  a.globalAlpha = 1;

  const { c: rgh, ctx: rc } = canvas(size);
  rc.fillStyle = '#6e6e6e';
  rc.fillRect(0, 0, size, size);

  const out: SurfaceMaps = {
    map: toTexture(alb, 1, true),
    normalMap: heightToNormal(hgt, 1.1),
    roughnessMap: toRoughness(rgh, 1),
  };
  cache.set(key, out);
  return out;
}

/** Worn metal: brushed grain, scratches, patchy roughness. */
export function metalSurface(color: number, q: Quality = tierQuality()): SurfaceMaps {
  const key = `metal:${color}:${q}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const size = SIZE[q];
  const rand = rng(color ^ 0x77c1);

  const { c: alb, ctx: a } = canvas(size);
  a.fillStyle = hex(color);
  a.fillRect(0, 0, size, size);

  const { c: hgt, ctx: hc } = canvas(size);
  hc.fillStyle = '#808080';
  hc.fillRect(0, 0, size, size);

  // Brushed grain.
  for (let i = 0; i < size * 6; i++) {
    const y = rand() * size;
    const v = 110 + Math.floor(rand() * 80);
    hc.strokeStyle = `rgb(${v},${v},${v})`;
    hc.lineWidth = rand() * 1.4;
    hc.beginPath();
    hc.moveTo(0, y);
    hc.lineTo(size, y + (rand() - 0.5) * 4);
    hc.stroke();
  }
  // Gouges.
  for (let i = 0; i < size / 8; i++) {
    hc.strokeStyle = rand() > 0.5 ? '#3a3a3a' : '#d2d2d2';
    hc.lineWidth = 0.6 + rand() * 1.6;
    const x = rand() * size;
    const y = rand() * size;
    hc.beginPath();
    hc.moveTo(x, y);
    hc.lineTo(x + (rand() - 0.5) * size * 0.4, y + (rand() - 0.5) * size * 0.1);
    hc.stroke();
  }
  // Corrosion blooms in the albedo.
  for (let i = 0; i < 30; i++) {
    a.globalAlpha = 0.05 + rand() * 0.12;
    a.fillStyle = rand() > 0.5 ? '#5a3a20' : '#2a2a2a';
    a.beginPath();
    a.arc(rand() * size, rand() * size, size * (0.02 + rand() * 0.1), 0, Math.PI * 2);
    a.fill();
  }
  a.globalAlpha = 1;

  const { c: rgh, ctx: rc } = canvas(size);
  rc.fillStyle = '#5a5a5a';
  rc.fillRect(0, 0, size, size);
  for (let i = 0; i < 60; i++) {
    rc.globalAlpha = 0.3;
    rc.fillStyle = rand() > 0.5 ? '#9c9c9c' : '#3c3c3c';
    rc.beginPath();
    rc.arc(rand() * size, rand() * size, size * (0.02 + rand() * 0.12), 0, Math.PI * 2);
    rc.fill();
  }

  const out: SurfaceMaps = {
    map: toTexture(alb, 2, true),
    normalMap: heightToNormal(hgt, 1.0),
    roughnessMap: toRoughness(rgh, 2),
  };
  cache.set(key, out);
  return out;
}

/** Poured concrete / packed earth: aggregate, pitting, slab joints. */
export function groundSurface(base: number, accent: number, q: Quality = tierQuality(), seed = 7): SurfaceMaps {
  const key = `ground:${base}:${accent}:${q}:${seed}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const size = SIZE[q];
  const rand = rng(seed ^ base);

  const { c: alb, ctx: a } = canvas(size);
  a.fillStyle = hex(base);
  a.fillRect(0, 0, size, size);

  const { c: hgt, ctx: hc } = canvas(size);
  hc.fillStyle = '#8a8a8a';
  hc.fillRect(0, 0, size, size);

  // Aggregate — stones showing through the surface.
  for (let i = 0; i < size * 3; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 1 + rand() * (size / 90);
    a.globalAlpha = 0.06 + rand() * 0.16;
    a.fillStyle = rand() > 0.5 ? hex(accent) : '#ffffff';
    a.beginPath();
    a.arc(x, y, r, 0, Math.PI * 2);
    a.fill();

    const v = 120 + Math.floor(rand() * 90);
    hc.fillStyle = `rgb(${v},${v},${v})`;
    hc.beginPath();
    hc.arc(x, y, r, 0, Math.PI * 2);
    hc.fill();
  }
  // Pitting.
  for (let i = 0; i < size; i++) {
    const v = 30 + Math.floor(rand() * 50);
    hc.fillStyle = `rgb(${v},${v},${v})`;
    hc.beginPath();
    hc.arc(rand() * size, rand() * size, rand() * 2.2, 0, Math.PI * 2);
    hc.fill();
  }
  a.globalAlpha = 1;

  // Slab joint around the tile edge, in both albedo and height.
  a.strokeStyle = 'rgba(0,0,0,.3)';
  a.lineWidth = size / 90;
  a.strokeRect(0, 0, size, size);
  hc.strokeStyle = '#2c2c2c';
  hc.lineWidth = size / 80;
  hc.strokeRect(0, 0, size, size);

  const { c: rgh, ctx: rc } = canvas(size);
  rc.fillStyle = '#c0c0c0';
  rc.fillRect(0, 0, size, size);
  for (let i = 0; i < 80; i++) {
    rc.globalAlpha = 0.25;
    rc.fillStyle = rand() > 0.5 ? '#8e8e8e' : '#e2e2e2';
    rc.beginPath();
    rc.arc(rand() * size, rand() * size, size * (0.03 + rand() * 0.14), 0, Math.PI * 2);
    rc.fill();
  }

  const out: SurfaceMaps = {
    map: toTexture(alb, 1, true),
    normalMap: heightToNormal(hgt, 1.3),
    roughnessMap: toRoughness(rgh, 1),
  };
  cache.set(key, out);
  return out;
}

/** Painted breeze-block / plaster wall: shallow block courses and scuffing. */
export function wallSurface(color: number, q: Quality = tierQuality()): SurfaceMaps {
  const key = `wall:${color}:${q}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const size = SIZE[q];
  const rand = rng(color ^ 0x3ae2);
  const course = size / 4;

  const { c: alb, ctx: a } = canvas(size);
  a.fillStyle = hex(color);
  a.fillRect(0, 0, size, size);

  const { c: hgt, ctx: hc } = canvas(size);
  hc.fillStyle = '#9a9a9a';
  hc.fillRect(0, 0, size, size);

  // Block courses, offset every other row.
  hc.strokeStyle = '#3c3c3c';
  hc.lineWidth = Math.max(2, size / 128);
  for (let row = 0; row * course < size; row++) {
    const y = row * course;
    hc.beginPath();
    hc.moveTo(0, y);
    hc.lineTo(size, y);
    hc.stroke();

    const offset = row % 2 ? course : 0;
    for (let x = offset; x < size; x += course * 2) {
      hc.beginPath();
      hc.moveTo(x, y);
      hc.lineTo(x, y + course);
      hc.stroke();
    }
  }

  // Scuffs and damp patches.
  for (let i = 0; i < 70; i++) {
    a.globalAlpha = 0.04 + rand() * 0.1;
    a.fillStyle = rand() > 0.5 ? '#000000' : '#ffffff';
    a.beginPath();
    a.arc(rand() * size, rand() * size, size * (0.02 + rand() * 0.13), 0, Math.PI * 2);
    a.fill();

    const v = 110 + Math.floor(rand() * 70);
    hc.globalAlpha = 0.4;
    hc.fillStyle = `rgb(${v},${v},${v})`;
    hc.beginPath();
    hc.arc(rand() * size, rand() * size, size * (0.01 + rand() * 0.06), 0, Math.PI * 2);
    hc.fill();
    hc.globalAlpha = 1;
  }
  a.globalAlpha = 1;

  const { c: rgh, ctx: rc } = canvas(size);
  rc.fillStyle = '#cfcfcf';
  rc.fillRect(0, 0, size, size);

  const out: SurfaceMaps = {
    map: toTexture(alb, 1, true),
    normalMap: heightToNormal(hgt, 1.4),
    roughnessMap: toRoughness(rgh, 1),
  };
  cache.set(key, out);
  return out;
}

/** Attach a surface set to a standard material, with per-use tiling. */
export function applySurface(
  mat: THREE.MeshStandardMaterial,
  s: SurfaceMaps,
  repeat = 1,
  normalScale = 1
): void {
  const clone = (t: THREE.Texture) => {
    if (repeat === 1) return t;
    const c = t.clone();
    c.needsUpdate = true;
    c.repeat.set(t.repeat.x * repeat, t.repeat.y * repeat);
    return c;
  };
  mat.map = clone(s.map);
  mat.normalMap = clone(s.normalMap);
  mat.roughnessMap = clone(s.roughnessMap);
  mat.normalScale = new THREE.Vector2(normalScale, normalScale);
  mat.needsUpdate = true;
}
