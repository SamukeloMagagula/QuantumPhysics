import React, { useEffect, useRef, useState } from 'react';
import { Meta, Page, PageHeader } from './ui/Page';
import { startNetworkDefender, type DefenderHandle } from './networkDefenderRun';
import { KIND_INFO, KIND_CLUES, REVIEWS_PER_ROUND, type DefenderState, type Threat, type ReviewResult } from './networkDefenderLogic';

interface LogLine {
  text: string;
  tone: 'in' | 'out' | 'ok' | 'warn' | 'err';
}

const HELP = [
  'commands:',
  '  logs              list live connections (ip, port, proto, and what they look like)',
  '  block <ip>        add a firewall rule — every packet from that ip is dropped, now and later',
  '  unblock <ip>       remove a firewall rule',
  '  status            score, health, trust, wave',
  '  clear             clear this screen',
  '  help              this list',
];

function runCommand(raw: string, defender: DefenderHandle): LogLine[] {
  const parts = raw.trim().split(/\s+/).filter(Boolean);
  const cmd = (parts[0] ?? '').toLowerCase();
  const arg = parts[1];

  if (!cmd) return [];
  if (cmd === 'help') return HELP.map((t) => ({ text: t, tone: 'out' }));

  if (cmd === 'clear') return [{ text: '__CLEAR__', tone: 'out' }];

  if (cmd === 'status') {
    const s = defender.getState();
    return [
      {
        text: `score ${s.score}   health ${s.health}   trust ${s.trust}   wave ${s.wave}   firewall rules ${s.blockedIps.size}`,
        tone: 'out',
      },
    ];
  }

  if (cmd === 'logs') {
    const s = defender.getState();
    const live = s.threats.filter((t) => !t.dropped);
    if (live.length === 0) return [{ text: 'no live connections right now', tone: 'out' }];
    return live.map((t) => {
      const info = KIND_INFO[t.kind];
      return {
        text: `${t.ip}:${t.port}/${t.protocol}  ${info.label} — ${info.detail}`,
        tone: 'out',
      };
    });
  }

  if (cmd === 'block' || cmd === 'unblock') {
    if (!arg || !/^\d+\.\d+\.\d+\.\d+$/.test(arg)) {
      return [{ text: `usage: ${cmd} <ip>`, tone: 'err' }];
    }
    if (cmd === 'unblock') {
      defender.unblock(arg);
      return [{ text: `firewall rule removed for ${arg}`, tone: 'out' }];
    }
    const outcome = defender.block(arg);
    if (outcome === 'already-blocked') return [{ text: `${arg} is already blocked`, tone: 'out' }];
    if (outcome === 'malicious-blocked') return [{ text: `${arg} blocked — that connection was malicious. +100`, tone: 'ok' }];
    if (outcome === 'legit-blocked')
      return [{ text: `${arg} blocked — that was legitimate traffic. trust -20`, tone: 'warn' }];
    return [{ text: `firewall rule added for ${arg} (no live connection matched it right now)`, tone: 'out' }];
  }

  return [{ text: `unknown command: ${cmd} (try "help")`, tone: 'err' }];
}

const TONE_COLOR: Record<LogLine['tone'], string> = {
  in: '#8b949e',
  out: '#c9d1d9',
  ok: '#3fb950',
  warn: '#d29922',
  err: '#f85149',
};

export function NetworkDefenderScreen() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const defenderRef = useRef<DefenderHandle | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('Ready when you are.');
  const [lines, setLines] = useState<LogLine[]>([{ text: 'network-defender-shell ready. type "help".', tone: 'out' }]);
  const [input, setInput] = useState('');
  const [hud, setHud] = useState<DefenderState | null>(null);
  const [run, setRun] = useState(0);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(true);
  const [selected, setSelected] = useState<Threat | null>(null);
  const [result, setResult] = useState<ReviewResult | null>(null);
  const inspectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handle = startNetworkDefender(
      canvas,
      () => { setStatus('Round finished.'); setPaused(true); },
      (state) => setHud({ ...state, threats: [...state.threats] }),
      (threat) => { setSelected(threat); setResult(null); setPaused(true); setStatus('Paused while you inspect.'); }
    );
    defenderRef.current = handle;
    return () => handle.dispose();
  }, [run]);

  useEffect(() => {
    if (selected) { inspectionRef.current?.focus({ preventScroll: true }); inspectionRef.current?.scrollIntoView?.({ block: 'nearest' }); }
  }, [selected?.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo?.({ top: scrollRef.current.scrollHeight });
  }, [lines]);

  const submit = () => {
    const text = input;
    setInput('');
    if (!text.trim() || !defenderRef.current) return;
    const result = runCommand(text, defenderRef.current);
    setLines((prev) => {
      const withInput: LogLine[] = [...prev, { text: `$ ${text}`, tone: 'in' }];
      if (result.length === 1 && result[0].text === '__CLEAR__') return [];
      return [...withInput, ...result];
    });
  };

  const hairline = 'rgb(var(--glass-border)/.2)';
  const resume = () => {
    setSelected(null); setResult(null); setStarted(true); setPaused(false);
    setStatus('Inspect a connection before deciding.');
    defenderRef.current?.setPaused(false);
  };
  const pause = () => { setPaused(true); setStatus('Paused. Take your time.'); defenderRef.current?.setPaused(true); };
  const review = (choice: 'block' | 'allow') => {
    if (!selected || result) return;
    setResult(defenderRef.current?.review(selected.id, choice) ?? null);
  };
  const restart = () => {
    setRun(n => n + 1); setStarted(false); setPaused(true); setSelected(null); setResult(null); setHud(null);
    setInput(''); setLines([]); setStatus('Ready for another round.');
  };

  return (
    <Page width="wide">
      <PageHeader
        eyebrow="Protect the shop"
        title="Network Defender"
        description="Keep the shop online for its customers. Inspect 12 connections, stop attacks, and let real requests through. Traffic pauses while you read the evidence."
        actions={<div className="flex gap-2 flex-wrap">
          {!hud?.over && <button className="btn btn-primary px-4 py-3" disabled={Boolean(selected)} onClick={paused ? resume : pause}>{!started ? 'Start defence' : paused ? 'Resume traffic' : 'Pause traffic'}</button>}
          <button className="btn btn-ghost px-4 py-3" onClick={restart}>{hud?.over ? 'Play another round' : 'Restart round'}</button>
        </div>}
        meta={
          hud ? (
            <>
              <Meta label="Score" value={hud.score} />
              <Meta label="Health" value={hud.health} tone={hud.health > 3 ? 'var(--ok)' : 'var(--danger)'} />
              <Meta label="Trust" value={hud.trust} tone="var(--accent)" />
              <Meta label="Firewalled" value={hud.blockedIps.size} tone="var(--warn)" />
              <Meta label="Reviewed" value={`${hud.reviewed}/${REVIEWS_PER_ROUND}`} />
              <Meta label="Status" value={status} />
            </>
          ) : (
            <Meta label="Status" value={status} />
          )
        }
      />

      {hud?.over && <section role="status" className="panel rounded-xl p-5 mb-4">
        <h2 className="text-xl font-bold">{hud.health > 0 && hud.trust > 0 ? 'The shop stayed open!' : hud.health === 0 ? 'Too many attacks reached the shop.' : 'Too many real requests were blocked.'}</h2>
        <p className="text-sm ink-2 mt-2">{hud.correct} of {hud.reviewed} reviewed connections handled correctly. Score: {hud.score}. Try another round with fresh traffic.</p>
      </section>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
        <section className="panel rounded-xl p-3 flex flex-col">
          <div className="label-mono !text-[9px] mb-2">Live network</div>
          <canvas
            ref={canvasRef}
            aria-label="Connections approaching the shop. Use the inspection buttons below to select one."
            className="rounded-lg w-full touch-none border"
            style={{ borderColor: hairline, background: 'var(--bg-sunken)' }}
          />
          <div className="flex items-center gap-4 mt-2.5 flex-wrap">
            <Legend tone="var(--accent)" label="Uninspected connection" />
            <Legend tone="var(--ink-4)" label="Firewall drop" />
          </div>
          <div className="mt-4 flex flex-col gap-2" aria-label="Connections to inspect">
            {!hud?.threats.some(t => !t.dropped) && <p className="text-sm ink-2">{started ? 'Waiting for the next connection…' : 'Start when you are ready. No traffic moves before you begin.'}</p>}
            {hud?.threats.filter(t => !t.dropped).map(t => <button key={t.id} disabled={hud.over || Boolean(selected)} className="btn btn-ghost justify-between px-3 py-3 text-sm" onClick={() => defenderRef.current?.inspect(t.id)}>
              <span>Inspect connection {t.id}</span><span className="font-mono text-xs">{t.ip}</span>
            </button>)}
          </div>
        </section>

        <section ref={inspectionRef} tabIndex={-1} aria-label="Connection evidence" className="panel rounded-xl p-5">
          {selected ? <>
            <p className="text-xs ink-3 uppercase">Traffic paused · connection {selected.id}</p>
            <h2 className="text-xl font-semibold mt-3">What is this device doing?</h2>
            <p className="text-base leading-relaxed mt-4">{KIND_CLUES[selected.kind]}</p>
            <details className="mt-4 text-sm ink-2"><summary className="cursor-pointer">Technical evidence</summary><p className="mt-2">{selected.ip}:{selected.port}/{selected.protocol} — {KIND_INFO[selected.kind].detail}</p></details>
            {result ? <div className="mt-5">
              <p role="status" className="text-base leading-relaxed" style={{ color: result.correct ? 'var(--ok)' : 'var(--warn)' }}>{result.explanation}</p>
              {!hud?.over && <button autoFocus className="btn btn-primary mt-4 px-4 py-3" onClick={resume}>Continue defending</button>}
              {hud?.over && <div className="mt-4"><p className="text-sm">Round finished: {hud.correct} of {hud.reviewed} decisions correct.</p><button className="btn btn-primary mt-3 px-4 py-3" onClick={restart}>Defend again</button></div>}
            </div> : <div className="flex gap-3 flex-wrap mt-5">
              <button className="btn btn-primary px-4 py-3" disabled={hud?.over} onClick={() => review('block')}>Block this source</button>
              <button className="btn btn-ghost px-4 py-3" disabled={hud?.over} onClick={() => review('allow')}>Let this request through</button>
            </div>}
          </> : <>
            <h2 className="text-xl font-semibold">Read the behaviour, then decide.</h2>
            <p className="text-base ink-2 leading-relaxed mt-3">Tap a connection or choose it from the list. Look for unexpected activity, repeated failed sign-ins, or requests that match your trusted records.</p>
            <p className="text-sm ink-2 mt-3">Blocking every connection hurts your customers. Letting every request through lets attacks reach the shop. The colour and address do not tell you which is which.</p>
          </>}
        </section>
      </div>

        <details className="panel rounded-xl mt-5 p-4" onToggle={e => { if (e.currentTarget.open && !hud?.over) pause(); }}>
        <summary className="cursor-pointer text-sm font-semibold">Advanced console</summary>
        <section
          className="rounded-xl flex flex-col h-[320px] overflow-hidden mt-3"
          style={{ background: 'var(--bg-sunken)' }}
        >
          <div className="label-mono !text-[9px] px-3 pt-3 pb-2">Console</div>
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 pb-2 font-mono text-xs space-y-1">
            {lines.map((l, i) => (
              <div key={i} style={{ color: TONE_COLOR[l.tone] }}>
                {l.text}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 border-t p-2.5" style={{ borderColor: hairline }}>
            <span className="font-mono text-xs" style={{ color: 'var(--ok)' }}>
              $
            </span>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="block 203.0.113.42"
              aria-label="Defender command"
              disabled={!started || hud?.over || Boolean(selected)}
              className="flex-1 bg-transparent outline-none text-xs font-mono ink-1 placeholder:ink-4"
              spellCheck={false}
            />
            <span className="label-mono !text-[8px] hidden sm:block">type help</span>
          </div>
        </section>
        </details>
    </Page>
  );
}

function Legend({ tone, label }: { tone: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] ink-3">
      <span className="w-2 h-2 rounded-full" style={{ background: tone }} />
      {label}
    </span>
  );
}
