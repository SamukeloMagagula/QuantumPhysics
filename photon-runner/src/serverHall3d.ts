import * as THREE from 'three';

export const HALL_BOUNDS = { minX: -5.7, maxX: 5.7, minZ: -6.7, maxZ: 6.7 };
export const HALL_SOLIDS = [
  { x: -4.3, z: 0, w: 1.5, d: 9.2 },
  { x: 4.3, z: 0, w: 1.5, d: 9.2 },
  { x: -2.5, z: -5.8, w: 4, d: 1.2 },
  { x: 2, z: -5.8, w: 2.4, d: 1.2 },
];
export function hallCanStand(x: number, z: number): boolean {
  const r = .3;
  return x >= HALL_BOUNDS.minX + r && x <= HALL_BOUNDS.maxX - r
    && z >= HALL_BOUNDS.minZ + r && z <= HALL_BOUNDS.maxZ - r
    && !HALL_SOLIDS.some(b => Math.abs(x - b.x) < b.w / 2 + r && Math.abs(z - b.z) < b.d / 2 + r);
}

/** Solid geometry inspired by the generated Server Hall illustration. */
export function buildServerHall(scene: THREE.Scene) {
  const materials: THREE.Material[] = [];
  const material = (color: number, metalness = 0, emissive = 0) => {
    const m = new THREE.MeshStandardMaterial({ color, metalness, roughness: .55, emissive, emissiveIntensity: .8 });
    materials.push(m); return m;
  };
  const wall = material(0xc7d0d8), floor = material(0x929ca6), steel = material(0x263342, .65);
  const dark = material(0x101924, .4), cyan = material(0x56caff, .2, 0x128ccd), green = material(0x74efa7, 0, 0x25a94d);
  const box = (x: number, y: number, z: number, w: number, h: number, d: number, m: THREE.Material, parent: THREE.Object3D = scene) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  box(0, -.12, 0, 12, .24, 14, floor);
  box(0, 1.8, -7, 12, 3.6, .2, wall);
  // Cutaway side walls keep the orbiting camera's view unobstructed.
  box(-6, .35, 0, .2, .7, 14, wall); box(6, .35, 0, .2, .7, 14, wall);
  const grid = new THREE.GridHelper(14, 28, 0x566473, 0x77838e); grid.scale.x = 12 / 14; grid.position.y = .008; scene.add(grid);
  const leds: THREE.Mesh[] = [];
  for (const x of [-4.3, 4.3]) {
    for (let i = 0; i < 6; i++) {
      const z = -3.75 + i * 1.5;
      box(x, 1.4, z, 1.5, 2.8, 1.45, dark);
      const front = x + (x < 0 ? .77 : -.77);
      for (let u = 0; u < 10; u++) {
        box(front, .25 + u * .245, z, .04, .20, 1.24, steel);
        for (let j = 0; j < 3; j++) leds.push(box(front + (x < 0 ? .025 : -.025), .28 + u * .245, z - .42 + j * .09, .025, .035, .04, j === 0 ? green : cyan));
      }
      box(x, 3.05, z, .45, .10, 1.5, steel);
      box(x, 3.12, z, .07, .035, 1.5, cyan);
    }
  }
  for (let i = 0; i < 4; i++) {
    box(-4 + i, 1.35, -5.8, .92, 2.7, 1.2, wall);
    for (let j = 0; j < 13; j++) box(-4 + i, .45 + j * .14, -5.18, .75, .045, .025, steel);
  }
  box(2, .85, -5.8, 2.4, .13, 1.2, steel);
  for (const x of [1, 3]) box(x, .42, -5.8, .12, .84, .9, steel);
  for (const x of [1.45, 2.55]) {
    box(x, 1.35, -6, .95, .60, .10, dark);
    box(x, 1.35, -5.94, .85, .49, .015, cyan);
    box(x, 1.02, -6, .08, .25, .08, steel);
    for (let i = 0; i < 5; i++) box(x - .32 + i * .14, 1.25 + i * .03, -5.925, .07, .12 + i * .055, .01, dark);
  }
  // Rear exit door and floor lighting.
  box(.25, 1.35, -6.86, 1.25, 2.7, .12, steel);
  for (const x of [-3.25, 3.25]) box(x, .012, 0, .035, .02, 10, cyan);
  const avatar = new THREE.Group(); scene.add(avatar);
  const suit = material(0x294868), skin = material(0xc99573);
  box(0, 1.0, 0, .45, .65, .28, suit, avatar);
  box(0, 1.54, 0, .30, .34, .30, skin, avatar);
  box(0, 1.7, 0, .32, .10, .32, dark, avatar);
  const legs = [-.13, .13].map(x => box(x, .36, 0, .17, .70, .22, dark, avatar));
  const arms = [-.31, .31].map(x => box(x, 1, 0, .13, .60, .18, suit, avatar));
  avatar.position.set(0, 0, 4.8);
  const hemi = new THREE.HemisphereLight(0xc4e7ff, 0x41495b, 2.4); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2df, 3); sun.position.set(-3, 10, 5); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -10; sun.shadow.camera.right = 10;
  sun.shadow.camera.top = 12; sun.shadow.camera.bottom = -12; sun.shadow.normalBias = .035; scene.add(sun);
  return { avatar, animate(time: number, walking: boolean) {
    legs.forEach((leg, i) => { leg.rotation.x = walking ? Math.sin(time * 9 + i * Math.PI) * .35 : 0; });
    arms.forEach((arm, i) => { arm.rotation.x = walking ? -Math.sin(time * 9 + i * Math.PI) * .25 : 0; });
    leds.forEach((led, i) => { led.visible = Math.sin(time * 2 + i * 3.7) > -.8; });
  }, dispose() {
    scene.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
    grid.geometry.dispose(); (grid.material as THREE.Material).dispose();
    materials.forEach(m => m.dispose()); sun.shadow.dispose();
  } };
}
