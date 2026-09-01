import * as THREE from 'three';
import { Text } from 'troika-three-text';
import { createLabel, setLabelText } from './sceneText';
import { fresnelRimMaterial } from './sceneShaders';
// Type-only: this module never constructs a Res, it just receives one. A
// value import would add a needless runtime edge back into sceneWorld.
import type { Res } from './sceneWorld';

/**
 * Diegetic holographic panels — the game's 3D UI.
 *
 * The rule this follows: anything the *character* would see is built here, in
 * the world, lit and occluded like everything else. Flat HTML stays for the
 * things only the *player* sees — menus, the task list, settings. A readout
 * that belongs to a console in the room should be floating above that console,
 * not pinned to the corner of the screen.
 *
 * Structurally this is the Quantum Lab's one-off hologram generalised: a
 * fresnel-rimmed frame, SDF type (so it stays sharp right up against the
 * camera), corner brackets, a travelling scanline, and an unfold animation.
 */

export interface HoloContent {
  title: string;
  /** Body rows, rendered under the title. */
  lines?: string[];
  /** Rim/type colour. Defaults to the panel's construction accent. */
  accent?: number;
}

export interface HoloPanelOptions {
  width?: number;
  height?: number;
  accent?: number;
  /** Turn to face the camera every frame. Off for panels bolted to a wall. */
  billboard?: boolean;
}

export interface HoloPanel {
  group: THREE.Group;
  setContent(content: HoloContent): void;
  show(): void;
  hide(): void;
  /** Drive the unfold/fade/scanline animation. Call once per frame. */
  update(dt: number, camera: THREE.Camera): void;
  readonly shown: boolean;
}

const MAX_LINES = 5;

export function createHoloPanel(res: Res, opts: HoloPanelOptions = {}): HoloPanel {
  const w = opts.width ?? 1.6;
  const h = opts.height ?? 0.95;
  const accent = opts.accent ?? 0x5ea8c9;
  const billboard = opts.billboard ?? true;

  const group = new THREE.Group();
  group.visible = false;

  // --- backing pane: additive so it reads as projected light, not a screen ---
  const paneMat = res.m(
    new THREE.MeshBasicMaterial({
      color: accent,
      transparent: true,
      opacity: 0.1,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
  );
  const pane = new THREE.Mesh(res.g(new THREE.PlaneGeometry(w, h)), paneMat);
  group.add(pane);

  // --- rim: the existing fresnel shader, which glows at grazing angles ---
  // Note this is a ShaderMaterial: its fade is driven by the `uOpacity`
  // uniform its own GLSL reads, not by `material.opacity`, which nothing in
  // that shader looks at.
  const rimMat = res.m(fresnelRimMaterial(accent, 0.85, 2.4));
  rimMat.transparent = true;
  rimMat.depthWrite = false;
  const rim = new THREE.Mesh(res.g(new THREE.PlaneGeometry(w * 1.03, h * 1.06)), rimMat);
  rim.position.z = -0.005;
  group.add(rim);

  // --- corner brackets: four L-shapes, the cheapest "targeting UI" cue ---
  const bracketMat = res.m(
    new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.95, toneMapped: false, depthWrite: false })
  );
  const armH = res.g(new THREE.PlaneGeometry(0.17, 0.018));
  const armV = res.g(new THREE.PlaneGeometry(0.018, 0.17));
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const cx = sx * (w / 2);
      const cy = sy * (h / 2);
      const a = new THREE.Mesh(armH, bracketMat);
      a.position.set(cx - sx * 0.085, cy, 0.002);
      group.add(a);
      const b = new THREE.Mesh(armV, bracketMat);
      b.position.set(cx, cy - sy * 0.085, 0.002);
      group.add(b);
    }
  }

  // --- travelling scanline ---
  const scanMat = res.m(
    new THREE.MeshBasicMaterial({
      color: accent,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    })
  );
  const scan = new THREE.Mesh(res.g(new THREE.PlaneGeometry(w * 0.98, 0.02)), scanMat);
  scan.position.z = 0.004;
  group.add(scan);

  // --- type ---
  const title = createLabel(res, {
    text: '',
    size: 0.115,
    color: 0xffffff,
    anchorX: 'left',
    anchorY: 'top',
    maxWidth: w * 0.9,
    letterSpacing: 0.04,
  });
  title.position.set(-w / 2 + 0.1, h / 2 - 0.1, 0.01);
  group.add(title);

  const underline = new THREE.Mesh(res.g(new THREE.PlaneGeometry(w * 0.86, 0.006)), bracketMat);
  underline.position.set(0, h / 2 - 0.27, 0.01);
  group.add(underline);

  // Body rows are allocated once and blanked when unused — rebuilding SDF
  // text every frame would re-run glyph layout on each `sync()`.
  const rows: Text[] = [];
  for (let i = 0; i < MAX_LINES; i++) {
    const row = createLabel(res, {
      text: '',
      size: 0.082,
      color: 0xcfe8ff,
      anchorX: 'left',
      anchorY: 'top',
      maxWidth: w * 0.9,
    });
    row.position.set(-w / 2 + 0.1, h / 2 - 0.34 - i * 0.115, 0.01);
    group.add(row);
    rows.push(row);
  }

  let target = 0; // 0 hidden, 1 shown
  let t = 0;
  let clock = 0;

  const applyAccent = (c: number) => {
    paneMat.color.setHex(c);
    bracketMat.color.setHex(c);
    scanMat.color.setHex(c);
    const uniforms = (rimMat as THREE.ShaderMaterial).uniforms;
    if (uniforms?.uColor) (uniforms.uColor.value as THREE.Color).setHex(c);
  };

  return {
    group,

    setContent(content: HoloContent) {
      setLabelText(title, content.title.toUpperCase());
      const lines = content.lines ?? [];
      for (let i = 0; i < MAX_LINES; i++) setLabelText(rows[i], lines[i] ?? '');
      if (content.accent !== undefined) applyAccent(content.accent);
    },

    show() {
      target = 1;
      group.visible = true;
    },

    hide() {
      target = 0;
    },

    get shown() {
      return target === 1;
    },

    update(dt: number, camera: THREE.Camera) {
      clock += dt;

      // Asymmetric easing: snaps open, fades out more gently — an interface
      // that dawdles on the way in feels unresponsive.
      const rate = target === 1 ? 6.5 : 3.5;
      t += (target - t) * Math.min(1, dt * rate);
      if (t < 0.002 && target === 0) {
        group.visible = false;
        return;
      }

      // Unfold: full width immediately, height opening out from the centre.
      group.scale.set(1, Math.max(0.001, t), 1);
      paneMat.opacity = 0.1 * t;
      rimMat.uniforms.uOpacity.value = 0.85 * t;
      bracketMat.opacity = 0.95 * t;
      scanMat.opacity = 0.3 * t;
      title.fillOpacity = t;
      for (const r of rows) r.fillOpacity = t;

      // Idle bob, so a shown panel never looks like a frozen decal.
      group.position.y += Math.sin(clock * 1.6) * 0.0004;

      scan.position.y = (((clock * 0.42) % 1) - 0.5) * h;

      if (billboard) group.quaternion.copy(camera.quaternion);
    },
  };
}
