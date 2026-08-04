import React, { useEffect, useRef, useState } from 'react';
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

  return (
    <div className="min-h-full px-4 py-6 max-w-5xl mx-auto space-y-4">
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-bold text-white">Network Defender</h1>
        <p className="text-slate-400 text-sm font-mono">{status}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-2">
          <div className="text-xs font-mono text-slate-500 uppercase tracking-wider">
            Live network — red is unblocked malicious traffic, green is legitimate, gray is a firewall drop
          </div>
          <canvas ref={canvasRef} className="border border-slate-800 rounded-xl w-full touch-none" />
          {hud && (
            <div className="grid grid-cols-4 gap-2 text-center font-mono text-xs">
              <div className="bg-slate-900 border border-slate-800 rounded-lg py-2">
                <div className="text-slate-500">score</div>
                <div className="text-white font-bold">{hud.score}</div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-lg py-2">
                <div className="text-slate-500">health</div>
                <div className="text-emerald-400 font-bold">{hud.health}</div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-lg py-2">
                <div className="text-slate-500">trust</div>
                <div className="text-cyan-400 font-bold">{hud.trust}</div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-lg py-2">
                <div className="text-slate-500">firewalled</div>
                <div className="text-amber-400 font-bold">{hud.blockedIps.size}</div>
              </div>
            </div>
          )}
        </div>

        <div className="bg-black border border-slate-800 rounded-xl flex flex-col h-[420px] lg:h-auto">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 font-mono text-xs space-y-1">
            {lines.map((l, i) => (
              <div key={i} style={{ color: TONE_COLOR[l.tone] }}>
                {l.text}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 border-t border-slate-800 p-2">
            <span className="text-emerald-500 font-mono text-xs">$</span>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="block 203.0.113.42"
              className="flex-1 bg-transparent outline-none text-xs font-mono text-slate-100 placeholder:text-slate-600"
              autoFocus
              spellCheck={false}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
