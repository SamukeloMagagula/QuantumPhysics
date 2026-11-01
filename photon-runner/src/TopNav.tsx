import React from 'react';
import { Map, Flag, FlaskConical, Users, Moon, Sun, ChevronDown, Volume2, VolumeX } from 'lucide-react';
import { useMuted } from './sound';
import type { ModeId } from './HomeHub';
import type { ThemeMode } from './theme';
export type Section = 'home' | ModeId;
interface TopNavProps { active: Section; onSelect: (section: Section) => void; onBack?: () => void; breadcrumb?: string; theme: ThemeMode; onToggleTheme: () => void }
const ITEMS = [
  { id: 'home', label: 'Map', Icon: Map },
  { id: 'first-mission', label: 'Mission', Icon: Flag },
  { id: 'labs', label: 'Labs', Icon: FlaskConical },
  { id: 'qkd-multiplayer', label: 'Team play', Icon: Users },
] as const;
export function TopNav({ active, onSelect, theme, onToggleTheme }: TopNavProps) {
  const [muted, setMuted] = useMuted();
  return <header className="campus-nav">
    <button className="campus-brand" onClick={() => onSelect('home')} aria-label="Quantum Lab home"><span>Q</span><div>QUANTUM<span>DISCOVERY CAMPUS</span></div></button>
    <nav aria-label="Main navigation">{ITEMS.map(({ id, label, Icon }) => <button key={id} onClick={() => onSelect(id)} aria-current={active === id || id === 'first-mission' && active === 'qkd-attack' ? 'page' : undefined}><Icon size={16} /><span>{label}</span></button>)}
      <details className="campus-more"><summary>More <ChevronDown size={13} /></summary><div>{([['rooms', 'Rooms'], ['defender', 'Defender'], ['quantum', 'Quantum experiments'], ['campaign', 'Story'], ['customize', 'Your character']] as const).map(([id, label]) => <button key={id} onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); onSelect(id); }}>{label}</button>)}</div></details>
    </nav>
    <button className="campus-theme campus-sound" onClick={() => setMuted(!muted)} aria-pressed={muted} aria-label={muted ? 'Turn sound on' : 'Mute sound'} title={muted ? 'Sound is off' : 'Sound is on'}>{muted ? <VolumeX size={17} /> : <Volume2 size={17} />}</button>
    <button className="campus-theme" onClick={onToggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button>
  </header>;
}
