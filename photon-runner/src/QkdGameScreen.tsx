import React, { useEffect, useRef, useState } from 'react';
import { Award, Crosshair, Eye, KeyRound, Loader2, Radio, ShieldCheck, ShieldX, Skull, Trophy } from 'lucide-react';
import type { QkdRole } from './QkdLobby';

const POLL_MS = 1500;

interface SeatView {
  role?: string;
  kind?: string;
  name?: string | null;
  codename?: string;
  submitted: boolean;
}

interface LastResult {
  eveHit: boolean;
  sampleQBER: number;
  finalKey: number;
  stolen: number;
  sifted: number;
  bobDecision: 'keep' | 'abort';
  perRole: Record<string, number>;
  round: number;
  errorShape: 'none' | 'clustered' | 'scattered';
}

interface GameState {
  code: string;
  phase: string;
  round: number;
  yourRole: QkdRole | null;
  seats: SeatView[];
  roundsTotal: number;
  youAreUpNow: boolean;
  scores?: { role: string; name: string | null; score: number }[];
  roundsCompleted?: number;
  sampleQBER?: number;
  errorShape?: 'none' | 'clustered' | 'scattered';
  lastResult?: LastResult;
  accusationResult?: { aliceAccused: string; bobAccused: string; eveCodename: string; crewWon: boolean };
  reveal?: Record<string, { name: string | null; kind: string; codename?: string }>;
}

async function postAction(code: string, action: Record<string, unknown>): Promise<GameState> {
  const res = await fetch(`/api/qkd/game/${code}/act`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
  return res.json();
}

interface QkdGameScreenProps {
  code: string;
  onExit: () => void;
}

export function QkdGameScreen({ code, onExit }: QkdGameScreenProps) {
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/qkd/game/${code}`);
        if (!res.ok) {
          if (!cancelled) setError('Game not found.');
          return;
        }
        const data = (await res.json()) as GameState;
        if (!cancelled) setState(data);
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

  const start = async () => {
    setSubmitting(true);
    await fetch(`/api/qkd/game/${code}/start`, { method: 'POST' });
    setSubmitting(false);
  };

  const act = async (action: Record<string, unknown>) => {
    setSubmitting(true);
    const next = await postAction(code, action);
    setState(next);
    setSubmitting(false);
  };

  if (error && !state) {
    return (
      <div className="min-h-full grid place-items-center px-4">
        <div className="text-center space-y-3">
          <p className="text-sm ink-2">{error}</p>
          <button onClick={onExit} className="btn btn-ghost px-4 py-2 text-xs">
            Back to lobby
          </button>
        </div>
      </div>
    );
  }
  if (!state) {
    return (
      <div className="min-h-full grid place-items-center px-4">
        <Loader2 size={18} className="animate-spin ink-3" />
      </div>
    );
  }

  return (
    <div className="min-h-full px-4 py-8 md:px-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <Header state={state} onExit={onExit} />
        <Seats state={state} />

        {state.phase === 'lobby' && <LobbyPanel state={state} submitting={submitting} onStart={start} />}
        {state.phase === 'alice_setup' && (
          <AliceSetupPanel state={state} submitting={submitting} onSubmit={(n, s) => act({ n, s })} />
        )}
        {state.phase === 'eve_move' && <EveMovePanel state={state} submitting={submitting} onSubmit={act} />}
        {state.phase === 'bob_decision' && <BobDecisionPanel state={state} submitting={submitting} onSubmit={act} />}
        {state.phase === 'resolve' && (
          <ResolvePanel state={state} submitting={submitting} onNext={() => act({ next: true })} />
        )}
        {state.phase === 'accusation' && <AccusationPanel state={state} submitting={submitting} onSubmit={act} />}
        {state.phase === 'ended' && <EndedPanel state={state} onExit={onExit} />}
      </div>
    </div>
  );
}

function Header({ state, onExit }: { state: GameState; onExit: () => void }) {
  const phaseLabel: Record<string, string> = {
    lobby: 'Lobby',
    alice_setup: "Alice's setup",
    eve_move: "Eve's move",
    bob_decision: "Bob's decision",
    resolve: 'Round result',
    accusation: 'Accusation',
    ended: 'Game over',
  };
  return (
    <header className="a-rise flex items-start justify-between gap-4">
      <div>
        <h1 className="h-display text-3xl md:text-4xl text-grad">{state.code}</h1>
        <p className="text-sm ink-2 mt-1">
          {phaseLabel[state.phase] ?? state.phase}
          {state.phase !== 'lobby' && state.phase !== 'ended' && ` · round ${state.round}/${state.roundsTotal}`}
        </p>
      </div>
      <button onClick={onExit} className="btn btn-ghost px-4 py-2 text-xs shrink-0">
        Leave
      </button>
    </header>
  );
}

function Seats({ state }: { state: GameState }) {
  return (
    <div className="glass rounded-2xl p-4 flex flex-wrap gap-3">
      {state.seats.map((s, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span
            className="grid place-items-center w-7 h-7 rounded-full"
            style={{ background: 'rgb(var(--glass-tint)/.14)', color: s.submitted ? 'var(--ok)' : 'var(--ink-3)' }}
          >
            {s.role === 'alice' ? <Radio size={12} /> : s.role === 'bob' ? <ShieldCheck size={12} /> : s.role === 'eve' ? <Eye size={12} /> : <Crosshair size={12} />}
          </span>
          <div>
            <div className="font-semibold ink-1">{s.role ? s.role[0].toUpperCase() + s.role.slice(1) : s.codename}</div>
            <div className="ink-4 text-[10px]">
              {s.name ?? (s.kind === 'computer' ? 'Computer' : '')} {s.submitted && '· ready'}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function LobbyPanel({ state, submitting, onStart }: { state: GameState; submitting: boolean; onStart: () => void }) {
  return (
    <div className="glass rounded-2xl p-5 text-center space-y-3">
      <p className="text-sm ink-2">Waiting to start. Share code <span className="font-mono font-bold ink-1">{state.code}</span> for others to join.</p>
      {state.yourRole && (
        <button onClick={onStart} disabled={submitting} className="btn btn-primary px-6 py-3 text-sm mx-auto">
          {submitting ? <Loader2 size={15} className="animate-spin" /> : <Radio size={15} />} Start game
        </button>
      )}
    </div>
  );
}

function AliceSetupPanel({
  state,
  submitting,
  onSubmit,
}: {
  state: GameState;
  submitting: boolean;
  onSubmit: (n: number, s: number) => void;
}) {
  const [n, setN] = useState(24);
  const [s, setS] = useState(6);
  if (state.yourRole !== 'alice' || !state.youAreUpNow) return <WaitingPanel />;
  return (
    <div className="glass rounded-2xl p-5 space-y-4">
      <p className="text-sm ink-1 font-medium">Choose how many qubits to send, and how many to sacrifice checking for eavesdropping.</p>
      <div>
        <div className="flex justify-between text-xs mb-1.5">
          <span className="ink-3">Qubits sent (n)</span>
          <span className="font-mono ink-1">{n}</span>
        </div>
        <input type="range" min={8} max={64} value={n} onChange={(e) => setN(Number(e.target.value))} className="w-full" />
      </div>
      <div>
        <div className="flex justify-between text-xs mb-1.5">
          <span className="ink-3">Sample size (s) — checked for errors, not usable as key</span>
          <span className="font-mono ink-1">{s}</span>
        </div>
        <input type="range" min={0} max={n} value={Math.min(s, n)} onChange={(e) => setS(Number(e.target.value))} className="w-full" />
      </div>
      <button onClick={() => onSubmit(n, s)} disabled={submitting} className="btn btn-primary px-6 py-3 text-sm">
        {submitting ? <Loader2 size={15} className="animate-spin" /> : <Radio size={15} />} Send qubits
      </button>
    </div>
  );
}

function EveMovePanel({
  state,
  submitting,
  onSubmit,
}: {
  state: GameState;
  submitting: boolean;
  onSubmit: (action: Record<string, unknown>) => void;
}) {
  const [method, setMethod] = useState<'tap' | 'spoof' | 'bruteforce'>('bruteforce');
  const [workers, setWorkers] = useState(0);
  const [tapCount, setTapCount] = useState(6);
  const [spoofStart, setSpoofStart] = useState(0);
  const [spoofLen, setSpoofLen] = useState(4);

  if (state.yourRole !== 'eve' || !state.youAreUpNow) return <WaitingPanel />;

  const submit = () => {
    if (method === 'tap') {
      const taps = Array.from({ length: tapCount }, (_, i) => ({ i, basis: Math.random() < 0.5 ? '+' : 'x' }));
      onSubmit({ method: 'tap', workers, taps });
    } else if (method === 'spoof') {
      onSubmit({ method: 'spoof', workers, start: spoofStart, len: spoofLen, basis: '+' });
    } else {
      onSubmit({ method: 'bruteforce', workers });
    }
  };

  return (
    <div className="glass rounded-2xl p-5 space-y-4">
      <p className="text-sm ink-1 font-medium">Pick your method. Tapping/spoofing risks introducing errors Bob can detect; a pure botnet run stays invisible on the wire but only matters if it can crack the key in time.</p>
      <div className="seg w-fit">
        {(['tap', 'spoof', 'bruteforce'] as const).map((m) => (
          <button key={m} data-on={method === m} onClick={() => setMethod(m)} className="px-3 py-1.5 text-xs font-semibold capitalize">
            {m === 'bruteforce' ? 'Brute-force' : m}
          </button>
        ))}
      </div>
      {method === 'tap' && (
        <div>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="ink-3">Qubits to tap (from the start of the stream)</span>
            <span className="font-mono ink-1">{tapCount}</span>
          </div>
          <input type="range" min={1} max={32} value={tapCount} onChange={(e) => setTapCount(Number(e.target.value))} className="w-full" />
        </div>
      )}
      {method === 'spoof' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs ink-3 mb-1.5">Start index</div>
            <input type="number" min={0} value={spoofStart} onChange={(e) => setSpoofStart(Number(e.target.value))} className="w-full panel rounded-xl px-3 py-2 text-sm ink-1" />
          </div>
          <div>
            <div className="text-xs ink-3 mb-1.5">Length</div>
            <input type="number" min={1} value={spoofLen} onChange={(e) => setSpoofLen(Number(e.target.value))} className="w-full panel rounded-xl px-3 py-2 text-sm ink-1" />
          </div>
        </div>
      )}
      <div>
        <div className="flex justify-between text-xs mb-1.5">
          <span className="ink-3">Botnet workers (crack the final key within the round)</span>
          <span className="font-mono ink-1">{workers}</span>
        </div>
        <input type="range" min={0} max={100} value={workers} onChange={(e) => setWorkers(Number(e.target.value))} className="w-full" />
      </div>
      <button onClick={submit} disabled={submitting} className="btn btn-primary px-6 py-3 text-sm">
        {submitting ? <Loader2 size={15} className="animate-spin" /> : <Eye size={15} />} Commit move
      </button>
    </div>
  );
}

function BobDecisionPanel({
  state,
  submitting,
  onSubmit,
}: {
  state: GameState;
  submitting: boolean;
  onSubmit: (action: Record<string, unknown>) => void;
}) {
  if (state.yourRole !== 'bob' || !state.youAreUpNow) return <WaitingPanel />;
  const qber = state.sampleQBER ?? 0;
  return (
    <div className="glass rounded-2xl p-5 space-y-4">
      <p className="text-sm ink-1 font-medium">The sample check is in. Keep the key, or abort if it looks tapped.</p>
      <div className="flex items-center gap-4">
        <div className="text-3xl font-mono font-bold ink-1">{(qber * 100).toFixed(1)}%</div>
        <div className="text-xs ink-3">
          sampled error rate
          {state.errorShape && state.errorShape !== 'none' && <> · pattern reads <span className="ink-1 font-semibold">{state.errorShape}</span></>}
        </div>
      </div>
      <div className="flex gap-3">
        <button onClick={() => onSubmit({ decision: 'keep' })} disabled={submitting} className="btn btn-primary px-6 py-3 text-sm flex-1">
          <ShieldCheck size={15} /> Keep the key
        </button>
        <button onClick={() => onSubmit({ decision: 'abort' })} disabled={submitting} className="btn btn-ghost px-6 py-3 text-sm flex-1">
          <ShieldX size={15} /> Abort
        </button>
      </div>
    </div>
  );
}

function ResolvePanel({ state, submitting, onNext }: { state: GameState; submitting: boolean; onNext: () => void }) {
  const r = state.lastResult;
  if (!r) return <WaitingPanel />;
  return (
    <div className="glass rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        {r.eveHit ? <Eye size={16} style={{ color: 'var(--danger)' }} /> : <ShieldCheck size={16} style={{ color: 'var(--ok)' }} />}
        <p className="text-sm font-semibold ink-1">{r.eveHit ? 'The channel was tapped.' : 'The channel was clean.'}</p>
      </div>
      <p className="text-xs ink-3">
        {r.sifted} sifted · {(r.sampleQBER * 100).toFixed(1)}% sample error · Bob {r.bobDecision === 'keep' ? 'kept' : 'aborted'} the key
        {r.bobDecision === 'keep' && !r.eveHit && <> · final key {r.finalKey} bits</>}
      </p>
      <div className="grid grid-cols-3 gap-2 text-center">
        {(['alice', 'bob', 'eve'] as const).map((role) => (
          <div key={role} className="panel rounded-xl py-2.5">
            <div className="text-[10px] label-mono">{role}</div>
            <div className="text-lg font-mono font-bold ink-1">
              {r.perRole[role] > 0 ? '+' : ''}
              {r.perRole[role]}
            </div>
          </div>
        ))}
      </div>
      {state.youAreUpNow && (
        <button onClick={onNext} disabled={submitting} className="btn btn-primary px-6 py-3 text-sm">
          {submitting ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />}
          {state.round >= state.roundsTotal ? 'Continue to accusation' : 'Next round'}
        </button>
      )}
    </div>
  );
}

function AccusationPanel({
  state,
  submitting,
  onSubmit,
}: {
  state: GameState;
  submitting: boolean;
  onSubmit: (action: Record<string, unknown>) => void;
}) {
  if (state.yourRole !== 'alice' && state.yourRole !== 'bob') {
    return (
      <div className="glass rounded-2xl p-5 text-center">
        <p className="text-sm ink-2">Alice and Bob are naming who they think Eve was…</p>
      </div>
    );
  }
  if (!state.youAreUpNow) return <WaitingPanel label="Vote submitted — waiting on the other crewmate…" />;
  const candidates = state.seats.filter((s) => s.codename);
  return (
    <div className="glass rounded-2xl p-5 space-y-4">
      <p className="text-sm ink-1 font-medium">Rounds are over. Who was Eve? You and your co-defender both need to name her correctly.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {candidates.map((c) => (
          <button
            key={c.codename}
            onClick={() => onSubmit({ accuse: c.codename })}
            disabled={submitting}
            className="btn btn-ghost px-4 py-3 text-sm justify-start"
          >
            <Skull size={14} /> {c.codename}
          </button>
        ))}
      </div>
    </div>
  );
}

function EndedPanel({ state, onExit }: { state: GameState; onExit: () => void }) {
  const res = state.accusationResult;
  const reveal = state.reveal;
  return (
    <div className="space-y-4">
      {res && (
        <div className="a-pop glass rounded-2xl p-5 text-center space-y-2" style={{ borderColor: res.crewWon ? 'var(--ok)' : 'var(--danger)' }}>
          <Award size={24} className="mx-auto" style={{ color: res.crewWon ? 'var(--ok)' : 'var(--danger)' }} />
          <h2 className="h-section text-2xl ink-1">{res.crewWon ? 'The crew caught Eve!' : 'Eve got away.'}</h2>
          {reveal && (
            <p className="text-xs ink-3">
              Eve was {reveal.eve?.name ?? res.eveCodename}. Alice accused {res.aliceAccused}, Bob accused {res.bobAccused}.
            </p>
          )}
        </div>
      )}
      {state.scores && (
        <div className="glass rounded-2xl p-4">
          <div className="label-mono flex items-center gap-1.5 mb-3">
            <Trophy size={13} /> Final scores
          </div>
          <div className="space-y-2">
            {[...state.scores]
              .sort((a, b) => b.score - a.score)
              .map((s) => (
                <div key={s.role} className="flex items-center justify-between text-sm">
                  <span className="ink-1">
                    {s.name} <span className="ink-4 text-xs">({s.role})</span>
                  </span>
                  <span className="font-mono font-bold ink-1">{s.score}</span>
                </div>
              ))}
          </div>
        </div>
      )}
      <button onClick={onExit} className="btn btn-primary px-6 py-3 text-sm mx-auto">
        Back to lobby
      </button>
    </div>
  );
}

function WaitingPanel({ label = 'Waiting on another operative…' }: { label?: string }) {
  return (
    <div className="glass rounded-2xl p-5 text-center">
      <Loader2 size={16} className="animate-spin mx-auto mb-2 ink-3" />
      <p className="text-sm ink-3">{label}</p>
    </div>
  );
}
