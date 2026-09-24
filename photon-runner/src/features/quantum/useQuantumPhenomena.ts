import { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export function useQuantumPhenomena() {
  // Mode Selector: Scene 2 (Polarization Lab & Wave Mechanics) vs Scene 3 (Encoding & Decoding Logic)
  const [activeSceneMode, setActiveSceneMode] = useState<'scene2_polarization' | 'scene3_encoding'>('scene2_polarization');

  // Scene 2 & 3 State
  const [aliceBit, setAliceBit] = useState<0 | 1>(0);
  const [aliceBasis, setAliceBasis] = useState<'plus' | 'cross'>('plus');
  // 4 Polarizations: 0 (Vertical 0°), 1 (Horizontal 90°), 2 (Diag Left -45°), 3 (Diag Right 45°)
  const [alicePolarization, setAlicePolarization] = useState<0 | 1 | 2 | 3>(0);
  const [bobBasis, setBobBasis] = useState<'plus' | 'cross'>('plus');

  // Animation state
  const [isFiring, setIsFiring] = useState(false);
  const [photonProgress, setPhotonProgress] = useState(0); // 0 to 1
  const [measuredBit, setMeasuredBit] = useState<0 | 1 | null>(null);
  const [isMatch, setIsMatch] = useState(true);
  const [cameraPreset, setCameraPreset] = useState<'bench' | 'alice' | 'bob' | 'wave' | 'top'>('bench');
  const [showEMWave, setShowEMWave] = useState(true);
  const [eveEnabled, setEveEnabled] = useState(false);
  const [eveIntercepted, setEveIntercepted] = useState(false);

  /** What Eve actually did to this photon — surfaced so her attack is visible, not implied. */
  interface EveReport {
    eveBasis: 'plus' | 'cross';
    aliceBasis: 'plus' | 'cross';
    guessedRight: boolean;
    /** The bit Eve read out. Only trustworthy to her when she guessed the basis right. */
    measuredBit: 0 | 1;
    /** Polarization she re-emitted toward Bob. */
    resentPolarization: 0 | 1 | 2 | 3;
    disturbed: boolean;
  }
  const [eveReport, setEveReport] = useState<EveReport | null>(null);

  /**
   * Running dossier across every photon Eve has touched this session. A single
   * intercept says nothing; the whole point of BB84 is that the *statistics*
   * give her away, so she needs a scoreboard to be worth watching.
   */
  interface EveStats {
    intercepts: number;
    cleanReads: number;
    disturbed: number;
    /** Bits she can actually trust (right basis, sifted). */
    bitsLearned: number;
    /** Sifted photons Bob kept, and how many of those carry an error. */
    sifted: number;
    siftedErrors: number;
  }
  const EVE_STATS_ZERO: EveStats = {
    intercepts: 0,
    cleanReads: 0,
    disturbed: 0,
    bitsLearned: 0,
    sifted: 0,
    siftedErrors: 0,
  };
  const [eveStats, setEveStats] = useState<EveStats>(EVE_STATS_ZERO);

  // Batch Test Matrix for Scene 3
  const [batchResults, setBatchResults] = useState<
    Array<{
      id: number;
      aliceBit: number;
      aliceBasis: 'plus' | 'cross';
      pol: string;
      bobBasis: 'plus' | 'cross';
      measuredBit: number;
      matched: boolean;
      type: 'Deterministic' | 'Quantum Superposition Collapse';
    }>
  >([]);

  // Refs for WebGL Canvas
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  // 3D Objects
  const waveMeshRef = useRef<THREE.Line | null>(null);
  const photonParticleRef = useRef<THREE.Mesh | null>(null);
  const photonGlowRef = useRef<THREE.PointLight | null>(null);
  const aliceHwpRef = useRef<THREE.Group | null>(null);
  const bobFilterRef = useRef<THREE.Group | null>(null);
  const collapseCloudRef = useRef<THREE.Points | null>(null);
  const eveMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const eveEyeMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const eveLabelRef = useRef<THREE.Sprite | null>(null);
  const captureRingRef = useRef<THREE.Mesh | null>(null);
  const captureRingMatRef = useRef<THREE.MeshBasicMaterial | null>(null);
  /** { start, disturbed } while the just-crossed-Eve flash/ring is playing; null when idle. */
  const captureBurstRef = useRef<{ start: number; disturbed: boolean } | null>(null);
  /** So the crossing-Eve's-station detector fires exactly once per shot, not every frame. */
  const capturedThisShotRef = useRef(false);

  const getPolarizationFromBitAndBasis = (bit: 0 | 1, basis: 'plus' | 'cross'): 0 | 1 | 2 | 3 => {
    if (basis === 'plus') {
      return bit === 0 ? 0 : 1; // 0 = 0° (|), 1 = 90° (-)
    } else {
      return bit === 0 ? 2 : 3; // Bit 0 X = -45° (\), Bit 1 X = +45° (/)
    }
  };

  useEffect(() => {
    if (activeSceneMode === 'scene3_encoding') {
      setAlicePolarization(getPolarizationFromBitAndBasis(aliceBit, aliceBasis));
    }
  }, [aliceBit, aliceBasis, activeSceneMode]);

  const getAngleDegrees = (pol: 0 | 1 | 2 | 3): number => {
    switch (pol) {
      case 0:
        return 0; // Vertical |
      case 1:
        return 90; // Horizontal -
      case 2:
        return -45; // Diag Left \
      case 3:
        return 45; // Diag Right /
    }
  };

  const getPolarizationLabel = (pol: 0 | 1 | 2 | 3): string => {
    switch (pol) {
      case 0:
        return 'Vertical (0°) |';
      case 1:
        return 'Horizontal (90°) -';
      case 2:
        return 'Diagonal Left (-45°) \\';
      case 3:
        return 'Diagonal Right (+45°) /';
    }
  };

  const checkBasisMatch = (pol: 0 | 1 | 2 | 3, bBasis: 'plus' | 'cross'): boolean => {
    const isAlicePlus = pol === 0 || pol === 1;
    const isBobPlus = bBasis === 'plus';
    return isAlicePlus === isBobPlus;
  };

  /**
   * What a detector reads out of a photon. Measuring in the basis it was
   * prepared in returns its real bit; measuring in the other basis collapses
   * it to a coin flip.
   */
  const deriveBit = (pol: 0 | 1 | 2 | 3, measBasis: 'plus' | 'cross'): 0 | 1 => {
    const preparedPlus = pol === 0 || pol === 1;
    if (preparedPlus === (measBasis === 'plus')) return pol === 0 || pol === 2 ? 0 : 1;
    return Math.random() < 0.5 ? 0 : 1;
  };

  // Setup Three.js 3D WebGL Canvas
  useEffect(() => {
    if (!mountRef.current) return;

    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05010d);
    scene.fog = new THREE.FogExp2(0x05010d, 0.02);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    camera.position.set(0, 4, 12);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 + 0.1;
    controlsRef.current = controls;

    const ambientLight = new THREE.AmbientLight(0x1e293b, 2.0);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0x38bdf8, 1.2);
    dirLight1.position.set(5, 10, 7);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xc084fc, 0.8);
    dirLight2.position.set(-5, 5, -5);
    scene.add(dirLight2);

    const gridHelper = new THREE.GridHelper(24, 24, 0x38bdf8, 0x1e293b);
    gridHelper.position.y = -0.8;
    scene.add(gridHelper);

    // Alice Encoder Station (Left, X = -6)
    const aliceGroup = new THREE.Group();
    aliceGroup.position.set(-6, 0, 0);

    const benchMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.8, roughness: 0.2 });
    const pedGeo = new THREE.BoxGeometry(2.2, 0.6, 2.2);
    const alicePed = new THREE.Mesh(pedGeo, benchMat);
    alicePed.position.y = -0.5;
    aliceGroup.add(alicePed);

    const laserGeo = new THREE.CylinderGeometry(0.35, 0.45, 1.4, 16);
    laserGeo.rotateZ(Math.PI / 2);
    const laserMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, emissive: 0x0369a1, emissiveIntensity: 0.5 });
    const laserMesh = new THREE.Mesh(laserGeo, laserMat);
    laserMesh.position.set(-0.4, 0, 0);
    aliceGroup.add(laserMesh);

    const hwpMountGeo = new THREE.TorusGeometry(0.55, 0.08, 16, 32);
    const hwpMountMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.9, roughness: 0.1 });
    const hwpMount = new THREE.Mesh(hwpMountGeo, hwpMountMat);
    hwpMount.position.set(0.6, 0, 0);
    hwpMount.rotation.y = Math.PI / 2;

    const glassGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.05, 32);
    glassGeo.rotateZ(Math.PI / 2);
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      transmission: 0.9,
      opacity: 1,
      transparent: true,
      roughness: 0.05,
      ior: 1.5,
    });
    const hwpGlass = new THREE.Mesh(glassGeo, glassMat);
    hwpMount.add(hwpGlass);

    const aliceHwpGroup = new THREE.Group();
    aliceHwpGroup.add(hwpMount);
    aliceGroup.add(aliceHwpGroup);
    aliceHwpRef.current = aliceHwpGroup;

    scene.add(aliceGroup);

    // Bob Receiver Station & Polarizing Filter Plate (Right, X = +6)
    const bobGroup = new THREE.Group();
    bobGroup.position.set(6, 0, 0);

    const bobPed = new THREE.Mesh(pedGeo, benchMat);
    bobPed.position.y = -0.5;
    bobGroup.add(bobPed);

    const filterFrameGeo = new THREE.BoxGeometry(0.12, 1.8, 1.8);
    const filterFrameMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.8, roughness: 0.2 });
    const filterFrame = new THREE.Mesh(filterFrameGeo, filterFrameMat);

    const filterApertureGroup = new THREE.Group();
    filterApertureGroup.position.set(0.01, 0, 0);

    const slitMat = new THREE.MeshStandardMaterial({
      color: 0xc084fc,
      emissive: 0x9333ea,
      emissiveIntensity: 0.8,
      metalness: 0.5,
    });
    const slitVGeo = new THREE.BoxGeometry(0.08, 1.3, 0.15);
    const slitHGeo = new THREE.BoxGeometry(0.08, 0.15, 1.3);

    const slitVMesh = new THREE.Mesh(slitVGeo, slitMat);
    const slitHMesh = new THREE.Mesh(slitHGeo, slitMat);
    filterApertureGroup.add(slitVMesh);
    filterApertureGroup.add(slitHMesh);

    const apertureBadgeGeo = new THREE.TorusGeometry(0.5, 0.03, 16, 32);
    apertureBadgeGeo.rotateY(Math.PI / 2);
    const apertureBadgeMat = new THREE.MeshBasicMaterial({ color: 0xf43f5e });
    const apertureBadge = new THREE.Mesh(apertureBadgeGeo, apertureBadgeMat);
    filterApertureGroup.add(apertureBadge);

    filterFrame.add(filterApertureGroup);

    const bobFilterGroup = new THREE.Group();
    bobFilterGroup.add(filterFrame);
    bobGroup.add(bobFilterGroup);
    bobFilterRef.current = bobFilterGroup;

    const detectorD0Geo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const detectorD0Mat = new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x047857 });
    const detectorD0 = new THREE.Mesh(detectorD0Geo, detectorD0Mat);
    detectorD0.position.set(1.2, 0.5, 0);
    bobGroup.add(detectorD0);

    const detectorD1Geo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const detectorD1Mat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xb91c1c });
    const detectorD1 = new THREE.Mesh(detectorD1Geo, detectorD1Mat);
    detectorD1.position.set(1.2, -0.3, 0);
    bobGroup.add(detectorD1);

    scene.add(bobGroup);

    const railGeo = new THREE.CylinderGeometry(0.04, 0.04, 12, 16);
    railGeo.rotateZ(Math.PI / 2);
    const railMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.5, roughness: 0.5 });
    const railMesh = new THREE.Mesh(railGeo, railMat);
    railMesh.position.set(0, -0.1, 0);
    scene.add(railMesh);

    // Eve's Tap Station (Center, X = 0) — a rose eavesdropping node clamped
    // onto the fiber between Alice and Bob, visible whenever "Enable Eve" is on.
    const eveGroup = new THREE.Group();
    eveGroup.position.set(0, 0, 0);

    const eveMat = new THREE.MeshStandardMaterial({
      color: 0xf43f5e,
      emissive: 0xf43f5e,
      emissiveIntensity: 0.6,
      metalness: 0.6,
      roughness: 0.2,
    });
    eveMatRef.current = eveMat;

    const eveClamp = new THREE.Mesh(new THREE.OctahedronGeometry(0.42), eveMat);
    eveClamp.position.y = 0;
    eveGroup.add(eveClamp);

    const eveMast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 1.6, 8),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.7, roughness: 0.3 })
    );
    eveMast.position.set(0, 1.4, 0);
    eveGroup.add(eveMast);

    const eveEyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf43f5e, emissiveIntensity: 1.2 });
    eveEyeMatRef.current = eveEyeMat;
    const eveEye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 16), eveEyeMat);
    eveEye.position.set(0, 2.2, 0);
    eveGroup.add(eveEye);

    eveGroup.add(new THREE.PointLight(0xf43f5e, 1.2, 5));
    scene.add(eveGroup);

    // A quick expanding ring flashed at Eve's tap point the instant the photon
    // reaches her — the "she's grabbing this one" beat. Starts invisible
    // (opacity 0, scale 1); driven entirely by captureBurstRef in animate().
    const captureRingMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0 });
    captureRingMatRef.current = captureRingMat;
    const captureRing = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 32), captureRingMat);
    captureRing.position.set(0, 0, 0);
    captureRing.rotation.x = Math.PI / 2;
    scene.add(captureRing);
    captureRingRef.current = captureRing;

    // ---- Alice / Bob / Eve nameplates — small canvas-texture sprites so
    // each station reads at a glance instead of relying on the camera-preset
    // button labels alone.
    const makeLabel = (text: string, color: string): THREE.Sprite => {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 128;
      const ctx = canvas.getContext('2d')!;
      ctx.font = '700 64px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,.9)';
      ctx.shadowBlur = 16;
      ctx.fillStyle = color;
      ctx.fillText(text, canvas.width / 2, canvas.height / 2);
      const tex = new THREE.CanvasTexture(canvas);
      tex.anisotropy = 8;
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(2.6, 0.65, 1);
      return sprite;
    };

    const aliceLabel = makeLabel('ALICE', '#38bdf8');
    aliceLabel.position.set(-6, 3, 0);
    scene.add(aliceLabel);

    const bobLabel = makeLabel('BOB', '#10b981');
    bobLabel.position.set(6, 3, 0);
    scene.add(bobLabel);

    const eveLabel = makeLabel('EVE', '#f43f5e');
    eveLabel.position.set(0, 3.1, 0);
    (eveLabel.material as THREE.SpriteMaterial).opacity = 0.25; // dim until she's on the line
    scene.add(eveLabel);
    eveLabelRef.current = eveLabel;

    // Single Photon Particle as Elongated Rotating Oval (Electric Field Vector)
    const photonGroup = new THREE.Group();
    photonGroup.position.set(-5.4, 0, 0);

    const photonOvalGeo = new THREE.SphereGeometry(0.25, 32, 32);
    const photonOvalMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      emissive: 0xeab308,
      emissiveIntensity: 1.8,
      roughness: 0.1,
    });
    const photonOvalMesh = new THREE.Mesh(photonOvalGeo, photonOvalMat);
    photonOvalMesh.scale.set(0.4, 1.2, 0.4);
    photonGroup.add(photonOvalMesh);

    const vectorRingGeo = new THREE.TorusGeometry(0.35, 0.02, 16, 32);
    vectorRingGeo.rotateY(Math.PI / 2);
    const vectorRingMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const vectorRingMesh = new THREE.Mesh(vectorRingGeo, vectorRingMat);
    photonGroup.add(vectorRingMesh);

    const photonLight = new THREE.PointLight(0xfacc15, 3, 4);
    photonGroup.add(photonLight);
    photonGlowRef.current = photonLight;

    scene.add(photonGroup);
    photonParticleRef.current = photonGroup as unknown as THREE.Mesh;

    // Quantum Superposition Particle Swarm Cloud (Active during Basis Clash)
    const particleCount = 120;
    const cloudGeo = new THREE.BufferGeometry();
    const cloudPositions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      cloudPositions[i * 3] = (Math.random() - 0.5) * 1.5;
      cloudPositions[i * 3 + 1] = (Math.random() - 0.5) * 1.5;
      cloudPositions[i * 3 + 2] = (Math.random() - 0.5) * 1.5;
    }
    cloudGeo.setAttribute('position', new THREE.BufferAttribute(cloudPositions, 3));
    const cloudMat = new THREE.PointsMaterial({
      color: 0xc084fc,
      size: 0.08,
      transparent: true,
      opacity: 0,
    });
    const collapseCloud = new THREE.Points(cloudGeo, cloudMat);
    collapseCloud.position.set(6, 0, 0);
    scene.add(collapseCloud);
    collapseCloudRef.current = collapseCloud;

    let animFrameId: number;
    const clock = new THREE.Clock();

    const CAPTURE_BURST_MS = 380;

    const animate = () => {
      animFrameId = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();

      if (collapseCloudRef.current && collapseCloudRef.current.material) {
        collapseCloudRef.current.rotation.y = elapsedTime * 1.5;
      }

      // Drive Eve's "she's grabbing this one" ring + eye flash purely off
      // captureBurstRef, set once per shot by the flight-progress loop below
      // the instant the photon reaches her tap point.
      const burst = captureBurstRef.current;
      if (burst) {
        // performance.now()-based, deliberately independent of `clock` (which
        // is relative to scene-mount time, not the capture timestamp below).
        const t = Math.min(1, (performance.now() - burst.start) / CAPTURE_BURST_MS);
        if (captureRingMatRef.current && captureRingRef.current) {
          captureRingMatRef.current.opacity = (1 - t) * 0.9;
          captureRingMatRef.current.color.set(burst.disturbed ? 0xf43f5e : 0xf59e0b);
          const scale = 1 + t * 2.2;
          captureRingRef.current.scale.set(scale, scale, scale);
        }
        if (eveEyeMatRef.current) {
          eveEyeMatRef.current.emissiveIntensity = 1.2 + (1 - t) * 3.5;
        }
        if (t >= 1) captureBurstRef.current = null;
      }

      controls.update();
      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!mountRef.current || !rendererRef.current || !cameraRef.current) return;
      const newW = mountRef.current.clientWidth;
      const newH = mountRef.current.clientHeight;
      cameraRef.current.aspect = newW / newH;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(newW, newH);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animFrameId);
      if (rendererRef.current && rendererRef.current.domElement) {
        rendererRef.current.domElement.remove();
      }
      rendererRef.current?.dispose();
    };
  }, []);

  // Update HWP, Photon Oval Orientation, and Bob Filter Rotations when Polarization or Basis changes
  useEffect(() => {
    const angleRad = (getAngleDegrees(alicePolarization) * Math.PI) / 180;

    if (aliceHwpRef.current) {
      aliceHwpRef.current.rotation.x = angleRad;
    }
    if (photonParticleRef.current) {
      photonParticleRef.current.rotation.x = angleRad;
    }
    if (bobFilterRef.current) {
      const bobAngleRad = (bobBasis === 'cross' ? 45 : 0) * (Math.PI / 180);
      bobFilterRef.current.rotation.x = bobAngleRad;
    }
  }, [alicePolarization, bobBasis]);

  // Eve's nameplate is dim while she's off the line, bright the instant she's tapped in.
  useEffect(() => {
    if (!eveLabelRef.current) return;
    (eveLabelRef.current.material as THREE.SpriteMaterial).opacity = eveEnabled ? 1 : 0.25;
  }, [eveEnabled]);

  // Update Camera View Preset
  useEffect(() => {
    if (!cameraRef.current || !controlsRef.current) return;

    if (cameraPreset === 'bench') {
      cameraRef.current.position.set(0, 4, 12);
      controlsRef.current.target.set(0, 0, 0);
    } else if (cameraPreset === 'alice') {
      cameraRef.current.position.set(-6, 2, 5);
      controlsRef.current.target.set(-5, 0, 0);
    } else if (cameraPreset === 'bob') {
      cameraRef.current.position.set(6, 2, 5);
      controlsRef.current.target.set(5, 0, 0);
    } else if (cameraPreset === 'wave') {
      cameraRef.current.position.set(0, 8, 0.1);
      controlsRef.current.target.set(0, 0, 0);
    } else if (cameraPreset === 'top') {
      cameraRef.current.position.set(0, 15, 0.01);
      controlsRef.current.target.set(0, 0, 0);
    }
  }, [cameraPreset]);

  // Dynamically build/update 3D Electromagnetic Wave Line Mesh
  useEffect(() => {
    if (!sceneRef.current) return;

    if (waveMeshRef.current) {
      sceneRef.current.remove(waveMeshRef.current);
      waveMeshRef.current.geometry.dispose();
      waveMeshRef.current = null;
    }

    if (!showEMWave) return;

    const pointsCount = 200;
    const startX = -5.4;
    const endX = 5.5;
    const points: THREE.Vector3[] = [];
    const angleRad = (getAngleDegrees(alicePolarization) * Math.PI) / 180;

    for (let i = 0; i < pointsCount; i++) {
      const t = i / (pointsCount - 1);
      const x = THREE.MathUtils.lerp(startX, endX, t);
      const amplitude = 0.6 * Math.sin((x + 6) * 3);
      const y = amplitude * Math.cos(angleRad);
      const z = amplitude * Math.sin(angleRad);
      points.push(new THREE.Vector3(x, y, z));
    }

    const waveGeo = new THREE.BufferGeometry().setFromPoints(points);
    const waveMat = new THREE.LineBasicMaterial({
      color: aliceBasis === 'plus' ? 0x38bdf8 : 0xc084fc,
      transparent: true,
      opacity: 0.8,
    });

    const waveLine = new THREE.Line(waveGeo, waveMat);
    sceneRef.current.add(waveLine);
    waveMeshRef.current = waveLine;
  }, [alicePolarization, aliceBasis, showEMWave]);

  const handleFirePhoton = () => {
    if (isFiring) return;

    setIsFiring(true);
    setPhotonProgress(0);
    setMeasuredBit(null);
    setEveIntercepted(false);
    capturedThisShotRef.current = false;

    // If Eve is enabled, she measures the photon at her tap point (X = 0) in
    // a random basis. Guessing Alice's basis right: she learns the bit and
    // resends it unchanged, invisible to Bob. Guessing wrong: her measurement
    // collapses the photon and she resends it re-encoded in HER basis — a
    // random bit within a possibly different polarization, exactly the
    // disturbance that lets Alice & Bob detect eavesdropping via QBER.
    let effectivePolarization = alicePolarization;
    let intercepted = false;
    if (eveEnabled) {
      const eveIsPlus = Math.random() < 0.5;
      const aliceIsPlus = alicePolarization === 0 || alicePolarization === 1;
      const guessedRight = eveIsPlus === aliceIsPlus;

      // Right basis: she reads Alice's real bit and resends it untouched.
      // Wrong basis: her measurement collapses the state to a coin flip in HER
      // basis, and that is what continues to Bob — the detectable disturbance.
      let measuredBit: 0 | 1;
      if (guessedRight) {
        measuredBit = alicePolarization === 0 || alicePolarization === 2 ? 0 : 1;
      } else {
        intercepted = true;
        measuredBit = Math.random() < 0.5 ? 0 : 1;
        effectivePolarization = eveIsPlus ? (measuredBit === 0 ? 0 : 1) : measuredBit === 0 ? 2 : 3;
      }

      setEveReport({
        eveBasis: eveIsPlus ? 'plus' : 'cross',
        aliceBasis: aliceIsPlus ? 'plus' : 'cross',
        guessedRight,
        measuredBit,
        resentPolarization: effectivePolarization,
        disturbed: intercepted,
      });
    } else {
      setEveReport(null);
    }
    setEveIntercepted(intercepted);

    const matched = checkBasisMatch(effectivePolarization, bobBasis);
    setIsMatch(matched);

    if (eveEnabled) {
      // Bob keeps this photon only when his basis matches what Alice actually
      // sent — that sifted subset is where an error becomes evidence.
      const aliceIsPlus = alicePolarization === 0 || alicePolarization === 1;
      const bobKeeps = (bobBasis === 'plus') === aliceIsPlus;
      const aliceBit: 0 | 1 = alicePolarization === 0 || alicePolarization === 2 ? 0 : 1;
      const bobBit = deriveBit(effectivePolarization, bobBasis);
      setEveStats((s) => ({
        intercepts: s.intercepts + 1,
        cleanReads: s.cleanReads + (intercepted ? 0 : 1),
        disturbed: s.disturbed + (intercepted ? 1 : 0),
        // She only trusts a bit when she guessed the basis right AND it survives sifting.
        bitsLearned: s.bitsLearned + (!intercepted && bobKeeps ? 1 : 0),
        sifted: s.sifted + (bobKeeps ? 1 : 0),
        siftedErrors: s.siftedErrors + (bobKeeps && bobBit !== aliceBit ? 1 : 0),
      }));
    }

    const startTime = Date.now();
    const duration = 2200;

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      setPhotonProgress(progress);

      if (photonParticleRef.current) {
        const currentX = THREE.MathUtils.lerp(-5.4, 5.5, progress);
        photonParticleRef.current.position.x = currentX;

        // The instant the photon reaches Eve's tap point (X=0), flash the
        // capture ring + her eye once — this is the "watch her take it"
        // moment the dossier/report panels describe in numbers.
        if (eveEnabled && !capturedThisShotRef.current && currentX >= 0) {
          capturedThisShotRef.current = true;
          captureBurstRef.current = { start: performance.now(), disturbed: intercepted };
        }

        // Before Eve's station (X < 0) the photon shows Alice's true state;
        // after it, whatever Eve actually resent (unchanged if she guessed
        // right, disturbed if she guessed wrong).
        const displayPolarization = currentX > 0 ? effectivePolarization : alicePolarization;
        const baseAngleRad = (getAngleDegrees(displayPolarization) * Math.PI) / 180;

        if (!matched && currentX > 4.5) {
          if (collapseCloudRef.current) {
            (collapseCloudRef.current.material as THREE.PointsMaterial).opacity = 0.95;
          }
          photonParticleRef.current.rotation.x += 0.25;
        } else {
          if (collapseCloudRef.current) {
            (collapseCloudRef.current.material as THREE.PointsMaterial).opacity = 0;
          }
          photonParticleRef.current.rotation.x = baseAngleRad;
        }
      }

      if (eveMatRef.current) {
        eveMatRef.current.emissiveIntensity = eveEnabled
          ? 0.6 + (intercepted ? Math.sin(progress * Math.PI) * 1.8 : Math.sin(progress * Math.PI) * 0.4)
          : 0.6;
      }

      if (progress >= 1) {
        clearInterval(interval);
        setIsFiring(false);

        let outcomeBit: 0 | 1;
        if (matched) {
          outcomeBit = effectivePolarization === 0 || effectivePolarization === 3 ? 0 : 1;
        } else {
          outcomeBit = Math.random() < 0.5 ? 0 : 1;
        }

        setMeasuredBit(outcomeBit);

        if (collapseCloudRef.current) {
          (collapseCloudRef.current.material as THREE.PointsMaterial).opacity = 0;
        }
        if (eveMatRef.current) eveMatRef.current.emissiveIntensity = 0.6;

        if (activeSceneMode === 'scene3_encoding') {
          setBatchResults((prev) => [
            {
              id: prev.length + 1,
              aliceBit,
              aliceBasis,
              pol: getPolarizationLabel(alicePolarization),
              bobBasis,
              measuredBit: outcomeBit,
              matched,
              type: matched ? 'Deterministic' : 'Quantum Superposition Collapse',
            },
            ...prev.slice(0, 14),
          ]);
        }
      }
    }, 30);
  };

  return {
    activeSceneMode,
    setActiveSceneMode,
    aliceBit,
    setAliceBit,
    aliceBasis,
    setAliceBasis,
    alicePolarization,
    setAlicePolarization,
    bobBasis,
    setBobBasis,
    isFiring,
    photonProgress,
    measuredBit,
    isMatch,
    cameraPreset,
    setCameraPreset,
    showEMWave,
    setShowEMWave,
    eveEnabled,
    setEveEnabled,
    eveReport,
    setEveReport,
    EVE_STATS_ZERO,
    eveStats,
    setEveStats,
    batchResults,
    setBatchResults,
    mountRef,
    getPolarizationLabel,
    checkBasisMatch,
    handleFirePhoton
  };
}
