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
import { useTheme } from './theme';

type Screen =
  | { name: 'home' }
  | { name: 'customize' }
  | { name: 'heist-lobby' }
  | { name: 'heist'; mapId: string; tutorial: boolean }
  | { name: 'labs' }
  | { name: 'lab'; labId: string }
  | { name: 'network-defender' }
  | { name: 'quantum-scene' };

function sectionOf(screen: Screen): Section {
  switch (screen.name) {
    case 'home':
      return 'home';
    case 'heist':
    case 'heist-lobby':
      return 'heist';
    case 'labs':
    case 'lab':
      return 'labs';
    case 'network-defender':
      return 'defender';
    case 'quantum-scene':
      return 'quantum';
    case 'customize':
      return 'customize';
  }
}

const BREADCRUMBS: Record<Screen['name'], string> = {
  home: '',
  customize: 'Character creator',
  'heist-lobby': 'Quantum Heist · choose a facility',
  heist: 'Quantum Heist',
  labs: 'Security labs',
  lab: 'Security labs · running',
  'network-defender': 'Network defender',
  'quantum-scene': 'Quantum 3D lab',
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
        {screen.name === 'labs' && (
          <LabsHub
            onOpenLab={(labId) => setScreen({ name: 'lab', labId })}
            onOpenGame={() => setScreen({ name: 'network-defender' })}
          />
        )}
        {screen.name === 'lab' && <LabRunner labId={screen.labId} />}
        {screen.name === 'network-defender' && <NetworkDefenderScreen />}
        {screen.name === 'quantum-scene' && <QuantumPhenomenaLab />}
      </main>
    </div>
  );
}
