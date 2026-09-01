import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * Post-processing chain and image-based lighting.
 *
 * Order matters: ambient occlusion has to run on the raw linear render, bloom
 * needs to see pre-tonemapped HDR values to bleed correctly, and OutputPass
 * does tone mapping + sRGB conversion last. Grading runs after that, in
 * display space, the way a film LUT would. Anti-aliasing goes last, on the
 * final LDR image, because both FXAA and SMAA work on perceived edges.
 *
 *   Render -> GTAO -> Bloom -> Output (ACES + sRGB) -> Grade -> SMAA/FXAA
 *
 * Every stage is optional and the whole thing degrades to a plain forward
 * render if anything fails, so a weak GPU still gets a playable scene.
 */

export interface PostFx {
  render(dt: number): void;
  setSize(width: number, height: number, pixelRatio: number): void;
  dispose(): void;
}

/**
 * Procedural studio environment for IBL. Cheaper and more predictable than
 * shipping an HDR file, and it's what makes MeshStandardMaterial's metalness
 * and roughness read correctly instead of looking like flat plastic.
 */
export function applyEnvironment(renderer: THREE.WebGLRenderer, scene: THREE.Scene, intensity = 0.6): () => void {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const roomScene = new RoomEnvironment();
  const envMap = pmrem.fromScene(roomScene, 0.04).texture;

  scene.environment = envMap;
  scene.environmentIntensity = intensity;

  // RoomEnvironment builds real meshes; drop them once baked.
  roomScene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.geometry?.dispose();
      const m = mesh.material;
      if (Array.isArray(m)) m.forEach((x) => x.dispose());
      else m?.dispose();
    }
  });
  pmrem.dispose();

  return () => {
    scene.environment = null;
    envMap.dispose();
  };
}

/**
 * Analytic colour grade — the film-LUT stage the chain was missing.
 *
 * Everything up to here is physically motivated (ACES tone mapping, sRGB
 * conversion); this is the purely artistic pass on top, and it's what gives
 * the whole game one coherent look instead of five scenes that each inherit
 * whatever their palette happened to be. Done analytically rather than with
 * a LUT image so there's no texture to load, decode or colour-manage.
 *
 * Split-toning is the load-bearing part: cool cyan pushed into the shadows,
 * a warm tint left in the highlights. That's the corporate-facility look —
 * daylight through glass reading warm against cold shadowed concrete.
 */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    contrast: { value: 1.04 },
    saturation: { value: 1.08 },
    shadowTint: { value: new THREE.Color(0.88, 0.98, 1.1) },
    highlightTint: { value: new THREE.Color(1.07, 1.0, 0.93) },
    tintStrength: { value: 0.5 },
    vignette: { value: 0.17 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float contrast;
    uniform float saturation;
    uniform vec3 shadowTint;
    uniform vec3 highlightTint;
    uniform float tintStrength;
    uniform float vignette;
    varying vec2 vUv;

    const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 c = texel.rgb;

      // Split-tone: blend between the shadow and highlight tint by luma, so
      // dark pixels go cool and bright ones stay warm.
      float l = dot(c, LUMA);
      vec3 tint = mix(shadowTint, highlightTint, smoothstep(0.0, 1.0, l));
      c = mix(c, c * tint, tintStrength);

      // Contrast S-curve about mid-grey.
      c = (c - 0.5) * contrast + 0.5;

      // Saturation, against the post-contrast luma.
      c = mix(vec3(dot(c, LUMA)), c, saturation);

      // Vignette — subtle, just enough to hold the eye toward centre frame.
      vec2 d = vUv - 0.5;
      c *= 1.0 - dot(d, d) * vignette;

      gl_FragColor = vec4(clamp(c, 0.0, 1.0), texel.a);
    }
  `,
};

export interface PostFxOptions {
  /** Ambient-occlusion sample count; 0 skips the pass entirely. */
  aoSamples?: number;
  bloom?: boolean;
  /** Analytic colour grade (split-tone + contrast + vignette). */
  grade?: boolean;
  /** Use SMAA rather than FXAA. Costs more, but doesn't smear the thin
   * geometry this game is full of — window mullions, rack rails, desk edges. */
  smaa?: boolean;
  /** Bloom strength. Emissive trim and lamps carry this scene, so keep it modest. */
  bloomStrength?: number;
  bloomThreshold?: number;
  bloomRadius?: number;
  aoRadius?: number;
}

export function createPostFx(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
  opts: PostFxOptions = {}
): PostFx | null {
  const aoSamples = opts.aoSamples ?? 12;
  const wantBloom = opts.bloom ?? true;
  const wantGrade = opts.grade ?? true;
  if (aoSamples === 0 && !wantBloom && !wantGrade) return null;

  try {
    const composer = new EffectComposer(renderer);
    composer.setSize(width, height);

    composer.addPass(new RenderPass(scene, camera));

    // --- ambient occlusion: contact shadows where geometry meets ---
    let gtao: GTAOPass | null = null;
    if (aoSamples > 0) {
      gtao = new GTAOPass(scene, camera, width, height);
      gtao.output = GTAOPass.OUTPUT.Default;
      // Tuned for a room-scale scene: a small radius keeps it to corners and
      // contact points rather than smearing across whole walls.
      gtao.updateGtaoMaterial({
        radius: opts.aoRadius ?? 0.35,
        distanceExponent: 1.2,
        thickness: 1,
        scale: 1,
        samples: aoSamples,
        screenSpaceRadius: false,
      });
      composer.addPass(gtao);
    }

    // --- bloom: emissive trim, lamps and markers actually glow ---
    const bloom = wantBloom
      ? new UnrealBloomPass(
          new THREE.Vector2(width, height),
          opts.bloomStrength ?? 0.3,
          opts.bloomRadius ?? 0.5,
          opts.bloomThreshold ?? 0.9
        )
      : null;
    if (bloom) composer.addPass(bloom);

    // --- tone map + sRGB, on the composited HDR buffer ---
    composer.addPass(new OutputPass());

    // --- artistic grade, in display space, like a film LUT ---
    if (wantGrade) composer.addPass(new ShaderPass(GradeShader));

    // --- anti-alias the final image ---
    // SMAA finds real edges via pattern matching; FXAA just blurs anything
    // with local contrast, which softens fine trim badly. SMAA where we can
    // afford it, FXAA as the cheap fallback.
    let fxaa: ShaderPass | null = null;
    if (opts.smaa) {
      composer.addPass(new SMAAPass());
    } else {
      fxaa = new ShaderPass(FXAAShader);
      const pr = renderer.getPixelRatio();
      fxaa.material.uniforms.resolution.value.set(1 / (width * pr), 1 / (height * pr));
      composer.addPass(fxaa);
    }

    return {
      render() {
        composer.render();
      },
      setSize(w, h, pixelRatio) {
        composer.setSize(w, h);
        gtao?.setSize(w, h);
        bloom?.setSize(w, h);
        fxaa?.material.uniforms.resolution.value.set(1 / (w * pixelRatio), 1 / (h * pixelRatio));
      },
      dispose() {
        composer.dispose();
      },
    };
  } catch {
    // Any pass failing to compile means we fall back to a plain render rather
    // than showing a black canvas.
    return null;
  }
}
