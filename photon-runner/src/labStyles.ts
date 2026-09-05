/**
 * Class strings for the vanilla-DOM labs.
 *
 * These were originally hardcoded Tailwind slate/emerald values carried over
 * from CyberRange, which meant every lab was legible in dark mode and washed
 * out in light. Everything here now goes through the app's own theme tokens
 * (--ink-*, --accent, --ok, --warn, --danger and the glass variables), so one
 * change covers both themes and the labs match the rest of the product.
 */

export const CARD =
  'rounded-2xl p-4 space-y-2 font-mono text-sm ink-2 ' +
  'bg-[rgb(var(--glass-tint)/var(--glass-alpha))] ' +
  'border border-[rgb(var(--glass-border)/var(--glass-border-alpha))]';

export const MUTED = 'ink-3 text-xs';

export const HEADING = 'text-lg font-bold ink-1';

export const INPUT =
  'w-full rounded-xl px-3 py-2 text-sm font-mono ink-1 ' +
  'bg-[color-mix(in_oklab,var(--ink-1)_7%,transparent)] ' +
  'border border-[color-mix(in_oklab,var(--ink-1)_16%,transparent)] ' +
  'focus:outline-none focus:border-[var(--accent)]';


/**
 * Native <select> keeps its own arrow (drawn by the OS, which follows the
 * document's color-scheme), so it only needs an opaque background — a
 * translucent one falls back to the platform grey and looks unstyled.
 */
export const SELECT =
  'w-full rounded-xl px-3 py-2 text-sm font-mono ink-1 ' +
  'bg-[var(--bg-raise)] ' +
  'border border-[color-mix(in_oklab,var(--ink-1)_16%,transparent)] ' +
  'focus:outline-none focus:border-[var(--accent)]';

export const BUTTON = 'btn btn-primary px-4 py-2 text-sm font-mono';

export const BUTTON_SECONDARY = 'btn btn-ghost px-4 py-2 text-sm font-mono';

export const ACCENT_CARD =
  'rounded-2xl p-4 font-mono text-sm ink-2 ' +
  'bg-[color-mix(in_oklab,var(--accent)_10%,transparent)] ' +
  'border border-[color-mix(in_oklab,var(--accent)_45%,transparent)]';

export const DANGER_CARD =
  'rounded-2xl p-4 font-mono text-sm ink-2 ' +
  'bg-[color-mix(in_oklab,var(--danger)_10%,transparent)] ' +
  'border border-[color-mix(in_oklab,var(--danger)_45%,transparent)]';

/** Status text. Semantic rather than coloured by hand, so light mode works. */
export const OK_TEXT = 'text-[var(--ok)] font-mono text-sm';
export const WARN_TEXT = 'text-[var(--warn)] font-mono text-sm';
export const DANGER_TEXT = 'text-[var(--danger)] font-mono text-sm';
export const ACCENT_TEXT = 'text-[var(--accent)] font-mono text-sm';

export const DONE_TEXT = 'text-[var(--ok)] font-bold font-mono text-sm';
