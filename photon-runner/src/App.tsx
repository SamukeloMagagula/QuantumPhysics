import React, { useCallback, useEffect, useRef, useSyncExternalStore, lazy, Suspense } from 'react';
import { TopNav, Section } from './TopNav';
import { HomeHub, ModeId } from './HomeHub';
import { nextCampaignScreen } from './features/campaign/campaignProgress';
import { useTheme } from './theme';
import { SceneManager } from './engine/SceneManager';

import type { RoomId } from './pqRooms';
import type { QkdRole } from './QkdLobby';

const CustomizeScreen = lazy(() => import('./CustomizeScreen').then(m => ({ default: m.CustomizeScreen })));
const LabsHub = lazy(() => import('./LabsHub').then(m => ({ default: m.LabsHub })));
const LabRunner = lazy(() => import('./LabRunner').then(m => ({ default: m.LabRunner })));
const LabExamView = lazy(() => import('./LabExamView').then(m => ({ default: m.LabExamView })));
const NetworkDefenderScreen = lazy(() => import('./NetworkDefenderScreen').then(m => ({ default: m.NetworkDefenderScreen })));
const QuantumPhenomenaLab = lazy(() => import('./features/quantum/QuantumPhenomenaLab').then(m => ({ default: m.QuantumPhenomenaLab })));
const PhantomQScene = lazy(() => import('./PhantomQScene').then(m => ({ default: m.PhantomQScene })));
const RoomsHub = lazy(() => import('./RoomsHub').then(m => ({ default: m.RoomsHub })));
const RoomRunner = lazy(() => import('./RoomRunner').then(m => ({ default: m.RoomRunner })));
const Leaderboard = lazy(() => import('./Leaderboard').then(m => ({ default: m.Leaderboard })));
const QkdLobby = lazy(() => import('./QkdLobby').then(m => ({ default: m.QkdLobby })));
const QkdGameScreen = lazy(() => import('./QkdGameScreen').then(m => ({ default: m.QkdGameScreen })));
const CampaignScene1 = lazy(() => import('./features/campaign/CampaignScene1').then(m => ({ default: m.CampaignScene1 })));
const CampaignScene2 = lazy(() => import('./features/campaign/CampaignScene2').then(m => ({ default: m.CampaignScene2 })));
const CampusScreen = lazy(() => import('./CampusScreen').then(m => ({ default: m.CampusScreen })));
const QuantumLabScreen = lazy(() => import('./QuantumLabScreen').then(m => ({ default: m.QuantumLabScreen })));
const ServerHall3DScreen = lazy(() => import('./ServerHall3DScreen').then(m => ({ default: m.ServerHall3DScreen })));
const Facility3DScreen = lazy(() => import('./Facility3DScreen').then(m => ({ default: m.Facility3DScreen })));

type Screen =
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
      case 'campus':
        go('campus');
        break;
      case 'qkd-attack':
        go('qkd-attack');
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

  const showBack = screen.name !== 'home';
  // These own the viewport (3D canvas + overlays); everything else scrolls.
  const immersive =
    screen.name === 'campus' || screen.name === 'quantum-lab-interior' || screen.name === 'qkd-attack' ||
    screen.name === 'server-hall-3d' || screen.name === 'facility-3d';

  return (
    <div
      className="h-screen w-full flex flex-col overflow-hidden"
      style={{ background: 'var(--bg-base)', color: 'var(--ink-1)' }}
    >
      <TopNav
        active={sectionOf(screen)}
        onSelect={handleSelectSection}
        onBack={showBack ? goHome : undefined}
        breadcrumb={BREADCRUMBS[screen.name] || undefined}
        theme={theme}
        onToggleTheme={toggle}
      />

      <main ref={mainRef} className={`flex-1 min-h-0 ${immersive ? 'overflow-hidden' : 'overflow-y-auto'}`}>
        <Suspense fallback={<p role="status" className="p-6 ink-2">Loading…</p>}>
        {screen.name === 'home' && <HomeHub onOpen={openMode} />}
        {screen.name === 'campus' && <CampusScreen onEnterBuilding={(sceneId) => go(sceneId as Screen['name'])} />}
        {screen.name === 'quantum-lab-interior' && (
          <QuantumLabScreen onOpenSimulator={() => go('quantum-scene')} />
        )}
        {screen.name === 'customize' && <CustomizeScreen onDone={goHome} onBack={goHome} />}
        {screen.name === 'qkd-attack' && <PhantomQScene initialRoom={screen.roomId} />}
        {screen.name === 'server-hall-3d' && <ServerHall3DScreen onBack={() => go('qkd-attack', { roomId: 'comms-centre' })} onSelectRoom={roomId => go('qkd-attack', { roomId })} />}
        {screen.name === 'facility-3d' && <Facility3DScreen onBack={goHome} />}
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
      </main>
    </div>
  );
}
