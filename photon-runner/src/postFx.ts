import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * Post-processing chain and image-based lighting.
 *
 * Order matters: ambient occlusion has to run on the raw linear render, bloom
 * needs to see pre-tonemapped HDR values to bleed correctly, and OutputPass
 * does tone mapping + sRGB conversion last. Anti-aliasing goes after that, on
 * the final LDR image, because FXAA works on perceived edges.
 *
 *   Render -> GTAO (contact shadows) -> Bloom -> Output (ACES + sRGB) -> FXAA
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

export interface PostFxOptions {
  /** Ambient-occlusion sample count; 0 skips the pass entirely. */
  aoSamples?: number;
  bloom?: boolean;
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
  if (aoSamples === 0 && !wantBloom) return null;

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
          opts.bloomStrength ?? 0.42,
          opts.bloomRadius ?? 0.5,
          opts.bloomThreshold ?? 0.82
        )
      : null;
    if (bloom) composer.addPass(bloom);

    // --- tone map + sRGB, on the composited HDR buffer ---
    composer.addPass(new OutputPass());

    // --- anti-alias the final image ---
    const fxaa = new ShaderPass(FXAAShader);
    const pr = renderer.getPixelRatio();
    fxaa.material.uniforms.resolution.value.set(1 / (width * pr), 1 / (height * pr));
    composer.addPass(fxaa);

    return {
      render() {
        composer.render();
      },
      setSize(w, h, pixelRatio) {
        composer.setSize(w, h);
        gtao?.setSize(w, h);
        bloom?.setSize(w, h);
        fxaa.material.uniforms.resolution.value.set(1 / (w * pixelRatio), 1 / (h * pixelRatio));
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
