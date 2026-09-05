import React, { useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Atom,
  Check,
  ChevronRight,
  ClipboardCheck,
  Fish,
  FlaskConical,
  Globe,
  LayoutDashboard,
  Lock,
  Shield,
  Wifi,
} from 'lucide-react';
import { LABS, labsInSection, sections } from './labRegistry';
import { createGuestStore } from './labFramework';
import { examForSection } from './labExams';
import { examUnlocked, labsRemaining, loadExamProgress } from './labExam';
import { ScoreRing } from './LabExamView';
import { Meta, PageHeader } from './ui/Page';

/**
 * The labs dashboard.
 *
 * Laid out as an operations console — sidebar of sections, a status strip,
 * a live panel for the section you are in, and a right rail of readouts —
 * because that is the environment the material is about, and because a wall
 * of cards gave no sense of where you were in the material or what came
 * next.
 *
 * Every number on it is real: labs completed, sections cleared, tests
 * passed, best scores. Nothing here is a decorative metric, which is why
 * there are no invented time series — the small bars are per-section
 * completion, not a fabricated trend.
 */

interface LabsHubProps {
  onOpenLab: (labId: string) => void;
  onOpenGame: () => void;
  onOpenExam: (examId: string) => void;
}

const SECTION_META: Record<string, { Icon: React.ComponentType<{ size?: number }>; glow: string }> = {
  Foundations: { Icon: Lock, glow: '#5eead4' },
  'Web Attacks': { Icon: Globe, glow: '#fb7185' },
  'Social Engineering & Passwords': { Icon: Fish, glow: '#fbbf24' },
  Wireless: { Icon: Wifi, glow: '#22d3ee' },
  'Network & Availability': { Icon: Activity, glow: '#f472b6' },
  Cryptography: { Icon: Atom, glow: '#a78bfa' },
};

const DIFFICULTY_TOKEN: Record<string, string> = {
  beginner: 'var(--ok)',
  intermediate: 'var(--warn)',
  advanced: 'var(--danger)',
};

const metaFor = (section: string) => SECTION_META[section] ?? { Icon: FlaskConical, glow: 'var(--accent)' };

export function LabsHub({ onOpenLab, onOpenGame, onOpenExam }: LabsHubProps) {
  const store = createGuestStore();
  const completed = store.all();
  const examProgress = useMemo(() => loadExamProgress(), []);
  const all = useMemo(() => sections(), []);

  // Open on the first section with work left, so the dashboard lands where
  // the learner actually is rather than always at the top.
  const firstUnfinished = all.find((s) => labsRemaining(labsInSection(s), completed) > 0);
  const [active, setActive] = useState<string>(firstUnfinished ?? all[0]);

  const labsHere = LABS.filter((l) => l.category === active);
  const exam = examForSection(active);
  const unlocked = exam ? examUnlocked(labsInSection(active), completed) : false;
  const left = labsRemaining(labsInSection(active), completed);
  const nextLab = labsHere.find((l) => !store.isComplete(l.id));

  const sectionsCleared = all.filter((s) => labsRemaining(labsInSection(s), completed) === 0).length;
  const testsPassed = all.filter((s) => {
    const e = examForSection(s);
    return e && examProgress[e.id]?.passed;
  }).length;
  const bestScores = all
    .map((s) => examForSection(s))
    .filter((e): e is NonNullable<typeof e> => !!e)
    .map((e) => examProgress[e.id]?.bestPercent)
    .filter((v): v is number => typeof v === 'number');
  const avgBest = bestScores.length
    ? Math.round(bestScores.reduce((a, b) => a + b, 0) / bestScores.length)
    : 0;
  const overall = LABS.length ? Math.round((completed.length / LABS.length) * 100) : 0;

  return (
    <div className="bg-scene min-h-full px-3 py-4 md:px-6 md:py-6">
      <div className="max-w-[1500px] mx-auto grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_300px]">
        {/* ------------------------------------------------ sidebar */}
        <aside className="space-y-3">
          <div className="panel rounded-2xl p-4">
            <div className="flex items-center gap-2.5">
              <span
                className="grid place-items-center w-9 h-9 rounded-xl shrink-0"
                style={{ background: 'color-mix(in oklab, var(--accent) 16%, transparent)', color: 'var(--accent)' }}
              >
                <Shield size={18} />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-bold ink-1 leading-tight">SECURITY LABS</div>
                <div className="label-mono !text-[8px] ink-4">hands-on training</div>
              </div>
            </div>
          </div>

          <nav className="panel rounded-2xl p-2 space-y-0.5">
            <SideItem
              Icon={LayoutDashboard}
              label="All sections"
              on={false}
              onClick={() => setActive(all[0])}
              trailing={`${completed.length}/${LABS.length}`}
            />
            <div className="h-px my-1.5" style={{ background: 'rgb(var(--glass-border)/.16)' }} />
            {all.map((s) => {
              const ids = labsInSection(s);
              const done = ids.length - labsRemaining(ids, completed);
              const { Icon } = metaFor(s);
              return (
                <SideItem
                  key={s}
                  Icon={Icon}
                  label={s}
                  on={s === active}
                  glow={metaFor(s).glow}
                  onClick={() => setActive(s)}
                  trailing={`${done}/${ids.length}`}
                />
              );
            })}
          </nav>

          <div className="panel rounded-2xl p-4 space-y-2.5">
            <div className="label-mono !text-[9px] ink-3">Training overview</div>
            <Row label="Status" value={<Pill tone={overall === 100 ? 'var(--ok)' : 'var(--accent)'}>{overall === 100 ? 'COMPLETE' : 'IN PROGRESS'}</Pill>} />
            <Row label="Labs completed" value={`${completed.length} / ${LABS.length}`} />
            <Row label="Sections cleared" value={`${sectionsCleared} / ${all.length}`} />
            <Row label="Tests passed" value={`${testsPassed} / ${all.length}`} />
            <Row label="Best score (avg)" value={bestScores.length ? `${avgBest}%` : '—'} />
          </div>

          <button onClick={onOpenGame} className="btn btn-ghost w-full px-3 py-2.5 text-xs justify-between">
            <span className="flex items-center gap-2">
              <Shield size={13} /> Network Defender
            </span>
            <ArrowRight size={12} />
          </button>
        </aside>

        {/* --------------------------------------------------- main */}
        <div className="space-y-4 min-w-0">
          {/* One header for the section, matching every other page in the
              product. It used to be a "Welcome back" strip stacked on a hero
              that repeated the section name directly underneath it. */}
          <PageHeader
            eyebrow="Security labs"
            title={active}
            description={`${labsHere.length} lab${labsHere.length === 1 ? '' : 's'}${
              exam ? ', ending in a section test' : ''
            }.`}
            actions={
              nextLab ? (
                <button onClick={() => onOpenLab(nextLab.id)} className="btn btn-primary px-4 py-2 text-sm">
                  {completed.length === 0 ? 'Start' : 'Continue'} <ArrowRight size={13} />
                </button>
              ) : undefined
            }
            meta={
              <>
                <Meta
                  label="Remaining here"
                  value={left === 0 ? 'Section complete' : `${left} lab${left === 1 ? '' : 's'}`}
                  tone={left === 0 ? 'var(--ok)' : undefined}
                />
                <Meta label="Overall" value={`${overall}%`} />
                <div className="flex-1 min-w-[160px]">
                  <SectionRail
                    labs={labsHere.map((l) => ({ id: l.id, done: store.isComplete(l.id) }))}
                    glow="var(--accent)"
                  />
                </div>
              </>
            }
          />

          {/* Real readouts, not decoration. */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Labs completed" value={`${completed.length}`} sub={`of ${LABS.length}`} tone="var(--accent)">
              <Bars values={all.map((s) => {
                const ids = labsInSection(s);
                return ids.length ? (ids.length - labsRemaining(ids, completed)) / ids.length : 0;
              })} tone="var(--accent)" />
            </Metric>
            <Metric label="Sections cleared" value={`${sectionsCleared}`} sub={`of ${all.length}`} tone="var(--ok)">
              <Bars values={all.map((s) => (labsRemaining(labsInSection(s), completed) === 0 ? 1 : 0))} tone="var(--ok)" />
            </Metric>
            <Metric label="Tests passed" value={`${testsPassed}`} sub={`of ${all.length}`} tone="var(--accent-2)">
              <Bars
                values={all.map((s) => {
                  const e = examForSection(s);
                  return e && examProgress[e.id]?.passed ? 1 : 0;
                })}
                tone="var(--accent-2)"
              />
            </Metric>
            <Metric label="Best score" value={bestScores.length ? `${avgBest}%` : '—'} sub="average across tests" tone="var(--warn)">
              <Bars
                values={all.map((s) => {
                  const e = examForSection(s);
                  return e ? (examProgress[e.id]?.bestPercent ?? 0) / 100 : 0;
                })}
                tone="var(--warn)"
              />
            </Metric>
          </div>

          {/* The labs in this section. */}
          <div className="grid gap-3 sm:grid-cols-2">
            {labsHere.map((lab, i) => {
              const done = store.isComplete(lab.id);
              const tone = DIFFICULTY_TOKEN[lab.difficulty] ?? 'var(--ink-3)';
              return (
                <button
                  key={lab.id}
                  onClick={() => onOpenLab(lab.id)}
                  style={{ ['--glow' as string]: metaFor(active).glow, ['--i' as string]: i }}
                  className="card sheen glass rounded-[18px] p-4 text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-sm font-semibold ink-1">{lab.title}</div>
                    {done && (
                      <span className="shrink-0" style={{ color: 'var(--ok)' }}>
                        <Check size={14} />
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-2.5">
                    <span
                      className="text-[10px] font-mono px-2 py-0.5 rounded-md border"
                      style={{
                        color: tone,
                        borderColor: `color-mix(in oklab, ${tone} 32%, transparent)`,
                        background: `color-mix(in oklab, ${tone} 12%, transparent)`,
                      }}
                    >
                      {lab.difficulty}
                    </span>
                    {done && (
                      <span className="text-[10px] font-mono" style={{ color: 'var(--ok)' }}>
                        completed
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* The section test. */}
          {exam && (
            <section
              className="panel rounded-2xl p-5"
              style={{ opacity: unlocked ? 1 : 0.72 }}
            >
              <div className="flex items-start gap-3 flex-wrap">
                <span
                  className="grid place-items-center w-10 h-10 rounded-xl shrink-0"
                  style={{
                    background: 'color-mix(in oklab, var(--accent-2) 16%, transparent)',
                    color: 'var(--accent-2)',
                  }}
                >
                  <ClipboardCheck size={19} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="label-mono !text-[9px] ink-4">Section test</div>
                  <h2 className="text-sm font-bold ink-1 mt-0.5">{exam.title}</h2>
                  <p className="text-xs ink-2 mt-1 leading-relaxed max-w-xl">{exam.blurb}</p>
                  <div className="text-[11px] ink-4 mt-1.5 font-mono">
                    {exam.questions.length} questions · pass at {exam.passPercent}%
                    {examProgress[exam.id] &&
                      ` · best ${examProgress[exam.id].bestPercent}% over ${examProgress[exam.id].attempts} attempt${
                        examProgress[exam.id].attempts === 1 ? '' : 's'
                      }`}
                  </div>
                </div>
                {unlocked ? (
                  <button
                    onClick={() => onOpenExam(exam.id)}
                    className="btn btn-primary px-4 py-2 text-sm"
                    style={{ ['--glow' as string]: 'var(--accent-2)' }}
                  >
                    {examProgress[exam.id]?.passed ? 'Retake' : 'Take the test'} <ArrowRight size={13} />
                  </button>
                ) : (
                  <span className="text-[11px] ink-4 font-mono self-center">
                    {left} lab{left === 1 ? '' : 's'} to go
                  </span>
                )}
              </div>
            </section>
          )}
        </div>

        {/* ---------------------------------------------- right rail */}
        <aside className="space-y-3 hidden xl:block">
          <div className="panel rounded-2xl p-5 text-center">
            <div className="label-mono !text-[9px] ink-3 mb-3">Training completion</div>
            <ScoreRing percent={overall} tone={overall === 100 ? 'var(--ok)' : 'var(--accent)'} size={128} />
            <div className="text-[11px] ink-3 mt-3 font-mono">
              {completed.length} of {LABS.length} labs finished
            </div>
          </div>

          <div className="panel rounded-2xl p-4 space-y-2">
            <div className="label-mono !text-[9px] ink-3 mb-1">Section tests</div>
            {all.map((s) => {
              const e = examForSection(s);
              if (!e) return null;
              const rec = examProgress[e.id];
              const open = examUnlocked(labsInSection(s), completed);
              return (
                <button
                  key={e.id}
                  onClick={() => open && onOpenExam(e.id)}
                  disabled={!open}
                  className="w-full flex items-center gap-2 text-left rounded-lg px-2 py-1.5 disabled:cursor-not-allowed"
                  style={{ background: 'transparent' }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{
                      background: rec?.passed ? 'var(--ok)' : open ? 'var(--warn)' : 'var(--ink-4)',
                    }}
                  />
                  <span className="text-[11.5px] ink-2 flex-1 truncate">{s}</span>
                  <span className="text-[10.5px] font-mono ink-4">
                    {rec ? `${rec.bestPercent}%` : open ? 'open' : 'locked'}
                  </span>
                  {open && <ChevronRight size={11} className="ink-4 shrink-0" />}
                </button>
              );
            })}
          </div>

          <div className="panel rounded-2xl p-4">
            <div className="label-mono !text-[9px] ink-3 mb-2">What is next</div>
            {nextLab ? (
              <>
                <div className="text-[12.5px] ink-1 font-semibold">{nextLab.title}</div>
                <p className="text-[11px] ink-3 mt-1 leading-relaxed">
                  {stripTags(nextLab.intro()).slice(0, 150)}…
                </p>
                <button
                  onClick={() => onOpenLab(nextLab.id)}
                  className="btn btn-ghost w-full px-3 py-2 text-xs mt-3"
                >
                  Open lab <ArrowRight size={12} />
                </button>
              </>
            ) : unlocked && exam && !examProgress[exam.id]?.passed ? (
              <>
                <div className="text-[12.5px] ink-1 font-semibold">{exam.title}</div>
                <p className="text-[11px] ink-3 mt-1 leading-relaxed">
                  Every lab in this section is done. The test is open.
                </p>
                <button
                  onClick={() => onOpenExam(exam.id)}
                  className="btn btn-ghost w-full px-3 py-2 text-xs mt-3"
                >
                  Take the test <ArrowRight size={12} />
                </button>
              </>
            ) : (
              <p className="text-[11px] ink-3 leading-relaxed">
                This section is finished. Pick another from the sidebar.
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

/** Lab HTML intros are authored as markup; the rail wants plain text. */
function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

// ------------------------------------------------------------ small parts

function SideItem({
  Icon,
  label,
  on,
  glow,
  trailing,
  onClick,
}: {
  Icon: React.ComponentType<{ size?: number }>;
  label: string;
  on: boolean;
  glow?: string;
  trailing?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors"
      style={{
        background: on ? `color-mix(in oklab, ${glow ?? 'var(--accent)'} 13%, transparent)` : 'transparent',
        color: on ? 'var(--ink-1)' : 'var(--ink-3)',
        borderLeft: `2px solid ${on ? glow ?? 'var(--accent)' : 'transparent'}`,
      }}
    >
      <Icon size={14} />
      <span className="text-[11.5px] font-medium flex-1 truncate">{label}</span>
      {trailing && <span className="text-[10px] font-mono ink-4 shrink-0">{trailing}</span>}
    </button>
  );
}

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-3">
    <span className="text-[11px] ink-3">{label}</span>
    <span className="text-[11.5px] ink-1 font-mono tabular-nums">{value}</span>
  </div>
);

const Pill = ({ tone, children }: { tone: string; children: React.ReactNode }) => (
  <span
    className="text-[9px] font-mono px-1.5 py-0.5 rounded"
    style={{ color: tone, background: `color-mix(in oklab, ${tone} 15%, transparent)` }}
  >
    {children}
  </span>
);

function Metric({
  label,
  value,
  sub,
  tone,
  children,
}: {
  label: string;
  value: string;
  sub: string;
  tone: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="panel rounded-2xl p-4">
      <div className="label-mono !text-[9px] ink-3">{label}</div>
      <div className="flex items-baseline gap-1.5 mt-1">
        <span className="h-section text-2xl ink-1 tabular-nums">{value}</span>
        <span className="text-[10.5px] ink-4">{sub}</span>
      </div>
      <div className="mt-2.5">{children}</div>
      <div className="mt-1.5 h-0.5 rounded" style={{ background: `color-mix(in oklab, ${tone} 30%, transparent)` }} />
    </div>
  );
}

/** Per-section completion as small bars — real data, not a fake trend line. */
function Bars({ values, tone }: { values: number[]; tone: string }) {
  return (
    <div className="flex items-end gap-1 h-7">
      {values.map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm"
          style={{
            height: `${Math.max(8, v * 100)}%`,
            background: v > 0 ? tone : `color-mix(in oklab, ${tone} 20%, transparent)`,
            opacity: v > 0 ? 0.35 + v * 0.65 : 1,
            transition: 'height .5s cubic-bezier(.2,.9,.25,1)',
          }}
        />
      ))}
    </div>
  );
}

/** The section's labs as a connected run, echoing the reference's link view. */
function SectionRail({ labs, glow }: { labs: { id: string; done: boolean }[]; glow: string }) {
  if (labs.length === 0) return null;
  return (
    <div className="flex items-center gap-0">
      {labs.map((l, i) => (
        <React.Fragment key={l.id}>
          {i > 0 && (
            <div
              className="flex-1 h-px"
              style={{
                background: labs[i - 1].done ? glow : 'rgb(var(--glass-border)/.25)',
              }}
            />
          )}
          <span
            className="grid place-items-center w-6 h-6 rounded-full shrink-0"
            style={{
              background: l.done ? glow : 'transparent',
              border: `1.5px solid ${l.done ? glow : 'rgb(var(--glass-border)/.35)'}`,
              color: l.done ? 'var(--bg-base)' : 'var(--ink-4)',
              boxShadow: l.done ? `0 0 14px -3px ${glow}` : 'none',
            }}
          >
            {l.done ? <Check size={12} /> : <span className="text-[9px] font-mono">{i + 1}</span>}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}
