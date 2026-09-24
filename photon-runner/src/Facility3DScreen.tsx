import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { build3DRoom, ROOM3D_IDS, ROOM3D_LABELS, type Facility3DRoomId } from './pqFacility3d';
import { Joystick } from './Joystick';

/**
 * A true 3D walkthrough of the facility, built from the `docs/3d-reference-v1`
 * reference sheets rather than the illustrated 2.5D rooms `PhantomQScene`
 * renders. Ten rooms, each proportioned to that room's own reference sheet
 * (real metres, real ceiling height); switching rooms rebuilds the scene
 * rather than trying to walk a continuous corridor the sheets don't define.
 */
export function Facility3DScreen({ onBack }: { onBack: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const move = useRef({ x: 0, z: 0 });
  const [room, setRoom] = useState<Facility3DRoomId>('ops');
  const [error, setError] = useState(false);

  useEffect(() => {
    const el = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      setError(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.setAttribute('aria-label', '3D facility. WASD to walk, drag to orbit, scroll to zoom.');

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xdfe4e8);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.minDistance = 3;
    controls.maxDistance = 26;
    controls.maxPolarAngle = Math.PI * 0.48;

    const world = build3DRoom(scene, room);
    camera.position.set(world.avatar.position.x + 6, 7, world.avatar.position.z + 8);
    controls.target.set(world.avatar.position.x, 1, world.avatar.position.z);

    const keys = new Set<string>();
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('button,input,textarea,select,[contenteditable="true"]')) return;
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) {
        e.preventDefault();
        keys.add(k);
      }
    };
    const up = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    const blur = () => { keys.clear(); move.current = { x: 0, z: 0 }; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);

    const resize = new ResizeObserver(() => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    resize.observe(el);

    const clock = new THREE.Clock();
    let time = 0;
    let frame = 0;
    const forward = new THREE.Vector3(), right = new THREE.Vector3(), delta = new THREE.Vector3();
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.04);
      time += dt;
      const x = move.current.x + Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'));
      const z = move.current.z + Number(keys.has('w') || keys.has('arrowup')) - Number(keys.has('s') || keys.has('arrowdown'));
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      right.crossVectors(forward, camera.up).normalize();
      delta.copy(forward).multiplyScalar(z).addScaledVector(right, x);
      if (delta.length() > 1) delta.normalize();
      delta.multiplyScalar(dt * (keys.has('shift') ? 4.2 : 2.6));
      const p = world.avatar.position;
      const old = p.clone();
      if (world.canStand(p.x + delta.x, p.z)) p.x += delta.x;
      if (world.canStand(p.x, p.z + delta.z)) p.z += delta.z;
      const moving = old.distanceToSquared(p) > 0.000001;
      if (moving) world.avatar.rotation.y = Math.atan2(delta.x, delta.z);
      camera.position.add(p.clone().sub(old));
      controls.target.lerp(new THREE.Vector3(p.x, 1, p.z), 1 - Math.exp(-dt * 5));
      controls.update();
      world.animate(time, moving);
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      controls.dispose();
      world.dispose();
      renderer.dispose();
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      renderer.domElement.remove();
    };
    // Rebuilt whenever the selected room changes — the ref hook below hands the
    // new room id to the running effect instance via a shared swap function
    // would be more code than just remounting, so `room` is a real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  return (
    <div className="relative h-full w-full bg-slate-950 text-white">
      <div ref={host} className="absolute inset-0" />
      <div className="absolute top-4 left-4 rounded-2xl bg-slate-950/85 p-4 max-w-xs">
        <p className="text-xs text-cyan-300 uppercase tracking-widest">Phantom Q · 3D facility</p>
        <h1 className="text-xl font-semibold">{ROOM3D_LABELS[room]}</h1>
        <p className="text-xs text-slate-300 mt-2">
          WASD / arrows to walk · Shift to run
          <br />
          Drag to orbit · Scroll or pinch to zoom
        </p>
        <button className="btn btn-ghost mt-3 text-xs" onClick={onBack}>
          Back to Quantum Lab
        </button>
      </div>
      <label className="absolute top-4 right-4 z-10 rounded-2xl bg-slate-950/90 text-white p-3 max-w-[220px]">
        <span className="block text-xs font-semibold mb-2">Jump to room</span>
        <select
          aria-label="3D facility room"
          value={room}
          className="w-full rounded-lg bg-slate-800 text-white text-xs p-2 border border-slate-600"
          onChange={(event) => setRoom(event.target.value as Facility3DRoomId)}
        >
          {ROOM3D_IDS.map((id) => (
            <option key={id} value={id}>
              {ROOM3D_LABELS[id]}
            </option>
          ))}
        </select>
      </label>
      {!error && (
        <div className="absolute bottom-6 left-6">
          <Joystick onChange={(x, z) => { move.current = { x, z }; }} />
        </div>
      )}
      {error && (
        <div role="alert" className="absolute inset-0 grid place-content-center bg-slate-950 text-center gap-4">
          <p>3D requires WebGL, which is unavailable in this browser.</p>
          <button className="btn btn-primary" onClick={onBack}>
            Back to Quantum Lab
          </button>
        </div>
      )}
    </div>
  );
}
