import React, { useEffect, useState } from 'react';
import { Gauge } from 'lucide-react';
import type { EngineStats } from './GameEngine';

/**
 * Dev-facing perf overlay — the instrumentation that was missing before any
 * of Phase 8's "optimize X" work could be anything but guessing. Off by
 * default (press P), polls `GameEngine.getStats()` only while visible so it
 * costs nothing during normal play.
 */
export function PerfOverlay({ getStats }: { getStats: () => EngineStats | null }) {
  const [visible, setVisible] = useState(false);
  const [stats, setStats] = useState<EngineStats | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'p') return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      setVisible((v) => !v);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => setStats(getStats()), 400);
    return () => clearInterval(id);
  }, [visible, getStats]);

  if (!visible || !stats) return null;

  const fpsColor = stats.fps >= 50 ? 'var(--ok)' : stats.fps >= 30 ? 'var(--warn)' : 'var(--danger)';

  return (
    <div className="absolute top-3 right-3 pointer-events-none z-20">
      <div className="glass rounded-2xl px-3.5 py-2.5 font-mono text-[11px] space-y-1 min-w-[140px]">
        <div className="flex items-center gap-1.5 label-mono mb-1.5">
          <Gauge size={11} /> perf (P to hide)
        </div>
        <div className="flex justify-between">
          <span className="ink-4">fps</span>
          <span style={{ color: fpsColor }} className="font-bold">
            {stats.fps}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="ink-4">frame</span>
          <span className="ink-1">{stats.frameMs}ms</span>
        </div>
        <div className="flex justify-between">
          <span className="ink-4">draw calls</span>
          <span className="ink-1">{stats.drawCalls}</span>
        </div>
        <div className="flex justify-between">
          <span className="ink-4">triangles</span>
          <span className="ink-1">{stats.triangles.toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span className="ink-4">geometries</span>
          <span className="ink-1">{stats.geometries}</span>
        </div>
        <div className="flex justify-between">
          <span className="ink-4">textures</span>
          <span className="ink-1">{stats.textures}</span>
        </div>
      </div>
    </div>
  );
}
