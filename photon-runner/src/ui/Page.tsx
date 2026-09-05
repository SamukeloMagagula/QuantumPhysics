import React from 'react';

/**
 * The shared page shell.
 *
 * Before this existed every screen invented its own chrome: a different
 * maximum width, different padding, and a 48–96px gradient wordmark as the
 * page title. Thirteen screens, thirteen headers. That reads as a set of
 * demos rather than one product, so all of it now comes from here.
 *
 * The rules are deliberately few and dull:
 *
 * - One page title style. Solid ink, ~24px, not a gradient. Gradients are
 *   for the brand mark in the top bar, not for saying "Leaderboard".
 * - An eyebrow above it carries the context that used to be shouted by the
 *   title's size.
 * - Content sits on one of two widths — `reading` for prose and forms,
 *   `wide` for dashboards and grids — so pages line up with each other when
 *   you move between them.
 * - Groups of things get a labelled `Section` with a hairline, which is what
 *   gives a screen structure instead of a heap of cards.
 */

type Width = 'reading' | 'wide' | 'full';

const WIDTH: Record<Width, string> = {
  reading: 'max-w-3xl',
  wide: 'max-w-6xl',
  full: 'max-w-[1500px]',
};

export function Page({
  children,
  width = 'wide',
  className = '',
}: {
  children: React.ReactNode;
  width?: Width;
  className?: string;
}) {
  return (
    <div className={`bg-scene min-h-full px-4 py-6 md:px-8 md:py-8 ${className}`}>
      <div className={`${WIDTH[width]} mx-auto`}>{children}</div>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
}: {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  /** Buttons, right-aligned and vertically centred against the title. */
  actions?: React.ReactNode;
  /** A row of small facts under the description — counts, status, progress. */
  meta?: React.ReactNode;
}) {
  return (
    <header className="pb-4 mb-6 border-b" style={{ borderColor: 'rgb(var(--glass-border)/.16)' }}>
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="min-w-0">
          {eyebrow && <div className="label-mono mb-1.5">{eyebrow}</div>}
          <h1 className="h-section text-[22px] md:text-[26px] ink-1">{title}</h1>
          {description && (
            <p className="text-[13px] ink-2 leading-relaxed mt-1.5 max-w-2xl">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {meta && <div className="flex items-center gap-5 flex-wrap mt-4">{meta}</div>}
    </header>
  );
}

/** A labelled group. The hairline is what turns a heap of cards into a page. */
export function Section({
  title,
  description,
  actions,
  children,
  className = '',
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`mb-7 ${className}`}>
      <div className="flex items-baseline justify-between gap-4 mb-3">
        <div className="min-w-0">
          <h2 className="label-mono">{title}</h2>
          {description && <p className="text-[12px] ink-3 mt-1">{description}</p>}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/** One fact, for the header's meta row. */
export function Meta({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="label-mono !text-[9px] !tracking-[.14em]">{label}</div>
      <div className="text-[13px] font-semibold mt-0.5 truncate" style={{ color: tone ?? 'var(--ink-1)' }}>
        {value}
      </div>
    </div>
  );
}

/** A thin progress bar, used wherever a page reports completion. */
export function ProgressBar({ percent, tone = 'var(--accent)' }: { percent: number; tone?: string }) {
  return (
    <div
      className="h-1 rounded-full overflow-hidden w-full"
      style={{ background: 'rgb(var(--glass-border)/.2)' }}
    >
      <div
        className="h-full rounded-full"
        style={{
          width: `${Math.max(0, Math.min(100, percent))}%`,
          background: tone,
          transition: 'width .6s cubic-bezier(.2,.9,.25,1)',
        }}
      />
    </div>
  );
}

/**
 * The standard card. Equal height by default, so a grid of them lines up
 * regardless of how long each description happens to be.
 */
export function Card({
  as = 'div',
  onClick,
  disabled,
  className = '',
  style,
  children,
}: {
  as?: 'div' | 'button';
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const cls = `panel rounded-xl p-4 h-full flex flex-col text-left ${
    as === 'button' && !disabled ? 'card' : ''
  } ${className}`;
  if (as === 'button') {
    return (
      <button onClick={onClick} disabled={disabled} className={cls} style={style}>
        {children}
      </button>
    );
  }
  return (
    <div className={cls} style={style}>
      {children}
    </div>
  );
}

/** Small status pill. One shape for every state in the product. */
export function Tag({ tone = 'var(--ink-3)', children }: { tone?: string; children: React.ReactNode }) {
  return (
    <span
      className="text-[10px] font-mono px-1.5 py-0.5 rounded border whitespace-nowrap"
      style={{
        color: tone,
        borderColor: `color-mix(in oklab, ${tone} 30%, transparent)`,
        background: `color-mix(in oklab, ${tone} 10%, transparent)`,
      }}
    >
      {children}
    </span>
  );
}
