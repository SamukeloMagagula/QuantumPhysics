import React, { useId } from 'react';
import type { CharacterAppearance } from './characterAppearance';

export type CharacterFacing = 'north' | 'south' | 'east' | 'west';

/** A small illustrated character, with the feet as its collision anchor. */
export function WorldCharacter({ appearance: a, facing, moving }: {
  appearance: CharacterAppearance; facing: CharacterFacing; moving: boolean;
}) {
  const id = useId();
  const side = facing === 'east' || facing === 'west', back = facing === 'north';
  const width = a.build === 'broad' ? 1.12 : a.build === 'slim' ? .92 : 1;
  const coat = a.outfit === 'labcoat';
  const primary = coat ? '#e7edf0' : a.outfitPrimary;
  const hair = a.hairStyle;
  return <g className={`world-character ${moving ? 'is-walking' : ''}`} data-facing={facing}>
    <defs>
      <linearGradient id={`${id}-jacket`}><stop stopColor={primary} /><stop offset=".48" stopColor={primary} /><stop offset="1" stopColor="#162c40" /></linearGradient>
      <linearGradient id={`${id}-skin`}><stop stopColor={a.skinTone} /><stop offset=".7" stopColor={a.skinTone} /><stop offset="1" stopColor="#a46f56" /></linearGradient>
      <linearGradient id={`${id}-hair`} x2=".8" y2="1"><stop stopColor={a.hairColor} /><stop offset="1" stopColor="#17222e" /></linearGradient>
    </defs>
    <ellipse cy=".5" rx="7.5" ry="2.6" fill="#233343" opacity=".24" />
    <ellipse cy=".5" rx="9" ry="3.6" fill="none" stroke="#5cbdd5" strokeWidth=".65" opacity=".8" />
    <g transform={`scale(${(facing === 'west' ? -1 : 1) * width} ${a.height})`}>
      <g className="character-leg character-leg-far"><path d="M-4-15L-4.5-7L-4 0" fill="none" stroke={a.outfitSecondary} strokeWidth="4.3" strokeLinecap="round" /><path d="M-6-1Q-3-2-1 0L-1 1.4H-6Z" fill="#172332" /><path d="M-6 1.3H-1" stroke="#748796" strokeWidth=".6" /></g>
      <g className="character-arm character-arm-far"><path d="M-5-29Q-9-25-7-19" fill="none" stroke={primary} strokeWidth="4" strokeLinecap="round" /><path d="M-7-20L-6.5-16" stroke={a.skinTone} strokeWidth="2.6" strokeLinecap="round" /></g>
      <g className="character-leg character-leg-near"><path d="M3-15L4-7L4 0" fill="none" stroke={a.outfitSecondary} strokeWidth="4.4" strokeLinecap="round" /><path d="M2-1Q5-2 7 0L7 1.4H2Z" fill="#172332" /><path d="M2 1.3H7" stroke="#748796" strokeWidth=".6" /></g>
      <g className="character-upper">
        <path d={coat ? 'M-5-30Q0-33 5-30L7-11H-7Z' : 'M-5-30Q0-33 5-30L6-17Q0-15-6-17Z'} fill={`url(#${id}-jacket)`} stroke="#223443" strokeWidth=".6" />
        {!back && <><path d="M-2-31L0-25L2-31" fill={a.outfitSecondary} /><path d="M0-25V-17" stroke="#142b39" strokeWidth=".5" opacity=".55" /><path d="M-5-29L-1-26L-2-31M5-29L1-26L2-31" fill={coat ? '#fff' : a.accentColor} opacity=".7" /><rect x="2" y="-25" width="2.5" height="3.2" rx=".5" fill="#edf3f7" /><path d="M2.5-24H4" stroke={a.accentColor} strokeWidth=".7" /></>}
        {back && <path d="M-4-27Q0-29 4-27M-4-19H4" fill="none" stroke={a.accentColor} strokeWidth=".7" opacity=".6" />}
        {a.outfit === 'hoodie' && <path d="M-4-31Q0-36 4-31L3-27Q0-25-3-27Z" fill={a.outfitSecondary} />}
        {a.outfit === 'tactical' && <path d="M-5-28H-1V-20H-5ZM1-28H5V-20H1Z" fill={a.outfitSecondary} stroke="#81919d" strokeWidth=".4" />}
        <g className="character-arm character-arm-near"><path d="M5-29Q8-25 7-20" fill="none" stroke={`url(#${id}-jacket)`} strokeWidth="4" strokeLinecap="round" /><path d="M7-20L6.5-16" stroke={a.skinTone} strokeWidth="2.8" strokeLinecap="round" /></g>
        <path d="M-1.7-34V-30Q0-28.5 1.7-30V-34" fill={a.skinTone} />
        {(hair === 'long' || hair === 'ponytail') && <path d="M-4-40Q-8-32-4-28L-1-31V-39Z" fill={a.hairColor} />}
        <path d={side ? 'M-4-40Q0-46 4-41L4-37L6-35.5L4-35L3-32Q-3-31-4-36Z' : 'M-4.5-40Q0-45 4.5-40L4-35Q3-31.5 0-31Q-3-31.5-4-35Z'} fill={`url(#${id}-skin)`} stroke="#805d50" strokeWidth=".35" />
        {!back && <g><path d={side ? 'M1-38H3' : 'M-3-38L-1-38.4M1-38.4L3-38'} stroke="#393031" strokeWidth=".65" strokeLinecap="round" /><ellipse cx={side ? 2.3 : -2} cy="-37" rx=".6" ry=".8" fill="#203442" />{!side && <ellipse cx="2" cy="-37" rx=".6" ry=".8" fill="#203442" />}<path d="M0-36.5L-.5-34.8H.5M-1.3-33.5Q0-32.8 1.3-33.5" fill="none" stroke="#9c6559" strokeWidth=".45" /></g>}
        {hair !== 'bald' && <path d={back ? 'M-5-39Q-6-46 0-45Q6-45 5-39L4-34Q0-32-4-34Z' : hair === 'buzz' ? 'M-4.6-39Q-4-44 0-44Q5-44 4.7-38L3-40L-3-40Z' : hair === 'afro' ? 'M-5-37Q-9-41-5-44Q-5-48 0-47Q5-48 6-43Q9-39 4-37L3-40Q0-38-3-40Z' : hair === 'mohawk' ? 'M-2-39L-2-46L0-48L2-45L2-39Z' : 'M-5-37Q-7-43-2-45Q2-47 5-42L5-37L3-40Q-1-38-2-41L-4-37Z'} fill={`url(#${id}-hair)`} />}
        {(hair === 'bun' || hair === 'ponytail') && <circle cx="-3" cy="-44" r="2.4" fill={a.hairColor} />}
        {a.accessory === 'glasses' && !back && <g fill="none" stroke="#25394b" strokeWidth=".65"><rect x="-3.8" y="-38.5" width="3" height="2.5" rx=".7" /><rect x=".8" y="-38.5" width="3" height="2.5" rx=".7" /><path d="M-.8-37.5H.8" /></g>}
        {(a.accessory === 'cap' || a.accessory === 'beanie') && <path d="M-5-40Q-5-47 0-46Q6-46 5-40Z" fill={a.accentColor} />}
        {a.accessory === 'cap' && <path d="M-1-40H7" stroke={a.accentColor} strokeWidth="1.5" strokeLinecap="round" />}
        {a.accessory === 'headphones' && <path d="M-5-36V-40Q0-47 5-40V-36" fill="none" stroke={a.accentColor} strokeWidth="1.8" />}
        {a.accessory === 'visor' && !back && <path d="M-4-38H4V-35H-4Z" fill="#66c9e5" opacity=".85" />}
        {a.accessory === 'mask' && !back && <path d="M-3-35H3L2-32H-2Z" fill="#bed4de" />}
        {a.accessory === 'earpiece' && <circle cx="4.5" cy="-36" r="1" fill={a.accentColor} />}
      </g>
    </g>
  </g>;
}
