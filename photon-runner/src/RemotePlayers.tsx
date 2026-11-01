import React, { memo, useEffect, useState } from 'react';
import { DEFAULT_APPEARANCE, type CharacterAppearance } from './characterAppearance';
import type { FloorLink, PeerLook, RemoteActor } from './floorClient';
import { QUICK_CHAT, type Facing } from './floorPresence';
import type { Bubble } from './useCampusPresence';
import { WorldCharacter, type CharacterFacing } from './WorldCharacter';
import { computerById } from './worldComputers';
import { WORLD_HEIGHT, WORLD_WIDTH, type Point } from './worldLayout';

const FROM_WIRE: Record<Facing, CharacterFacing> = { backward: 'north', forward: 'south', right: 'east', left: 'west' };

// Cached per look object, so a player's drawing is only rebuilt when their look arrives anew.
const appearances = new WeakMap<PeerLook, CharacterAppearance>();
function appearanceOf(look: PeerLook | null): CharacterAppearance {
  if (!look) return DEFAULT_APPEARANCE;
  let appearance = appearances.get(look);
  if (!appearance) appearances.set(look, (appearance = { ...DEFAULT_APPEARANCE, ...look } as CharacterAppearance));
  return appearance;
}

/** Where to draw another player: in their chair if seated, else where they stand. */
export function remotePoint(a: RemoteActor): Point {
  return computerById(a.seat)?.seat ?? { x: a.x * WORLD_WIDTH, y: a.y * WORLD_HEIGHT };
}

export function SpeechBubble({ text }: { text: string }) {
  const width = Math.min(150, 14 + text.length * 4.6);
  return (
    <g className="world-bubble" transform="translate(0 -74)" aria-hidden="true">
      <rect x={-width / 2} y="-11" width={width} height="17" rx="8" fill="#fffdf6" stroke="#2f5566" strokeWidth=".8" />
      <path d="M-4 6L0 11L4 6Z" fill="#fffdf6" stroke="#2f5566" strokeWidth=".8" />
      <path d="M-3.4 5.3H3.4" stroke="#fffdf6" strokeWidth="1.6" />
      <text y="1" textAnchor="middle" fontSize="7.5" fill="#203a48">
        {text.length > 32 ? `${text.slice(0, 31)}…` : text}
      </text>
    </g>
  );
}

/**
 * Everyone else on campus. Runs its own animation loop against the live floor
 * link, so smoothing other players re-renders only this layer — the map,
 * artwork and HUD stay put.
 */
export const RemotePlayers = memo(function RemotePlayers({ link, bubbles }: { link: FloorLink | null; bubbles: Record<number, Bubble> }) {
  const [, setFrame] = useState(0);
  useEffect(() => {
    if (!link) return;
    let frame = 0;
    let last = performance.now();
    let shown = 0;
    const animate = (now: number) => {
      link.tick(Math.min((now - last) / 1000, 0.1));
      last = now;
      const count = link.actors().length;
      if (count || shown) setFrame((f) => f + 1);
      shown = count;
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [link]);

  const now = Date.now();
  return (
    <>
      {link?.actors().map((a) => {
        const at = remotePoint(a);
        const bubble = bubbles[a.userId];
        return (
          <g key={a.userId} transform={`translate(${at.x} ${at.y})`} className="world-remote" aria-label={`${a.name}${a.seat ? ' (at a computer)' : ''}`}>
            <WorldCharacter appearance={appearanceOf(a.look)} facing={a.seat ? 'north' : FROM_WIRE[a.facing]} moving={a.walking} seated={Boolean(a.seat)} />
            <text className="world-nametag" y={a.seat ? -42 : -52} textAnchor="middle">
              {a.name}
            </text>
            {bubble && bubble.until > now && <SpeechBubble text={QUICK_CHAT[bubble.phrase]} />}
          </g>
        );
      })}
    </>
  );
});
