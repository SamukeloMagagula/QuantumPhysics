import * as THREE from 'three';
import { PostFx, applyEnvironment, createPostFx } from './postFx';
import { getTier, profile } from './sceneQuality';

/**
 * The contract a game implements. GameEngine knows nothing about BB84,
 * characters, or task logic — it only owns the Three.js scene/camera/
 * renderer/render-loop and hands frames + movement input to whichever game
 * is active.
 */
export interface Game {
  id: string;
  title: string;
  init(engine: GameEngine): void;
  update(dt: number): void;
  dispose(): void;
  /** x: -1 (left) .. 1 (right) strafe, z: -1 (back) .. 1 (forward). */
  setMoveVector(x: number, z: number, sprint?: boolean): void;
  interact(): void;
}

export interface EngineOptions {
  /** Force post-processing off — used by small previews that don't need it. */
  noPost?: boolean;
  /** Image-based lighting strength; 0 disables the environment entirely. */
  envIntensity?: number;
}

export class GameEngine {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer | null = null;

  private clock = new THREE.Clock();
  private rafId: number | null = null;
  private activeGame: Game | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private post: PostFx | null = null;
  private disposeEnv: (() => void) | null = null;
  private opts: EngineOptions;
  private resizeHandler = () => this.handleResize();

  constructor(opts: EngineOptions = {}) {
    this.opts = opts;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0a0c);
    this.scene.fog = new THREE.FogExp2(0x0b0a0c, 0.026);
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.1, 140);
  }

  /** Returns false (and leaves the engine idle) if WebGL init fails. */
  mount(canvas: HTMLCanvasElement): boolean {
    try {
      this.canvas = canvas;
      this.renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: false, // FXAA in the post chain handles this
        powerPreference: 'high-performance',
      });
      // Above 1 this is supersampling — the single biggest lever on both
      // image quality and GPU load.
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, profile().pixelRatio));
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.05;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      const envIntensity = this.opts.envIntensity ?? 0.55;
      if (envIntensity > 0) {
        this.disposeEnv = applyEnvironment(this.renderer, this.scene, envIntensity);
      }

      this.handleResize();
      window.addEventListener('resize', this.resizeHandler);
      this.clock.start();
      this.loop();
      return true;
    } catch {
      return false;
    }
  }

  setGame(game: Game): void {
    this.activeGame?.dispose();
    this.clearScene();
    this.activeGame = game;
    game.init(this);
    // Built after init so passes bind to the scene the game actually populated.
    this.rebuildPost();
  }

  private rebuildPost(): void {
    if (!this.renderer || !this.canvas) return;
    this.post?.dispose();
    this.post = null;

    if (this.opts.noPost) return;

    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    const prof = profile();
    this.post = createPostFx(this.renderer, this.scene, this.camera, w, h, {
      aoSamples: prof.aoSamples,
      bloom: prof.bloom,
    });
  }

  private clearScene(): void {
    while (this.scene.children.length) {
      this.scene.remove(this.scene.children[0]);
    }
  }

  private handleResize(): void {
    if (!this.canvas || !this.renderer) return;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    this.camera.aspect = width / (height || 1);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.post?.setSize(width, height, this.renderer.getPixelRatio());
  }

  private loop = (): void => {
    this.rafId = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.1);
    this.activeGame?.update(dt);
    if (!this.renderer) return;
    if (this.post) this.post.render(dt);
    else this.renderer.render(this.scene, this.camera);
  };

  dispose(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this.resizeHandler);
    this.activeGame?.dispose();
    this.activeGame = null;
    this.post?.dispose();
    this.post = null;
    this.disposeEnv?.();
    this.disposeEnv = null;
    this.clearScene();
    this.renderer?.dispose();
    this.renderer = null;
  }
}
