import React, { memo, useEffect, useState } from 'react';
import { ArrowRight, CloudUpload, Compass, MessageCircle, Monitor, X } from 'lucide-react';
import { fetchSaveCode, restoreFromCode } from './progressClient';
import type { CharacterAppearance } from './characterAppearance';
import type { ChatLine } from './floorClient';
import { QUICK_CHAT } from './floorPresence';
import { RankMedal } from './RankMedal';
import type { CampusPerson } from './WorldComputer';
import { WorldCharacter } from './WorldCharacter';
import type { WorldComputer } from './worldComputers';
import { nextRank, rankFor, type ExplorerRank } from './worldExploration';
import { WORLD_ZONES, type CampusZoneId, type WorldZone } from './worldLayout';

/** Name, medal, XP and progress toward the next explorer rank. */
export const PlayerHud = memo(function PlayerHud({
  appearance,
  explored,
  missionsDone,
  onCustomize,
}: {
  appearance: CharacterAppearance;
  explored: readonly CampusZoneId[];
  missionsDone: number;
  onCustomize: () => void;
}) {
  const rank = rankFor(explored.length);
  const upcoming = nextRank(explored.length);
  const remaining = upcoming ? upcoming.places - explored.length : 0;
  return (
    <div className="world-player-hud">
      <button
        className="world-customize-button"
        aria-label="Customize character"
        aria-haspopup="dialog"
        title="Customize your character"
        onClick={onCustomize}
      >
        <svg viewBox="-13 -54 26 57" aria-hidden="true">
          <WorldCharacter appearance={appearance} facing="south" moving={false} />
        </svg>
        <span>Edit look</span>
      </button>
      <div>
        <b className="world-rank-line">
          <RankMedal tier={rank.medal} size={20} />
          {[appearance.nickname.trim(), rank.name].filter(Boolean).join(' · ')}
        </b>
        <span>
          {explored.length * 25 + missionsDone * 100} XP · {explored.length}/{WORLD_ZONES.length} places · {missionsDone}/4 missions
        </span>
        <div
          className="world-explore-pips"
          role="meter"
          aria-label="Campus exploration"
          aria-valuemin={0}
          aria-valuemax={WORLD_ZONES.length}
          aria-valuenow={explored.length}
        >
          {WORLD_ZONES.map((z, i) => (
            <span key={z.id} data-on={i < explored.length || undefined} />
          ))}
        </div>
        <span>{upcoming ? `${remaining} more ${remaining === 1 ? 'place' : 'places'} to ${upcoming.name}` : 'Top rank reached'}</span>
      </div>
    </div>
  );
});

export function RankUpCard({ rank, onClose }: { rank: ExplorerRank; onClose: () => void }) {
  const next = nextRank(rank.places);
  return (
    <div role="status" className="world-rank-up" data-tier={rank.medal}>
      <RankMedal tier={rank.medal} size={64} />
      <div>
        <b>Rank up!</b>
        <h2>{rank.name}</h2>
        <p>
          {next
            ? `Discover ${next.places - rank.places} more places to become ${next.name}.`
            : 'You have discovered every place on campus.'}
        </p>
      </div>
      <button aria-label="Close rank up" onClick={onClose}>
        <X size={16} />
      </button>
    </div>
  );
}

export function DiscoveryToast({ place }: { place: string }) {
  return (
    <div role="status" className="world-discovery-toast">
      <b>+25 XP · Place discovered</b>
      <span>{place}</span>
    </div>
  );
}

/** Who is on campus, recent quick chat, and the phrases to send. */
export function PeoplePanel({
  online,
  me,
  people,
  chat,
  onSay,
  onClose,
}: {
  online: boolean;
  me: CampusPerson;
  people: CampusPerson[];
  chat: ChatLine[];
  onSay: (phrase: number) => void;
  onClose: () => void;
}) {
  return (
    <aside className="world-directory world-people" aria-label="Players on campus">
      <div>
        <h2>On campus</h2>
        <button aria-label="Close players" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      {!online && (
        <p className="world-people-note">The campus server isn't answering, so you're exploring solo. Everything else still works.</p>
      )}
      {online && (
        <ul>
          {[me, ...people].map((p, i) => (
            <li key={p.userId}>
              <b>
                {p.name}
                {i === 0 ? ' (you)' : ''}
              </b>
              <span>
                {p.atComputer ? 'At a computer · ' : ''}
                {p.where}
              </span>
            </li>
          ))}
        </ul>
      )}
      <h3>
        <MessageCircle size={13} /> Quick chat
      </h3>
      <ol className="world-chat-log">
        {chat.length ? (
          chat.slice(-6).map(l => (
            <li key={l.id}>
              <b>{l.name}</b> {QUICK_CHAT[l.phrase]}
            </li>
          ))
        ) : (
          <li>No messages yet.</li>
        )}
      </ol>
      <div className="world-phrases">
        {QUICK_CHAT.map((text, i) => (
          <button key={i} disabled={!online} onClick={() => onSay(i)}>
            {text}
          </button>
        ))}
      </div>
    </aside>
  );
}

export function PlacesPanel({
  explored,
  onGo,
  onClose,
}: {
  explored: readonly CampusZoneId[];
  onGo: (zone: WorldZone) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  return (
    <aside className="world-directory" aria-label="Campus places">
      <div>
        <h2>Where to?</h2>
        <button aria-label="Close places" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <input aria-label="Find a place" placeholder="Find a place…" value={query} onChange={e => setQuery(e.target.value)} autoFocus />
      <nav>
        {WORLD_ZONES.filter(z => z.name.toLowerCase().includes(query.toLowerCase())).map(z => (
          <button key={z.id} onClick={() => onGo(z)}>
            <span style={{ background: explored.includes(z.id) ? '#54b8a5' : z.color }} />
            {z.name}
            <ArrowRight size={14} />
          </button>
        ))}
      </nav>
    </aside>
  );
}

/** Where you are (or are heading), with the actions available there. */
export function LocationCard({
  target,
  current,
  nearby,
  onSit,
  onOpen,
  onStop,
}: {
  target: WorldZone | null;
  current?: WorldZone;
  nearby?: WorldComputer;
  onSit: (computer: WorldComputer) => void;
  onOpen: (zone: WorldZone) => void;
  onStop: () => void;
}) {
  return (
    <div className="world-location" aria-live="polite">
      <div className="world-location-icon">
        <Compass size={23} />
      </div>
      <div>
        <span>{target ? 'ON YOUR WAY TO' : current ? 'YOU ARE HERE' : 'EXPLORING'}</span>
        <h2>{target?.name ?? current?.name ?? 'Main hallway'}</h2>
        <p>
          {target
            ? 'Follow the dotted path, or use movement controls.'
            : (current?.description ?? 'Follow the indoor hallway to your next room.')}
        </p>
      </div>
      {!target && nearby && (
        <button className="world-open world-sit" onClick={() => onSit(nearby)}>
          <Monitor size={16} />
          Use computer
        </button>
      )}
      {!target && current && (
        <button className="world-open" onClick={() => onOpen(current)}>
          {current.action}
          <ArrowRight size={17} />
        </button>
      )}
      {target && (
        <button className="world-open" onClick={onStop}>
          Stop walking
        </button>
      )}
    </div>
  );
}

/** Show this player's save code, or continue as someone else's on this computer. */
export function SavePanel({ onClose }: { onClose: () => void }) {
  const [code, setCode] = useState<string | null | undefined>(undefined);
  const [entry, setEntry] = useState('');
  const [status, setStatus] = useState<{ busy?: boolean; error?: string }>({});
  useEffect(() => {
    fetchSaveCode().then(setCode);
  }, []);
  const load = async () => {
    setStatus({ busy: true });
    const result = await restoreFromCode(entry);
    if (result.ok) window.location.reload();
    else setStatus({ error: result.message });
  };
  return (
    <aside className="world-directory world-save" aria-label="Save progress">
      <div>
        <h2>Your progress</h2>
        <button aria-label="Close save panel" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <p className="world-people-note">Progress saves automatically. To carry on from another computer, use your save code there.</p>
      <h3>
        <CloudUpload size={13} /> Your save code
      </h3>
      <output className="world-save-code" aria-live="polite">
        {code === undefined ? 'Getting your code…' : (code ?? 'Unavailable — the campus server is offline.')}
      </output>
      <h3>Continue on this computer</h3>
      <form
        className="world-save-form"
        onSubmit={e => {
          e.preventDefault();
          load();
        }}
      >
        <input
          aria-label="Save code"
          placeholder="ABCD-2345"
          value={entry}
          onChange={e => setEntry(e.target.value.toUpperCase())}
          maxLength={12}
          autoComplete="off"
          spellCheck={false}
        />
        <button type="submit" disabled={status.busy || entry.replace(/[^A-Z0-9]/gi, '').length !== 8}>
          {status.busy ? 'Loading…' : 'Load'}
        </button>
      </form>
      {status.error && (
        <p className="world-save-error" role="alert">
          {status.error}
        </p>
      )}
    </aside>
  );
}
