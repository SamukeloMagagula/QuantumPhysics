import React, { useState } from 'react';
import { Page, PageHeader } from './ui/Page';
import { KeyRound, Loader2, Radio, Users } from 'lucide-react';

export type QkdRole = 'alice' | 'bob' | 'eve';

const ROLE_INFO: Record<QkdRole, { label: string; blurb: string; glow: string }> = {
  alice: { label: 'Alice', blurb: 'Sends the quantum key — picks how many qubits, how many to sacrifice as a sample.', glow: '#60a5fa' },
  bob: { label: 'Bob', blurb: 'Receives the key and decides, from the sample error rate, whether to keep or abort it.', glow: '#34d399' },
  eve: { label: 'Eve', blurb: 'Secretly intercepts the channel — tap qubits, spoof a basis, or brute-force the key with a botnet.', glow: '#fb7185' },
};

interface QkdLobbyProps {
  onEnterGame: (code: string, role: QkdRole) => void;
  onExit: () => void;
}

export function QkdLobby({ onEnterGame, onExit }: QkdLobbyProps) {
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [role, setRole] = useState<QkdRole>('alice');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (mode === 'create') {
        const res = await fetch('/api/qkd/game', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Could not create game.');
        onEnterGame(body.code, role);
      } else {
        const clean = code.trim().toUpperCase();
        if (clean.length !== 4) throw new Error('Enter the 4-letter game code.');
        const res = await fetch(`/api/qkd/game/${clean}/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Could not join game.');
        onEnterGame(clean, role);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page width="reading">
      <PageHeader
        eyebrow="Multiplayer"
        title="Quantum Intercept"
      />
      <div className="space-y-6">
        <header className="hidden">
          <h1>Quantum Intercept</h1>
          <p className="text-sm ink-2 mt-2 max-w-xl leading-relaxed">
            A real BB84 key exchange with up to three players on the same network — Alice sends, Bob
            receives, Eve secretly taps the line. After three rounds, Alice and Bob vote on who Eve was.
          </p>
        </header>

        <div className="seg w-fit">
          <button data-on={mode === 'create'} onClick={() => setMode('create')} className="px-4 py-2 text-xs font-semibold">
            Create game
          </button>
          <button data-on={mode === 'join'} onClick={() => setMode('join')} className="px-4 py-2 text-xs font-semibold">
            Join with a code
          </button>
        </div>

        {mode === 'join' && (
          <div className="glass rounded-2xl p-4">
            <label className="label-mono block mb-2">Game code</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 4))}
              placeholder="ABCD"
              className="w-40 panel rounded-xl px-3 py-2.5 text-lg font-mono tracking-[0.3em] text-center ink-1 outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>
        )}

        <div className="stagger grid gap-3 sm:grid-cols-3">
          {(Object.keys(ROLE_INFO) as QkdRole[]).map((r, i) => {
            const info = ROLE_INFO[r];
            return (
              <button
                key={r}
                onClick={() => setRole(r)}
                data-on={role === r}
                style={{ ['--glow' as string]: info.glow, ['--i' as string]: i }}
                className="card sheen glass rounded-[18px] p-4 text-left data-[on=true]:ring-2"
              >
                <div className="text-sm font-semibold ink-1">{info.label}</div>
                <p className="text-xs ink-3 mt-1.5 leading-relaxed">{info.blurb}</p>
              </button>
            );
          })}
        </div>

        {error && (
          <p className="text-xs" style={{ color: 'var(--danger)' }}>
            {error}
          </p>
        )}

        <div className="flex items-center gap-3">
          <button onClick={submit} disabled={busy} className="btn btn-primary px-6 py-3 text-sm">
            {busy ? <Loader2 size={15} className="animate-spin" /> : mode === 'create' ? <Radio size={15} /> : <KeyRound size={15} />}
            {mode === 'create' ? 'Create & get a code' : 'Join game'}
          </button>
          <span className="text-[11px] ink-4 flex items-center gap-1">
            <Users size={12} /> Open roles auto-fill with a computer opponent
          </span>
          <button onClick={onExit} className="btn btn-ghost px-4 py-2.5 text-xs ml-auto">
            Back
          </button>
        </div>
      </div>
    </Page>
  );
}
