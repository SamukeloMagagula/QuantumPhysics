import React from 'react';
import { Map, Flag, FlaskConical, Users, Moon, Sun, ChevronDown } from 'lucide-react';
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
  return <header className="campus-nav">
    <button className="campus-brand" onClick={() => onSelect('home')} aria-label="Quantum Lab home"><span>Q</span><div>QUANTUM<span>DISCOVERY CAMPUS</span></div></button>
    <nav aria-label="Main navigation">{ITEMS.map(({ id, label, Icon }) => <button key={id} onClick={() => onSelect(id)} aria-current={active === id || id === 'first-mission' && active === 'qkd-attack' ? 'page' : undefined}><Icon size={16} /><span>{label}</span></button>)}
      <details className="campus-more"><summary>More <ChevronDown size={13} /></summary><div>{([['rooms', 'Rooms'], ['defender', 'Defender'], ['quantum', 'Quantum experiments'], ['campaign', 'Story'], ['customize', 'Your character']] as const).map(([id, label]) => <button key={id} onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); onSelect(id); }}>{label}</button>)}</div></details>
    </nav>
    <button className="campus-theme" onClick={onToggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button>
  </header>;
}
