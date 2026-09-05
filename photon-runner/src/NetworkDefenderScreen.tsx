import React, { useEffect, useRef, useState } from 'react';
import { Meta, Page, PageHeader } from './ui/Page';
import { startNetworkDefender, type DefenderHandle } from './networkDefenderRun';
import { KIND_INFO, type DefenderState } from './networkDefenderLogic';

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
  const [status, setStatus] = useState('Type "help", or click a packet to firewall its IP.');
  const [lines, setLines] = useState<LogLine[]>([{ text: 'network-defender-shell ready. type "help".', tone: 'out' }]);
  const [input, setInput] = useState('');
  const [hud, setHud] = useState<DefenderState | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handle = startNetworkDefender(
      canvas,
      (score) => setStatus(`Game over — score ${score}.`),
      (state) => setHud({ ...state, threats: state.threats })
    );
    defenderRef.current = handle;
    return () => handle.dispose();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
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

  return (
    <Page width="wide">
      <PageHeader
        eyebrow="Arcade round"
        title="Network Defender"
        description="Hold the perimeter as intrusions escalate. Click a packet to firewall its address, or drive it from the console."
        meta={
          hud ? (
            <>
              <Meta label="Score" value={hud.score} />
              <Meta label="Health" value={hud.health} tone={hud.health > 3 ? 'var(--ok)' : 'var(--danger)'} />
              <Meta label="Trust" value={hud.trust} tone="var(--accent)" />
              <Meta label="Firewalled" value={hud.blockedIps.size} tone="var(--warn)" />
              <Meta label="Status" value={status} />
            </>
          ) : (
            <Meta label="Status" value={status} />
          )
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
        <section className="panel rounded-xl p-3 flex flex-col">
          <div className="label-mono !text-[9px] mb-2">Live network</div>
          <canvas
            ref={canvasRef}
            className="rounded-lg w-full touch-none border"
            style={{ borderColor: hairline, background: 'var(--bg-sunken)' }}
          />
          <div className="flex items-center gap-4 mt-2.5 flex-wrap">
            <Legend tone="var(--danger)" label="Unblocked malicious" />
            <Legend tone="var(--ok)" label="Legitimate" />
            <Legend tone="var(--ink-4)" label="Firewall drop" />
          </div>
        </section>

        <section
          className="panel rounded-xl flex flex-col h-[420px] lg:h-auto lg:min-h-[420px] overflow-hidden"
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
              className="flex-1 bg-transparent outline-none text-xs font-mono ink-1 placeholder:ink-4"
              autoFocus
              spellCheck={false}
            />
            <span className="label-mono !text-[8px] hidden sm:block">type help</span>
          </div>
        </section>
      </div>
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
