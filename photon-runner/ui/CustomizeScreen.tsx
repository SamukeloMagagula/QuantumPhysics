import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Dices, RotateCcw, Shirt, Headphones, Scissors, PersonStanding } from 'lucide-react';
import * as THREE from 'three';
import { GameEngine, Game } from '../engine/GameEngine';
import { createHumanoid, Humanoid } from '../games/lab/character';
import {
  ACCENT_PALETTE,
  ACCESSORIES,
  BUILDS,
  CharacterAppearance,
  DEFAULT_APPEARANCE,
  HAIR_COLORS,
  HAIR_STYLES,
  OUTFIT_COLORS,
  OUTFITS,
  SKIN_TONES,
  getAppearance,
  randomAppearance,
  saveAppearance,
} from '../storage/characterAppearance';

interface CustomizeScreenProps {
  onDone: () => void;
  onBack?: () => void;
}

type Tab = 'body' | 'hair' | 'outfit' | 'gear';

const TABS: { id: Tab; label: string; Icon: React.ComponentType<{ size?: number }> }[] = [
  { id: 'body', label: 'Body', Icon: PersonStanding },
  { id: 'hair', label: 'Hair', Icon: Scissors },
  { id: 'outfit', label: 'Outfit', Icon: Shirt },
  { id: 'gear', label: 'Gear', Icon: Headphones },
];

/**
 * Turntable preview. Exposes setAppearance so changing an option rebuilds only
 * the figure — the scene, lights, and camera persist, so there's no flicker or
 * reset of the angle the user dragged to.
 */
interface PreviewGame extends Game {
  setAppearance(a: CharacterAppearance): void;
  nudgeSpin(delta: number): void;
  setDragging(dragging: boolean): void;
}

function createPreviewGame(initial: CharacterAppearance): PreviewGame {
  let humanoid: Humanoid | null = null;
  let engineRef: GameEngine | null = null;
  let spin = 0.4;
  let autoSpin = true;
  let appearance = initial;
  let walkClock = 0;

  const build = () => {
    if (!engineRef) return;
    if (humanoid) {
      engineRef.scene.remove(humanoid.group);
      humanoid.dispose();
    }
    humanoid = createHumanoid(0x8b5cf6, { appearance, rimGlow: false });
    engineRef.scene.add(humanoid.group);
  };

  return {
    id: 'character-preview',
    title: 'preview',

    init(engine) {
      engineRef = engine;
      engine.scene.background = new THREE.Color(0x0b0620);
      engine.scene.fog = null;
      engine.camera.position.set(0, 1.15, 3.15);
      engine.camera.lookAt(0, 0.98, 0);

      engine.scene.add(new THREE.HemisphereLight(0x8ab4ff, 0x1a1030, 1.5));

      const key = new THREE.DirectionalLight(0xffffff, 2.1);
      key.position.set(2.6, 4.2, 3.4);
      engine.scene.add(key);

      const rimA = new THREE.DirectionalLight(0x22d3ee, 1.8);
      rimA.position.set(-3.4, 2.2, -2.2);
      engine.scene.add(rimA);

      const rimB = new THREE.DirectionalLight(0xa855f7, 1.5);
      rimB.position.set(3.2, 1.4, -2.8);
      engine.scene.add(rimB);

      // Turntable disc + glow ring under the figure.
      const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(0.85, 0.85, 0.05, 48),
        new THREE.MeshStandardMaterial({ color: 0x1a1140, roughness: 0.35, metalness: 0.6 })
      );
      disc.position.y = -0.025;
      engine.scene.add(disc);

      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.86, 0.012, 8, 64),
        new THREE.MeshBasicMaterial({ color: 0x22d3ee })
      );
      ring.position.y = 0.002;
      ring.rotation.x = Math.PI / 2;
      engine.scene.add(ring);

      build();
    },

    setAppearance(a) {
      appearance = a;
      build();
    },

    nudgeSpin(delta) {
      spin += delta;
    },

    setDragging(dragging) {
      autoSpin = !dragging;
    },

    update(dt) {
      if (autoSpin) spin += dt * 0.45;
      if (humanoid) {
        humanoid.group.rotation.y = spin;
        // Alternate idle and a short walk so the rig visibly animates.
        walkClock = (walkClock + dt) % 8;
        humanoid.setWalking(walkClock > 5);
        humanoid.update(dt);
      }
    },

    dispose() {
      humanoid?.dispose();
      humanoid = null;
      engineRef = null;
    },

    setMoveVector() {},
    interact() {},
  };
}

function Swatches({
  colors,
  value,
  onChange,
  label,
}: {
  colors: readonly string[];
  value: string;
  onChange: (c: string) => void;
  label: string;
}) {
  return (
    <Field label={label}>
      <div className="flex flex-wrap gap-2">
        {colors.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`${label}: ${c}`}
            aria-pressed={value === c}
            data-on={value === c}
            onClick={() => onChange(c)}
            style={{
              backgroundColor: c,
              borderColor: 'rgb(var(--glass-border)/.3)',
              ['--glow' as string]: c,
            }}
            className="chip w-8 h-8 rounded-full border"
          />
        ))}
      </div>
    </Field>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="label-mono">{label}</label>
      {children}
    </div>
  );
}

function OptionGrid<T extends string>({
  options,
  value,
  onChange,
  cols = 4,
}: {
  options: { id: T; label: string; blurb?: string }[];
  value: T;
  onChange: (v: T) => void;
  cols?: number;
}) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          title={o.blurb}
          data-on={value === o.id}
          className="chip px-2 py-2 rounded-xl border text-[11px] font-semibold"
          style={{
            background: value === o.id ? 'var(--ink-1)' : 'rgb(var(--glass-tint)/var(--glass-alpha))',
            color: value === o.id ? 'var(--bg-base)' : 'var(--ink-2)',
            borderColor: 'rgb(var(--glass-border)/var(--glass-border-alpha))',
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function CustomizeScreen({ onDone, onBack }: CustomizeScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const gameRef = useRef<PreviewGame | null>(null);
  const dragRef = useRef<{ active: boolean; x: number }>({ active: false, x: 0 });

  const [appearance, setAppearance] = useState<CharacterAppearance>(getAppearance);
  const [tab, setTab] = useState<Tab>('body');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new GameEngine();
    if (!engine.mount(canvas)) return;
    const game = createPreviewGame(appearance);
    engine.setGame(game);
    engineRef.current = engine;
    gameRef.current = game;
    return () => {
      engine.dispose();
      engineRef.current = null;
      gameRef.current = null;
    };
    // Mount once; appearance updates flow through the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    gameRef.current?.setAppearance(appearance);
  }, [appearance]);

  const set = useCallback(<K extends keyof CharacterAppearance>(key: K, value: CharacterAppearance[K]) => {
    setSaved(false);
    setAppearance((a) => ({ ...a, [key]: value }));
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = { active: true, x: e.clientX };
    gameRef.current?.setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.x;
    dragRef.current.x = e.clientX;
    gameRef.current?.nudgeSpin(dx * 0.011);
  };
  const endDrag = (e: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current.active = false;
    gameRef.current?.setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const handleSave = () => {
    saveAppearance(appearance);
    setSaved(true);
    onDone();
  };

  const summary = useMemo(
    () =>
      [
        BUILDS.find((b) => b.id === appearance.build)?.label,
        HAIR_STYLES.find((h) => h.id === appearance.hairStyle)?.label + ' hair',
        OUTFITS.find((o) => o.id === appearance.outfit)?.label,
        appearance.accessory !== 'none' ? ACCESSORIES.find((a) => a.id === appearance.accessory)?.label : null,
      ]
        .filter(Boolean)
        .join(' · '),
    [appearance]
  );

  return (
    <div className="bg-scene bg-mesh min-h-full px-4 py-8 md:px-8">
      <div className="max-w-6xl mx-auto">
        <header className="a-rise flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="h-display text-4xl md:text-5xl text-grad">Character Creator</h1>
            <p className="text-sm ink-2 mt-2">
              Build your operative. Drag the figure to spin it.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setSaved(false);
                setAppearance((a) => ({ ...randomAppearance(), nickname: a.nickname }));
              }}
              className="btn btn-ghost px-4 py-2.5 text-xs"
            >
              <Dices size={13} /> Randomize
            </button>
            <button
              onClick={() => {
                setSaved(false);
                setAppearance((a) => ({ ...DEFAULT_APPEARANCE, nickname: a.nickname }));
              }}
              className="btn btn-ghost px-4 py-2.5 text-xs"
            >
              <RotateCcw size={13} /> Reset
            </button>
          </div>
        </header>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          {/* ---------------- preview ---------------- */}
          <div className="a-pop glass rounded-[22px] p-4 relative overflow-hidden">
            <canvas
              ref={canvasRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              className="w-full aspect-[3/4] max-h-[540px] rounded-2xl cursor-grab active:cursor-grabbing"
            />
            <div className="absolute left-6 bottom-6 right-6 flex items-end justify-between gap-3 pointer-events-none">
              <div>
                <div className="text-lg font-semibold ink-1">
                  {appearance.nickname.trim() || 'Unnamed Operative'}
                </div>
                <div className="label-mono !tracking-[.1em]">{summary}</div>
              </div>
              <div
                className="w-9 h-9 rounded-full border-2 shrink-0"
                style={{ backgroundColor: appearance.accentColor }}
              />
            </div>
          </div>

          {/* ---------------- controls ---------------- */}
          <div className="a-rise glass rounded-[22px] p-5 space-y-5" style={{ animationDelay: '90ms' }}>
            <div className="seg w-full">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  aria-pressed={tab === t.id}
                  data-on={tab === t.id}
                  className="flex-1 px-2 py-2 text-[11px] font-semibold flex items-center justify-center gap-1.5"
                >
                  <t.Icon size={13} />
                  {t.label}
                </button>
              ))}
            </div>

            <div key={tab} className="a-rise space-y-5 min-h-[268px]">
              {tab === 'body' && (
                <>
                  <Swatches
                    label="Skin Tone"
                    colors={SKIN_TONES}
                    value={appearance.skinTone}
                    onChange={(c) => set('skinTone', c)}
                  />
                  <Field label="Build">
                    <OptionGrid options={BUILDS} value={appearance.build} onChange={(v) => set('build', v)} cols={3} />
                  </Field>
                  <Field label={`Height · ${Math.round(appearance.height * 100)}%`}>
                    <input
                      type="range"
                      min={0.92}
                      max={1.08}
                      step={0.01}
                      value={appearance.height}
                      onChange={(e) => set('height', Number(e.target.value))}
                      className="w-full" style={{ accentColor: "var(--accent)" }}
                    />
                  </Field>
                </>
              )}

              {tab === 'hair' && (
                <>
                  <Field label="Style">
                    <OptionGrid
                      options={HAIR_STYLES}
                      value={appearance.hairStyle}
                      onChange={(v) => set('hairStyle', v)}
                    />
                  </Field>
                  <Swatches
                    label="Hair Color"
                    colors={HAIR_COLORS}
                    value={appearance.hairColor}
                    onChange={(c) => set('hairColor', c)}
                  />
                </>
              )}

              {tab === 'outfit' && (
                <>
                  <Field label="Outfit">
                    <OptionGrid options={OUTFITS} value={appearance.outfit} onChange={(v) => set('outfit', v)} cols={3} />
                  </Field>
                  <Swatches
                    label="Primary"
                    colors={OUTFIT_COLORS}
                    value={appearance.outfitPrimary}
                    onChange={(c) => set('outfitPrimary', c)}
                  />
                  <Swatches
                    label="Secondary"
                    colors={OUTFIT_COLORS}
                    value={appearance.outfitSecondary}
                    onChange={(c) => set('outfitSecondary', c)}
                  />
                </>
              )}

              {tab === 'gear' && (
                <>
                  <Field label="Accessory">
                    <OptionGrid
                      options={ACCESSORIES}
                      value={appearance.accessory}
                      onChange={(v) => set('accessory', v)}
                    />
                  </Field>
                  <Swatches
                    label="Accent"
                    colors={ACCENT_PALETTE}
                    value={appearance.accentColor}
                    onChange={(c) => set('accentColor', c)}
                  />
                </>
              )}
            </div>

            <Field label="Callsign">
              <input
                value={appearance.nickname}
                onChange={(e) => set('nickname', e.target.value.slice(0, 16))}
                placeholder="Optional"
                className="w-full panel rounded-xl px-3 py-2.5 text-sm ink-1 outline-none focus:border-[var(--accent)] transition-colors"
              />
            </Field>

            <div className="flex gap-2 pt-1">
              <button onClick={handleSave} className="btn btn-primary flex-1 py-3 text-sm">
                {saved ? <><Check size={14} /> Saved</> : 'Save & continue'}
              </button>
              <button onClick={onBack ?? onDone} className="btn btn-ghost px-5 py-3 text-sm">
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
