import React, { useState } from 'react';
import { Check, ChevronRight, GraduationCap, Gauge, Map as MapIcon, Play } from 'lucide-react';
import { MAPS } from './sceneMaps';
import { TIER_INFO, Tier, getTier, setTier } from './sceneQuality';
import type { MapDef } from './sceneMaps';
import type { HeistUiState } from './quantumHeist';

/**
 * The mentor's dialogue box. Sits low-centre so it never covers the minimap or
 * the role card, and states what the current step is waiting for — so the
 * player always knows whether to press Next or go do something.
 */
export function TutorialPanel({
  view,
  onNext,
  onSkip,
}: {
  view: NonNullable<HeistUiState['tutorial']>;
  onNext: () => void;
  onSkip: () => void;
}) {
  const { step, index, total, manual } = view;

  const WAITING: Record<string, string> = {
    move: 'Waiting for you to move',
    'reach-station': 'Walk to a glowing console',
    'open-terminal': 'Press E to open it',
    'complete-task': 'Finish the console',
    'complete-count': 'Clear more consoles',
    'open-comms': 'Send a message',
    'round-resolved': 'Play out the round',
    'vote-cast': 'Cast your vote',
  };

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[min(560px,calc(100%-2rem))] z-20 pointer-events-auto">
      <div className="a-pop glass glass-strong rounded-2xl p-4">
        <div className="flex items-start gap-3">
          <span
            className="grid place-items-center w-10 h-10 rounded-xl shrink-0"
            style={{ background: 'color-mix(in oklab, #f2c078 20%, transparent)', color: '#f2c078' }}
          >
            <GraduationCap size={20} />
          </span>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="label-mono !tracking-[.12em]">
                {step.speaker === 'mentor' ? 'Handler' : 'Facility'} · {index + 1}/{total}
              </span>
              <button onClick={onSkip} className="text-[10px] ink-4 hover:ink-2 underline underline-offset-2">
                skip tutorial
              </button>
            </div>

            <h3 className="h-section text-sm ink-1 mb-1">{step.title}</h3>
            <p className="text-xs ink-2 leading-relaxed">{step.body}</p>

            <div className="flex items-center justify-between gap-3 mt-3">
              <div
                className="h-1 rounded-full flex-1 overflow-hidden"
                style={{ background: 'rgb(var(--glass-tint)/.14)' }}
              >
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{ width: `${((index + 1) / total) * 100}%`, background: '#f2c078' }}
                />
              </div>

              {manual ? (
                <button
                  onClick={onNext}
                  className="btn btn-primary px-4 py-2 text-xs shrink-0"
                  style={{ ['--glow' as string]: '#f2c078' }}
                >
                  Next <ChevronRight size={13} />
                </button>
              ) : (
                <span className="text-[10px] ink-4 shrink-0 italic">
                  {WAITING[step.trigger.kind] ?? 'Waiting…'}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Top-down schematic of a map, drawn straight from its own geometry. */
export function MapThumb({ map }: { map: MapDef }) {
  const pf = map.playfield;
  const worldW = pf.xMax - pf.xMin;
  const worldH = pf.zMax - pf.zMin;
  const W = 240;
  const H = 108;
  const scale = Math.min(W / worldW, H / worldH);
  const ox = (W - worldW * scale) / 2;
  const oy = (H - worldH * scale) / 2;

  return (
    <div
      className="relative rounded-xl overflow-hidden"
      style={{ height: H, background: 'rgb(var(--glass-tint)/.05)' }}
    >
      {map.corridors.map((c, i) => (
        <div
          key={`c${i}`}
          className="absolute rounded-[2px]"
          style={{
            left: ox + (c.x - c.w / 2 - pf.xMin) * scale,
            top: oy + (c.z - c.d / 2 - pf.zMin) * scale,
            width: c.w * scale,
            height: c.d * scale,
            background: 'rgb(var(--glass-tint)/.18)',
          }}
        />
      ))}
      {map.rooms.map((r) => {
        const col = `#${r.color.toString(16).padStart(6, '0')}`;
        return (
          <div
            key={r.id}
            className="absolute rounded-[3px] border"
            style={{
              left: ox + (r.center.x - r.size.w / 2 - pf.xMin) * scale,
              top: oy + (r.center.z - r.size.d / 2 - pf.zMin) * scale,
              width: r.size.w * scale,
              height: r.size.d * scale,
              background: `${col}33`,
              borderColor: `${col}88`,
            }}
          />
        );
      })}
      {map.vents.map((v) => (
        <div
          key={v.id}
          className="absolute w-1.5 h-1.5 rounded-full"
          style={{
            left: ox + (v.x - pf.xMin) * scale - 3,
            top: oy + (v.z - pf.zMin) * scale - 3,
            background: 'var(--danger)',
          }}
          title="vent"
        />
      ))}
    </div>
  );
}

/** Pre-game lobby: choose a facility, then play with or without the tutorial. */
export function HeistLobby({
  onStart,
  onExit,
}: {
  onStart: (mapId: string, tutorial: boolean) => void;
  onExit: () => void;
}) {
  const [mapId, setMapId] = useState(MAPS[0].id);
  const [tier, setTierState] = useState<Tier>(getTier);

  return (
    <div className="bg-scene bg-mesh min-h-full px-4 py-12 md:px-8">
      <div className="max-w-5xl mx-auto">
        <header className="a-rise mb-8">
          <h1 className="h-display text-4xl md:text-5xl text-grad">Quantum Heist</h1>
          <p className="text-sm ink-2 mt-2 max-w-xl leading-relaxed">
            Three operatives, one secret eavesdropper, and a quantum key that gives them away. Pick a
            facility to work tonight.
          </p>
        </header>

        <div className="label-mono mb-3 flex items-center gap-1.5">
          <MapIcon size={12} /> Facility
        </div>

        <div className="stagger grid gap-4 md:grid-cols-3 mb-6">
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
                <p className="text-xs ink-3 leading-relaxed mt-2">{m.blurb}</p>
                {on && (
                  <div className="mt-3 text-[11px] flex items-center gap-1" style={{ color: 'var(--accent)' }}>
                    <Check size={12} /> selected
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <div className="label-mono mb-3 flex items-center gap-1.5">
          <Gauge size={12} /> Graphics
        </div>

        <div className="grid gap-3 sm:grid-cols-3 mb-6">
          {(Object.keys(TIER_INFO) as Tier[]).map((t) => {
            const on = t === tier;
            return (
              <button
                key={t}
                onClick={() => {
                  setTier(t);
                  setTierState(t);
                }}
                className="card glass rounded-[18px] p-4 text-left"
                style={{ ['--glow' as string]: t === 'ultra' ? 'var(--danger)' : 'var(--accent)' }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold ink-1">{TIER_INFO[t].label}</span>
                  {on && <Check size={13} style={{ color: 'var(--accent)' }} />}
                </div>
                <p className="text-[11px] ink-3 leading-relaxed mt-1">{TIER_INFO[t].blurb}</p>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => onStart(mapId, true)}
            className="btn btn-primary flex-1 py-4 text-sm"
            style={{ ['--glow' as string]: '#f2c078' }}
          >
            <GraduationCap size={16} /> Play with tutorial
          </button>
          <button onClick={() => onStart(mapId, false)} className="btn btn-ghost flex-1 py-4 text-sm">
            <Play size={16} /> Straight into a match
          </button>
          <button onClick={onExit} className="btn btn-ghost px-6 py-4 text-sm">
            Back
          </button>
        </div>

        <p className="text-[11px] ink-4 mt-4">
          First time? Take the tutorial — a handler walks the floor with you and explains what each
          console actually does.
        </p>
      </div>
    </div>
  );
}
