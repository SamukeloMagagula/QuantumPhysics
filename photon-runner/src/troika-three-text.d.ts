/**
 * Minimal hand-written declarations for troika-three-text, which ships no
 * types of its own. Only the surface sceneText.ts actually uses — adding a
 * property here is fine, but keep it to things verified against the real
 * bundle rather than guessed from docs.
 */
declare module 'troika-three-text' {
  import * as THREE from 'three';

  export class Text extends THREE.Mesh {
    text: string;
    /** URL of a .ttf/.otf/.woff (NOT .woff2 — troika can't decode those). */
    font: string | null;
    fontSize: number;
    color: THREE.ColorRepresentation;
    anchorX: number | 'left' | 'center' | 'right';
    anchorY: number | 'top' | 'top-baseline' | 'middle' | 'bottom-baseline' | 'bottom';
    maxWidth: number;
    lineHeight: number | 'normal';
    letterSpacing: number;
    textAlign: 'left' | 'right' | 'center' | 'justify';
    outlineWidth: number | string;
    outlineColor: THREE.ColorRepresentation;
    outlineBlur: number | string;
    fillOpacity: number;
    /** Nudges depth testing to stop coplanar text z-fighting its backing panel. */
    depthOffset: number;
    curveRadius: number;
    sdfGlyphSize: number | null;
    /** Troika derives its own shader from whatever material you assign. */
    material: THREE.Material;
    /** Rebuilds glyph layout. Must be called after changing any property. */
    sync(callback?: () => void): void;
    dispose(): void;
  }

  export function configureTextBuilder(config: { defaultFontURL?: string; sdfGlyphSize?: number }): void;

  export function preloadFont(
    options: { font?: string; characters?: string | string[]; sdfGlyphSize?: number },
    callback: () => void
  ): void;
}
