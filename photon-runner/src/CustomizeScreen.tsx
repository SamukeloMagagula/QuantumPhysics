import React, { useCallback, useMemo, useState } from 'react';
import { Dices, RotateCcw, Shirt, Headphones, Scissors, PersonStanding } from 'lucide-react';
import { WorldCharacter, type CharacterFacing } from './WorldCharacter';
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
} from './characterAppearance';

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
  const [facing, setFacing] = useState<CharacterFacing>('south');
  const [walking, setWalking] = useState(false);
  const [appearance, setAppearance] = useState<CharacterAppearance>(getAppearance);
  const [tab, setTab] = useState<Tab>('body');

  const set = useCallback(<K extends keyof CharacterAppearance>(key: K, value: CharacterAppearance[K]) => {
    setAppearance((a) => ({ ...a, [key]: value }));
  }, []);

  const handleSave = () => {
    saveAppearance(appearance);
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
        <header className="pb-4 mb-6 border-b flex flex-wrap items-end justify-between gap-4"
          style={{ borderColor: 'rgb(var(--glass-border)/.16)' }}>
          <div>
            <div className="label-mono mb-1.5">Appearance</div>
            <h1 className="h-section text-[22px] md:text-[26px] ink-1">Character Creator</h1>
            <p className="text-[13px] ink-2 mt-1.5">
              Make this character yours. Preview changes here, then save to wear them on the map.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setAppearance((a) => ({ ...randomAppearance(), nickname: a.nickname }))}
              className="btn btn-ghost px-4 py-2.5 text-xs"
            >
              <Dices size={13} /> Randomize
            </button>
            <button
              onClick={() => setAppearance((a) => ({ ...DEFAULT_APPEARANCE, nickname: a.nickname }))}
              className="btn btn-ghost px-4 py-2.5 text-xs"
            >
              <RotateCcw size={13} /> Reset
            </button>
          </div>
        </header>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          {/* ---------------- preview ---------------- */}
          <section className="character-custom-preview panel rounded-[22px] p-4" aria-label="Live character preview">
            <svg viewBox="-24 -57 48 64" role="img" aria-label={`${appearance.nickname.trim() || 'Your character'} preview`} className="character-preview-figure">
              <WorldCharacter appearance={appearance} facing={facing} moving={walking} />
            </svg>
            <h2 className="text-lg font-semibold text-center">{appearance.nickname.trim() || 'Your character'}</h2>
            <p className="text-xs ink-2 text-center mt-1">{summary}</p>
            <div className="flex flex-wrap justify-center gap-2 mt-4" role="group" aria-label="Preview direction">
              {([['south', 'Front'], ['west', 'Left'], ['north', 'Back'], ['east', 'Right']] as const).map(([direction, label]) => <button key={direction} className="btn btn-ghost px-3 py-2 text-xs" aria-pressed={facing === direction} onClick={() => setFacing(direction)}>{label}</button>)}
            </div>
            <button className="btn btn-ghost mx-auto mt-2 px-4 py-2 text-xs" aria-pressed={walking} onClick={() => setWalking(!walking)}>{walking ? 'Stop walking preview' : 'Preview walking'}</button>
            <p className="text-xs ink-3 text-center mt-4">Changes apply when you save. Cancel keeps your current look.</p>
          </section>

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
                      aria-label="Character height"
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
                aria-label="Callsign"
                maxLength={16}
                value={appearance.nickname}
                onChange={(e) => set('nickname', e.target.value.slice(0, 16))}
                placeholder="Optional"
                className="w-full panel rounded-xl px-3 py-2.5 text-sm ink-1 outline-none focus:border-[var(--accent)] transition-colors"
              />
            </Field>

            <div className="flex gap-2 pt-1">
              <button onClick={handleSave} className="btn btn-primary flex-1 py-3 text-sm">
                Save appearance
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
