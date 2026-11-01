import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, CloudUpload, LocateFixed, Map, Minus, Plus, Search, Users } from 'lucide-react';
import { getAppearance } from './characterAppearance';
import { ASSIGNMENTS, readFacilityStory } from './facilityStory';
import { QUICK_CHAT } from './floorPresence';
import { Joystick } from './Joystick';
import { MapBackdrop } from './MapBackdrop';
import type { RoomId } from './pqRooms';
import { RemotePlayers, SpeechBubble, remotePoint } from './RemotePlayers';
import { play } from './sound';
import { useCampusPresence } from './useCampusPresence';
import { useCharacterMovement } from './useCharacterMovement';
import { useExploration } from './useExploration';
import { MAX_ZOOM, useMapZoom } from './useMapZoom';
import { WorldCharacter } from './WorldCharacter';
import { WorldComputerScreen, type CampusPerson } from './WorldComputer';
import { computerById, computerNear, type WorldComputer } from './worldComputers';
import { DiscoveryToast, LocationCard, PeoplePanel, PlacesPanel, PlayerHud, RankUpCard, SavePanel } from './WorldHud';
import { WORLD_ZONES, centerOf, zoneAt, type WorldActivity, type WorldZone } from './worldLayout';

type Panel = 'places' | 'people' | 'save';

/** The persistent campus: walk, discover places, sit at computers, and see everyone else. */
export function WorldMap({
  active,
  destination,
  onOpen,
}: {
  active: boolean;
  destination?: RoomId;
  onOpen: (activity: WorldActivity) => void;
}) {
  const [seat, setSeat] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const seatRef = useRef(seat);
  seatRef.current = seat;
  const nearbyRef = useRef<WorldComputer | undefined>(undefined);
  const openRef = useRef(onOpen);
  openRef.current = onOpen;

  const camera = useMapZoom(active);
  const walker = useCharacterMovement(active, centerOf(WORLD_ZONES[0]), {
    onInteract: () => {
      if (seatRef.current) return false;
      const desk = nearbyRef.current;
      const zone = zoneAt(walker.positionRef.current);
      if (desk) sit(desk);
      else if (zone) openRef.current(zone.activity);
      return Boolean(desk || zone);
    },
    onEscape: () => {
      if (!seatRef.current) return false;
      stand();
      return true;
    },
    onManualMove: () => {
      if (seatRef.current) setSeat(null);
    },
  });
  const { position, facing, moving, target } = walker;

  // Re-read from storage whenever the map comes back into view: an activity may have changed them.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const appearance = useMemo(() => getAppearance(), [active]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const story = useMemo(() => readFacilityStory(), [active]);
  const assignment = ASSIGNMENTS[story.completed];
  const current = zoneAt(position);
  const atCentre = Boolean(current && Math.hypot(position.x - centerOf(current).x, position.y - centerOf(current).y) < 14);
  const { explored, discovery, rankUp, dismissRankUp } = useExploration(active, current, atCentre);
  const presence = useCampusPresence({ position, facing, moving, seat, appearance });

  const computer = computerById(seat);
  const taken = useMemo(() => new Set(presence.peers.map(p => p.seat).filter((id): id is string => Boolean(id))), [presence.peers]);
  const nearby = !computer && !target ? computerNear(position, taken) : undefined;
  nearbyRef.current = nearby;

  function sit(desk: WorldComputer) {
    walker.placeAt(desk.stand, 'north');
    setSeat(desk.id);
    setPanel(null);
    play('sit');
    window.setTimeout(() => play('computerOn'), 250);
  }
  const { setFacing, walkTo } = walker;
  const stand = useCallback(() => {
    setSeat(null);
    setFacing('south');
  }, [setFacing]);

  // Someone else sat down here first, between our last poll and our click.
  useEffect(() => {
    if (seat && taken.has(seat)) stand();
  }, [seat, taken, stand]);

  const { setZoom } = camera;
  const goTo = useCallback(
    (zone: WorldZone) => {
      setSeat(null);
      walkTo(zone);
      setPanel(null);
      setZoom(z => Math.max(1, z));
    },
    [walkTo, setZoom],
  );
  useEffect(() => {
    const zone = WORLD_ZONES.find(z => z.id === destination);
    if (zone) goTo(zone);
  }, [destination, goTo]);

  const people: CampusPerson[] = presence.peers.map(a => ({
    userId: a.userId,
    name: a.name,
    where: zoneAt(remotePoint(a))?.short ?? 'Hallway',
    atComputer: Boolean(a.seat),
  }));
  const me: CampusPerson = {
    userId: 0,
    name: appearance.nickname.trim() || 'You',
    where: current?.short ?? 'Hallway',
    atComputer: Boolean(seat),
  };
  const customize = useCallback(() => openRef.current('customize'), []);
  const togglePanel = (which: Panel) => setPanel(p => (p === which ? null : which));
  const drawAt = computer?.seat ?? position;

  return (
    <div className="world-map world-illustrated" ref={camera.host} aria-label="Connected campus map">
      <div className="world-heading">
        <span className="world-eyebrow">EXPLORE / DISCOVER / DECODE</span>
        <h1>
          Discovery campus<span>A secret in every department.</span>
        </h1>
      </div>
      <div className="world-tools">
        <button onClick={() => togglePanel('places')} aria-label="Places" aria-expanded={panel === 'places'}>
          <Search size={16} />
          <span>Places</span>
        </button>
        <button
          onClick={() => togglePanel('people')}
          aria-label={presence.online ? `Players online: ${people.length + 1}` : 'Players: playing solo'}
          aria-expanded={panel === 'people'}
          className={presence.online ? 'world-online is-live' : 'world-online'}
        >
          <Users size={16} />
          <span>{presence.online ? `${people.length + 1} online` : 'Solo'}</span>
        </button>
        <button onClick={() => togglePanel('save')} aria-label="Save progress" aria-expanded={panel === 'save'}>
          <CloudUpload size={16} />
          <span>Save</span>
        </button>
        <button
          onClick={() => camera.setZoom(camera.overview ? 1 : camera.fitZoom)}
          aria-label={camera.overview ? 'Follow my character' : 'Show whole map'}
        >
          {camera.overview ? <LocateFixed size={17} /> : <Map size={17} />}
          <span>{camera.overview ? 'Follow me' : 'Whole map'}</span>
        </button>
        <div className="world-zoom-controls" role="group" aria-label="Map zoom">
          <button aria-label="Zoom out" title="Zoom out" disabled={camera.overview} onClick={() => camera.adjustZoom(1 / 1.3)}>
            <Minus size={17} />
          </button>
          <output aria-label="Zoom level">{Math.round(camera.zoom * 100)}%</output>
          <button aria-label="Zoom in" title="Zoom in" disabled={camera.zoom >= MAX_ZOOM} onClick={() => camera.adjustZoom(1.3)}>
            <Plus size={17} />
          </button>
        </div>
      </div>

      <svg
        ref={camera.canvas}
        className="world-canvas"
        style={{ touchAction: 'none' }}
        viewBox={camera.viewBox(position)}
        aria-label="Continuous map with connected rooms"
        role="group"
        {...camera.canvasProps}
      >
        <MapBackdrop explored={explored} missionRoom={assignment?.room} currentRoom={current?.id} focusable={active} onSelect={goTo} />
        {target && (
          <polyline
            points={[position, ...walker.route.current].map(p => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke="#3197b4"
            strokeWidth="2"
            strokeDasharray="8 9"
            opacity=".65"
          />
        )}
        {nearby && (
          <g className="world-computer-hint" transform={`translate(${nearby.seat.x} ${nearby.seat.y})`} aria-hidden="true">
            <ellipse rx="15" ry="7" fill="none" stroke="#f4ca76" strokeWidth="2" />
          </g>
        )}
        <RemotePlayers link={presence.link} bubbles={presence.bubbles} />
        <g
          transform={`translate(${drawAt.x} ${drawAt.y})`}
          aria-label="Your character"
          data-testid="world-player"
          data-x={Math.round(position.x)}
          data-y={Math.round(position.y)}
          data-seat={seat ?? undefined}
        >
          <WorldCharacter appearance={appearance} facing={computer ? 'north' : facing} moving={moving} seated={Boolean(computer)} />
          {nearby && (
            <g className="world-sit-prompt" transform="translate(0 -60)">
              <rect x="-38" y="-9" width="76" height="15" rx="7" fill="#183143" />
              <text y="1.5" textAnchor="middle" fontSize="7.5" fill="#f4ca76" fontWeight="700">
                E · Sit at computer
              </text>
            </g>
          )}
          {presence.myBubble && <SpeechBubble text={QUICK_CHAT[presence.myBubble.phrase]} />}
        </g>
      </svg>

      <PlayerHud appearance={appearance} explored={explored} missionsDone={story.completed} onCustomize={customize} />
      {rankUp && <RankUpCard rank={rankUp} onClose={dismissRankUp} />}
      {discovery && !rankUp && <DiscoveryToast place={discovery} />}
      {panel === 'people' && (
        <PeoplePanel
          online={presence.online}
          me={me}
          people={people}
          chat={presence.chat}
          onSay={presence.say}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === 'save' && <SavePanel onClose={() => setPanel(null)} />}
      {panel === 'places' && <PlacesPanel explored={explored} onGo={goTo} onClose={() => setPanel(null)} />}
      {computer && active && (
        <WorldComputerScreen
          computer={computer}
          online={presence.online}
          people={people}
          chat={presence.chat}
          onLaunch={onOpen}
          onSay={presence.say}
          onStand={stand}
        />
      )}

      <div className="world-bottom">
        <LocationCard
          target={target}
          current={current}
          nearby={nearby}
          onSit={sit}
          onOpen={zone => onOpen(zone.activity)}
          onStop={walker.stopWalking}
        />
        <div className="world-footnote">
          <span>Click a room to walk there · WASD / arrows to explore · E to interact or sit at a computer</span>
          <button onClick={() => onOpen('mission')}>
            {assignment ? `Next: ${assignment.title}` : 'Replay your first mission'} <ArrowRight size={13} />
          </button>
        </div>
      </div>
      <div className="world-joystick">
        <Joystick
          onChange={(x, y) => {
            walker.joystick.current = { x, y: -y };
          }}
        />
      </div>
    </div>
  );
}
