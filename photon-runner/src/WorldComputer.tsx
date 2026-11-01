import React, { useEffect, useRef } from 'react';
import { Activity, Atom, BookLock, Cpu, FlaskConical, LogOut, MessageCircle, Radio, Search, ShieldCheck, Users, Wrench } from 'lucide-react';
import { appsFor, type WorldComputer } from './worldComputers';
import { QUICK_CHAT, type ChatLine } from './floorPresence';
import type { WorldActivity } from './worldLayout';

const ICONS: Partial<Record<WorldActivity, React.ReactNode>> = {
  mission: <Radio size={20} />, multiplayer: <Users size={20} />, forensics: <Search size={20} />, rooms: <BookLock size={20} />,
  labs: <FlaskConical size={20} />, defender: <ShieldCheck size={20} />, hardware: <Wrench size={20} />, quantum: <Atom size={20} />,
};

export interface CampusPerson { userId: number; name: string; where: string; atComputer: boolean }

/** The screen of the workstation the player is sitting at. */
export function WorldComputerScreen({ computer, online, people, chat, onLaunch, onSay, onStand }: {
  computer: WorldComputer; online: boolean; people: CampusPerson[]; chat: ChatLine[];
  onLaunch: (activity: WorldActivity) => void; onSay: (phrase: number) => void; onStand: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const log = useRef<HTMLOListElement>(null);
  useEffect(() => { ref.current?.querySelector<HTMLElement>('.computer-app')?.focus(); }, [computer.id]);
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }); }, [chat.length]);
  const apps = appsFor(computer);
  return <div className="world-computer" role="dialog" aria-label={computer.label} ref={ref}>
    <header className="computer-bar">
      <Cpu size={15} /><b>{computer.label}</b>
      <span className={online ? 'computer-net is-online' : 'computer-net'}><Activity size={12} />{online ? `Campus network · ${people.length + 1} online` : 'Offline · single player'}</span>
      <button onClick={onStand}><LogOut size={14} />Stand up <kbd>Esc</kbd></button>
    </header>
    <div className="computer-body">
      <section aria-label="Programs" className="computer-apps">
        {apps.map((app, i) => <button key={app.activity} className="computer-app" data-featured={i === 0 || undefined} onClick={() => onLaunch(app.activity)}>
          <span>{ICONS[app.activity]}</span><b>{app.name}</b><small>{app.blurb}</small>
        </button>)}
      </section>
      <section aria-label="Campus network" className="computer-net-panel">
        <h3><Users size={13} />On campus now</h3>
        {!online && <p className="computer-empty">The campus server isn't answering, so you're playing solo. Programs still work.</p>}
        {online && !people.length && <p className="computer-empty">Nobody else is here yet. Share this campus with a friend to play together.</p>}
        {online && people.length > 0 && <ul className="computer-people">{people.map(p => <li key={p.userId}><b>{p.name}</b><span>{p.atComputer ? 'At a computer · ' : ''}{p.where}</span></li>)}</ul>}
        <h3><MessageCircle size={13} />Quick chat</h3>
        <ol className="computer-chat" ref={log} aria-live="polite">
          {chat.length ? chat.map(l => <li key={l.id}><b>{l.name}</b> {QUICK_CHAT[l.phrase]}</li>) : <li className="computer-empty">No messages yet.</li>}
        </ol>
        <div className="computer-phrases" role="group" aria-label="Send a quick chat message">
          {QUICK_CHAT.map((text, i) => <button key={i} disabled={!online} onClick={() => onSay(i)}>{text}</button>)}
        </div>
      </section>
    </div>
  </div>;
}
