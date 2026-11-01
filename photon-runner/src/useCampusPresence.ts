import { useEffect, useState } from 'react';
import type { CharacterAppearance } from './characterAppearance';
import { connectFloor, type ChatLine, type FloorLink, type PeerLook, type RemoteActor } from './floorClient';
import type { Facing } from './floorPresence';
import { play } from './sound';
import type { CharacterFacing } from './WorldCharacter';
import { WORLD_HEIGHT, WORLD_WIDTH, type Point } from './worldLayout';

/** Everyone on the campus shares one presence room; positions travel normalised. */
const FLOOR_ROOM = 'campus';
/** How long a quick-chat line hangs over the speaker's head. */
export const BUBBLE_MS = 5000;
const TO_WIRE: Record<CharacterFacing, Facing> = { north: 'backward', south: 'forward', east: 'right', west: 'left' };

export interface Bubble {
  phrase: number;
  until: number;
}

function lookOf({ nickname: _nickname, ...look }: CharacterAppearance): PeerLook {
  return look;
}

/**
 * The campus multiplayer link. Presence keeps running under activity panels,
 * so a player using a program still shows up to everyone else at their desk.
 *
 * `peers` is a snapshot refreshed each time the server answers (a few times a
 * second) — enough for lists and seat checks. Smooth on-screen motion reads
 * the live `link` directly, so it never re-renders the whole map.
 */
export function useCampusPresence(me: {
  position: Point;
  facing: CharacterFacing;
  moving: boolean;
  seat: string | null;
  appearance: CharacterAppearance;
}) {
  const [link, setLink] = useState<FloorLink | null>(null);
  const [online, setOnline] = useState(false);
  const [peers, setPeers] = useState<RemoteActor[]>([]);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [bubbles, setBubbles] = useState<Record<number, Bubble>>({});
  const [myBubble, setMyBubble] = useState<Bubble | null>(null);

  useEffect(() => {
    const floor = connectFloor();
    setLink(floor);
    let primed = false;
    let seen = 0;
    const unsubscribe = floor.subscribe(() => {
      const lines = floor.messages();
      setOnline(floor.online());
      setChat([...lines]);
      setPeers(floor.actors().map((a) => ({ ...a })));
      const fresh = lines.filter((l) => l.id > seen);
      if (fresh.length) seen = fresh[fresh.length - 1].id;
      // The first answer carries history; only lines said since then pop up.
      if (primed && fresh.length) {
        play('chat');
        setBubbles((b) => {
          const next = { ...b };
          for (const l of fresh) next[l.userId] = { phrase: l.phrase, until: Date.now() + BUBBLE_MS };
          return next;
        });
      }
      if (floor.online()) primed = true;
    });
    return () => {
      unsubscribe();
      floor.stop();
      setLink(null);
    };
  }, []);

  const { position, facing, moving, seat, appearance } = me;
  useEffect(() => {
    link?.report(position.x / WORLD_WIDTH, position.y / WORLD_HEIGHT, TO_WIRE[facing], moving, FLOOR_ROOM, {
      name: appearance.nickname.trim() || undefined,
      look: lookOf(appearance),
      seat,
    });
  }, [link, position, facing, moving, seat, appearance]);

  useEffect(() => {
    if (!myBubble) return;
    const timeout = window.setTimeout(() => setMyBubble(null), myBubble.until - Date.now());
    return () => window.clearTimeout(timeout);
  }, [myBubble]);

  const say = (phrase: number) => {
    link?.say(phrase).then((ok) => {
      if (!ok) return;
      play('chat');
      setMyBubble({ phrase, until: Date.now() + BUBBLE_MS });
    });
  };

  return { link, online, peers, chat, bubbles, myBubble, say };
}
