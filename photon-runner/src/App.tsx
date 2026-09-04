import React, { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { TopNav, Section } from './TopNav';
import { HomeHub, ModeId } from './HomeHub';
import { CustomizeScreen } from './CustomizeScreen';
import { LabsHub } from './LabsHub';
import { LabRunner } from './LabRunner';
import { NetworkDefenderScreen } from './NetworkDefenderScreen';
import { QuantumPhenomenaLab } from './QuantumPhenomenaLab';
import { PhantomQScene } from './PhantomQScene';
import { RoomsHub } from './RoomsHub';
import { RoomRunner } from './RoomRunner';
import { Leaderboard } from './Leaderboard';
import { QkdLobby, type QkdRole } from './QkdLobby';
import { QkdGameScreen } from './QkdGameScreen';
import { CampaignScene1 } from './CampaignScene1';
import { CampaignScene2 } from './CampaignScene2';
import { CampusScreen } from './CampusScreen';
import { QuantumLabScreen } from './QuantumLabScreen';
import { nextCampaignScreen } from './campaignProgress';
import { useTheme } from './theme';
import { SceneManager } from './engine/SceneManager';

type Screen =
  | { name: 'home' }
  | { name: 'campus' }
  | { name: 'quantum-lab-interior' }
  | { name: 'customize' }
  | { name: 'qkd-attack' }
  | { name: 'labs' }
  | { name: 'lab'; labId: string }
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
      return 'qkd-attack';
    case 'labs':
    case 'lab':
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
  home: '',
  campus: 'Research Campus',
  'quantum-lab-interior': 'Quantum Lab',
  customize: 'Character creator',
  'qkd-attack': 'Phantom Q · Headquarters',
  labs: 'Security labs',
  lab: 'Security labs · running',
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
  'home',
  'campus',
  'quantum-lab-interior',
  'customize',
  'qkd-attack',
  'labs',
  'lab',
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
    screen.name === 'campus' || screen.name === 'quantum-lab-interior' || screen.name === 'qkd-attack';

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
        {screen.name === 'home' && <HomeHub onOpen={openMode} />}
        {screen.name === 'campus' && <CampusScreen onEnterBuilding={(sceneId) => go(sceneId as Screen['name'])} />}
        {screen.name === 'quantum-lab-interior' && (
          <QuantumLabScreen onOpenSimulator={() => go('quantum-scene')} />
        )}
        {screen.name === 'customize' && <CustomizeScreen onDone={goHome} onBack={goHome} />}
        {screen.name === 'qkd-attack' && <PhantomQScene />}
        {screen.name === 'labs' && (
          <LabsHub onOpenLab={(labId) => go('lab', { labId })} onOpenGame={() => go('network-defender')} />
        )}
        {screen.name === 'lab' && <LabRunner labId={screen.labId} />}
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
      </main>
    </div>
  );
}
