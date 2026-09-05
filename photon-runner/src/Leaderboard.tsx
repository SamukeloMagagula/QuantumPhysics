import React, { useEffect, useState } from 'react';
import { Page, PageHeader } from './ui/Page';
import { Trophy } from 'lucide-react';

interface LeaderboardEntry {
  username: string;
  points: number;
  rank: string;
}

export function Leaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/leaderboard')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => !cancelled && setEntries((data as { leaderboard: LeaderboardEntry[] }).leaderboard))
      .catch(() => !cancelled && setEntries([]));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Page width="reading">
      <PageHeader
        eyebrow="Symmetric cryptography"
        title="Leaderboard"
        description="Top operatives by points earned across the learning path."
      />
      <div className="space-y-6">

        {entries === null && <p className="text-sm ink-3">Loading…</p>}
        {entries?.length === 0 && <p className="text-sm ink-3">No scores yet — be the first.</p>}

        {entries && entries.length > 0 && (
          <ol className="stagger space-y-2">
            {entries.map((e, i) => (
              <li
                key={e.username + i}
                style={{ ['--i' as string]: i }}
                className="card glass rounded-2xl px-4 py-3 flex items-center gap-3"
              >
                <span
                  className="grid place-items-center w-8 h-8 rounded-full shrink-0 text-xs font-mono font-bold"
                  style={{
                    background: i === 0 ? 'color-mix(in oklab, var(--warn) 20%, transparent)' : 'rgb(var(--glass-tint)/.14)',
                    color: i === 0 ? 'var(--warn)' : 'var(--ink-3)',
                  }}
                >
                  {i === 0 ? <Trophy size={14} /> : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold ink-1 truncate">{e.username}</div>
                  <div className="text-[10px] ink-4">{e.rank}</div>
                </div>
                <div className="text-sm font-mono font-bold ink-1 tabular-nums shrink-0">{e.points}</div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Page>
  );
}
