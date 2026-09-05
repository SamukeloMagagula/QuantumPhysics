import React, { useEffect, useState } from 'react';
import { ArrowRight, Check, Lock, Trophy } from 'lucide-react';
import { Meta, Page, PageHeader, ProgressBar, Section } from './ui/Page';

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
    <Page width="wide">
      <PageHeader
        eyebrow="Learning path"
        title={data.path.title}
        description={data.path.description}
        actions={
          <button onClick={onOpenLeaderboard} className="btn btn-ghost px-3 py-2 text-xs">
            <Trophy size={13} /> Leaderboard
          </button>
        }
        meta={
          <>
            <Meta label="Rooms completed" value={`${done} of ${data.rooms.length}`} />
            <Meta label="Progress" value={`${pct}%`} tone={pct === 100 ? 'var(--ok)' : undefined} />
            <div className="flex-1 min-w-[140px]">
              <ProgressBar percent={pct} />
            </div>
          </>
        }
      />

      <div className="space-y-7">
        {badges.length > 0 && (
          <Section title="Badges" description="Earned as you finish rooms.">
            <div className="panel rounded-xl p-3 flex flex-wrap items-center gap-2">
              {badges.map((b) => (
                <span
                  key={b.id}
                  title={b.name}
                  className="text-[11px] font-mono px-2 py-1 rounded border"
                  style={{
                    background: 'rgb(var(--glass-tint)/.1)',
                    borderColor: 'rgb(var(--glass-border)/.2)',
                  }}
                >
                  {b.name}
                </span>
              ))}
            </div>
          </Section>
        )}

        <Section title="Rooms" description="Each one unlocks the next.">
        <div className="grid gap-3 sm:grid-cols-2 items-stretch">
          {data.rooms.map((room, i) => {
            const locked = i > 0 && !data.rooms[i - 1].completed;
            const isNext = i === nextIdx;
            const tone = DIFFICULTY_TOKEN[room.difficulty] ?? 'var(--ink-3)';
            return (
              <button
                key={room.id}
                onClick={() => !locked && onOpenRoom(room.id)}
                disabled={locked}
                style={{ opacity: locked ? 0.5 : 1 }}
                className="panel card rounded-xl p-4 h-full flex flex-col text-left disabled:cursor-not-allowed"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="text-[14px] font-semibold ink-1">{room.title}</div>
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
                <p className="text-[12px] ink-3 mt-1.5 leading-relaxed flex-1">{room.summary}</p>
                <div className="flex items-center gap-2 mt-3">
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
        </Section>
      </div>
    </Page>
  );
}
