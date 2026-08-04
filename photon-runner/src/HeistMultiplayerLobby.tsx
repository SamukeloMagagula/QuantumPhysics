import React, { useEffect, useRef, useState } from 'react';
import { Check, Crown, Eye, KeyRound, Loader2, Play, Radio, ShieldCheck, Users } from 'lucide-react';
import { MAPS, getMap } from './sceneMaps';
import { MapThumb } from './HeistLobby';

const POLL_MS = 1500;

interface SeatView {
  codename: string;
  kind: 'human' | 'computer';
  alive: boolean;
  isYou: boolean;
  x: number;
  z: number;
  facing: number;
  walking: boolean;
}

interface RoomState {
  code: string;
  phase: 'lobby' | 'play' | 'ended';
  mapId: string;
  isHost: boolean;
  yourSeatIndex: number | null;
  yourCodename: string | null;
  you: { codename: string; role: 'crew' | 'eve'; alive: boolean } | null;
  seats: SeatView[];
  outcome: { winner: 'crew' | 'eve'; youWon: boolean } | null;
}

async function getJSON(url: string, init?: RequestInit): Promise<RoomState> {
  const res = await fetch(url, init);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Request failed.');
  return body;
}

/** Create-or-join a room by code, then a live waiting room / role-reveal screen. */
export function HeistMultiplayerLobby({ onExit }: { onExit: () => void }) {
  const [code, setCode] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [mapId, setMapId] = useState(MAPS[0].id);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const data = await getJSON(`/api/heist/room/${code}`);
        if (!cancelled) setRoom(data);
      } catch {
        if (!cancelled) setError('Connection lost — retrying…');
      }
    };
    poll();
    pollRef.current = window.setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [code]);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = await getJSON('/api/heist/room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mapId }),
      });
      setCode(body.code);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create room.');
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    const clean = joinCode.trim().toUpperCase();
    if (clean.length !== 4) {
      setError('Enter the 4-letter room code.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await getJSON(`/api/heist/room/${clean}/join`, { method: 'POST' });
      setCode(clean);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join room.');
    } finally {
      setBusy(false);
    }
  };

  const changeMap = async (id: string) => {
    if (!code || !room?.isHost || room.phase !== 'lobby') return;
    setMapId(id);
    try {
      await getJSON(`/api/heist/room/${code}/map`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mapId: id }),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change facility.');
    }
  };

  const start = async () => {
    if (!code) return;
    setBusy(true);
    try {
      const data = await getJSON(`/api/heist/room/${code}/start`, { method: 'POST' });
      setRoom(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start.');
    } finally {
      setBusy(false);
    }
  };

  // -------- pick a code (create or join) --------
  if (!code) {
    return (
      <div className="bg-scene bg-mesh min-h-full px-4 py-10 md:px-8">
        <div className="max-w-2xl mx-auto space-y-6">
          <header className="a-rise">
            <h1 className="h-display text-4xl md:text-5xl text-grad">Quantum Heist · Online</h1>
            <p className="text-sm ink-2 mt-2 max-w-xl leading-relaxed">
              Host a room and share the code, or join one already open. The host picks the facility —
              every operative only ever learns their own role.
            </p>
          </header>

          <div className="seg w-fit">
            <button data-on={mode === 'create'} onClick={() => setMode('create')} className="px-4 py-2 text-xs font-semibold">
              Host a room
            </button>
            <button data-on={mode === 'join'} onClick={() => setMode('join')} className="px-4 py-2 text-xs font-semibold">
              Join with a code
            </button>
          </div>

          {mode === 'create' ? (
            <>
              <div className="label-mono mb-1">Facility</div>
              <div className="stagger grid gap-4 md:grid-cols-3">
                {MAPS.map((m, i) => {
                  const on = m.id === mapId;
                  return (
                    <button
                      key={m.id}
                      onClick={() => setMapId(m.id)}
                      style={{
                        ['--glow' as string]: `#${m.palette.wallTop.toString(16).padStart(6, '0')}`,
                        ['--i' as string]: i,
                      }}
                      className="card glass rounded-[22px] p-5 text-left"
                    >
                      <MapThumb map={m} />
                      <h3 className="h-section text-base ink-1 mt-3">{m.name}</h3>
                      <div className="label-mono !text-[9px] mt-1">{m.shape}</div>
                      {on && (
                        <div className="mt-3 text-[11px] flex items-center gap-1" style={{ color: 'var(--accent)' }}>
                          <Check size={12} /> selected
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              <button onClick={create} disabled={busy} className="btn btn-primary px-6 py-3 text-sm">
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Radio size={15} />}
                Host & get a code
              </button>
            </>
          ) : (
            <div className="glass rounded-2xl p-4 flex flex-col gap-3 items-start">
              <label className="label-mono">Room code</label>
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 4))}
                placeholder="ABCD"
                className="w-40 panel rounded-xl px-3 py-2.5 text-lg font-mono tracking-[0.3em] text-center ink-1 outline-none focus:border-[var(--accent)] transition-colors"
              />
              <button onClick={join} disabled={busy} className="btn btn-primary px-6 py-3 text-sm">
                {busy ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />}
                Join room
              </button>
            </div>
          )}

          {error && (
            <p className="text-xs" style={{ color: 'var(--danger)' }}>
              {error}
            </p>
          )}

          <button onClick={onExit} className="btn btn-ghost px-4 py-2.5 text-xs">
            Back
          </button>
        </div>
      </div>
    );
  }

  // -------- waiting room / role reveal --------
  const map = getMap(room?.mapId ?? mapId);
  const humanCount = room?.seats.filter((s) => s.kind === 'human').length ?? 0;

  return (
    <div className="bg-scene bg-mesh min-h-full px-4 py-10 md:px-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <header className="a-rise">
          <div className="label-mono mb-2 flex items-center gap-2">
            <Users size={12} /> Room <span className="text-base font-mono tracking-[0.3em] ink-1">{code}</span>
          </div>
          <h1 className="h-display text-3xl md:text-4xl text-grad">{map.name}</h1>
          <p className="text-sm ink-2 mt-2">{map.blurb}</p>
        </header>

        {error && (
          <p className="text-xs" style={{ color: 'var(--danger)' }}>
            {error}
          </p>
        )}

        {room?.phase === 'lobby' && (
          <>
            <div className="stagger grid gap-3 sm:grid-cols-2">
              {room.seats.map((s, i) => (
                <div key={s.codename} className="card glass rounded-[16px] p-4 flex items-center gap-3" style={{ ['--i' as string]: i }}>
                  <span
                    className="grid place-items-center w-9 h-9 rounded-xl shrink-0"
                    style={{
                      background: s.kind === 'human' ? 'color-mix(in oklab, var(--accent) 18%, transparent)' : 'rgb(var(--glass-tint)/.12)',
                      color: s.kind === 'human' ? 'var(--accent)' : 'var(--ink-4)',
                    }}
                  >
                    {s.isYou ? <Crown size={16} /> : <Users size={15} />}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold ink-1">
                      {s.codename} {s.isYou && <span className="ink-4 text-[10px]">(you)</span>}
                    </div>
                    <div className="label-mono !text-[9px]">{s.kind === 'human' ? 'connected' : 'open — bot fill-in'}</div>
                  </div>
                </div>
              ))}
            </div>

            {room.isHost ? (
              <>
                <div className="label-mono mb-1">Facility (host picks)</div>
                <div className="stagger grid gap-3 sm:grid-cols-3">
                  {MAPS.map((m, i) => {
                    const on = m.id === room.mapId;
                    return (
                      <button
                        key={m.id}
                        onClick={() => changeMap(m.id)}
                        style={{ ['--i' as string]: i }}
                        className="card glass rounded-[16px] p-3 text-left"
                      >
                        <MapThumb map={m} />
                        <div className="text-xs font-semibold ink-1 mt-2">{m.name}</div>
                        {on && (
                          <div className="mt-1 text-[10px] flex items-center gap-1" style={{ color: 'var(--accent)' }}>
                            <Check size={11} /> selected
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
                <button onClick={start} disabled={busy} className="btn btn-primary px-6 py-3 text-sm">
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
                  Start heist
                </button>
              </>
            ) : (
              <p className="text-xs ink-3">Waiting for the host to start… ({humanCount} connected)</p>
            )}
          </>
        )}

        {room?.phase !== 'lobby' && room?.you && (
          <div className="glass rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <span
                className="grid place-items-center w-12 h-12 rounded-2xl"
                style={{
                  background: room.you.role === 'eve' ? 'color-mix(in oklab, var(--danger) 18%, transparent)' : 'color-mix(in oklab, var(--accent) 18%, transparent)',
                  color: room.you.role === 'eve' ? 'var(--danger)' : 'var(--accent)',
                }}
              >
                {room.you.role === 'eve' ? <Eye size={22} /> : <ShieldCheck size={22} />}
              </span>
              <div>
                <div className="text-xs ink-3">You are</div>
                <div className="h-section text-xl ink-1">
                  {room.you.codename} — {room.you.role === 'eve' ? 'the Eavesdropper' : 'Crew'}
                </div>
              </div>
            </div>
            <p className="text-xs ink-3 leading-relaxed">
              Nobody else can see your role. {room.seats.length} operatives are in the facility with you,
              known only by codename.
            </p>
            {room.outcome && (
              <p className="text-sm font-semibold" style={{ color: room.outcome.youWon ? 'var(--accent)' : 'var(--danger)' }}>
                {room.outcome.winner === 'crew' ? 'Crew wins.' : 'The Eavesdropper wins.'} {room.outcome.youWon ? 'You won.' : 'You lost.'}
              </p>
            )}
          </div>
        )}

        <button onClick={onExit} className="btn btn-ghost px-4 py-2.5 text-xs">
          Leave room
        </button>
      </div>
    </div>
  );
}
