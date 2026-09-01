import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LogOut } from 'lucide-react';
import { ConsoleState, Line, initialConsole, runCommand } from './qkdAttackCommands';
import { ATTACKS, AttackState, currentQBER, keyFraction } from './qkdAttack';

/**
 * The QKD attack terminal. All the game logic lives in qkdAttack.ts /
 * qkdAttackCommands.ts — this component only renders lines and forwards
 * keystrokes, which is why the whole game is testable without a DOM.
 *
 * Embeddable: the computer room mounts it as an overlay when you sit at a
 * workstation, passing that desk's target so the session opens already
 * connected.
 */

/**
 * Fixed, not theme-derived. The terminal is always dark regardless of the
 * app theme, so `var(--ink-*)` would resolve to dark greys in light mode and
 * render the output essentially invisible against the black.
 */
const TONE: Record<NonNullable<Line['tone']>, string> = {
  normal: '#d6e2f0',
  dim: '#7c8ba0',
  good: '#4ade80',
  warn: '#fbbf24',
  bad: '#fb7185',
  accent: '#22d3ee',
};

const TERMINAL_BG = '#080b11';

/** A labelled meter — the two numbers that decide whether you get caught
 * deserve to be visible at all times, not buried in scrollback. */
function Gauge({ label, value, max, danger }: { label: string; value: number; max: number; danger?: boolean }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[9px] tracking-wider uppercase" style={{ color: TONE.dim }}>
          {label}
        </span>
        <span className="text-[11px] font-mono" style={{ color: danger ? TONE.bad : TONE.normal }}>
          {(value * 100).toFixed(2)}%
        </span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,.08)' }}>
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${pct}%`, background: danger ? TONE.bad : TONE.accent }}
        />
      </div>
    </div>
  );
}

export interface QkdConsoleProps {
  /** Open already connected to this target — used by the workstation you sat at. */
  initialTargetId?: string;
  /** Shown as a "stand up" control, and bound to Escape. */
  onClose?: () => void;
  /** Fills its container rather than the page. */
  embedded?: boolean;
  /** Reports the live session upward, so Bob's forensics station can read
   * the exchange Eve just ran. */
  onSessionChange?: (session: AttackState | null) => void;
}

export function QkdConsole({ initialTargetId, onClose, embedded, onSessionChange }: QkdConsoleProps) {
  const [state, setState] = useState<ConsoleState>(() =>
    initialTargetId ? runCommand(initialConsole(), `connect ${initialTargetId}`) : initialConsole()
  );
  const [input, setInput] = useState('');
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Pin to the newest output as it arrives.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.lines]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Publish the session so the forensics station has something to analyse.
  useEffect(() => {
    onSessionChange?.(state.session);
  }, [state.session, onSessionChange]);

  // Escape leaves the terminal — the same thing the close control does.
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = () => {
    if (!input.trim()) return;
    setState((s) => runCommand(s, input));
    setInput('');
    setHistoryIndex(null);
  };

  // Up/down walks the command history, the way a real shell does.
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      submit();
      return;
    }
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const h = state.history;
    if (!h.length) return;
    const next =
      e.key === 'ArrowUp'
        ? historyIndex === null
          ? h.length - 1
          : Math.max(0, historyIndex - 1)
        : historyIndex === null
          ? null
          : Math.min(h.length - 1, historyIndex + 1);
    setHistoryIndex(next);
    setInput(next === null ? '' : h[next]);
  };

  const session = state.session;
  const qber = session ? currentQBER(session) : 0;
  const key = session ? keyFraction(session) : 0;

  const quickCommands = useMemo(
    () => (session ? ['scan', 'status', 'run 500', 'attacks', 'extract'] : ['help', 'targets', 'attacks']),
    [session]
  );

  return (
    <div className={`grid gap-4 ${embedded ? 'h-full lg:grid-cols-[1fr_260px]' : 'lg:grid-cols-[1fr_280px]'}`}>
      {/* ---- terminal ---- */}
      <div
        className="rounded-[16px] overflow-hidden flex flex-col min-h-0"
        style={{ background: TERMINAL_BG, border: '1px solid rgba(255,255,255,.1)', height: embedded ? '100%' : '68vh' }}
      >
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-3 font-mono text-[12.5px] leading-[1.55] min-h-0"
          onClick={() => inputRef.current?.focus()}
        >
          {state.lines.map((l, i) => (
            <div key={i} style={{ color: TONE[l.tone ?? 'normal'], whiteSpace: 'pre-wrap' }}>
              {l.text || ' '}
            </div>
          ))}
        </div>

        <div
          className="flex items-center gap-2 px-4 py-3 font-mono text-[12.5px]"
          style={{ borderTop: '1px solid rgba(255,255,255,.09)' }}
        >
          <span style={{ color: TONE.accent }}>{session ? `${session.target.id}$` : 'qkd$'}</span>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            spellCheck={false}
            autoComplete="off"
            className="flex-1 bg-transparent outline-none"
            style={{ color: TONE.normal }}
            placeholder='try "help"'
          />
        </div>
      </div>

      {/* ---- live state ---- */}
      <div className="flex flex-col gap-3 min-h-0 overflow-y-auto">
        <div
          className="rounded-[16px] p-4"
          style={{ background: 'rgba(12,16,22,.86)', border: '1px solid rgba(255,255,255,.1)' }}
        >
          <div className="text-[9px] tracking-wider uppercase mb-3" style={{ color: TONE.dim }}>
            link status
          </div>
          {session ? (
            <div className="flex flex-col gap-3">
              <div className="text-sm font-semibold" style={{ color: TONE.normal }}>
                {session.target.name}
              </div>
              <Gauge
                label={`QBER · abort ${(session.target.abortQBER * 100).toFixed(0)}%`}
                value={qber}
                max={session.target.abortQBER}
                danger={qber >= session.target.abortQBER * 0.8}
              />
              <Gauge label={`key stolen · goal ${(session.target.keyGoal * 100).toFixed(0)}%`} value={key} max={1} />
              <Gauge label="alarm" value={session.alarm} max={1} danger={session.alarm > 0.4} />
              <div className="text-[11px] font-mono" style={{ color: TONE.dim }}>
                round {session.round} / {session.target.totalRounds}
              </div>
              {session.status !== 'active' && (
                <div
                  className="text-[11px] font-semibold"
                  style={{ color: session.status === 'caught' ? TONE.bad : TONE.good }}
                >
                  {session.status.toUpperCase()}
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs leading-relaxed" style={{ color: TONE.dim }}>
              No link. Run <span className="font-mono">targets</span>, then{' '}
              <span className="font-mono">connect &lt;id&gt;</span>.
            </p>
          )}
        </div>

        {session && session.armed.length > 0 && (
          <div
            className="rounded-[16px] p-4"
            style={{ background: 'rgba(12,16,22,.86)', border: '1px solid rgba(255,255,255,.1)' }}
          >
            <div className="text-[9px] tracking-wider uppercase mb-3" style={{ color: TONE.dim }}>
              armed
            </div>
            <div className="flex flex-col gap-2">
              {session.armed.map((a) => (
                <div key={a.mode} className="flex items-center justify-between text-[11px] font-mono">
                  <span style={{ color: TONE.normal }}>{ATTACKS[a.mode].label}</span>
                  <span style={{ color: TONE.dim }}>{(a.fraction * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div
          className="rounded-[16px] p-4"
          style={{ background: 'rgba(12,16,22,.86)', border: '1px solid rgba(255,255,255,.1)' }}
        >
          <div className="text-[9px] tracking-wider uppercase mb-2" style={{ color: TONE.dim }}>
            quick
          </div>
          <div className="flex flex-wrap gap-1.5">
            {quickCommands.map((c) => (
              <button
                key={c}
                onClick={() => {
                  setState((s) => runCommand(s, c));
                  inputRef.current?.focus();
                }}
                className="px-2.5 py-1 rounded-lg text-[11px] font-mono"
                style={{ background: 'rgba(255,255,255,.06)', color: TONE.normal, border: '1px solid rgba(255,255,255,.1)' }}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="px-3 py-2.5 rounded-[14px] text-[12px] font-semibold flex items-center justify-center gap-2"
            style={{ background: 'rgba(255,255,255,.07)', color: TONE.normal, border: '1px solid rgba(255,255,255,.12)' }}
          >
            <LogOut size={14} /> Stand up <span style={{ color: TONE.dim }}>(Esc)</span>
          </button>
        )}
      </div>
    </div>
  );
}
