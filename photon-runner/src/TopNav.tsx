import React from 'react';
import {
  ArrowLeft,
  BookOpen,
  Eye,
  FlaskConical,
  Home,
  Moon,
  Radio,
  Shield,
  Sparkles,
  Sun,
  Terminal as TerminalIcon,
  Users,
} from 'lucide-react';
import type { ModeId } from './HomeHub';
import type { ThemeMode } from './theme';

export type Section = 'home' | ModeId;

interface TopNavProps {
  active: Section;
  onSelect: (section: Section) => void;
  onBack?: () => void;
  breadcrumb?: string;
  theme: ThemeMode;
  onToggleTheme: () => void;
}

const ITEMS: { id: Section; label: string; Icon: React.ComponentType<{ size?: number }>; glow: string }[] = [
  { id: 'home', label: 'Home', Icon: Home, glow: '#94a3b8' },
  { id: 'qkd-attack', label: 'Attack', Icon: TerminalIcon, glow: '#fb7185' },
  { id: 'rooms', label: 'Rooms', Icon: BookOpen, glow: '#22d3ee' },
  { id: 'qkd-multiplayer', label: 'Intercept', Icon: Radio, glow: '#60a5fa' },
  { id: 'quantum', label: '3D Lab', Icon: Sparkles, glow: '#fbbf24' },
  { id: 'labs', label: 'Labs', Icon: FlaskConical, glow: '#a78bfa' },
  { id: 'defender', label: 'Defender', Icon: Shield, glow: '#34d399' },
];

export function TopNav({ active, onSelect, onBack, breadcrumb, theme, onToggleTheme }: TopNavProps) {
  return (
    <header
      className="sticky top-0 z-50 shrink-0 backdrop-blur-xl"
      style={{
        borderBottom: '1px solid rgb(var(--glass-border)/var(--glass-border-alpha))',
        background: 'color-mix(in oklab, var(--bg-base) 82%, transparent)',
      }}
    >
      <div className="max-w-6xl mx-auto px-3 py-2.5 flex items-center gap-3">
        <button onClick={() => onSelect('home')} className="flex items-center gap-2 shrink-0" aria-label="Quantum Lab home">
          <span
            className="relative grid place-items-center w-7 h-7 rounded-lg text-[11px] font-black"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-2))', color: '#04100e' }}
          >
            Q
            <span className="absolute inset-0 rounded-lg a-ring" style={{ ['--glow' as string]: 'var(--accent)' }} />
          </span>
          <span className="hidden sm:block h-section text-sm text-grad">QUANTUM LAB</span>
        </button>

        {breadcrumb && (
          <div className="hidden md:flex items-center gap-2 min-w-0">
            <span className="ink-4">/</span>
            <span className="label-mono !tracking-[.12em] truncate">{breadcrumb}</span>
          </div>
        )}

        <nav className="seg ml-auto overflow-x-auto">
          {ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              data-on={active === item.id}
              aria-current={active === item.id ? 'page' : undefined}
              title={item.label}
              className="px-2.5 py-1.5 text-[11px] font-semibold whitespace-nowrap flex items-center gap-1.5"
            >
              <item.Icon size={13} />
              <span className="hidden lg:inline">{item.label}</span>
            </button>
          ))}
        </nav>

        <button
          onClick={onToggleTheme}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          className="btn btn-ghost w-9 h-9 rounded-xl shrink-0"
        >
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </button>

        {onBack && (
          <button onClick={onBack} className="btn btn-ghost px-3 py-1.5 text-[11px] shrink-0">
            <ArrowLeft size={13} />
            <span className="hidden sm:inline">Back</span>
          </button>
        )}
      </div>
    </header>
  );
}
