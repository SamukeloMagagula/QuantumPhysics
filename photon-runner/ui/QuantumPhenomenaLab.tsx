import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Zap, RefreshCw, Layers, Sparkles, Activity, Compass, Cpu, Send, Lock } from 'lucide-react';

/**
 * Ported near-verbatim from quantum-key-distribution-explorer's
 * QuantumPhenomenaScene2Scene3.tsx — it was fully self-contained (own
 * state, own Three.js scene, no dependency on the explorer's mode/role
 * system we deliberately did not port). Navigation out of this screen is
 * handled by the app's persistent top nav.
 */
export function QuantumPhenomenaLab() {
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

    const eveEye = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf43f5e, emissiveIntensity: 1.2 })
    );
    eveEye.position.set(0, 2.2, 0);
    eveGroup.add(eveEye);

    eveGroup.add(new THREE.PointLight(0xf43f5e, 1.2, 5));
    scene.add(eveGroup);

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

    const animate = () => {
      animFrameId = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();

      if (collapseCloudRef.current && collapseCloudRef.current.material) {
        collapseCloudRef.current.rotation.y = elapsedTime * 1.5;
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

  return (
    <div className="min-h-full w-full max-w-7xl mx-auto p-4 md:p-6 space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900/90 border border-cyan-500/40 p-5 rounded-3xl backdrop-blur-md flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-2xl">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 bg-cyan-500/20 border border-cyan-500/50 rounded-lg text-xs font-mono font-bold text-cyan-400 uppercase">
              Quantum Phenomena 3D Simulator
            </span>
            <span className="text-slate-500">•</span>
            <span className="text-xs font-mono text-slate-400">BB84 Physical Hardware Protocol</span>
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-white mt-1.5 flex items-center gap-2">
            <Sparkles className="text-yellow-400" size={24} />
            {activeSceneMode === 'scene2_polarization'
              ? 'Scene 2: Single-Photon Polarization & Superposition Lab'
              : 'Scene 3: Quantum Encoding & Measurement Logic Matrix'}
          </h1>
        </div>

        <div className="flex gap-2 bg-slate-950 p-1.5 rounded-2xl border border-slate-800 font-mono text-xs">
          <button
            onClick={() => setActiveSceneMode('scene2_polarization')}
            className={`px-4 py-2 rounded-xl font-bold transition-all flex items-center gap-2 ${
              activeSceneMode === 'scene2_polarization'
                ? 'bg-cyan-600 text-slate-950 shadow-lg shadow-cyan-900/40'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Compass size={15} /> Scene 2: Polarization Lab
          </button>
          <button
            onClick={() => setActiveSceneMode('scene3_encoding')}
            className={`px-4 py-2 rounded-xl font-bold transition-all flex items-center gap-2 ${
              activeSceneMode === 'scene3_encoding'
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/40'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Cpu size={15} /> Scene 3: Encoding & Decoding
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 h-[420px] relative rounded-3xl overflow-hidden border border-slate-800 shadow-2xl bg-slate-950">
          <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

          <div className="absolute top-4 left-4 flex flex-wrap gap-2 z-10">
            <button
              onClick={() => setCameraPreset('bench')}
              className={`px-3 py-1.5 rounded-full border text-xs font-mono font-bold transition-all ${
                cameraPreset === 'bench' ? 'bg-cyan-500 text-slate-950 border-cyan-400' : 'bg-slate-900/80 text-slate-300 border-slate-700'
              }`}
            >
              Full Bench View
            </button>
            <button
              onClick={() => setCameraPreset('alice')}
              className={`px-3 py-1.5 rounded-full border text-xs font-mono font-bold transition-all ${
                cameraPreset === 'alice' ? 'bg-cyan-500 text-slate-950 border-cyan-400' : 'bg-slate-900/80 text-slate-300 border-slate-700'
              }`}
            >
              Alice Station
            </button>
            <button
              onClick={() => setCameraPreset('bob')}
              className={`px-3 py-1.5 rounded-full border text-xs font-mono font-bold transition-all ${
                cameraPreset === 'bob' ? 'bg-cyan-500 text-slate-950 border-cyan-400' : 'bg-slate-900/80 text-slate-300 border-slate-700'
              }`}
            >
              Bob Station
            </button>
            <button
              onClick={() => setCameraPreset('top')}
              className={`px-3 py-1.5 rounded-full border text-xs font-mono font-bold transition-all ${
                cameraPreset === 'top' ? 'bg-purple-500 text-slate-950 border-purple-400' : 'bg-slate-900/80 text-slate-300 border-slate-700'
              }`}
            >
              Top View (Overhead)
            </button>
            <button
              onClick={() => setShowEMWave(!showEMWave)}
              className={`px-3 py-1.5 rounded-full border text-xs font-mono font-bold transition-all ${
                showEMWave ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50' : 'bg-slate-900/80 text-slate-500 border-slate-800'
              }`}
            >
              {showEMWave ? 'EM Wave Vector ON' : 'EM Wave OFF'}
            </button>
            <button
              onClick={() => {
                setEveEnabled(!eveEnabled);
                setEveStats(EVE_STATS_ZERO);
                setEveReport(null);
              }}
              className={`px-3 py-1.5 rounded-full border text-xs font-mono font-bold transition-all ${
                eveEnabled ? 'bg-rose-500/20 text-rose-300 border-rose-500/50' : 'bg-slate-900/80 text-slate-500 border-slate-800'
              }`}
            >
              {eveEnabled ? 'Eve tap ACTIVE' : 'Put Eve on the line'}
            </button>
          </div>

          {eveEnabled && <EveDossier stats={eveStats} onReset={() => setEveStats(EVE_STATS_ZERO)} />}

          <div className="absolute bottom-4 left-4 right-4 bg-slate-900/90 border border-slate-800/80 backdrop-blur-md p-3 rounded-2xl flex items-center justify-between font-mono text-xs text-slate-300">
            <div className="flex items-center gap-2">
              <Activity className="text-cyan-400 animate-pulse" size={16} />
              <span>
                PHOTON PROGRESS: <strong>{(photonProgress * 100).toFixed(0)}%</strong>
              </span>
            </div>

            <div className="flex items-center gap-3">
              <span>
                STATE: <strong className="text-yellow-400">{getPolarizationLabel(alicePolarization)}</strong>
              </span>
              <span>
                FILTER: <strong className="text-purple-400">{bobBasis === 'plus' ? 'Rectilinear (+)' : 'Diagonal (X)'}</strong>
              </span>
            </div>
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-3xl backdrop-blur-md flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <div className="text-xs font-mono font-bold text-slate-400 uppercase tracking-widest flex items-center justify-between border-b border-slate-800 pb-2">
              <span>Quantum Controls & Physics</span>
              <span className="text-cyan-400">{activeSceneMode === 'scene2_polarization' ? 'Scene 2' : 'Scene 3'}</span>
            </div>

            {activeSceneMode === 'scene2_polarization' ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-mono font-bold text-cyan-400">1. Select Alice Polarization State:</label>
                  <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                    <button
                      onClick={() => setAlicePolarization(0)}
                      className={`p-2.5 rounded-xl border font-bold transition-all text-left flex items-center justify-between ${
                        alicePolarization === 0 ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400' : 'bg-slate-950 text-slate-400 border-slate-800'
                      }`}
                    >
                      <span>Vertical 0°</span>
                      <span className="text-lg">|</span>
                    </button>
                    <button
                      onClick={() => setAlicePolarization(1)}
                      className={`p-2.5 rounded-xl border font-bold transition-all text-left flex items-center justify-between ${
                        alicePolarization === 1 ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400' : 'bg-slate-950 text-slate-400 border-slate-800'
                      }`}
                    >
                      <span>Horizontal 90°</span>
                      <span className="text-lg">-</span>
                    </button>
                    <button
                      onClick={() => setAlicePolarization(2)}
                      className={`p-2.5 rounded-xl border font-bold transition-all text-left flex items-center justify-between ${
                        alicePolarization === 2 ? 'bg-purple-500/20 text-purple-300 border-purple-400' : 'bg-slate-950 text-slate-400 border-slate-800'
                      }`}
                    >
                      <span>Diag Left -45°</span>
                      <span className="text-lg">\</span>
                    </button>
                    <button
                      onClick={() => setAlicePolarization(3)}
                      className={`p-2.5 rounded-xl border font-bold transition-all text-left flex items-center justify-between ${
                        alicePolarization === 3 ? 'bg-purple-500/20 text-purple-300 border-purple-400' : 'bg-slate-950 text-slate-400 border-slate-800'
                      }`}
                    >
                      <span>Diag Right +45°</span>
                      <span className="text-lg">/</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-mono font-bold text-emerald-400">2. Select Bob Measurement Filter:</label>
                  <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                    <button
                      onClick={() => setBobBasis('plus')}
                      className={`p-3 rounded-xl border font-bold transition-all text-center ${
                        bobBasis === 'plus' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400' : 'bg-slate-950 text-slate-400 border-slate-800'
                      }`}
                    >
                      Rectilinear (+)
                    </button>
                    <button
                      onClick={() => setBobBasis('cross')}
                      className={`p-3 rounded-xl border font-bold transition-all text-center ${
                        bobBasis === 'cross' ? 'bg-purple-500/20 text-purple-300 border-purple-400' : 'bg-slate-950 text-slate-400 border-slate-800'
                      }`}
                    >
                      Diagonal (X)
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-3 bg-slate-950/90 rounded-2xl border border-cyan-500/30 space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-mono font-bold text-cyan-400 border-b border-slate-800 pb-1.5">
                    <span className="flex items-center gap-1.5">
                      <Send size={13} /> ALICE ENCODING SECTION (TRANSMITTER)
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 bg-cyan-950 text-cyan-300 rounded border border-cyan-800">STEP 1</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                    <div className="p-2 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
                      <span className="text-[10px] text-slate-400 uppercase font-bold">Alice Bit Choice</span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => setAliceBit(0)}
                          className={`flex-1 py-1.5 rounded-lg font-bold transition-all ${
                            aliceBit === 0 ? 'bg-cyan-500 text-slate-950 shadow-md' : 'bg-slate-950 text-slate-400'
                          }`}
                        >
                          Bit 0
                        </button>
                        <button
                          onClick={() => setAliceBit(1)}
                          className={`flex-1 py-1.5 rounded-lg font-bold transition-all ${
                            aliceBit === 1 ? 'bg-cyan-500 text-slate-950 shadow-md' : 'bg-slate-950 text-slate-400'
                          }`}
                        >
                          Bit 1
                        </button>
                      </div>
                    </div>

                    <div className="p-2 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
                      <span className="text-[10px] text-slate-400 uppercase font-bold">Alice Encoding Basis</span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => setAliceBasis('plus')}
                          className={`flex-1 py-1.5 rounded-lg font-bold transition-all ${
                            aliceBasis === 'plus' ? 'bg-cyan-500 text-slate-950 shadow-md' : 'bg-slate-950 text-slate-400'
                          }`}
                        >
                          + (Rect)
                        </button>
                        <button
                          onClick={() => setAliceBasis('cross')}
                          className={`flex-1 py-1.5 rounded-lg font-bold transition-all ${
                            aliceBasis === 'cross' ? 'bg-purple-500 text-white shadow-md' : 'bg-slate-950 text-slate-400'
                          }`}
                        >
                          X (Diag)
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="p-2 bg-slate-900 rounded-xl border border-slate-800 font-mono text-xs flex justify-between items-center text-slate-300">
                    <span className="text-[11px]">Encoded Photon State:</span>
                    <strong className="text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded border border-yellow-400/30">
                      {getPolarizationLabel(alicePolarization)}
                    </strong>
                  </div>
                </div>

                <div className="p-3 bg-slate-950/90 rounded-2xl border border-purple-500/30 space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-mono font-bold text-purple-400 border-b border-slate-800 pb-1.5">
                    <span className="flex items-center gap-1.5">
                      <Lock size={13} /> BOB DECODING SECTION (RECEIVER)
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 bg-purple-950 text-purple-300 rounded border border-purple-800">STEP 2</span>
                  </div>

                  <div className="space-y-1.5 font-mono text-xs">
                    <span className="text-[10px] text-slate-400 uppercase font-bold">Bob Aperture Filter Basis</span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setBobBasis('plus')}
                        className={`p-2 rounded-xl border font-bold transition-all text-center ${
                          bobBasis === 'plus' ? 'bg-purple-500/20 text-purple-300 border-purple-400 shadow-md' : 'bg-slate-900 text-slate-400 border-slate-800'
                        }`}
                      >
                        Rectilinear (+) Slit
                      </button>
                      <button
                        onClick={() => setBobBasis('cross')}
                        className={`p-2 rounded-xl border font-bold transition-all text-center ${
                          bobBasis === 'cross' ? 'bg-purple-500/20 text-purple-300 border-purple-400 shadow-md' : 'bg-slate-900 text-slate-400 border-slate-800'
                        }`}
                      >
                        Diagonal (X) Slit
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={handleFirePhoton}
              disabled={isFiring}
              className={`w-full py-3.5 rounded-2xl font-mono font-bold text-sm transition-all shadow-xl flex items-center justify-center gap-2 ${
                isFiring
                  ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                  : 'bg-gradient-to-r from-yellow-500 via-amber-400 to-emerald-400 text-slate-950 hover:brightness-110 shadow-amber-950/40'
              }`}
            >
              {isFiring ? <RefreshCw className="animate-spin" size={18} /> : <Zap size={18} />}
              {isFiring ? 'Emitting Quantum Photon...' : 'Fire Single Quantum Photon'}
            </button>
          </div>

          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2 font-mono text-xs">
            <div className="flex justify-between items-center text-slate-400">
              <span>MEASUREMENT RESULT:</span>
              <span className={`font-bold ${isMatch ? 'text-emerald-400' : 'text-amber-400'}`}>
                {isMatch ? 'DETERMINISTIC PASS' : 'PHYSICAL COLLISION (SUPERPOSITION)'}
              </span>
            </div>

            {measuredBit !== null ? (
              <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-1">
                <div className="flex justify-between items-center text-sm font-bold">
                  <span className="text-slate-200">Bob Measured Bit:</span>
                  <span className="text-xl text-yellow-400 px-2 py-0.5 bg-yellow-400/10 rounded-lg border border-yellow-400/30">
                    {measuredBit}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed pt-1">
                  {isMatch
                    ? "100% Passage: The photon's spatial oval shape aligned perfectly with Bob's aperture slot (+ or X) and glided through cleanly!"
                    : "50% Superposition Collapse: The photon's oval orientation struck the solid frame of Bob's plate! It entered a quantum superposition state and collapsed randomly upon measurement."}
                </p>
                {eveEnabled && eveReport && <EveInterceptReport report={eveReport} />}
              </div>
            ) : (
              <div className="p-3 bg-slate-900/50 rounded-xl border border-dashed border-slate-800 text-center text-slate-500 text-[11px]">
                Click "Fire Single Quantum Photon" to test aperture alignment.
              </div>
            )}
          </div>

          <div className="p-3 bg-slate-950/80 rounded-2xl border border-slate-800/80 font-mono text-[11px] space-y-1.5 text-slate-400">
            <div className="text-cyan-400 font-bold uppercase tracking-wider text-[10px] flex items-center gap-1.5">
              <Sparkles size={12} /> Physical Geometry Mechanics
            </div>
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div className="p-1.5 bg-slate-900 rounded-lg border border-slate-800/80">
                <span className="text-yellow-400 font-bold">Photon Shape:</span>
                <p className="text-slate-300">
                  Elongated Oval rotating to match <strong className="text-white">| - / \</strong>
                </p>
              </div>
              <div className="p-1.5 bg-slate-900 rounded-lg border border-slate-800/80">
                <span className="text-purple-400 font-bold">Bob Aperture:</span>
                <p className="text-slate-300">
                  Physical cutout slot forming <strong className="text-white">+</strong> or <strong className="text-white">X</strong>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {activeSceneMode === 'scene3_encoding' && (
        <div className="bg-slate-900/90 border border-slate-800 p-6 rounded-3xl backdrop-blur-md space-y-4 animate-in fade-in">
          <div className="flex justify-between items-center border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-lg font-bold text-purple-300 flex items-center gap-2 font-sans">
                <Layers size={20} /> Scene 3: Quantum Encoding & Decoding Truth Matrix
              </h3>
              <p className="text-slate-400 text-xs font-mono mt-0.5">
                Bit + Alice Basis = Single Photon State → Bob Filter Basis → Measured Bit Outcome
              </p>
            </div>

            {batchResults.length > 0 && (
              <button
                onClick={() => setBatchResults([])}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-mono"
              >
                Clear Log
              </button>
            )}
          </div>

          <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-4">
            <div className="flex justify-between items-center text-xs font-mono">
              <span className="text-yellow-400 font-bold flex items-center gap-1.5">
                <Zap size={14} /> INTERACTIVE LINKING CONNECTIONS
              </span>
              <span className="text-slate-400 text-[11px]">Click buttons to re-route quantum path</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative font-mono text-xs">
              <svg className="hidden md:block absolute inset-0 w-full h-full pointer-events-none z-0">
                <defs>
                  <linearGradient id="linkGradMatch" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#eab308" />
                    <stop offset="50%" stopColor="#38bdf8" />
                    <stop offset="100%" stopColor="#10b981" />
                  </linearGradient>
                  <linearGradient id="linkGradClash" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#eab308" />
                    <stop offset="50%" stopColor="#c084fc" />
                    <stop offset="100%" stopColor="#f59e0b" />
                  </linearGradient>
                </defs>
                <path
                  d="M 170 110 C 230 110, 250 110, 310 110"
                  stroke={checkBasisMatch(alicePolarization, bobBasis) ? 'url(#linkGradMatch)' : 'url(#linkGradClash)'}
                  strokeWidth="3"
                  fill="none"
                  strokeDasharray="6 4"
                  className="animate-pulse"
                />
                <path
                  d="M 450 110 C 510 110, 530 110, 590 110"
                  stroke={checkBasisMatch(alicePolarization, bobBasis) ? 'url(#linkGradMatch)' : 'url(#linkGradClash)'}
                  strokeWidth="3"
                  fill="none"
                  strokeDasharray="6 4"
                  className="animate-pulse"
                />
              </svg>

              <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-2 z-10">
                <div className="text-cyan-400 font-bold border-b border-slate-800 pb-1 flex justify-between">
                  <span>1. ALICE PHOTON</span>
                  <span className="text-yellow-400">STATE</span>
                </div>
                <div className="space-y-1.5">
                  <button
                    onClick={() => {
                      setAliceBit(0);
                      setAliceBasis('plus');
                    }}
                    className={`w-full p-2 rounded-lg border flex items-center justify-between transition-all ${
                      alicePolarization === 0 ? 'bg-yellow-400/20 text-yellow-300 border-yellow-400 font-bold shadow-md' : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    <span>Vertical | (0°)</span>
                    <span className="px-1.5 py-0.5 bg-slate-800 rounded text-[10px]">Bit 0 +</span>
                  </button>
                  <button
                    onClick={() => {
                      setAliceBit(1);
                      setAliceBasis('plus');
                    }}
                    className={`w-full p-2 rounded-lg border flex items-center justify-between transition-all ${
                      alicePolarization === 1 ? 'bg-yellow-400/20 text-yellow-300 border-yellow-400 font-bold shadow-md' : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    <span>Horizontal - (90°)</span>
                    <span className="px-1.5 py-0.5 bg-slate-800 rounded text-[10px]">Bit 1 +</span>
                  </button>
                  <button
                    onClick={() => {
                      setAliceBit(0);
                      setAliceBasis('cross');
                    }}
                    className={`w-full p-2 rounded-lg border flex items-center justify-between transition-all ${
                      alicePolarization === 2 ? 'bg-yellow-400/20 text-yellow-300 border-yellow-400 font-bold shadow-md' : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    <span>Diag Left \ (-45°)</span>
                    <span className="px-1.5 py-0.5 bg-slate-800 rounded text-[10px]">Bit 0 X</span>
                  </button>
                  <button
                    onClick={() => {
                      setAliceBit(1);
                      setAliceBasis('cross');
                    }}
                    className={`w-full p-2 rounded-lg border flex items-center justify-between transition-all ${
                      alicePolarization === 3 ? 'bg-yellow-400/20 text-yellow-300 border-yellow-400 font-bold shadow-md' : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    <span>Diag Right / (+45°)</span>
                    <span className="px-1.5 py-0.5 bg-slate-800 rounded text-[10px]">Bit 1 X</span>
                  </button>
                </div>
              </div>

              <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-2 z-10">
                <div className="text-purple-400 font-bold border-b border-slate-800 pb-1 flex justify-between">
                  <span>2. BOB FILTER</span>
                  <span className="text-purple-300">APERTURE</span>
                </div>
                <div className="space-y-2 pt-2">
                  <button
                    onClick={() => setBobBasis('plus')}
                    className={`w-full p-3.5 rounded-xl border text-center transition-all ${
                      bobBasis === 'plus' ? 'bg-purple-500/20 text-purple-300 border-purple-400 font-bold shadow-md' : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    <div className="text-sm font-bold">Rectilinear (+)</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Vertical | & Horizontal - Slits</div>
                  </button>

                  <button
                    onClick={() => setBobBasis('cross')}
                    className={`w-full p-3.5 rounded-xl border text-center transition-all ${
                      bobBasis === 'cross' ? 'bg-purple-500/20 text-purple-300 border-purple-400 font-bold shadow-md' : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    <div className="text-sm font-bold">Diagonal (X)</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Diagonal \ & / Slits</div>
                  </button>
                </div>
              </div>

              <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-3 z-10 flex flex-col justify-between">
                <div>
                  <div className="text-emerald-400 font-bold border-b border-slate-800 pb-1 flex justify-between">
                    <span>3. DECODED OUTCOME</span>
                    <span className="text-emerald-300">RESULT</span>
                  </div>

                  <div className="mt-3 p-3 bg-slate-950 rounded-xl border border-slate-800 text-center space-y-2">
                    <div className="flex justify-center items-center gap-2">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg border ${
                          checkBasisMatch(alicePolarization, bobBasis)
                            ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 shadow-lg shadow-emerald-950/50'
                            : 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-lg shadow-amber-950/50'
                        }`}
                      >
                        {measuredBit !== null ? measuredBit : aliceBit}
                      </div>
                    </div>

                    <div className="text-[11px] font-bold">
                      {checkBasisMatch(alicePolarization, bobBasis) ? (
                        <span className="text-emerald-400">100% Certain (Bases Matched)</span>
                      ) : (
                        <span className="text-amber-400">50% Random (Bases Clash)</span>
                      )}
                    </div>

                    <p className="text-[10px] text-slate-400 leading-tight">
                      {checkBasisMatch(alicePolarization, bobBasis)
                        ? 'Deterministic photon passage through aligned slit geometry.'
                        : 'Photon enters quantum superposition & collapses randomly upon detection.'}
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleFirePhoton}
                  disabled={isFiring}
                  className="w-full py-2 bg-gradient-to-r from-yellow-500 to-emerald-400 text-slate-950 rounded-lg font-bold text-xs hover:brightness-110"
                >
                  Simulate Link Photon
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between text-slate-400 font-bold border-b border-slate-800 pb-1 text-[11px] uppercase tracking-wider">
              <span>TRUTH MATRIX BY TRANSMITTER & RECEIVER BASES</span>
              <span className="text-cyan-400">ALICE ENCODING ↔ BOB DECODING</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-950 p-4 rounded-2xl border border-cyan-500/30 space-y-2">
                <div className="text-cyan-400 font-bold border-b border-slate-800 pb-1.5 flex justify-between items-center">
                  <span className="flex items-center gap-1.5">
                    <Send size={13} /> ALICE SECTION: RECTILINEAR (+) ENCODING
                  </span>
                  <span className="text-[10px] bg-cyan-950 px-1.5 py-0.5 rounded border border-cyan-800 text-cyan-300">BASIS 0</span>
                </div>
                <div className="space-y-1.5 text-slate-300">
                  <div className="flex justify-between items-center p-2 bg-slate-900/80 rounded-lg border border-slate-800">
                    <div>
                      <strong className="text-white font-bold">Bit 0 (+)</strong> → Vertical 0° (<span className="text-yellow-400">|</span>)
                    </div>
                    <span className="text-emerald-400 font-bold text-[11px] bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800">
                      Bob (+) → Bit 0 (100% Pass)
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-slate-900/80 rounded-lg border border-slate-800">
                    <div>
                      <strong className="text-white font-bold">Bit 1 (+)</strong> → Horizontal 90° (<span className="text-yellow-400">-</span>)
                    </div>
                    <span className="text-emerald-400 font-bold text-[11px] bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800">
                      Bob (+) → Bit 1 (100% Pass)
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-amber-950/20 border border-amber-500/30 rounded-lg text-amber-300">
                    <div className="text-[11px]">
                      Any Bit (+) vs <strong className="text-purple-300 font-bold">Bob Diagonal (X)</strong>
                    </div>
                    <span className="font-bold text-[10px] bg-amber-900/40 px-2 py-0.5 rounded border border-amber-600/50">
                      50/50 Superposition Collapse
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-950 p-4 rounded-2xl border border-purple-500/30 space-y-2">
                <div className="text-purple-400 font-bold border-b border-slate-800 pb-1.5 flex justify-between items-center">
                  <span className="flex items-center gap-1.5">
                    <Send size={13} /> ALICE SECTION: DIAGONAL (X) ENCODING
                  </span>
                  <span className="text-[10px] bg-purple-950 px-1.5 py-0.5 rounded border border-purple-800 text-purple-300">BASIS 1</span>
                </div>
                <div className="space-y-1.5 text-slate-300">
                  <div className="flex justify-between items-center p-2 bg-slate-900/80 rounded-lg border border-slate-800">
                    <div>
                      <strong className="text-white font-bold">Bit 0 (X)</strong> → Diag Left -45° (<span className="text-yellow-400">\</span>)
                    </div>
                    <span className="text-emerald-400 font-bold text-[11px] bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800">
                      Bob (X) → Bit 0 (100% Pass)
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-slate-900/80 rounded-lg border border-slate-800">
                    <div>
                      <strong className="text-white font-bold">Bit 1 (X)</strong> → Diag Right +45° (<span className="text-yellow-400">/</span>)
                    </div>
                    <span className="text-emerald-400 font-bold text-[11px] bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800">
                      Bob (X) → Bit 1 (100% Pass)
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-amber-950/20 border border-amber-500/30 rounded-lg text-amber-300">
                    <div className="text-[11px]">
                      Any Bit (X) vs <strong className="text-cyan-300 font-bold">Bob Rectilinear (+)</strong>
                    </div>
                    <span className="font-bold text-[10px] bg-amber-900/40 px-2 py-0.5 rounded border border-amber-600/50">
                      50/50 Superposition Collapse
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {batchResults.length > 0 && (
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 overflow-x-auto">
              <div className="text-xs font-mono font-bold text-slate-400 mb-2">LIVE EMISSION LOG HISTORY:</div>
              <table className="w-full text-left font-mono text-xs">
                <thead className="bg-slate-900 text-slate-400 uppercase">
                  <tr>
                    <th className="p-2">#</th>
                    <th className="p-2">Alice Bit</th>
                    <th className="p-2">Alice Basis</th>
                    <th className="p-2">Polarization State</th>
                    <th className="p-2">Bob Basis</th>
                    <th className="p-2">Measured Bit</th>
                    <th className="p-2">Match Status</th>
                    <th className="p-2">Quantum Phenomenon</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {batchResults.map((res) => (
                    <tr key={res.id} className="hover:bg-slate-900/50 transition-colors">
                      <td className="p-2 text-slate-500">#{res.id}</td>
                      <td className="p-2 font-bold text-cyan-400">{res.aliceBit}</td>
                      <td className="p-2 text-slate-300">{res.aliceBasis === 'plus' ? '+' : 'X'}</td>
                      <td className="p-2 text-yellow-400 font-bold">{res.pol}</td>
                      <td className="p-2 text-purple-400 font-bold">{res.bobBasis === 'plus' ? '+' : 'X'}</td>
                      <td className="p-2 font-bold text-emerald-400">{res.measuredBit}</td>
                      <td className="p-2">
                        {res.matched ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">MATCHED</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold">CLASH</span>
                        )}
                      </td>
                      <td className="p-2 text-slate-400">{res.type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const POL_GLYPH: Record<0 | 1 | 2 | 3, string> = { 0: '↕ 0°', 1: '↔ 90°', 2: '↘ -45°', 3: '↗ +45°' };
const BASIS_GLYPH = { plus: '⊕ rectilinear', cross: '⊗ diagonal' } as const;

/**
 * Eve's full attack readout for the photon just fired: which basis she guessed,
 * what she read, what she resent, and whether that left a trace. Without this
 * the eavesdropper is invisible — you only ever saw the downstream error.
 */
function EveInterceptReport({
  report,
}: {
  report: {
    eveBasis: 'plus' | 'cross';
    aliceBasis: 'plus' | 'cross';
    guessedRight: boolean;
    measuredBit: 0 | 1;
    resentPolarization: 0 | 1 | 2 | 3;
    disturbed: boolean;
  };
}) {
  const tone = report.disturbed
    ? { ring: 'border-rose-500/40', bg: 'bg-rose-500/5', text: 'text-rose-300', chip: 'bg-rose-500/15 text-rose-300 border-rose-500/30' }
    : { ring: 'border-amber-500/40', bg: 'bg-amber-500/5', text: 'text-amber-300', chip: 'bg-amber-500/15 text-amber-300 border-amber-500/30' };

  return (
    <div className={`mt-2 rounded-xl border ${tone.ring} ${tone.bg} p-3 space-y-2.5`}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-200">
          <span>🕵️</span> EVE INTERCEPT LOG
        </span>
        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-md border ${tone.chip}`}>
          {report.disturbed ? 'TRACE LEFT' : 'CLEAN READ'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-1.5 text-[10px]">
        <div className="rounded-lg bg-black/40 px-2 py-1.5">
          <div className="text-slate-500">Alice sent in</div>
          <div className="text-slate-200 font-bold">{BASIS_GLYPH[report.aliceBasis]}</div>
        </div>
        <div className="rounded-lg bg-black/40 px-2 py-1.5">
          <div className="text-slate-500">Eve guessed</div>
          <div className={`font-bold ${report.guessedRight ? 'text-emerald-300' : 'text-rose-300'}`}>
            {BASIS_GLYPH[report.eveBasis]}
          </div>
        </div>
        <div className="rounded-lg bg-black/40 px-2 py-1.5">
          <div className="text-slate-500">Eve read bit</div>
          <div className="text-slate-200 font-bold">
            {report.measuredBit}
            {!report.guessedRight && <span className="text-rose-400 font-normal"> (garbage)</span>}
          </div>
        </div>
        <div className="rounded-lg bg-black/40 px-2 py-1.5">
          <div className="text-slate-500">Resent to Bob</div>
          <div className="text-slate-200 font-bold">{POL_GLYPH[report.resentPolarization]}</div>
        </div>
      </div>

      <p className={`text-[10px] leading-relaxed ${tone.text}`}>
        {report.disturbed
          ? 'Wrong basis — measuring collapsed the photon, so what continued to Bob is a fresh random state, not what Alice sent. Alice and Bob will see this as an error when they compare a sample of their bits. That error rate is how Eve gets caught.'
          : 'Right basis — she recovered the real bit and forwarded an identical photon. This one is undetectable. She only gets away with it about half the time, which is why sampling enough bits still exposes her.'}
      </p>
    </div>
  );
}

/**
 * Eve's running dossier. A single intercept proves nothing — BB84's whole
 * argument is statistical, so this shows the numbers that actually decide
 * whether she gets away with it: how much key she truly holds, and how much
 * error she injected into the sifted bits Alice and Bob will compare.
 */
function EveDossier({
  stats,
  onReset,
}: {
  stats: {
    intercepts: number;
    cleanReads: number;
    disturbed: number;
    bitsLearned: number;
    sifted: number;
    siftedErrors: number;
  };
  onReset: () => void;
}) {
  const qber = stats.sifted ? stats.siftedErrors / stats.sifted : 0;
  const caught = stats.sifted >= 4 && qber > 0.11;
  const knowledge = stats.sifted ? stats.bitsLearned / stats.sifted : 0;

  const Stat = ({ label, value, tone }: { label: string; value: string; tone?: string }) => (
    <div className="rounded-lg bg-black/40 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-sm font-bold" style={{ color: tone ?? '#e2e8f0' }}>
        {value}
      </div>
    </div>
  );

  return (
    <div className="absolute top-16 right-4 w-56 rounded-2xl border border-rose-500/35 bg-slate-950/92 backdrop-blur-md p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-rose-300">EVE — LIVE DOSSIER</span>
        <button onClick={onReset} className="text-[9px] text-slate-500 hover:text-slate-300 underline">
          reset
        </button>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <Stat label="Tapped" value={String(stats.intercepts)} />
        <Stat label="Clean reads" value={String(stats.cleanReads)} tone="#4ade80" />
        <Stat label="Disturbed" value={String(stats.disturbed)} tone="#fb7185" />
        <Stat label="Key bits held" value={String(stats.bitsLearned)} tone="#fbbf24" />
      </div>

      <div>
        <div className="flex justify-between text-[9px] mb-1">
          <span className="text-slate-500">KEY SHE ACTUALLY KNOWS</span>
          <span className="text-amber-300 font-bold">{Math.round(knowledge * 100)}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-400 to-rose-500 transition-[width] duration-500"
            style={{ width: `${knowledge * 100}%` }}
          />
        </div>
      </div>

      <div>
        <div className="flex justify-between text-[9px] mb-1">
          <span className="text-slate-500">ERROR SHE INJECTED (QBER)</span>
          <span className={caught ? 'text-rose-400 font-bold' : 'text-slate-300 font-bold'}>
            {(qber * 100).toFixed(0)}%
          </span>
        </div>
        <div className="relative h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{
              width: `${Math.min(100, qber * 100)}%`,
              background: caught ? '#fb7185' : '#38bdf8',
            }}
          />
          {/* 11% is the classic BB84 abort threshold. */}
          <div className="absolute inset-y-0 w-px bg-white/60" style={{ left: '11%' }} />
        </div>
      </div>

      <p
        className="text-[10px] leading-relaxed"
        style={{ color: caught ? '#fb7185' : '#94a3b8' }}
      >
        {stats.sifted < 4
          ? 'Fire more photons — a few samples prove nothing either way.'
          : caught
            ? 'Above the 11% abort line. Alice and Bob would throw this key away and know they were tapped.'
            : 'Under the abort line so far. She is getting away with it — but every wrong-basis guess pushes this up.'}
      </p>
    </div>
  );
}
