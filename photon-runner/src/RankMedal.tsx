import React from 'react';
import type { MedalTier } from './worldExploration';

// White Kenney glyphs (CC0), used as masks so each tier can be coloured in CSS.
const ICON = '/assets/kenney/game-icons/PNG/White/2x/';
const GLYPH: Record<MedalTier, string> = { recruit: 'star', bronze: 'medal2', silver: 'medal1', gold: 'trophy' };

/** A coloured medal for an explorer rank. Decorative: the rank name is always beside it. */
export function RankMedal({ tier, size = 34 }: { tier: MedalTier; size?: number }) {
  const glyph = `url(${ICON}${GLYPH[tier]}.png)`;
  return <span className="rank-medal" data-tier={tier} style={{ width: size, height: size }} aria-hidden="true">
    <span style={{ WebkitMaskImage: glyph, maskImage: glyph }} />
  </span>;
}
