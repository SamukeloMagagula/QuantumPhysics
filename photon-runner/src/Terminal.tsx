import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  CircleDot,
  Cpu,
  Gauge,
  Radio,
  Send,
  SlidersHorizontal,
  Waves,
  X,
  Zap,
} from 'lucide-react';
import type { ActiveTerminal, CommsMessage } from './quantumHeist';

interface TerminalProps {
  terminal: ActiveTerminal;
  comms: CommsMessage[];
  yourCodename: string;
  onComplete: () => void;
  onClose: () => void;
  onSend: (text: string) => void;
}

/** Shared chrome for every console: title bar, hint, and a close affordance. */
function Frame({
  icon,
  title,
  hint,
  onClose,
  children,
  footer,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-black/70 backdrop-blur-md px-4 py-6">
      <div className="a-pop glass glass-strong rounded-3xl w-full max-w-lg overflow-hidden">
        <header className="flex items-start gap-3 px-5 py-4 border-b border-[rgb(var(--glass-border)/var(--glass-border-alpha))]">
          <span className="mt-0.5 ink-2">{icon}</span>
          <div className="flex-1 min-w-0">
            <h2 className="h-section text-base ink-1">{title}</h2>
            <p className="text-xs ink-3 mt-0.5 leading-relaxed">{hint}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close terminal"
            className="btn btn-ghost w-8 h-8 rounded-lg shrink-0"
          >
            <X size={14} />
          </button>
        </header>

        <div className="px-5 py-5">{children}</div>

        {footer && (
          <footer className="px-5 py-4 border-t border-[rgb(var(--glass-border)/var(--glass-border-alpha))]">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}

const BASES = ['plus', 'cross'] as const;
type BasisKey = (typeof BASES)[number];
const BASIS_GLYPH: Record<BasisKey, string> = { plus: '⊕', cross: '⊗' };

/** Repeat the shown basis pattern — stands in for encoding/logging a run. */
function SequenceTask({ onComplete }: { onComplete: () => void }) {
  const target = useMemo<BasisKey[]>(
    () => Array.from({ length: 5 }, () => BASES[Math.floor(Math.random() * 2)]),
    []
  );
  const [entered, setEntered] = useState<BasisKey[]>([]);
  const wrong = entered.some((b, i) => b !== target[i]);

  useEffect(() => {
    if (!wrong && entered.length === target.length) {
      const t = setTimeout(onComplete, 420);
      return () => clearTimeout(t);
    }
  }, [entered, wrong, target.length, onComplete]);

  return (
    <div className="space-y-5">
      <div>
        <div className="label-mono mb-2">Pattern to match</div>
        <div className="flex gap-2">
          {target.map((b, i) => (
            <div
              key={i}
              className="flex-1 aspect-square rounded-xl grid place-items-center text-2xl panel ink-1"
            >
              {BASIS_GLYPH[b]}
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="label-mono mb-2">Your entry</div>
        <div className="flex gap-2">
          {target.map((_, i) => {
            const val = entered[i];
            const bad = val && val !== target[i];
            return (
              <div
                key={i}
                className="flex-1 aspect-square rounded-xl grid place-items-center text-2xl border transition-colors"
                style={{
                  borderColor: bad
                    ? 'var(--danger)'
                    : val
                      ? 'var(--ok)'
                      : 'rgb(var(--glass-border)/var(--glass-border-alpha))',
                  color: bad ? 'var(--danger)' : 'var(--ink-1)',
                  background: 'rgb(var(--glass-tint)/var(--glass-alpha))',
                }}
              >
                {val ? BASIS_GLYPH[val] : ''}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex gap-2">
        {BASES.map((b) => (
          <button
            key={b}
            onClick={() => setEntered((e) => (e.length < target.length ? [...e, b] : e))}
            className="btn btn-ghost flex-1 py-3 text-lg"
          >
            {BASIS_GLYPH[b]}
          </button>
        ))}
        <button onClick={() => setEntered([])} className="btn btn-ghost px-4 py-3 text-xs">
          Clear
        </button>
      </div>

      {wrong && (
        <p className="text-xs" style={{ color: 'var(--danger)' }}>
          Mismatch — clear and start again.
        </p>
      )}
    </div>
  );
}

/** Drag a dial into tolerance — the polarizer/detector alignment. */
function AlignTask({ onComplete }: { onComplete: () => void }) {
  const target = useMemo(() => 20 + Math.random() * 60, []);
  const [value, setValue] = useState(0);
  const [held, setHeld] = useState(0);
  const locked = Math.abs(value - target) < 4;

  useEffect(() => {
    if (!locked) {
      setHeld(0);
      return;
    }
    const iv = setInterval(() => setHeld((h) => h + 0.1), 100);
    return () => clearInterval(iv);
  }, [locked]);

  useEffect(() => {
    if (held >= 0.9) onComplete();
  }, [held, onComplete]);

  return (
    <div className="space-y-5">
      <div className="relative h-14 rounded-xl panel overflow-hidden">
        <div
          className="absolute inset-y-0 opacity-30"
          style={{ left: `${target - 4}%`, width: '8%', background: 'var(--ok)' }}
        />
        <div
          className="absolute inset-y-2 w-1.5 rounded-full transition-[left] duration-75"
          style={{ left: `${value}%`, background: locked ? 'var(--ok)' : 'var(--accent)' }}
        />
        <div className="absolute inset-0 grid place-items-center pointer-events-none">
          <span className="label-mono">{locked ? 'locked — hold steady' : 'find the band'}</span>
        </div>
      </div>

      <input
        type="range"
        min={0}
        max={100}
        step={0.5}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        className="w-full"
        style={{ accentColor: 'var(--accent)' }}
      />

      <div className="h-1.5 rounded-full overflow-hidden panel">
        <div
          className="h-full rounded-full transition-[width] duration-100"
          style={{ width: `${Math.min(100, (held / 0.9) * 100)}%`, background: 'var(--ok)' }}
        />
      </div>
    </div>
  );
}

/** Keep only the pulses where both bases match — the sifting step. */
function SiftTask({ onComplete }: { onComplete: () => void }) {
  const pairs = useMemo(
    () =>
      Array.from({ length: 8 }, () => ({
        a: BASES[Math.floor(Math.random() * 2)],
        b: BASES[Math.floor(Math.random() * 2)],
      })),
    []
  );
  const [kept, setKept] = useState<Set<number>>(new Set());
  const correct = pairs.every((p, i) => (p.a === p.b) === kept.has(i));

  return (
    <div className="space-y-5">
      <p className="text-xs ink-2">Keep only the pulses where Alice and Bob used the same basis.</p>

      <div className="grid grid-cols-4 gap-2">
        {pairs.map((p, i) => {
          const on = kept.has(i);
          return (
            <button
              key={i}
              onClick={() =>
                setKept((s) => {
                  const n = new Set(s);
                  n.has(i) ? n.delete(i) : n.add(i);
                  return n;
                })
              }
              className="rounded-xl p-2.5 border transition-colors"
              style={{
                borderColor: on ? 'var(--accent)' : 'rgb(var(--glass-border)/var(--glass-border-alpha))',
                background: on
                  ? 'color-mix(in oklab, var(--accent) 16%, transparent)'
                  : 'rgb(var(--glass-tint)/var(--glass-alpha))',
              }}
            >
              <div className="text-lg ink-1 leading-none">{BASIS_GLYPH[p.a]}</div>
              <div className="text-lg ink-2 leading-none mt-1">{BASIS_GLYPH[p.b]}</div>
            </button>
          );
        })}
      </div>

      <button onClick={onComplete} disabled={!correct} className="btn btn-primary w-full py-3 text-sm disabled:opacity-40">
        {correct ? 'Confirm sift' : 'Selection incomplete'}
      </button>
    </div>
  );
}

/** Read the error rate off a sampled slice — the QBER check. */
function SampleTask({ onComplete }: { onComplete: () => void }) {
  const bits = useMemo(
    () => Array.from({ length: 12 }, () => (Math.random() < 0.22 ? 1 : 0)),
    []
  );
  const errors = bits.filter(Boolean).length;
  const [answer, setAnswer] = useState<number | null>(null);
  const options = useMemo(() => {
    const set = new Set([errors, Math.max(0, errors - 1), errors + 1, errors + 2]);
    return [...set].sort((a, b) => a - b);
  }, [errors]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-12 gap-1">
        {bits.map((b, i) => (
          <div
            key={i}
            className="aspect-square rounded-md grid place-items-center text-[10px] font-mono"
            style={{
              background: b
                ? 'color-mix(in oklab, var(--danger) 24%, transparent)'
                : 'rgb(var(--glass-tint)/var(--glass-alpha))',
              color: b ? 'var(--danger)' : 'var(--ink-3)',
            }}
          >
            {b ? '×' : '·'}
          </div>
        ))}
      </div>

      <p className="text-xs ink-2">How many mismatches in this sample?</p>

      <div className="flex gap-2">
        {options.map((o) => (
          <button
            key={o}
            onClick={() => setAnswer(o)}
            data-on={answer === o}
            className="chip btn btn-ghost flex-1 py-3 text-sm"
          >
            {o}
          </button>
        ))}
      </div>

      <button
        onClick={onComplete}
        disabled={answer !== errors}
        className="btn btn-primary w-full py-3 text-sm disabled:opacity-40"
      >
        {answer === errors ? 'Log the reading' : 'Count again'}
      </button>
    </div>
  );
}

/** Hold to charge the cryogenic detectors. */
function PowerTask({ onComplete }: { onComplete: () => void }) {
  const [charge, setCharge] = useState(0);
  const holding = useRef(false);

  useEffect(() => {
    const iv = setInterval(() => {
      setCharge((c) => {
        const next = holding.current ? c + 2.6 : Math.max(0, c - 1.4);
        return Math.min(100, next);
      });
    }, 40);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (charge >= 100) onComplete();
  }, [charge, onComplete]);

  return (
    <div className="space-y-5">
      <div className="h-4 rounded-full overflow-hidden panel">
        <div
          className="h-full transition-[width] duration-75"
          style={{
            width: `${charge}%`,
            background: 'linear-gradient(90deg, var(--warn), var(--ok))',
          }}
        />
      </div>

      <button
        onPointerDown={() => (holding.current = true)}
        onPointerUp={() => (holding.current = false)}
        onPointerLeave={() => (holding.current = false)}
        className="btn btn-primary w-full py-6 text-sm select-none"
        style={{ ['--glow' as string]: 'var(--warn)' }}
      >
        <Zap size={16} /> Hold to charge
      </button>
      <p className="text-xs ink-3 text-center">{Math.round(charge)}% charged — it bleeds off if you let go.</p>
    </div>
  );
}

/** Broadcast a line to the other operatives. Everything here is public. */
function CommsTask({
  comms,
  yourCodename,
  onSend,
  onClose,
}: {
  comms: CommsMessage[];
  yourCodename: string;
  onSend: (t: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [comms.length]);

  const send = () => {
    if (!draft.trim()) return;
    onSend(draft);
    setDraft('');
  };

  const QUICK = ['I was in Power Bay.', 'Someone was at the fiber.', 'My tasks are done.', 'Where were you?'];

  return (
    <div className="space-y-4">
      <div className="h-52 overflow-y-auto rounded-xl panel p-3 space-y-2">
        {comms.length === 0 && <p className="text-xs ink-3">No traffic yet. Say something.</p>}
        {comms.map((m, i) => (
          <div key={i} className={`flex ${m.isYou ? 'justify-end' : 'justify-start'}`}>
            <div
              className="max-w-[80%] rounded-xl px-3 py-2"
              style={{
                background: m.isYou
                  ? 'color-mix(in oklab, var(--accent) 20%, transparent)'
                  : 'rgb(var(--glass-tint)/var(--glass-alpha-strong))',
              }}
            >
              <div className="label-mono !text-[9px] !tracking-[.12em] mb-0.5">
                {m.isYou ? `${yourCodename} (you)` : m.from}
              </div>
              <div className="text-xs ink-1 leading-relaxed">{m.text}</div>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {QUICK.map((q) => (
          <button key={q} onClick={() => onSend(q)} className="btn btn-ghost px-2.5 py-1.5 text-[11px]">
            {q}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Broadcast to all operatives…"
          maxLength={90}
          className="flex-1 rounded-xl px-3 py-2.5 text-sm panel ink-1 outline-none focus:border-[var(--accent)]"
        />
        <button onClick={send} className="btn btn-primary px-4 py-2.5">
          <Send size={14} />
        </button>
      </div>

      <button onClick={onClose} className="btn btn-ghost w-full py-2.5 text-xs">
        Close channel
      </button>
    </div>
  );
}

const ICONS: Record<string, React.ReactNode> = {
  sequence: <Waves size={18} />,
  align: <SlidersHorizontal size={18} />,
  sift: <CircleDot size={18} />,
  sample: <Gauge size={18} />,
  power: <Zap size={18} />,
  comms: <Radio size={18} />,
};

export function Terminal({ terminal, comms, yourCodename, onComplete, onClose, onSend }: TerminalProps) {
  const icon = terminal.stationId === 'crack' ? <Cpu size={18} /> : ICONS[terminal.kind] ?? <Cpu size={18} />;

  const body = () => {
    if (terminal.kind === 'comms') {
      return <CommsTask comms={comms} yourCodename={yourCodename} onSend={onSend} onClose={onClose} />;
    }
    switch (terminal.kind) {
      case 'align':
        return <AlignTask onComplete={onComplete} />;
      case 'sift':
        return <SiftTask onComplete={onComplete} />;
      case 'sample':
        return <SampleTask onComplete={onComplete} />;
      case 'power':
        return <PowerTask onComplete={onComplete} />;
      default:
        return <SequenceTask onComplete={onComplete} />;
    }
  };

  return (
    <Frame icon={icon} title={terminal.label} hint={terminal.hint} onClose={onClose}>
      {body()}
    </Frame>
  );
}

/** Eve's offline cracking rig — hold to grind, and it decays if you walk away. */
export function CrackConsole({
  progress,
  onAdvance,
  onClose,
}: {
  progress: number;
  onAdvance: (d: number) => void;
  onClose: () => void;
}) {
  const holding = useRef(false);

  useEffect(() => {
    const iv = setInterval(() => {
      if (holding.current) onAdvance(0.018);
    }, 60);
    return () => clearInterval(iv);
  }, [onAdvance]);

  const pct = Math.round(progress * 100);

  return (
    <Frame
      icon={<Cpu size={18} />}
      title="Offline key crack"
      hint="Grind the sifted key with borrowed compute. Nothing on the wire to see."
      onClose={onClose}
      footer={
        <button onClick={onClose} className="btn btn-ghost w-full py-2.5 text-xs">
          Leave console
        </button>
      }
    >
      <div className="space-y-5">
        <div className="rounded-xl panel p-3 font-mono text-[11px] ink-2 space-y-1 h-28 overflow-hidden">
          <div>$ keysearch --sifted --threads 64</div>
          <div className="ink-3">scanning keyspace…</div>
          <div style={{ color: 'var(--warn)' }}>candidates rejected: {Math.round(progress * 8421)}</div>
          {pct > 45 && <div style={{ color: 'var(--accent)' }}>partial structure detected</div>}
          {pct >= 100 && <div style={{ color: 'var(--ok)' }}>KEY RECOVERED</div>}
        </div>

        <div className="h-3 rounded-full overflow-hidden panel">
          <div
            className="h-full transition-[width] duration-100"
            style={{
              width: `${pct}%`,
              background: 'linear-gradient(90deg, var(--danger), var(--warn))',
            }}
          />
        </div>

        <button
          onPointerDown={() => (holding.current = true)}
          onPointerUp={() => (holding.current = false)}
          onPointerLeave={() => (holding.current = false)}
          disabled={pct >= 100}
          className="btn btn-primary w-full py-5 text-sm select-none disabled:opacity-50"
          style={{ ['--glow' as string]: 'var(--danger)' }}
        >
          {pct >= 100 ? <Check size={16} /> : <Cpu size={16} />}
          {pct >= 100 ? 'Key recovered' : `Hold to crack — ${pct}%`}
        </button>

        <p className="text-xs ink-3">
          Silent on the channel, so it never raises the error rate — but it only pays off if the crew
          left the key short.
        </p>
      </div>
    </Frame>
  );
}
