import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ACTOR,
  DEPTH_LAYERS,
  Facing,
  HOTSPOTS,
  Hotspot,
  LAYER_FILES,
  SCENE_ASPECT,
  SCENE_H,
  SCENE_W,
  SCREENS,
  SPAWN,
  StationKind,
  Vec2,
  depthScale,
  hotspotAt,
  layerCoversActor,
  resolveMove,
} from './pqScene';
import { QkdConsole } from './QkdConsole';
import { ForensicsPanel } from './ForensicsPanel';
import { CampaignPanel } from './CampaignPanel';
import { RemoteActor, connectFloor } from './floorClient';
import { AttackState } from './qkdAttack';

/**
 * Phantom Q HQ, rendered the way the client specified: the illustration is
 * the world.
 *
 * There is no 3D here by design — their handoff is explicit that the scene
 * must not be rebuilt in an engine ("the Page 8 image is the visual world;
 * demarcation supplies spatial data"). So this draws the master image, walks
 * a sprite actor over a traced floor, and re-draws cropped furniture layers
 * on top of him when he is behind them, which is what gives a flat image
 * depth.
 *
 * Our own game is unchanged underneath: the three consoles open the same
 * attack / forensics / hardware terminals as before.
 */

const BASE = '/pq';
const WALK_SPEED = 0.155; // normalised units per second at the near edge

interface Sprites {
  hq: HTMLImageElement;
  walk: HTMLImageElement;
  idle: HTMLImageElement;
  idleLeft: HTMLImageElement;
  layers: Record<string, HTMLImageElement>;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${src}`));
    img.src = src;
  });
}

async function loadSprites(): Promise<Sprites> {
  const [hq, walk, idle, idleLeft] = await Promise.all([
    loadImage(`${BASE}/hq-master.jpg`),
    loadImage(`${BASE}/operator-walk.png`),
    loadImage(`${BASE}/operator-idle.png`),
    loadImage(`${BASE}/operator-idle-left.png`),
  ]);
  const entries = await Promise.all(
    Object.entries(LAYER_FILES).map(async ([k, f]) => [k, await loadImage(`${BASE}/layers/${f}`)] as const)
  );
  return { hq, walk, idle, idleLeft, layers: Object.fromEntries(entries) };
}

export function PhantomQScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [sprites, setSprites] = useState<Sprites | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<Hotspot | null>(null);
  const [station, setStation] = useState<StationKind | null>(null);
  const [session, setSession] = useState<AttackState | null>(null);

  // Mutable per-frame state, deliberately outside React: the render loop
  // runs at 60fps and must not queue a re-render per frame.
  const pos = useRef<Vec2>({ ...SPAWN });
  const facing = useRef<Facing>('forward');
  const held = useRef<Set<string>>(new Set());
  const seated = useRef(false);
  const promptRef = useRef<Hotspot | null>(null);

  useEffect(() => {
    let alive = true;
    loadSprites()
      .then((s) => alive && setSprites(s))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    seated.current = station !== null;
  }, [station]);

  const standUp = useCallback(() => setStation(null), []);

  // ---- input ----
  useEffect(() => {
    const MOVE = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (MOVE.has(k)) {
        e.preventDefault();
        held.current.add(k);
        return;
      }
      if (k === 'e' && !seated.current && promptRef.current) {
        e.preventDefault();
        setStation(promptRef.current.station);
      }
      if (k === 'escape' && seated.current) standUp();
    };
    const up = (e: KeyboardEvent) => held.current.delete(e.key.toLowerCase());
    const blur = () => held.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [standUp]);

  // ---- render loop ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sprites) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Other people on the same floor. Presence is optional: if the API is not
    // there, this reports nobody and the scene plays exactly as before.
    const floor = connectFloor();

    let raf = 0;
    let last = performance.now();
    let clock = 0;
    let stepPhase = 0;

    // ---- camera ----------------------------------------------------------
    // A shallow parallax that gives the flat illustration some depth without
    // touching the art. The client's rule is that the rendered image *is* the
    // world, so nothing here redraws or restyles it: the frame is overscanned
    // a couple of percent and the whole composite — background, glows,
    // hotspots, actor and the furniture layers drawn over him — is panned as
    // one plane against the player, with a slight dolly as he moves front to
    // back.
    //
    // Panning the furniture layers *further* than the background would be the
    // textbook multi-plane parallax, but it cannot be done here: those layers
    // are crops of the same illustration, so offsetting them would ghost them
    // against the furniture already painted into the background. Moving the
    // whole frame keeps the registration exact, which matters more than the
    // extra depth cue.
    const CAM = { overscan: 0.022, sway: 0.62, tilt: 0.6, dolly: 0.012, ease: 3.4 };
    const cam = { x: 0, y: 0 };

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = parent.clientWidth;
      const ch = parent.clientHeight;
      // Letterbox to the artwork's aspect so the traced map stays aligned
      // with the image no matter the window shape.
      const scale = Math.min(cw / SCENE_ASPECT, ch);
      const w = scale * SCENE_ASPECT;
      const h = scale;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      clock += dt;

      const W = canvas.width;
      const H = canvas.height;
      const toPx = (nx: number, ny: number) => [nx * W, ny * H] as const;

      // Ease the camera toward the player rather than pinning it, so the room
      // settles behind him instead of jerking with every step.
      {
        const e = 1 - Math.exp(-CAM.ease * dt);
        cam.x += ((pos.current.x - 0.5) * 2 - cam.x) * e;
        cam.y += ((pos.current.y - 0.5) * 2 - cam.y) * e;
      }

      // ---- movement ----
      if (!seated.current) {
        const k = held.current;
        let dx = 0;
        let dy = 0;
        if (k.has('a') || k.has('arrowleft')) dx -= 1;
        if (k.has('d') || k.has('arrowright')) dx += 1;
        if (k.has('w') || k.has('arrowup')) dy -= 1;
        if (k.has('s') || k.has('arrowdown')) dy += 1;

        if (dx || dy) {
          const len = Math.hypot(dx, dy) || 1;
          // Foreshortening: the same key press covers less image distance
          // at the back of the room than at the front.
          const speed = WALK_SPEED * depthScale(pos.current.y) * dt;
          // Vertical steps move "into" the room, which is a shorter screen
          // distance than sideways travel on this projection.
          const next = resolveMove(pos.current, (dx / len) * speed, (dy / len) * speed * 0.62);
          pos.current = next;
          stepPhase += dt * ACTOR.stepsPerSecond;
          // Left/right read more strongly than depth, so they win the sprite.
          if (dx < 0) facing.current = 'left';
          else if (dx > 0) facing.current = 'right';
          else if (dy < 0) facing.current = 'backward';
          else facing.current = 'forward';
        }

        // Dev-only position readout, so the scene can be steered and
        // asserted from an automated browser session the way PerfOverlay
        // exposes frame stats. Stripped from production builds.
        if (import.meta.env.DEV) {
          (window as unknown as { __pq?: unknown }).__pq = { x: pos.current.x, y: pos.current.y };
        }

        floor.report(pos.current.x, pos.current.y, facing.current, held.current.size > 0);

        const hit = hotspotAt(pos.current);
        if (hit?.id !== promptRef.current?.id) {
          promptRef.current = hit;
          setPrompt(hit);
        }
      }

      const moving = !seated.current && held.current.size > 0;

      // ---- draw ----
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);

      // Overscan covers the pan, and the dolly stays above 1 so the frame
      // edges can never be exposed.
      const scale = (1 + CAM.overscan * 2) * (1 + CAM.dolly * cam.y);
      ctx.setTransform(
        scale,
        0,
        0,
        scale,
        -W * (scale - 1) * 0.5 - cam.x * CAM.overscan * CAM.sway * W,
        -H * (scale - 1) * 0.5 - cam.y * CAM.overscan * CAM.sway * CAM.tilt * H
      );

      ctx.drawImage(sprites.hq, 0, 0, W, H);

      // Screen glows: a slow pulse over the video walls, so the room is not
      // a completely static photograph.
      for (const s of SCREENS) {
        const a = 0.06 + 0.05 * Math.sin(clock * 1.4 + s.phase);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(120,200,255,${a.toFixed(3)})`;
        ctx.fillRect((s.x / SCENE_W) * W, (s.y / SCENE_H) * H, (s.w / SCENE_W) * W, (s.h / SCENE_H) * H);
        ctx.restore();
      }

      // Hotspot markers, drawn under the actor.
      for (const h of HOTSPOTS) {
        const [ax, ay] = toPx(h.anchor.x, h.anchor.y);
        const pulse = 0.5 + 0.5 * Math.sin(clock * 2 + h.anchor.x * 10);
        const active = promptRef.current?.id === h.id;
        const r = (active ? 0.017 : 0.012) * W * (1 + pulse * 0.12);
        ctx.beginPath();
        ctx.arc(ax, ay, r, 0, Math.PI * 2);
        ctx.strokeStyle = active ? 'rgba(120,220,255,.95)' : 'rgba(150,190,225,.5)';
        ctx.lineWidth = Math.max(1.5, W * 0.0016);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(ax, ay, r * 0.28, 0, Math.PI * 2);
        ctx.fillStyle = active ? 'rgba(120,220,255,.95)' : 'rgba(150,190,225,.6)';
        ctx.fill();
      }

      // ---- actors ----
      // Everyone on the floor, drawn back to front so a person nearer the
      // camera overlaps one further away.
      floor.tick(dt);
      const cast = [
        {
          x: pos.current.x,
          y: pos.current.y,
          facing: facing.current,
          walking: moving,
          phase: stepPhase,
          name: null as string | null,
        },
        ...floor.actors().map((a: RemoteActor) => ({
          x: a.x,
          y: a.y,
          facing: a.facing,
          walking: a.walking,
          phase: a.phase,
          name: a.name as string | null,
        })),
      ].sort((a, b) => a.y - b.y);

      for (const who of cast) {
        const [px, py] = toPx(who.x, who.y);
        // Height in image space, scaled with depth so they shrink toward the
        // back wall the way the drawn figures do.
        const h = (ACTOR.visibleHeight / SCENE_H) * H * (0.82 + 0.24 * depthScale(who.y));

        let sheet: HTMLImageElement;
        let rect: [number, number, number, number];
        if (who.walking) {
          const frames = ACTOR.walkFrames[who.facing];
          rect = frames[Math.floor(who.phase) % frames.length];
          sheet = sprites.walk;
        } else if (who.facing === 'left') {
          rect = ACTOR.idleLeftSource;
          sheet = sprites.idleLeft;
        } else {
          rect = ACTOR.idleFrames[who.facing === 'backward' ? 'backward' : who.facing === 'right' ? 'right' : 'forward'];
          sheet = sprites.idle;
        }
        const [sx, sy, sw, sh] = rect;
        const w = h * (sw / sh);
        // Feet are the anchor, per the client's actor contract.
        const drawX = px - w / 2;
        const drawY = py - h;

        // Contact shadow, so they sit on the floor rather than floating.
        ctx.save();
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = '#0d1520';
        ctx.beginPath();
        ctx.ellipse(px, py, w * 0.34, w * 0.13, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.drawImage(sheet, sx, sy, sw, sh, drawX, drawY, w, h);

        // Name tag over other people only — you know who you are.
        if (who.name) {
          const fontPx = Math.max(9, h * 0.115);
          ctx.save();
          ctx.font = `600 ${fontPx}px system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const padX = fontPx * 0.5;
          const tw = ctx.measureText(who.name).width;
          const ty = drawY - fontPx * 0.9;
          ctx.globalAlpha = 0.72;
          ctx.fillStyle = '#0b1420';
          ctx.beginPath();
          ctx.roundRect(px - tw / 2 - padX, ty - fontPx * 0.75, tw + padX * 2, fontPx * 1.5, fontPx * 0.6);
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.fillStyle = '#bfe6f5';
          ctx.fillText(who.name, px, ty);
          ctx.restore();
        }

        // ---- depth layers ----
        // Re-draw furniture crops over this person when they are behind them.
        // This is what makes a flat illustration read as a space you are
        // inside of, and doing it per actor keeps the ordering right when two
        // people are on opposite sides of the same desk.
        for (const layer of DEPTH_LAYERS) {
          if (!layerCoversActor(layer, who.x, who.y)) continue;
          const img = sprites.layers[layer.src];
          if (!img) continue;
          const [bx, by, bw, bh] = layer.box;
          ctx.drawImage(img, (bx / SCENE_W) * W, (by / SCENE_H) * H, (bw / SCENE_W) * W, (bh / SCENE_H) * H);
        }
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
    };

    raf = requestAnimationFrame(frame);
    return () => {
      floor.stop();
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [sprites]);

  if (error) {
    return (
      <div className="h-full grid place-items-center px-6">
        <div className="glass rounded-3xl p-8 max-w-sm text-center">
          <p className="text-sm ink-2">Scene assets failed to load.</p>
          <p className="text-xs ink-4 mt-2 font-mono">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden grid place-items-center" style={{ background: '#0a0d12' }}>
      <canvas ref={canvasRef} className="block" />

      {!sprites && (
        <div className="absolute inset-0 grid place-items-center">
          <p className="text-sm ink-3">Loading Phantom Q HQ…</p>
        </div>
      )}

      {sprites && !station && (
        <>
          <div className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-none">
            <div className="glass rounded-2xl px-4 py-2 text-center">
              <div className="label-mono !text-[9px]">phantom q · headquarters</div>
              <p className="text-[11px] ink-3 mt-0.5">
                WASD to walk · <span className="ink-1 font-semibold">E</span> at a console
              </p>
            </div>
          </div>

          {prompt && (
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 pointer-events-none">
              <div
                className="rounded-2xl px-4 py-2.5 flex items-center gap-3"
                style={{ background: 'rgba(10,16,26,.88)', border: '1px solid rgba(255,255,255,.16)' }}
              >
                <span
                  className="grid place-items-center w-6 h-6 rounded-md text-[11px] font-bold"
                  style={{ background: '#5ec8e8', color: '#04121a' }}
                >
                  E
                </span>
                <span>
                  <span className="block text-[8.5px] tracking-[.16em]" style={{ color: '#8fa6bd' }}>
                    {prompt.kicker}
                  </span>
                  <span className="block text-xs font-semibold" style={{ color: '#e6eef7' }}>
                    {prompt.label}
                  </span>
                </span>
              </div>
            </div>
          )}
        </>
      )}

      {station && (
        <div
          className="absolute inset-0 flex items-center justify-center p-4 sm:p-8"
          style={{ background: 'rgba(4,7,11,.74)', backdropFilter: 'blur(2px)' }}
        >
          <div
            className={station === 'forensics' ? 'w-full max-w-2xl' : 'w-full max-w-5xl'}
            style={{ height: 'min(86%, 660px)' }}
          >
            {station === 'attack' && <QkdConsole onClose={standUp} embedded onSessionChange={setSession} />}
            {station === 'forensics' && <ForensicsPanel session={session} onClose={standUp} />}
            {station === 'campaign' && <CampaignPanel onClose={standUp} />}
            {station === 'rack' && <CampaignPanel onClose={standUp} place="rack" />}
          </div>
        </div>
      )}
    </div>
  );
}
