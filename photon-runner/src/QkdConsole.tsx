import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LogOut } from 'lucide-react';
import { ASSIGNMENTS } from './facilityStory';
import { ConsoleState, Line, initialConsole, runCommand } from './qkdAttackCommands';
import { ATTACKS, TARGETS, AttackState, currentQBER, keyFraction, captureReady, isWin, MIN_CAPTURE_PULSES, errorRate, alarmRate } from './qkdAttack';

const TOOL_NAMES = {
  intercept: 'Read and resend', beamsplit: 'Take a spare photon', blind: 'Dazzle the detector',
  trojan: 'Peek at the sender', timeshift: 'Shift the timing',
};
const TOOL_HINTS = {
  intercept: 'Learns bits, but wrong guesses leave errors. Pair with a sender peek when no isolator is fitted.',
  beamsplit: 'Steals spare photons without errors. Decoy checks can catch it.',
  blind: 'Controls the receiver without errors. A detector monitor builds an alarm.',
  trojan: 'Helps Read and resend avoid guessing. An optical isolator blocks the peek and raises an alarm.',
  timeshift: 'Takes advantage of uneven detectors. Gains a little information and leaves a few errors.',
};

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
  initialSession?: AttackState | null;
  /** Shown as a "stand up" control, and bound to Escape. */
  onClose?: () => void;
  /** Fills its container rather than the page. */
  embedded?: boolean;
  /** Reports the live session upward, so Bob's forensics station can read
   * the exchange Eve just ran. */
  onSessionChange?: (session: AttackState | null) => void;
}

export function QkdConsole({ initialTargetId, initialSession, onClose, embedded, onSessionChange }: QkdConsoleProps) {
  const [state, setState] = useState<ConsoleState>(() =>
    initialSession && (!initialTargetId || initialSession.target.id === initialTargetId)
      ? { ...initialConsole(), session: initialSession }
      : initialTargetId ? runCommand(initialConsole(), `connect ${initialTargetId}`) : initialConsole()
  );
  const [advanced, setAdvanced] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [input, setInput] = useState('');
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const rewardRef = useRef<HTMLDivElement | null>(null);

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
  useEffect(() => {
    if (session && isWin(session)) rewardRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [session?.status]);
  const qber = session ? currentQBER(session) : 0;
  const key = session ? keyFraction(session) : 0;
  const active = session?.status === 'active';
  const execute = (command: string) => {
    if (command.startsWith('connect ')) setScanned(false);
    if (command === 'scan') setScanned(true);
    setState(s => runCommand(s, command));
    setHistoryIndex(null);
  };
  const objective = !session ? 'Choose a target to begin your intercept.'
    : !active ? (session.status === 'caught' ? 'Spotted. Your capture was lost. Change your tools and try again.' : isWin(session) ? 'Mission complete. Your capture met the goal.' : 'Safe exit, but the mission goal was not met. Retry to finish the capture.')
    : session.armed.length === 0 ? 'Scan the defences, then choose an attack. Missing countermeasures are your opening.'
    : captureReady(session) ? 'Key goal reached. Extract now to bank your result.'
    : 'Advance the exchange. Watch the error rate and alarm as you collect the key.';

  const quickCommands = useMemo(
    () => (session ? ['scan', 'status', 'attacks'] : ['help', 'targets', 'attacks']),
    [session]
  );

  return (
    <div className={`gap-4 ${embedded ? 'h-full overflow-y-auto flex flex-col lg:grid lg:grid-rows-1 lg:grid-cols-[minmax(0,1fr)_300px]' : 'grid lg:grid-cols-[1fr_300px]'}`}>
      {!advanced && <section className="rounded-2xl p-5 shrink-0 lg:overflow-y-auto lg:min-h-0" style={{ background: '#0b1926', color: '#e2edf5' }}>
        <p className="text-xs uppercase tracking-wider text-cyan-200">Live interception</p>
        <h2 className="text-2xl font-bold mt-3">{session?.target.name ?? 'Choose a link to investigate'}</h2>
        <p role="status" className="text-base leading-relaxed mt-4">{objective}</p>
        {session && <>
          <div className="flex items-center justify-between gap-3 my-8 text-sm text-center" aria-label="Signal path">
            <span>Sender<br />◉</span><span aria-hidden="true">→ →</span><span className="rounded-xl bg-cyan-950 p-4">Your tap<br /><strong>{Math.round(key * 100)}% learned</strong></span><span aria-hidden="true">→ →</span><span>Receiver<br />{session.status === 'caught' ? 'Link closed' : 'Listening'}</span>
          </div>
          <p className="text-sm text-slate-300">A mission needs at least {MIN_CAPTURE_PULSES} pulses and {Math.round(session.target.keyGoal * 100)}% of the sampled key. A short lucky capture does not count.</p>
          <progress className="w-full my-3 accent-cyan-300" aria-label="Capture length" max={MIN_CAPTURE_PULSES} value={Math.min(session.round, MIN_CAPTURE_PULSES)} />
          <p className="text-sm">Capture: {session.round} / {MIN_CAPTURE_PULSES} pulses minimum</p>
          {scanned && <div className="mt-5 rounded-xl bg-slate-900 p-4 space-y-2 text-sm" aria-label="Defence scan">
            <h3 className="font-bold text-cyan-200">What can catch you?</h3>
            <p>Spare-photon check: {session.target.decoyStates ? 'ON — photon stealing raises an alarm.' : 'OFF — spare photons are unmonitored.'}</p>
            <p>Detector monitor: {session.target.detectorMonitoring ? 'ON — dazzling raises an alarm.' : 'OFF — dazzling is unmonitored.'}</p>
            <p>Sender shield: {session.target.opticalIsolator ? 'ON — peeking is blocked.' : 'OFF — peeking can help Read and resend.'}</p>
            <p>Detector imbalance: {Math.round(session.target.detectorMismatch * 100)}% — larger gaps help timing attacks.</p>
          </div>}
          {active && session.armed.length > 0 && <div className="mt-5 rounded-xl border border-slate-600 p-4 text-sm space-y-2">
            <h3 className="font-bold">Before the next burst</h3>
            <p>Expected new errors: {(errorRate(session.armed, session.target) * 100).toFixed(1)}%. The receiver closes the link at {(session.target.abortQBER * 100).toFixed(0)}% sampled errors.</p>
            <p>Alarm after 500 more pulses: {Math.round(Math.min(1, session.alarm + alarmRate(session.armed, session.target) * 500) * 100)}%. At 100%, you are caught.</p>
            <p className="text-slate-300">Use the strength sliders to balance the information you gain against the trace you leave. Error counts vary between bursts.</p>
          </div>}
          {session.ending && <p className="mt-5 text-sm text-amber-200">{session.ending}</p>}
          {isWin(session) && <div ref={rewardRef} className="mt-5 rounded-xl border border-emerald-400 p-5"><p className="text-xs text-emerald-200 uppercase">Mission clue unlocked</p><p className="text-lg font-semibold mt-2">{ASSIGNMENTS.find(task => task.target === session.target.id)?.reward}</p><p className="text-sm mt-3 text-slate-300">Return to the map to continue. Assigned missions save automatically.</p></div>}
        </>}
        <button className="mt-6 underline text-sm text-cyan-200" onClick={() => setAdvanced(true)}>Open advanced terminal</button>
      </section>}
      {/* ---- terminal ---- */}
      <div
        className="rounded-[16px] overflow-hidden flex flex-col min-h-[300px] shrink-0 lg:min-h-0"
        style={{ display: advanced ? 'flex' : 'none', background: TERMINAL_BG, border: '1px solid rgba(255,255,255,.1)', height: embedded ? '100%' : '68vh' }}
      >
        <div className="px-4 py-3 border-b border-white/10" style={{ background: '#10232d' }}>
          <p className="text-[10px] uppercase tracking-[.18em]" style={{ color: TONE.accent }}>Intercept operation</p>
          <p role={advanced ? 'status' : undefined} className="text-sm mt-1" style={{ color: TONE.normal }}>{objective}</p>
          <button className="text-xs underline mt-2 text-cyan-200" onClick={() => setAdvanced(false)}>Show the signal view</button>
        </div>
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
            aria-label="Attack command"
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
      <div className="flex flex-col gap-3 shrink-0 lg:min-h-0 lg:overflow-y-auto">
        <div className="rounded-2xl p-4 border border-white/10" style={{ background: '#0c1016', color: TONE.normal }}>
          <label className="block text-xs mb-2" htmlFor="intercept-target">01 / Choose your target</label>
          <select id="intercept-target" value={session?.target.id ?? ''} className="w-full rounded-lg p-2 text-xs bg-slate-900 border border-slate-600"
            onChange={e => { if (e.target.value) execute(`connect ${e.target.value}`); }}>
            <option value="" disabled>Select a link</option>
            {TARGETS.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          {session && <>
            <button className="mt-3 w-full rounded-lg p-2 text-xs border border-cyan-400/40 text-cyan-200" onClick={() => execute('scan')}>02 / Scan countermeasures</button>
            <p className="text-xs mt-4 mb-2">03 / Build your attack</p>
            <div className="flex flex-col gap-2">
              {Object.values(ATTACKS).map(a => {
                const armed = session.armed.some(entry => entry.mode === a.mode);
                return <div key={a.mode}><button disabled={!active} aria-pressed={armed}
                  onClick={() => execute(armed ? `disarm ${a.mode}` : `arm ${a.mode} 1`)}
                  className="w-full text-left p-3 rounded-lg border disabled:opacity-40"
                  style={{ borderColor: armed ? TONE.accent : '#334155', background: armed ? '#12323a' : 'transparent' }}>
                  <span className="block text-sm font-semibold">{armed ? 'Armed · ' : ''}{TOOL_NAMES[a.mode]}</span>
                  <span className="block text-xs mt-1" style={{ color: '#a6b5c9' }}>{TOOL_HINTS[a.mode]}</span>
                </button>
                {armed && <label className="block text-xs mt-2 mb-3">{TOOL_NAMES[a.mode]} strength: {Math.round((session.armed.find(entry => entry.mode === a.mode)?.fraction ?? 0) * 100)}%
                  <input type="range" className="w-full mt-2" min="5" max="100" step="5" disabled={!active}
                    value={(session.armed.find(entry => entry.mode === a.mode)?.fraction ?? 0) * 100}
                    onChange={e => execute(`arm ${a.mode} ${Number(e.target.value) / 100}`)} />
                </label>}</div>;
              })}
            </div>
            <p className="text-xs mt-2" style={{ color: TONE.dim }}>Tools start at full strength. Lower the sliders when the target can spot them.</p>
            <div className="grid grid-cols-2 gap-2 mt-4">
              <button disabled={!active} onClick={() => execute('run 500')} className="rounded-lg p-2 text-xs bg-cyan-300 text-slate-950 font-semibold disabled:opacity-40">Run 500 pulses</button>
              <button disabled={!active || !captureReady(session)} onClick={() => execute('extract')} className="rounded-lg p-2 text-xs border border-emerald-400 text-emerald-200 disabled:opacity-40">Extract key</button>
            </div>
            {!active && <button className="mt-3 w-full rounded-lg p-2 text-xs border border-white/20" onClick={() => execute(`connect ${session.target.id}`)}>Retry this target</button>}
          </>}
        </div>
        <div
          className="order-first rounded-[16px] p-4"
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
            <LogOut size={14} /> Return to map <span style={{ color: TONE.dim }}>(Esc)</span>
          </button>
        )}
      </div>
    </div>
  );
}
