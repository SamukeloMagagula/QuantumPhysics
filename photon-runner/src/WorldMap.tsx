import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Compass, LocateFixed, Map, MessageCircle, Minus, Monitor, Plus, Search, Users, X } from 'lucide-react';
import { discoverRoom, nextRank, rankFor, readExplored, saveExplored, type ExplorerRank } from './worldExploration';
import { RankMedal } from './RankMedal';
import { play } from './sound';
import { DEFAULT_APPEARANCE, getAppearance, type CharacterAppearance } from './characterAppearance';
import { WorldCharacter, type CharacterFacing } from './WorldCharacter';
import { WorldComputerScreen, type CampusPerson } from './WorldComputer';
import { computerById, computerNear } from './worldComputers';
import { connectFloor, type ChatLine, type FloorLink, type PeerLook, type RemoteActor } from './floorClient';
import { QUICK_CHAT, type Facing } from './floorPresence';
import { Joystick } from './Joystick';
import { ASSIGNMENTS, readFacilityStory } from './facilityStory';
import type { RoomId } from './pqRooms';
import { WORLD_ZONES, WORLD_ART, WORLD_WIDTH, WORLD_HEIGHT, doorX, moveCharacter, centerOf, routeTo, zoneAt, type Point, type WorldZone, type WorldActivity } from './worldLayout';

/** Everyone on the campus shares one presence room; positions travel normalised. */
const FLOOR_ROOM = 'campus';
const TO_WIRE: Record<CharacterFacing, Facing> = { north: 'backward', south: 'forward', east: 'right', west: 'left' };
const FROM_WIRE: Record<Facing, CharacterFacing> = { backward: 'north', forward: 'south', right: 'east', left: 'west' };
/** How long a quick-chat line hangs over the speaker's head. */
const BUBBLE_MS = 5000;

function lookOf({ nickname: _nickname, ...look }: CharacterAppearance): PeerLook { return look; }
function appearanceOf(look: PeerLook | null): CharacterAppearance {
  return look ? { ...DEFAULT_APPEARANCE, ...look } as CharacterAppearance : DEFAULT_APPEARANCE;
}
function remotePoint(a: RemoteActor): Point {
  return computerById(a.seat)?.seat ?? { x: a.x * WORLD_WIDTH, y: a.y * WORLD_HEIGHT };
}

function SpeechBubble({ text }: { text: string }) {
  const width = Math.min(150, 14 + text.length * 4.6);
  return <g className="world-bubble" transform="translate(0 -74)" aria-hidden="true">
    <rect x={-width / 2} y="-11" width={width} height="17" rx="8" fill="#fffdf6" stroke="#2f5566" strokeWidth=".8" />
    <path d="M-4 6L0 11L4 6Z" fill="#fffdf6" stroke="#2f5566" strokeWidth=".8" /><path d="M-3.4 5.3H3.4" stroke="#fffdf6" strokeWidth="1.6" />
    <text y="1" textAnchor="middle" fontSize="7.5" fill="#203a48">{text.length > 32 ? `${text.slice(0, 31)}…` : text}</text>
  </g>;
}

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
  const [rankUp, setRankUp] = useState<ExplorerRank | null>(null);
  const [size, setSize] = useState({ w: 1100, h: 800 });
  const [seat, setSeat] = useState<string | null>(null);
  const seatRef = useRef(seat); seatRef.current = seat;
  const floor = useRef<FloorLink | null>(null);
  const [remotes, setRemotes] = useState<RemoteActor[]>([]);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [online, setOnline] = useState(false);
  const [bubbles, setBubbles] = useState<Record<number, { phrase: number; until: number }>>({});
  const [myBubble, setMyBubble] = useState<{ phrase: number; until: number } | null>(null);
  const [people, setPeople] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<SVGSVGElement>(null);
  const touches = useRef(new globalThis.Map<number, Point>());
  const pinchDistance = useRef(0);
  const suppressClickUntil = useRef(0);
  const baseWidth = Math.max(340, 320 * size.w / Math.max(1, size.h));
  const baseHeight = Math.max(320, baseWidth * size.h / Math.max(1, size.w));
  const fitZoom = Math.min(baseWidth / (WORLD_WIDTH + 40), baseHeight / (WORLD_HEIGHT + 40));
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
  const computer = computerById(seat);
  const taken = useMemo(() => new Set(remotes.map(r => r.seat).filter((id): id is string => Boolean(id))), [remotes]);
  const nearby = !computer && !target ? computerNear(position, taken) : undefined;
  const nearbyRef = useRef(nearby); nearbyRef.current = nearby;
  const sit = (id: string) => {
    const desk = computerById(id);
    if (!desk) return;
    route.current = []; setTarget(null); setDirectory(false); setPeople(false);
    positionRef.current = desk.stand; setPosition(desk.stand); setFacing('north'); setSeat(desk.id);
    play('sit'); window.setTimeout(() => play('computerOn'), 250);
  };
  const sitRef = useRef(sit); sitRef.current = sit;
  const stand = () => { setSeat(null); setFacing('south'); };
  const say = (phrase: number) => {
    floor.current?.say(phrase).then(ok => { if (ok) { play('chat'); setMyBubble({ phrase, until: Date.now() + BUBBLE_MS }); } });
  };
  const atCenter = Boolean(current && Math.hypot(position.x - centerOf(current).x, position.y - centerOf(current).y) < 14);
  useEffect(() => {
    // Presence keeps running under activity panels, so a player using a
    // program still shows up to everyone else, sitting at their desk.
    const link = connectFloor();
    floor.current = link;
    let primed = false, seen = 0;
    const unsubscribe = link.subscribe(() => {
      const lines = link.messages();
      setOnline(link.online()); setChat([...lines]);
      const fresh = lines.filter(l => l.id > seen);
      if (fresh.length) seen = fresh[fresh.length - 1].id;
      // The first answer carries history; only lines said since then pop up.
      if (primed && fresh.length) play('chat');
      if (primed && fresh.length) setBubbles(b => {
        const next = { ...b };
        for (const l of fresh) next[l.userId] = { phrase: l.phrase, until: Date.now() + BUBBLE_MS };
        return next;
      });
      if (link.online()) primed = true;
    });
    let frame = 0, last = performance.now(), shown = 0;
    const animate = (now: number) => {
      link.tick(Math.min((now - last) / 1000, .1)); last = now;
      const actors = link.actors();
      if (actors.length || shown) setRemotes(actors.map(a => ({ ...a })));
      shown = actors.length;
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => { cancelAnimationFrame(frame); unsubscribe(); link.stop(); floor.current = null; };
  }, []);
  useEffect(() => {
    floor.current?.report(position.x / WORLD_WIDTH, position.y / WORLD_HEIGHT, TO_WIRE[facing], moving, FLOOR_ROOM,
      { name: appearance.nickname.trim() || undefined, look: lookOf(appearance), seat });
  }, [position, facing, moving, seat, appearance]);
  useEffect(() => {
    if (!myBubble) return;
    const timeout = window.setTimeout(() => setMyBubble(null), myBubble.until - Date.now());
    return () => window.clearTimeout(timeout);
  }, [myBubble]);
  useEffect(() => {
    // Someone else sat down here first, between our last poll and our click.
    if (seat && taken.has(seat)) stand();
  }, [seat, taken]);
  useEffect(() => {
    if (!active || !current || !atCenter || explored.includes(current.id)) return;
    const next = discoverRoom(explored, current.id);
    setExplored(next); saveExplored(next); setDiscovery(current.name);
    const before = rankFor(explored.length), after = rankFor(next.length);
    if (after.name !== before.name) { setRankUp(after); play('rankUp'); } else play('discover');
  }, [active, current?.id, atCenter, explored]);
  useEffect(() => {
    if (!discovery) return;
    const timeout = window.setTimeout(() => setDiscovery(null), 3500);
    return () => window.clearTimeout(timeout);
  }, [discovery]);
  useEffect(() => {
    if (!rankUp) return;
    const timeout = window.setTimeout(() => setRankUp(null), 6000);
    return () => window.clearTimeout(timeout);
  }, [rankUp]);
  const goTo = (zone: WorldZone) => {
    setSeat(null);
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
      // An Escape that just closed an activity panel must not also stand you up.
      if (e.key === 'Escape' && seatRef.current && !e.defaultPrevented) { e.preventDefault(); stand(); return; }
      if ((e.target as HTMLElement)?.closest('input,textarea,select,button,[contenteditable="true"]')) return;
      const key = e.key.toLowerCase();
      if (key === 'e' && !route.current.length && !seatRef.current) {
        const desk = nearbyRef.current, zone = zoneAt(positionRef.current);
        if (desk) { e.preventDefault(); sitRef.current(desk.id); }
        else if (zone) { e.preventDefault(); openRef.current(zone.activity); }
      }
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(key)) { keys.add(key); e.preventDefault(); }
    };
    const up = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    const blur = () => { keys.clear(); joystick.current = { x: 0, y: 0 }; };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
    let frame = 0, last = performance.now(), stride = 0;
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, .04); last = now;
      const p = positionRef.current;
      let dx = joystick.current.x + Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'));
      let dy = joystick.current.y + Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup'));
      const manual = Math.hypot(dx, dy) > .1;
      if (manual) { route.current = []; setTarget(null); if (seatRef.current) setSeat(null); }
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
      // A footstep every stride, a little brisker when running.
      stride += travelled;
      if (stride > (keys.has('shift') ? 30 : 24)) { stride = 0; play('step'); }
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
  const rank = rankFor(explored.length), upcoming = nextRank(explored.length);
  const campusPeople: CampusPerson[] = remotes.map(a => ({ userId: a.userId, name: a.name, where: zoneAt(remotePoint(a))?.short ?? 'Hallway', atComputer: Boolean(a.seat) }));
  const viewW = baseWidth / effectiveZoom, height = baseHeight / effectiveZoom;
  const recenter = Math.max(0, Math.min(1, (1 - effectiveZoom) / (1 - fitZoom)));
  const cx = position.x + (WORLD_WIDTH / 2 - position.x) * recenter;
  const cy = position.y + (WORLD_HEIGHT / 2 - position.y) * recenter;
  return <div className="world-map world-illustrated" ref={host} aria-label="Connected campus map">
    <div className="world-heading"><span className="world-eyebrow">EXPLORE / DISCOVER / DECODE</span><h1>Discovery campus<span>A secret in every department.</span></h1></div>
    <div className="world-tools">
      <button onClick={() => { setDirectory(!directory); setPeople(false); }} aria-label="Places" aria-expanded={directory}><Search size={16} /><span>Places</span></button>
      <button onClick={() => { setPeople(!people); setDirectory(false); }} aria-label={online ? `Players online: ${remotes.length + 1}` : 'Players: playing solo'} aria-expanded={people} className={online ? 'world-online is-live' : 'world-online'}><Users size={16} /><span>{online ? `${remotes.length + 1} online` : 'Solo'}</span></button>
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
      <rect x="-4000" y="-4000" width="10000" height="10000" fill="#eeefee" />
      <image href={WORLD_ART} x="0" y="0" width={WORLD_WIDTH} height={WORLD_HEIGHT} aria-label="Detailed connected building interior" />
      {WORLD_ZONES.map((zone, i) => {
        const visited = explored.includes(zone.id), mission = assignment?.room === zone.id;
        return <g key={zone.id} className="world-zone" role="button" tabIndex={active ? 0 : -1} aria-label={`Walk to ${zone.name}`}
          onClick={() => goTo(zone)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goTo(zone); } }}>
          <title>{zone.name} — {visited ? 'Discovered' : 'Explore for 25 XP'} — {zone.action}</title>
          <rect className="world-room-outline" x={zone.x + 1} y={zone.y + 1} width={zone.width - 2} height={zone.height - 2} fill="transparent" stroke="transparent" />
          <g transform={`translate(${zone.x + 8} ${zone.y + 1})`}>
            <rect width="238" height="19" rx="4" fill={current?.id === zone.id ? '#183744' : '#314650'} />
            <rect width="24" height="19" rx="4" fill={mission ? '#e9b95e' : visited ? '#54b8a5' : '#536872'} />
            <text x="12" y="13" textAnchor="middle" fill={visited || mission ? '#142b37' : '#e8eef0'} fontSize="8" fontWeight="800">{String(i + 1).padStart(2, '0')}</text>
            <text x="31" y="13" fill="#f2f6f7" fontSize="9" fontWeight="650">{zone.short}</text>
            <text x="225" y="13" textAnchor="end" fill={mission ? '#f4cb76' : '#77d4c1'} fontSize="9">{mission ? '◆' : visited ? '✓' : '+'}</text>
          </g>
          {!visited && <g className="world-discovery-token" transform={`translate(${centerOf(zone).x + 20} ${centerOf(zone).y})`}><ellipse cy="6" rx="7" ry="3" fill="#263942" opacity=".15" /><path d="M0-12L7-7V1L0 6L-7 1V-7Z" fill="#f2c467" stroke="#fff2c9" strokeWidth="1" /><path d="M-3-3H3M0-6V0" stroke="#795623" strokeWidth="1.3" /></g>}
          {mission && <g className="world-mission-beacon" transform={`translate(${doorX(zone)} ${zone.y + zone.height + 7})`}><ellipse rx="12" ry="4" fill="#e9b95e" opacity=".25" /><path d="M-4-7L0-3L4-7" fill="none" stroke="#b58830" strokeWidth="2" /></g>}
        </g>;
      })}
      {target && <polyline points={[position, ...route.current].map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#3197b4" strokeWidth="2" strokeDasharray="8 9" opacity=".65" />}
      {nearby && <g className="world-computer-hint" transform={`translate(${nearby.seat.x} ${nearby.seat.y})`} aria-hidden="true">
        <ellipse rx="15" ry="7" fill="none" stroke="#f4ca76" strokeWidth="2" />
      </g>}
      {remotes.map(a => {
        const at = remotePoint(a), bubble = bubbles[a.userId];
        return <g key={a.userId} transform={`translate(${at.x} ${at.y})`} className="world-remote" aria-label={`${a.name}${a.seat ? ' (at a computer)' : ''}`}>
          <WorldCharacter appearance={appearanceOf(a.look)} facing={a.seat ? 'north' : FROM_WIRE[a.facing]} moving={a.walking} seated={Boolean(a.seat)} />
          <text className="world-nametag" y={a.seat ? -42 : -52} textAnchor="middle">{a.name}</text>
          {bubble && bubble.until > Date.now() && <SpeechBubble text={QUICK_CHAT[bubble.phrase]} />}
        </g>;
      })}
      <g transform={`translate(${computer?.seat.x ?? position.x} ${computer?.seat.y ?? position.y})`} aria-label="Your character" data-testid="world-player" data-x={Math.round(position.x)} data-y={Math.round(position.y)} data-seat={seat ?? undefined}>
        <WorldCharacter appearance={appearance} facing={computer ? 'north' : facing} moving={moving} seated={Boolean(computer)} />
        {nearby && <g className="world-sit-prompt" transform="translate(0 -60)"><rect x="-38" y="-9" width="76" height="15" rx="7" fill="#183143" /><text y="1.5" textAnchor="middle" fontSize="7.5" fill="#f4ca76" fontWeight="700">E · Sit at computer</text></g>}
        {myBubble && <SpeechBubble text={QUICK_CHAT[myBubble.phrase]} />}
      </g>
    </svg>
    <div className="world-player-hud"><button className="world-customize-button" aria-label="Customize character" aria-haspopup="dialog" title="Customize your character" onClick={() => onOpen('customize')}><svg viewBox="-13 -54 26 57" aria-hidden="true"><WorldCharacter appearance={appearance} facing="south" moving={false} /></svg><span>Edit look</span></button><div><b className="world-rank-line"><RankMedal tier={rank.medal} size={20} />{[appearance.nickname.trim(), rank.name].filter(Boolean).join(' · ')}</b><span>{explored.length * 25 + story.completed * 100} XP · {explored.length}/{WORLD_ZONES.length} places · {story.completed}/4 missions</span><div className="world-explore-pips" role="meter" aria-label="Campus exploration" aria-valuemin={0} aria-valuemax={WORLD_ZONES.length} aria-valuenow={explored.length}>{WORLD_ZONES.map((z, i) => <span key={z.id} data-on={i < explored.length || undefined} />)}</div><span>{upcoming ? `${upcoming.places - explored.length} more ${upcoming.places - explored.length === 1 ? 'place' : 'places'} to ${upcoming.name}` : 'Top rank reached'}</span></div></div>
    {rankUp && <div role="status" className="world-rank-up" data-tier={rankUp.medal}>
      <RankMedal tier={rankUp.medal} size={64} />
      <div><b>Rank up!</b><h2>{rankUp.name}</h2><p>{nextRank(rankUp.places) ? `Discover ${nextRank(rankUp.places)!.places - rankUp.places} more places to become ${nextRank(rankUp.places)!.name}.` : 'You have discovered every place on campus.'}</p></div>
      <button aria-label="Close rank up" onClick={() => setRankUp(null)}><X size={16} /></button>
    </div>}
    {discovery && !rankUp && <div role="status" className="world-discovery-toast"><b>+25 XP · Place discovered</b><span>{discovery}</span></div>}
    {people && <aside className="world-directory world-people" aria-label="Players on campus"><div><h2>On campus</h2><button aria-label="Close players" onClick={() => setPeople(false)}><X size={18} /></button></div>
      {!online && <p className="world-people-note">The campus server isn't answering, so you're exploring solo. Everything else still works.</p>}
      {online && <ul>{[{ userId: 0, name: appearance.nickname.trim() || 'You', where: current?.short ?? 'Hallway', atComputer: Boolean(seat) }, ...campusPeople].map((p, i) => <li key={p.userId}><b>{p.name}{i === 0 ? ' (you)' : ''}</b><span>{p.atComputer ? 'At a computer · ' : ''}{p.where}</span></li>)}</ul>}
      <h3><MessageCircle size={13} /> Quick chat</h3>
      <ol className="world-chat-log">{chat.length ? chat.slice(-6).map(l => <li key={l.id}><b>{l.name}</b> {QUICK_CHAT[l.phrase]}</li>) : <li>No messages yet.</li>}</ol>
      <div className="world-phrases">{QUICK_CHAT.map((text, i) => <button key={i} disabled={!online} onClick={() => say(i)}>{text}</button>)}</div>
    </aside>}
    {computer && active && <WorldComputerScreen computer={computer} online={online} people={campusPeople} chat={chat} onLaunch={onOpen} onSay={say} onStand={stand} />}
    {directory && <aside className="world-directory" aria-label="Campus places"><div><h2>Where to?</h2><button aria-label="Close places" onClick={() => setDirectory(false)}><X size={18} /></button></div><input aria-label="Find a place" placeholder="Find a place…" value={query} onChange={e => setQuery(e.target.value)} autoFocus /><nav>{WORLD_ZONES.filter(z => z.name.toLowerCase().includes(query.toLowerCase())).map(z => <button key={z.id} onClick={() => goTo(z)}><span style={{ background: explored.includes(z.id) ? '#54b8a5' : z.color }} />{z.name}<ArrowRight size={14} /></button>)}</nav></aside>}
    <div className="world-bottom">
      <div className="world-location" aria-live="polite"><div className="world-location-icon"><Compass size={23} /></div><div><span>{target ? 'ON YOUR WAY TO' : current ? 'YOU ARE HERE' : 'EXPLORING'}</span><h2>{target?.name ?? current?.name ?? 'Main hallway'}</h2><p>{target ? 'Follow the dotted path, or use movement controls.' : current?.description ?? 'Follow the indoor hallway to your next room.'}</p></div>{!target && nearby && <button className="world-open world-sit" onClick={() => sit(nearby.id)}><Monitor size={16} />Use computer</button>}{!target && current && <button className="world-open" onClick={() => onOpen(current.activity)}>{current.action}<ArrowRight size={17} /></button>}{target && <button className="world-open" onClick={() => { route.current = []; setTarget(null); }}>Stop walking</button>}</div>
      <div className="world-footnote"><span>Click a room to walk there · WASD / arrows to explore · E to interact or sit at a computer</span><button onClick={() => onOpen('mission')}>{assignment ? `Next: ${assignment.title}` : 'Replay your first mission'} <ArrowRight size={13} /></button></div>
    </div>
    <div className="world-joystick"><Joystick onChange={(x, y) => { joystick.current = { x, y: -y }; }} /></div>
  </div>;
}

