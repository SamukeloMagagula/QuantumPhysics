import React, { useEffect, useState } from 'react';
import { ArrowRight, Award, Check, Lock, Trophy } from 'lucide-react';

interface RoomCard {
  id: string;
  title: string;
  summary: string;
  difficulty: string;
  estimatedMinutes: number;
  completed: boolean;
}

interface PathResponse {
  path: { id: string; title: string; description: string };
  rooms: RoomCard[];
}

interface Badge {
  id: string;
  name: string;
  icon: string;
}

interface RoomsHubProps {
  onOpenRoom: (roomId: string) => void;
  onOpenLeaderboard: () => void;
}

const DIFFICULTY_TOKEN: Record<string, string> = {
  Easy: 'var(--ok)',
  Medium: 'var(--warn)',
  Hard: 'var(--danger)',
};

export function RoomsHub({ onOpenRoom, onOpenLeaderboard }: RoomsHubProps) {
  const [data, setData] = useState<PathResponse | null>(null);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/paths/symmetric').then((r) => (r.ok ? r.json() : Promise.reject())),
      fetch('/api/badges').then((r) => (r.ok ? r.json() : Promise.reject())),
    ])
      .then(([pathRes, badgeRes]) => {
        if (cancelled) return;
        setData(pathRes as PathResponse);
        setBadges((badgeRes as { badges: Badge[] }).badges);
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="bg-scene bg-mesh min-h-full grid place-items-center px-4">
        <p className="text-sm ink-2">Couldn't load the learning path. Try again shortly.</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="bg-scene bg-mesh min-h-full grid place-items-center px-4">
        <p className="text-sm ink-3">Loading…</p>
      </div>
    );
  }

  const done = data.rooms.filter((r) => r.completed).length;
  const pct = data.rooms.length ? Math.round((done / data.rooms.length) * 100) : 0;
  // First room, or the first not-yet-completed room after a completed prerequisite, is "next".
  const nextIdx = data.rooms.findIndex((r) => !r.completed);

  return (
    <div className="bg-scene bg-mesh min-h-full px-4 py-10 md:px-8">
      <div className="max-w-5xl mx-auto space-y-7">
        <header className="a-rise">
          <h1 className="h-display text-4xl md:text-5xl text-grad">{data.path.title}</h1>
          <p className="text-sm ink-2 mt-2 max-w-xl leading-relaxed">{data.path.description}</p>

          <div className="mt-5 glass rounded-2xl p-4 flex items-center gap-4">
            <div className="flex-1">
              <div className="flex justify-between text-[11px] mb-2">
                <span className="ink-3">Progress</span>
                <span className="font-bold">
                  {done} / {data.rooms.length}
                </span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgb(var(--glass-tint)/.12)' }}>
                <div
                  className="h-full rounded-full transition-[width] duration-700 ease-out"
                  style={{ width: `${pct}%`, background: 'linear-gradient(90deg, var(--accent), var(--accent-2))' }}
                />
              </div>
            </div>
            <div className="h-section text-3xl ink-1 tabular-nums shrink-0">{pct}%</div>
          </div>

          <button
            onClick={onOpenLeaderboard}
            className="btn btn-ghost mt-4 px-4 py-2 text-xs inline-flex items-center gap-1.5"
          >
            <Trophy size={13} /> Leaderboard
          </button>
        </header>

        {badges.length > 0 && (
          <section className="a-rise glass rounded-2xl p-4 flex flex-wrap items-center gap-3">
            <span className="label-mono flex items-center gap-1.5">
              <Award size={13} /> Badges
            </span>
            {badges.map((b) => (
              <span
                key={b.id}
                title={b.name}
                className="text-[11px] font-mono px-2 py-1 rounded-md"
                style={{ background: 'rgb(var(--glass-tint)/.14)' }}
              >
                {b.icon} {b.name}
              </span>
            ))}
          </section>
        )}

        <div className="stagger grid gap-3 sm:grid-cols-2">
          {data.rooms.map((room, i) => {
            const locked = i > 0 && !data.rooms[i - 1].completed;
            const isNext = i === nextIdx;
            const tone = DIFFICULTY_TOKEN[room.difficulty] ?? 'var(--ink-3)';
            return (
              <button
                key={room.id}
                onClick={() => !locked && onOpenRoom(room.id)}
                disabled={locked}
                style={{ ['--glow' as string]: tone, ['--i' as string]: i, opacity: locked ? 0.55 : 1 }}
                className="card sheen glass group rounded-[18px] p-4 text-left disabled:cursor-not-allowed"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="text-sm font-semibold ink-1">{room.title}</div>
                  {room.completed ? (
                    <span className="shrink-0" style={{ color: 'var(--ok)' }}>
                      <Check size={14} />
                    </span>
                  ) : locked ? (
                    <span className="shrink-0 ink-4">
                      <Lock size={14} />
                    </span>
                  ) : null}
                </div>
                <p className="text-xs ink-3 mt-1.5 leading-relaxed">{room.summary}</p>
                <div className="flex items-center gap-2 mt-2.5">
                  <span
                    className="text-[10px] font-mono px-2 py-0.5 rounded-md border"
                    style={{
                      color: tone,
                      borderColor: `color-mix(in oklab, ${tone} 32%, transparent)`,
                      background: `color-mix(in oklab, ${tone} 12%, transparent)`,
                    }}
                  >
                    {room.difficulty}
                  </span>
                  <span className="text-[10px] ink-4">{room.estimatedMinutes} min</span>
                  {isNext && (
                    <span className="text-[10px] ink-4 ml-auto flex items-center gap-1">
                      Continue <ArrowRight size={11} />
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
