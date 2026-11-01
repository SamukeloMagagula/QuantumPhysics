import React from 'react';

/**
 * A segmented bar: easier to read at a glance than a thin line, and the
 * marker shows the line that matters (the abort threshold, the key goal).
 * `danger` meters go amber then red as they fill; `goal` meters go green
 * once the marker is reached.
 */
export function SegmentMeter({ label, value, max, mark, kind = 'danger', valueText, segments = 20, dark = true }: {
  label: string; value: number; max: number;
  /** Where the line that matters sits, in the same units as value. */
  mark?: number;
  kind?: 'danger' | 'goal' | 'neutral';
  valueText?: string; segments?: number; dark?: boolean;
}) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const filled = value > 0 ? Math.max(1, Math.round(ratio * segments)) : 0;
  const markAt = mark === undefined || max <= 0 ? undefined : Math.max(0, Math.min(1, mark / max));
  const reached = markAt !== undefined && ratio >= markAt;
  const tone = kind === 'goal' ? (reached ? 'good' : 'progress')
    : kind === 'neutral' ? 'progress'
    : markAt !== undefined ? (reached ? 'bad' : ratio >= markAt * 0.75 ? 'warn' : 'safe')
    : ratio >= 0.75 ? 'bad' : ratio >= 0.45 ? 'warn' : 'safe';
  return <div className="segment-meter" data-tone={tone} data-dark={dark || undefined}>
    <div className="segment-meter-label"><span>{label}</span><b>{valueText ?? `${Math.round(ratio * 100)}%`}</b></div>
    <div className="segment-meter-bar" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-valuetext={valueText}>
      {Array.from({ length: segments }, (_, i) => <span key={i} data-on={i < filled || undefined} />)}
      {markAt !== undefined && <i style={{ left: `${markAt * 100}%` }} />}
    </div>
  </div>;
}
