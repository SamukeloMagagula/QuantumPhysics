import React, { useCallback, useState } from 'react';
import { TopNav, Section } from './TopNav';
import { HomeHub, ModeId } from './HomeHub';
import { CustomizeScreen } from './CustomizeScreen';
import { LabsHub } from './LabsHub';
import { LabRunner } from './LabRunner';
import { NetworkDefenderScreen } from './NetworkDefenderScreen';
import { QuantumPhenomenaLab } from './QuantumPhenomenaLab';
import { HeistScreen } from './HeistScreen';
import { HeistLobby } from './HeistLobby';
import { HeistMultiplayerLobby } from './HeistMultiplayerLobby';
import { RoomsHub } from './RoomsHub';
import { RoomRunner } from './RoomRunner';
import { Leaderboard } from './Leaderboard';
import { QkdLobby, type QkdRole } from './QkdLobby';
import { QkdGameScreen } from './QkdGameScreen';
import { useTheme } from './theme';

type Screen =
  | { name: 'home' }
  | { name: 'customize' }
  | { name: 'heist-lobby' }
  | { name: 'heist'; mapId: string; tutorial: boolean }
  | { name: 'heist-mp' }
  | { name: 'labs' }
  | { name: 'lab'; labId: string }
  | { name: 'network-defender' }
  | { name: 'quantum-scene' }
  | { name: 'rooms' }
  | { name: 'room'; roomId: string }
  | { name: 'leaderboard' }
  | { name: 'qkd-lobby' }
  | { name: 'qkd-game'; code: string };

function sectionOf(screen: Screen): Section {
  switch (screen.name) {
    case 'home':
      return 'home';
    case 'heist':
    case 'heist-lobby':
      return 'heist';
    case 'heist-mp':
      return 'heist-mp';
    case 'labs':
    case 'lab':
      return 'labs';
    case 'network-defender':
      return 'defender';
    case 'quantum-scene':
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
  }
}

const BREADCRUMBS: Record<Screen['name'], string> = {
  home: '',
  customize: 'Character creator',
  'heist-lobby': 'Quantum Heist · choose a facility',
  heist: 'Quantum Heist',
  'heist-mp': 'Quantum Heist · Online',
  labs: 'Security labs',
  lab: 'Security labs · running',
  'network-defender': 'Network defender',
  'quantum-scene': 'Quantum 3D lab',
  rooms: 'Symmetric Cryptography',
  room: 'Symmetric Cryptography · room',
  leaderboard: 'Leaderboard',
  'qkd-lobby': 'Quantum Intercept',
  'qkd-game': 'Quantum Intercept · in progress',
};

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const { theme, toggle } = useTheme();

  const goHome = useCallback(() => setScreen({ name: 'home' }), []);

  const openMode = useCallback((mode: ModeId) => {
    switch (mode) {
      case 'heist':
        setScreen({ name: 'heist-lobby' });
        break;
      case 'heist-mp':
        setScreen({ name: 'heist-mp' });
        break;
      case 'labs':
        setScreen({ name: 'labs' });
        break;
      case 'quantum':
        setScreen({ name: 'quantum-scene' });
        break;
      case 'defender':
        setScreen({ name: 'network-defender' });
        break;
      case 'customize':
        setScreen({ name: 'customize' });
        break;
      case 'rooms':
        setScreen({ name: 'rooms' });
        break;
      case 'qkd-multiplayer':
        setScreen({ name: 'qkd-lobby' });
        break;
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
  // The heist owns the viewport (3D canvas + overlays); everything else scrolls.
  const immersive = screen.name === 'heist';

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

      <main className={`flex-1 min-h-0 ${immersive ? 'overflow-hidden' : 'overflow-y-auto'}`}>
        {screen.name === 'home' && <HomeHub onOpen={openMode} />}
        {screen.name === 'customize' && <CustomizeScreen onDone={goHome} onBack={goHome} />}
        {screen.name === 'heist-lobby' && (
          <HeistLobby
            onStart={(mapId, tutorial) => setScreen({ name: 'heist', mapId, tutorial })}
            onExit={goHome}
          />
        )}
        {screen.name === 'heist' && (
          <HeistScreen
            onExit={() => setScreen({ name: 'heist-lobby' })}
            theme={theme}
            mapId={screen.mapId}
            tutorial={screen.tutorial}
          />
        )}
        {screen.name === 'heist-mp' && <HeistMultiplayerLobby onExit={goHome} />}
        {screen.name === 'labs' && (
          <LabsHub
            onOpenLab={(labId) => setScreen({ name: 'lab', labId })}
            onOpenGame={() => setScreen({ name: 'network-defender' })}
          />
        )}
        {screen.name === 'lab' && <LabRunner labId={screen.labId} />}
        {screen.name === 'network-defender' && <NetworkDefenderScreen />}
        {screen.name === 'quantum-scene' && <QuantumPhenomenaLab />}
        {screen.name === 'rooms' && (
          <RoomsHub
            onOpenRoom={(roomId) => setScreen({ name: 'room', roomId })}
            onOpenLeaderboard={() => setScreen({ name: 'leaderboard' })}
          />
        )}
        {screen.name === 'room' && (
          <RoomRunner roomId={screen.roomId} onExit={() => setScreen({ name: 'rooms' })} />
        )}
        {screen.name === 'leaderboard' && <Leaderboard />}
        {screen.name === 'qkd-lobby' && (
          <QkdLobby
            onEnterGame={(code: string, _role: QkdRole) => setScreen({ name: 'qkd-game', code })}
            onExit={goHome}
          />
        )}
        {screen.name === 'qkd-game' && (
          <QkdGameScreen code={screen.code} onExit={() => setScreen({ name: 'qkd-lobby' })} />
        )}
      </main>
    </div>
  );
}
