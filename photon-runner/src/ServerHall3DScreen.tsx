import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildServerHall, hallCanStand } from './serverHall3d';
import { FacilityNavigation } from './FacilityNavigation';
import type { RoomId } from './pqRooms';
import { Joystick } from './Joystick';
import { HardwareLabPanel } from './HardwareLabPanel';

export function ServerHall3DScreen({ onBack, onSelectRoom }: { onBack: () => void; onSelectRoom: (id: RoomId) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const move = useRef({ x: 0, z: 0 });
  const interact = useRef(() => {});
  const paused = useRef(false);
  const [panel, setPanel] = useState(false);
  const [near, setNear] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => { paused.current = panel; move.current = { x: 0, z: 0 }; }, [panel]);
  useEffect(() => {
    const el = host.current!;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); } catch { setError(true); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.setAttribute('aria-label', '3D Server Hall. WASD to walk, drag to orbit, scroll to zoom.');
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x111c2b);
    const camera = new THREE.PerspectiveCamera(48, 1, .1, 80);
    camera.position.set(7, 9, 15);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1, 3); controls.enablePan = false; controls.enableDamping = true;
    controls.minDistance = 4; controls.maxDistance = 21; controls.maxPolarAngle = Math.PI * .46;
    const world = buildServerHall(scene);
    const keys = new Set<string>();
    let canInteract = false;
    interact.current = () => { if (canInteract && !paused.current) { keys.clear(); paused.current = true; setPanel(true); } };
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('button,input,textarea,select,[contenteditable="true"]') || paused.current) return;
      const k = e.key.toLowerCase();
      if (['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','shift','e'].includes(k)) {
        e.preventDefault(); keys.add(k); if (k === 'e' && !e.repeat) interact.current();
      }
    };
    const up = (e: KeyboardEvent) => { keys.delete(e.key.toLowerCase()); };
    const blur = () => { keys.clear(); move.current = { x: 0, z: 0 }; };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
    const resize = new ResizeObserver(() => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
    }); resize.observe(el);
    const clock = new THREE.Clock(); let time = 0, frame = 0;
    const forward = new THREE.Vector3(), right = new THREE.Vector3(), delta = new THREE.Vector3();
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), .04); time += dt;
      let x = move.current.x + Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'));
      let z = move.current.z + Number(keys.has('w') || keys.has('arrowup')) - Number(keys.has('s') || keys.has('arrowdown'));
      if (paused.current) { x = 0; z = 0; }
      camera.getWorldDirection(forward); forward.y = 0; forward.normalize();
      right.crossVectors(forward, camera.up).normalize();
      delta.copy(forward).multiplyScalar(z).addScaledVector(right, x);
      if (delta.length() > 1) delta.normalize();
      delta.multiplyScalar(dt * (keys.has('shift') ? 4 : 2.6));
      const p = world.avatar.position;
      const old = p.clone();
      if (hallCanStand(p.x + delta.x, p.z)) p.x += delta.x;
      if (hallCanStand(p.x, p.z + delta.z)) p.z += delta.z;
      const moving = old.distanceToSquared(p) > .000001;
      if (moving) world.avatar.rotation.y = Math.atan2(delta.x, delta.z);
      camera.position.add(p.clone().sub(old));
      controls.target.lerp(new THREE.Vector3(p.x, 1, p.z), 1 - Math.exp(-dt * 5));
      controls.enabled = !paused.current; controls.update();
      const nextNear = Math.hypot(p.x - 2, p.z + 4.6) < 1.5;
      if (nextNear !== canInteract) { canInteract = nextNear; setNear(nextNear); }
      world.animate(time, moving); renderer.render(scene, camera);
    }; tick();
    return () => {
      cancelAnimationFrame(frame); resize.disconnect(); controls.dispose(); world.dispose(); renderer.dispose();
      window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur);
      renderer.domElement.remove(); interact.current = () => {};
    };
  }, []);
  return <div className="relative h-full w-full bg-slate-950 text-white">
    <div ref={host} className="absolute inset-0" />
    <div className="absolute top-4 left-4 rounded-2xl bg-slate-950/85 p-4 max-w-xs">
      <p className="text-xs text-cyan-300 uppercase tracking-widest">Phantom Q · 3D</p>
      <h1 className="text-xl font-semibold">Server Hall</h1>
      <p className="text-xs text-slate-300 mt-2">WASD / arrows to walk · Shift to run<br />Drag to orbit · Scroll or pinch to zoom</p>
      <button className="btn btn-ghost mt-3 text-xs" onClick={onBack}>Return to Communications Centre</button>
    </div>
    {!panel && <FacilityNavigation roomId="server-hall" onSelect={onSelectRoom} />}
    {!error && !panel && <>
      <div className="absolute bottom-6 left-6"><Joystick onChange={(x, z) => { move.current = { x, z }; }} /></div>
      <button disabled={!near} onClick={() => interact.current()} className="absolute bottom-8 right-6 btn btn-primary disabled:opacity-40">{near ? 'E · Inspect console' : 'Walk to the rear console'}</button>
    </>}
    {error && <div role="alert" className="absolute inset-0 grid place-content-center bg-slate-950 text-center gap-4"><p>3D requires WebGL, which is unavailable in this browser.</p><button className="btn btn-primary" onClick={onBack}>Open illustrated facility</button></div>}
    {panel && <div className="absolute inset-0 bg-black/70 overflow-auto p-6 flex items-start justify-center"><div className="w-full max-w-5xl"><HardwareLabPanel onClose={() => setPanel(false)} /></div></div>}
  </div>;
}
