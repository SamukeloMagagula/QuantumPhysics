import React, { useCallback, useEffect, useRef, useSyncExternalStore, lazy, Suspense } from 'react';
import { TopNav, Section } from './TopNav';
import type { ModeId } from './HomeHub';
import { WorldMap } from './WorldMap';
import { ActivityOverlay } from './ActivityOverlay';
import type { WorldActivity } from './worldLayout';
import { QkdConsole } from './QkdConsole';
import { HardwareLabPanel } from './HardwareLabPanel';
import { ForensicsPanel } from './ForensicsPanel';
import { completeAssignment, saveFacilityStory } from './facilityStory';
import type { AttackState } from './qkdAttack';
import { useState } from 'react';
import { nextCampaignScreen } from './features/campaign/campaignProgress';
import { useTheme } from './theme';
import { SceneManager } from './engine/SceneManager';
import { ASSIGNMENTS, readFacilityStory } from './facilityStory';

import type { RoomId } from './pqRooms';
import type { QkdRole } from './QkdLobby';

const CustomizeScreen = lazy(() => import('./CustomizeScreen').then(m => ({ default: m.CustomizeScreen })));
const FirstMission = lazy(() => import('./FirstMission').then(m => ({ default: m.FirstMission })));
const LabsHub = lazy(() => import('./LabsHub').then(m => ({ default: m.LabsHub })));
const LabRunner = lazy(() => import('./LabRunner').then(m => ({ default: m.LabRunner })));
const LabExamView = lazy(() => import('./LabExamView').then(m => ({ default: m.LabExamView })));
const NetworkDefenderScreen = lazy(() => import('./NetworkDefenderScreen').then(m => ({ default: m.NetworkDefenderScreen })));
const QuantumPhenomenaLab = lazy(() => import('./features/quantum/QuantumPhenomenaLab').then(m => ({ default: m.QuantumPhenomenaLab })));
const RoomsHub = lazy(() => import('./RoomsHub').then(m => ({ default: m.RoomsHub })));
const RoomRunner = lazy(() => import('./RoomRunner').then(m => ({ default: m.RoomRunner })));
const Leaderboard = lazy(() => import('./Leaderboard').then(m => ({ default: m.Leaderboard })));
const QkdLobby = lazy(() => import('./QkdLobby').then(m => ({ default: m.QkdLobby })));
const QkdGameScreen = lazy(() => import('./QkdGameScreen').then(m => ({ default: m.QkdGameScreen })));
const CampaignScene1 = lazy(() => import('./features/campaign/CampaignScene1').then(m => ({ default: m.CampaignScene1 })));
const CampaignScene2 = lazy(() => import('./features/campaign/CampaignScene2').then(m => ({ default: m.CampaignScene2 })));

type Screen =
  | { name: 'first-mission' }
  | { name: 'mission-console' }
  | { name: 'hardware' }
  | { name: 'forensics' }
  | { name: 'server-hall-3d' }
  | { name: 'facility-3d' }
  | { name: 'home' }
  | { name: 'campus' }
  | { name: 'quantum-lab-interior' }
  | { name: 'customize' }
  | { name: 'qkd-attack'; roomId?: RoomId }
  | { name: 'labs' }
  | { name: 'lab'; labId: string }
  | { name: 'lab-exam'; examId: string }
  | { name: 'network-defender' }
  | { name: 'quantum-scene' }
  | { name: 'rooms' }
  | { name: 'room'; roomId: string }
  | { name: 'leaderboard' }
  | { name: 'qkd-lobby' }
  | { name: 'qkd-game'; code: string }
  | { name: 'campaign-scene1' }
  | { name: 'campaign-scene2' };

function sectionOf(screen: Screen): Section {
  switch (screen.name) {
    case 'home':
    case 'campus':
      return 'home';
    case 'qkd-attack':
    case 'mission-console':
    case 'hardware':
    case 'forensics':
    case 'first-mission':
    case 'server-hall-3d':
      return 'qkd-attack';
    case 'facility-3d':
      return 'facility3d';
    case 'labs':
    case 'lab':
    case 'lab-exam':
      return 'labs';
    case 'network-defender':
      return 'defender';
    case 'quantum-scene':
    case 'quantum-lab-interior':
      return 'quantum';
    case 'customize':
      return 'customize';
    case 'rooms':
    case 'room':
    case 'leaderboard':
      return 'rooms';
    case 'qkd-lobby':
    case 'qkd-game':
      return 'qkd-multiplayer';
    case 'campaign-scene1':
    case 'campaign-scene2':
      return 'campaign';
  }
}

const BREADCRUMBS: Record<Screen['name'], string> = {
  'mission-console': 'Mission control',
  hardware: 'Engineering workshop',
  forensics: 'Signal evidence',
  'first-mission': 'Operation 01 · Find the meeting place',
  'server-hall-3d': 'Phantom Q · Server Hall 3D',
  'facility-3d': 'Phantom Q · 3D Facility',
  home: '',
  campus: 'Research Campus',
  'quantum-lab-interior': 'Quantum Lab',
  customize: 'Character creator',
  'qkd-attack': 'Phantom Q · Headquarters',
  labs: 'Security labs',
  lab: 'Security labs · running',
  'lab-exam': 'Security labs · section test',
  'network-defender': 'Network defender',
  'quantum-scene': 'Quantum 3D lab',
  rooms: 'Symmetric Cryptography',
  room: 'Symmetric Cryptography · room',
  leaderboard: 'Leaderboard',
  'qkd-lobby': 'Quantum Intercept',
  'qkd-game': 'Quantum Intercept · in progress',
  'campaign-scene1': 'Quantum Breach · Symmetric Cryptography',
  'campaign-scene2': 'Quantum Breach · Asymmetric Cryptography',
};

// Every screen is registered with SceneManager as a real, named scene —
// `SceneManager.load('qkd-attack')` genuinely navigates the app from anywhere
// (game code, engine systems, a future storyline script), not just from a
// click handler inside this component. App.tsx renders whatever
// SceneManager says is current instead of owning that state itself.
const SCREEN_IDS: Screen['name'][] = [
  'mission-console', 'hardware', 'forensics',
  'first-mission',
  'server-hall-3d',
  'facility-3d',
  'home',
  'campus',
  'quantum-lab-interior',
  'customize',
  'qkd-attack',
  'labs',
  'lab',
  'lab-exam',
  'network-defender',
  'quantum-scene',
  'rooms',
  'room',
  'leaderboard',
  'qkd-lobby',
  'qkd-game',
  'campaign-scene1',
  'campaign-scene2',
];
for (const id of SCREEN_IDS) SceneManager.register({ id });
if (!SceneManager.currentScene) SceneManager.load('home');

// useSyncExternalStore requires getSnapshot to return a stable reference
// between notifications (React compares with Object.is) — so the merged
// {name, ...params} object is memoized here and only rebuilt when
// SceneManager's id/params actually changed, not on every render.
let cachedId: string | null = null;
let cachedParams: unknown;
let cachedScreen: Screen | null = null;

function screenSnapshot(): Screen {
  const id = (SceneManager.currentScene ?? 'home') as Screen['name'];
  const params = SceneManager.currentSceneParams;
  if (cachedScreen && cachedId === id && cachedParams === params) return cachedScreen;
  cachedId = id;
  cachedParams = params;
  cachedScreen = { name: id, ...(params as object | undefined) } as Screen;
  return cachedScreen;
}

function useScreen(): Screen {
  return useSyncExternalStore((onChange) => SceneManager.subscribe(onChange), screenSnapshot);
}

function go(name: Screen['name'], params?: Record<string, unknown>): void {
  SceneManager.load(name, params);
}

export default function App() {
  const screen = useScreen();
  const { theme, toggle } = useTheme();
  const mainRef = useRef<HTMLElement>(null);
  const [session, setSession] = useState<AttackState | null>(null);
  const task = ASSIGNMENTS[readFacilityStory().completed];
  const recordSession = useCallback((next: AttackState | null) => {
    setSession(next);
    const story = readFacilityStory();
    const current = ASSIGNMENTS[story.completed];
    if (current && next) saveFacilityStory(completeAssignment({ ...story, access: true }, next, current.room));
  }, []);

  // `<main>` is one persistent scroll container across every screen — React
  // just swaps which child renders inside it, so a screen you scrolled down
  // on leaves that scroll position behind for whatever you navigate to next
  // (e.g. clicking a below-the-fold card auto-scrolls the page, and the next
  // screen inherits that offset, landing with its own header cut off).
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, left: 0 });
  }, [screen]);

  const goHome = useCallback(() => go('home'), []);

  const openMode = useCallback((mode: ModeId) => {
    switch (mode) {
      case 'first-mission':
        go(readFacilityStory().completed > 0 && readFacilityStory().completed < ASSIGNMENTS.length ? 'mission-console' : 'first-mission');
        break;
      case 'campus':
        go('campus');
        break;
      case 'qkd-attack':
        go('qkd-attack', { roomId: readFacilityStory().access ? ASSIGNMENTS[readFacilityStory().completed]?.room ?? 'ops' : undefined });
        break;
      case 'labs':
        go('labs');
        break;
      case 'quantum':
        go('quantum-scene');
        break;
      case 'defender':
        go('network-defender');
        break;
      case 'customize':
        go('customize');
        break;
      case 'rooms':
        go('rooms');
        break;
      case 'qkd-multiplayer':
        go('qkd-lobby');
        break;
      case 'facility3d':
        go('facility-3d');
        break;
      case 'campaign': {
        const next = nextCampaignScreen();
        go(next === 'campaign-scene1' ? 'campaign-scene1' : 'campaign-scene2');
        break;
      }
    }
  }, []);

  const handleSelectSection = useCallback(
    (section: Section) => {
      if (section === 'home') goHome();
      else openMode(section);
    },
    [goHome, openMode]
  );

  const mapScreen = ['home', 'campus', 'qkd-attack', 'server-hall-3d', 'facility-3d', 'quantum-lab-interior'].includes(screen.name);
  const openActivity = (activity: WorldActivity) => {
    const screens: Record<WorldActivity, Screen['name']> = { mission: readFacilityStory().completed > 0 && readFacilityStory().completed < ASSIGNMENTS.length ? 'mission-console' : 'first-mission', labs: 'labs', rooms: 'rooms', defender: 'network-defender', quantum: 'quantum-scene', campaign: nextCampaignScreen(), hardware: 'hardware', forensics: 'forensics', multiplayer: 'qkd-lobby', customize: 'customize' };
    go(screens[activity]);
  };
  const destination = screen.name === 'qkd-attack' ? screen.roomId : screen.name === 'server-hall-3d' ? 'server-hall' : screen.name === 'quantum-lab-interior' ? 'quantum-wing' : undefined;

  return (
    <div
      className="h-screen w-full flex flex-col overflow-hidden"
      style={{ background: 'var(--bg-base)', color: 'var(--ink-1)' }}
    >
      <TopNav
        active={mapScreen ? 'home' : sectionOf(screen)}
        onSelect={handleSelectSection}
        onBack={undefined}
        breadcrumb={undefined}
        theme={theme}
        onToggleTheme={toggle}
      />

      <main ref={mainRef} className="flex-1 min-h-0 relative overflow-hidden">
        <div className="absolute inset-0" inert={!mapScreen || undefined}><WorldMap active={mapScreen} destination={destination} onOpen={openActivity} /></div>
        {!mapScreen && <ActivityOverlay title={BREADCRUMBS[screen.name]} onClose={goHome}>
        <Suspense fallback={<p role="status" className="p-6 ink-2">Loading…</p>}>
        {screen.name === 'first-mission' && <FirstMission onExit={goHome} onContinue={() => {
          const story = readFacilityStory();
          go('qkd-attack', { roomId: ASSIGNMENTS[story.completed]?.room ?? 'ops' });
        }} />}
        {screen.name === 'customize' && <CustomizeScreen onDone={goHome} onBack={goHome} />}
        {screen.name === 'mission-console' && <QkdConsole initialTargetId={session?.status === 'active' ? session.target.id : task?.target ?? 'testbed'} initialSession={session} onSessionChange={recordSession} embedded onClose={goHome} />}
        {screen.name === 'hardware' && <HardwareLabPanel onClose={goHome} />}
        {screen.name === 'forensics' && <ForensicsPanel session={session} onClose={goHome} />}
        {screen.name === 'labs' && (
          <LabsHub
            onOpenLab={(labId) => go('lab', { labId })}
            onOpenGame={() => go('network-defender')}
            onOpenExam={(examId) => go('lab-exam', { examId })}
          />
        )}
        {screen.name === 'lab' && <LabRunner labId={screen.labId} onExit={() => go('labs')} />}
        {screen.name === 'lab-exam' && (
          <LabExamView examId={screen.examId} onBack={() => go('labs')} />
        )}
        {screen.name === 'network-defender' && <NetworkDefenderScreen />}
        {screen.name === 'quantum-scene' && <QuantumPhenomenaLab />}
        {screen.name === 'rooms' && (
          <RoomsHub onOpenRoom={(roomId) => go('room', { roomId })} onOpenLeaderboard={() => go('leaderboard')} />
        )}
        {screen.name === 'room' && <RoomRunner roomId={screen.roomId} onExit={() => go('rooms')} />}
        {screen.name === 'leaderboard' && <Leaderboard />}
        {screen.name === 'qkd-lobby' && (
          <QkdLobby onEnterGame={(code: string, _role: QkdRole) => go('qkd-game', { code })} onExit={goHome} />
        )}
        {screen.name === 'qkd-game' && <QkdGameScreen code={screen.code} onExit={() => go('qkd-lobby')} />}
        {screen.name === 'campaign-scene1' && (
          <CampaignScene1 onNext={() => go('campaign-scene2')} onExit={goHome} />
        )}
        {screen.name === 'campaign-scene2' && <CampaignScene2 onNext={() => go('qkd-lobby')} onExit={goHome} />}
        </Suspense>
        </ActivityOverlay>}
      </main>
    </div>
  );
}
