import * as THREE from 'three';
import { Text, configureTextBuilder, preloadFont } from 'troika-three-text';

/**
 * Crisp world-space text, via signed-distance-field glyphs.
 *
 * Everything in-world used to be drawn into a `CanvasTexture` and stretched
 * across a quad — a 1024px canvas spread over a 1.7m sign is roughly 600
 * pixels per metre, so it turns to mush the moment you walk up to it. SDF
 * glyphs stay sharp at any distance and any resolution, which matters twice
 * over now that holographic panels put text right in front of the camera.
 *
 * Fonts are served from `public/fonts/` deliberately. Troika's default is to
 * fetch a font from a CDN at runtime, which would mean in-world text
 * silently failing to render offline (and a network round-trip before the
 * first sign appears). Inter ships with the app instead — SIL OFL 1.1, see
 * `public/fonts/Inter-LICENSE.txt`.
 */

export const FONT_URL = '/fonts/inter-600.woff';

let configured = false;

/** Point troika at the bundled font so it never reaches for its CDN default. */
function ensureConfigured(): void {
  if (configured) return;
  configured = true;
  configureTextBuilder({ defaultFontURL: FONT_URL });
}

/**
 * Warm the glyph atlas for the characters signage actually uses. Without
 * this the first label to appear pops in a frame or two late, while the font
 * is fetched and rasterised — very visible when a room's sign is the first
 * thing you look at. Safe to call more than once.
 */
export function preloadSceneFont(onReady?: () => void): void {
  ensureConfigured();
  preloadFont(
    {
      font: FONT_URL,
      characters: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ·—-–:/%.,!?()[]<>+#',
    },
    () => onReady?.()
  );
}

/** Anything with a `dispose()` — a scene's `Res` tracker satisfies this. */
export interface TextTracker {
  d<T extends { dispose(): void }>(x: T): T;
}

export interface LabelOptions {
  text: string;
  /** Cap height in world units (metres). */
  size?: number;
  color?: THREE.ColorRepresentation;
  anchorX?: 'left' | 'center' | 'right';
  anchorY?: 'top' | 'middle' | 'bottom';
  maxWidth?: number;
  letterSpacing?: number;
  textAlign?: 'left' | 'right' | 'center' | 'justify';
  /** Dark rim behind the glyphs — keeps text legible over a busy backdrop. */
  outline?: number;
  opacity?: number;
  /** Skips tone mapping so the text reads as emissive signage and can bloom. */
  emissive?: boolean;
}

/**
 * Builds an SDF text mesh, registered with `res` so it's torn down with the
 * rest of the scene. Returns a `Text`, which is a `THREE.Mesh` — position,
 * rotate and parent it like any other object.
 */
export function createLabel(res: TextTracker, opts: LabelOptions): Text {
  ensureConfigured();

  const label = new Text();
  label.font = FONT_URL;
  label.text = opts.text;
  label.fontSize = opts.size ?? 0.18;
  label.color = opts.color ?? 0xeaf6ff;
  label.anchorX = opts.anchorX ?? 'center';
  label.anchorY = opts.anchorY ?? 'middle';
  label.textAlign = opts.textAlign ?? 'center';
  label.letterSpacing = opts.letterSpacing ?? 0.02;
  if (opts.maxWidth !== undefined) label.maxWidth = opts.maxWidth;
  if (opts.outline !== undefined) {
    label.outlineWidth = opts.outline;
    label.outlineColor = 0x05070b;
  }
  if (opts.opacity !== undefined) label.fillOpacity = opts.opacity;

  if (opts.emissive ?? true) {
    // Signage and holograms are light sources in the fiction, so they should
    // ignore tone mapping and feed the bloom pass rather than being graded
    // down like a lit surface.
    const mat = new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true });
    label.material = mat;
  }

  // Text mounted flat against a panel is coplanar with it; without a depth
  // nudge the two z-fight and the glyphs strobe as the camera moves.
  label.depthOffset = -1;

  label.sync();
  return res.d(label);
}

/** Retarget an existing label's copy without rebuilding the mesh. */
export function setLabelText(label: Text, text: string): void {
  if (label.text === text) return;
  label.text = text;
  label.sync();
}
