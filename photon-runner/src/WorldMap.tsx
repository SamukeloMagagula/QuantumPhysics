import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Compass, LocateFixed, Map, Minus, Plus, Search, X } from 'lucide-react';
import { ART_HEIGHT, ART_TOP, artworkFor } from './worldArtwork';
import { discoverRoom, explorerRank, readExplored, saveExplored } from './worldExploration';
import { getAppearance } from './characterAppearance';
import { WorldCharacter, type CharacterFacing } from './WorldCharacter';
import { Joystick } from './Joystick';
import { ASSIGNMENTS, readFacilityStory } from './facilityStory';
import type { RoomId } from './pqRooms';
import { WORLD_ZONES, WORLD_SIZE, ROOM_W, moveCharacter, centerOf, routeTo, zoneAt, type Point, type WorldZone, type WorldActivity } from './worldLayout';

export function WorldMap({ active, destination, onOpen }: {
  active: boolean; destination?: RoomId; onOpen: (activity: WorldActivity) => void;
}) {
  const [position, setPosition] = useState<Point>(() => centerOf(WORLD_ZONES[0]));
  const positionRef = useRef(position);
  const [facing, setFacing] = useState<CharacterFacing>('south');
  const [moving, setMoving] = useState(false);
  const route = useRef<Point[]>([]);
  const [target, setTarget] = useState<WorldZone | null>(null);
  const [zoom, setZoom] = useState(1);
  const [directory, setDirectory] = useState(false);
  const [query, setQuery] = useState('');
  const [explored, setExplored] = useState(readExplored);
  const [discovery, setDiscovery] = useState<string | null>(null);
  const [size, setSize] = useState({ w: 1100, h: 800 });
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<SVGSVGElement>(null);
  const touches = useRef(new globalThis.Map<number, Point>());
  const pinchDistance = useRef(0);
  const suppressClickUntil = useRef(0);
  const baseWidth = Math.max(340, 320 * size.w / Math.max(1, size.h));
  const baseHeight = Math.max(320, baseWidth * size.h / Math.max(1, size.w));
  const fitZoom = Math.min(baseWidth, baseHeight) / (WORLD_SIZE + 100);
  const effectiveZoom = Math.max(fitZoom, Math.min(2.5, zoom));
  const overview = effectiveZoom <= fitZoom + .001;
  const adjustZoom = (factor: number) => setZoom(z => Math.max(fitZoom, Math.min(2.5, Math.max(fitZoom, z) * factor)));
  useEffect(() => {
    const el = canvas.current;
    if (!el || !active) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? size.h : 1);
      setZoom(z => Math.max(fitZoom, Math.min(2.5, Math.max(fitZoom, z) * Math.exp(-Math.max(-200, Math.min(200, delta)) * .002))));
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [active, fitZoom, size.h]);
  const endTouch = (event: React.PointerEvent<SVGSVGElement>) => {
    touches.current.delete(event.pointerId);
    if (pinchDistance.current) suppressClickUntil.current = performance.now() + 400;
    pinchDistance.current = 0;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const joystick = useRef({ x: 0, y: 0 });
  const current = zoneAt(position);
  const appearance = useMemo(() => getAppearance(), [active]);
  const openRef = useRef(onOpen); openRef.current = onOpen;
  const story = useMemo(() => readFacilityStory(), [active]);
  const assignment = ASSIGNMENTS[story.completed];
  const atCenter = Boolean(current && Math.hypot(position.x - centerOf(current).x, position.y - centerOf(current).y) < 14);
  useEffect(() => {
    if (!active || !current || !atCenter || explored.includes(current.id)) return;
    const next = discoverRoom(explored, current.id);
    setExplored(next); saveExplored(next); setDiscovery(current.name);
  }, [active, current?.id, atCenter, explored]);
  useEffect(() => {
    if (!discovery) return;
    const timeout = window.setTimeout(() => setDiscovery(null), 3500);
    return () => window.clearTimeout(timeout);
  }, [discovery]);
  const goTo = (zone: WorldZone) => {
    route.current = routeTo(positionRef.current, zone);
    setTarget(zone); setDirectory(false); setZoom(z => Math.max(1, z));
  };
  useEffect(() => {
    const zone = WORLD_ZONES.find(z => z.id === destination);
    if (zone) goTo(zone);
  }, [destination]);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const resize = new ResizeObserver(() => setSize({ w: el.clientWidth || 1100, h: Math.max(200, (el.clientHeight || 800) - (el.clientWidth > 700 ? 150 : 0)) }));
    resize.observe(el);
    return () => resize.disconnect();
  }, []);
  useEffect(() => {
    if (!active) { joystick.current = { x: 0, y: 0 }; setMoving(false); return; }
    const keys = new Set<string>();
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea,select,button,[contenteditable="true"]')) return;
      const key = e.key.toLowerCase();
      if (key === 'e' && !route.current.length) { const zone = zoneAt(positionRef.current); if (zone) { e.preventDefault(); openRef.current(zone.activity); } }
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(key)) { keys.add(key); e.preventDefault(); }
    };
    const up = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    const blur = () => { keys.clear(); joystick.current = { x: 0, y: 0 }; };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
    let frame = 0, last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, .04); last = now;
      const p = positionRef.current;
      let dx = joystick.current.x + Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'));
      let dy = joystick.current.y + Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup'));
      const manual = Math.hypot(dx, dy) > .1;
      if (manual) { route.current = []; setTarget(null); }
      const next = route.current[0];
      const speed = (keys.has('shift') ? 260 : 160) * dt;
      let movement = { x: 0, y: 0 };
      if (!manual && next) {
        const distance = Math.hypot(next.x - p.x, next.y - p.y);
        const amount = Math.min(speed, distance);
        if (distance > .001) movement = { x: (next.x - p.x) / distance * amount, y: (next.y - p.y) / distance * amount };
      } else {
        const length = Math.max(1, Math.hypot(dx, dy));
        movement = { x: dx / length * speed, y: dy / length * speed };
      }
      const moved = moveCharacter(p, movement, manual);
      const travelled = Math.hypot(moved.x - p.x, moved.y - p.y);
      setMoving(travelled > .001);
      if (travelled > .001) {
        setFacing(Math.abs(moved.x - p.x) > Math.abs(moved.y - p.y) ? moved.x > p.x ? 'east' : 'west' : moved.y > p.y ? 'south' : 'north');
        positionRef.current = moved; setPosition(moved);
      }
      if (!manual && next && Math.hypot(next.x - moved.x, next.y - moved.y) < .01) {
        route.current.shift(); if (!route.current.length) setTarget(null);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, [active]);
  const viewW = baseWidth / effectiveZoom, height = baseHeight / effectiveZoom;
  const recenter = Math.max(0, Math.min(1, (1 - effectiveZoom) / (1 - fitZoom)));
  const cx = position.x + (WORLD_SIZE / 2 - position.x) * recenter;
  const cy = position.y + (WORLD_SIZE / 2 - position.y) * recenter;
  return <div className="world-map world-illustrated" ref={host} aria-label="Connected campus map">
    <div className="world-heading"><span className="world-eyebrow">EXPLORE / DISCOVER / DECODE</span><h1>Discovery campus<span>A secret in every department.</span></h1></div>
    <div className="world-tools">
      <button onClick={() => setDirectory(!directory)} aria-label="Places" aria-expanded={directory}><Search size={16} /><span>Places</span></button>
      <button onClick={() => setZoom(overview ? 1 : fitZoom)} aria-label={overview ? 'Follow my character' : 'Show whole map'}>{overview ? <LocateFixed size={17} /> : <Map size={17} />}<span>{overview ? 'Follow me' : 'Whole map'}</span></button>
      <div className="world-zoom-controls" role="group" aria-label="Map zoom">
        <button aria-label="Zoom out" title="Zoom out" disabled={overview} onClick={() => adjustZoom(1 / 1.3)}><Minus size={17} /></button>
        <output aria-label="Zoom level">{Math.round(effectiveZoom * 100)}%</output>
        <button aria-label="Zoom in" title="Zoom in" disabled={effectiveZoom >= 2.5} onClick={() => adjustZoom(1.3)}><Plus size={17} /></button>
      </div>
    </div>
    <svg ref={canvas} className="world-canvas" style={{ touchAction: 'none' }} viewBox={`${cx - viewW / 2} ${cy - height / 2} ${viewW} ${height}`} aria-label="Continuous map with connected rooms" role="group"
      onClickCapture={event => { if (performance.now() < suppressClickUntil.current) { event.preventDefault(); event.stopPropagation(); } }}
      onPointerDown={event => {
        if (event.pointerType !== 'touch') return;
        touches.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (touches.current.size === 2) {
          const [a, b] = [...touches.current.values()];
          pinchDistance.current = Math.hypot(a.x - b.x, a.y - b.y);
          suppressClickUntil.current = Infinity;
          for (const id of touches.current.keys()) event.currentTarget.setPointerCapture(id);
        }
      }}
      onPointerMove={event => {
        if (!touches.current.has(event.pointerId)) return;
        touches.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (touches.current.size !== 2) return;
        const [a, b] = [...touches.current.values()];
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDistance.current > 0 && distance > 0) adjustZoom(distance / pinchDistance.current);
        pinchDistance.current = distance;
      }}
      onPointerUp={endTouch} onPointerCancel={endTouch} onLostPointerCapture={endTouch}>
      <defs>
        <pattern id="world-grid" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="#e1dfda" /><path d="M16 0H0V16" fill="none" stroke="#c8c7c3" strokeWidth=".45" /></pattern>
        <pattern id="corridor-grid" width="13" height="13" patternUnits="userSpaceOnUse"><rect width="13" height="13" fill="#eeece6" /><path d="M13 0H0V13" fill="none" stroke="#c5c4bf" strokeWidth=".45" /></pattern>
        <linearGradient id="world-wall" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#f6f5f0" /><stop offset="1" stopColor="#c8cbca" /></linearGradient>
      </defs>
      <rect x="-4000" y="-4000" width="10000" height="10000" fill="#eeefee" />
      <path d="M660 25V1290 M20 295H1300 M20 605H1300 M20 915H1300 M20 1225H1300" stroke="#b6bec2" strokeWidth="76" fill="none" />
      <path d="M660 25V1290 M20 295H1300 M20 605H1300 M20 915H1300 M20 1225H1300" stroke="url(#corridor-grid)" strokeWidth="70" fill="none" />
      <path d="M660 25V1290 M20 295H1300 M20 605H1300 M20 915H1300 M20 1225H1300" stroke="#6ba4b7" strokeWidth="1" strokeDasharray="3 12" fill="none" />
      {WORLD_ZONES.map((zone, i) => {
        const art = artworkFor(zone.id), visited = explored.includes(zone.id), mission = assignment?.room === zone.id;
        const entranceX = zone.x + art.entrance[0] * ROOM_W, entranceW = (art.entrance[1] - art.entrance[0]) * ROOM_W;
        return <g key={zone.id} className="world-zone" role="button" tabIndex={active ? 0 : -1} aria-label={`Walk to ${zone.name}`}
          onClick={() => goTo(zone)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goTo(zone); } }}>
          <title>{zone.name} — {visited ? 'Discovered' : 'Explore for 25 XP'} — {zone.action}</title>
          <rect className="world-door-path" x={entranceX} y={zone.y + ART_TOP + ART_HEIGHT * .86} width={entranceW} height={255 - ART_TOP - ART_HEIGHT * .86} fill="url(#corridor-grid)" stroke="#c8cdce" strokeWidth=".5" />
          <image className="world-room-image" href={art.src} x={zone.x} y={zone.y + ART_TOP} width={ROOM_W} height={ART_HEIGHT} preserveAspectRatio="xMidYMid meet" />
          <rect className="world-room-outline" x={zone.x + 1} y={zone.y + ART_TOP} width={ROOM_W - 2} height={ART_HEIGHT} fill="none" stroke="transparent" strokeWidth="1" />
          <g transform={`translate(${zone.x + 6} ${zone.y - 2})`}>
            <rect width="238" height="19" rx="4" fill={current?.id === zone.id ? '#183744' : '#314650'} />
            <rect width="24" height="19" rx="4" fill={mission ? '#e9b95e' : visited ? '#54b8a5' : '#536872'} />
            <text x="12" y="13" textAnchor="middle" fill={visited || mission ? '#142b37' : '#e8eef0'} fontSize="8" fontWeight="800">{String(i + 1).padStart(2, '0')}</text>
            <text x="31" y="13" fill="#f2f6f7" fontSize="9" fontWeight="650">{zone.short}</text>
            <text x="225" y="13" textAnchor="end" fill={mission ? '#f4cb76' : '#77d4c1'} fontSize="9">{mission ? '◆' : visited ? '✓' : '+'}</text>
          </g>
          {!visited && <g className="world-discovery-token" transform={`translate(${centerOf(zone).x + 20} ${centerOf(zone).y})`}><ellipse cy="6" rx="7" ry="3" fill="#263942" opacity=".15" /><path d="M0-12L7-7V1L0 6L-7 1V-7Z" fill="#f2c467" stroke="#fff2c9" strokeWidth="1" /><path d="M-3-3H3M0-6V0" stroke="#795623" strokeWidth="1.3" /></g>}
          {mission && <g className="world-mission-beacon" transform={`translate(${zone.x + 125} ${zone.y + ART_TOP + ART_HEIGHT + 6})`}><ellipse rx="12" ry="4" fill="#e9b95e" opacity=".25" /><path d="M-4-7L0-3L4-7" fill="none" stroke="#b58830" strokeWidth="2" /></g>}
        </g>;
      })}
      <g transform="translate(765 1010)"><rect width="480" height="120" rx="12" fill="#e3e7e3" stroke="#c0cbc5" /><text x="240" y="38" textAnchor="middle" fill="#526b63" fontSize="13" letterSpacing="3">EXPLORER'S LOG</text><text x="240" y="70" textAnchor="middle" fill="#244c44" fontSize="22" fontWeight="700">{explored.length} / 14 discovered</text><text x="240" y="96" textAnchor="middle" fill="#526b63" fontSize="10">Visit every department to become a Campus Pathfinder</text></g>
      {target && <polyline points={[position, ...route.current].map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#3197b4" strokeWidth="2" strokeDasharray="8 9" opacity=".65" />}
      <g transform={`translate(${position.x} ${position.y})`} aria-label="Your character" data-testid="world-player" data-x={Math.round(position.x)} data-y={Math.round(position.y)}>
        <WorldCharacter appearance={appearance} facing={facing} moving={moving} />
      </g>
    </svg>
    <div className="world-player-hud"><span className="world-rank-icon">◆</span><div><b>{explorerRank(explored.length)}</b><span>{explored.length * 25 + story.completed * 100} XP · {explored.length}/14 places · {story.completed}/4 missions</span><progress aria-label="Campus exploration" value={explored.length} max={14} /></div></div>
    {discovery && <div role="status" className="world-discovery-toast"><b>+25 XP · Place discovered</b><span>{discovery}</span></div>}
    {directory && <aside className="world-directory" aria-label="Campus places"><div><h2>Where to?</h2><button aria-label="Close places" onClick={() => setDirectory(false)}><X size={18} /></button></div><input aria-label="Find a place" placeholder="Find a place…" value={query} onChange={e => setQuery(e.target.value)} autoFocus /><nav>{WORLD_ZONES.filter(z => z.name.toLowerCase().includes(query.toLowerCase())).map(z => <button key={z.id} onClick={() => goTo(z)}><span style={{ background: explored.includes(z.id) ? '#54b8a5' : z.color }} />{z.name}<ArrowRight size={14} /></button>)}</nav></aside>}
    <div className="world-bottom">
      <div className="world-location" aria-live="polite"><div className="world-location-icon"><Compass size={23} /></div><div><span>{target ? 'ON YOUR WAY TO' : current ? 'YOU ARE HERE' : 'EXPLORING'}</span><h2>{target?.name ?? current?.name ?? 'Discovery Walk'}</h2><p>{target ? 'Follow the dotted path, or use movement controls.' : current?.description ?? 'Every department connects through this shared walkway.'}</p></div>{!target && current && <button className="world-open" onClick={() => onOpen(current.activity)}>{current.action}<ArrowRight size={17} /></button>}{target && <button className="world-open" onClick={() => { route.current = []; setTarget(null); }}>Stop walking</button>}</div>
      <div className="world-footnote"><span>Click a room to walk there · WASD / arrows to explore · E to interact</span><button onClick={() => onOpen('mission')}>{assignment ? `Next: ${assignment.title}` : 'Replay your first mission'} <ArrowRight size={13} /></button></div>
    </div>
    <div className="world-joystick"><Joystick onChange={(x, y) => { joystick.current = { x, y: -y }; }} /></div>
  </div>;
}

