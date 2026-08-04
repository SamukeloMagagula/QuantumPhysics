/**
 * Ported from quantumbreach/progress/service.py — points, room completion,
 * badges, and the leaderboard, backed by the same schema (user_stats,
 * room_progress, question_submissions, badges, user_badges).
 */
import type { Db } from './serverDb';
import { getPath, getRoom, roomQuestionIds, type Room, type RoomQuestion } from './roomsContent';
import { rankForPoints } from './roomRanks';

export interface Badge {
  id: string;
  name: string;
  icon: string;
}

export function getPoints(db: Db, userId: number): number {
  const row = db.prepare('SELECT points FROM user_stats WHERE user_id = ?').get(userId) as
    | { points: number }
    | undefined;
  return row?.points ?? 0;
}

export function answeredQuestionIds(db: Db, userId: number, roomId: string): Set<string> {
  const rows = db
    .prepare('SELECT DISTINCT question_id FROM question_submissions WHERE user_id = ? AND room_id = ? AND correct = 1')
    .all(userId, roomId) as { question_id: string }[];
  return new Set(rows.map((r) => r.question_id));
}

function roomComplete(db: Db, userId: number, room: Room): boolean {
  const answered = answeredQuestionIds(db, userId, room.id);
  const ids = roomQuestionIds(room);
  return ids.length > 0 && ids.every((id) => answered.has(id));
}

function awardBadge(db: Db, userId: number, badgeId: string): Badge | null {
  const exists = db.prepare('SELECT 1 FROM user_badges WHERE user_id = ? AND badge_id = ?').get(userId, badgeId);
  if (exists) return null;
  db.prepare('INSERT INTO user_badges (user_id, badge_id) VALUES (?, ?)').run(userId, badgeId);
  const b = db.prepare('SELECT id, name, icon FROM badges WHERE id = ?').get(badgeId) as Badge | undefined;
  return b ?? null;
}

/** Awards the 'symmetric-path' badge if every room in that path is complete. */
function checkPathBadges(db: Db, userId: number): Badge[] {
  const awarded: Badge[] = [];
  const path = getPath('symmetric');
  if (!path || path.roomIds.length === 0) return awarded;
  const allDone = path.roomIds.every((rid) => {
    const room = getRoom(rid);
    return room && roomComplete(db, userId, room);
  });
  if (allDone) {
    const b = awardBadge(db, userId, 'symmetric-path');
    if (b) awarded.push(b);
  }
  return awarded;
}

export interface AnswerResult {
  correct: boolean;
  alreadySolved: boolean;
  pointsAwarded: number;
  totalPoints: number;
  rank: string;
  roomComplete: boolean;
  newBadges: Badge[];
}

export function recordAnswer(db: Db, userId: number, room: Room, question: RoomQuestion, correct: boolean): AnswerResult {
  const already = answeredQuestionIds(db, userId, room.id).has(question.id);
  db.prepare(
    'INSERT INTO question_submissions (user_id, room_id, question_id, correct) VALUES (?, ?, ?, ?)'
  ).run(userId, room.id, question.id, correct ? 1 : 0);

  let pointsAwarded = 0;
  const newBadges: Badge[] = [];
  let complete = false;

  if (correct && !already) {
    pointsAwarded = question.points;
    db.prepare('UPDATE user_stats SET points = points + ? WHERE user_id = ?').run(pointsAwarded, userId);
    if (roomComplete(db, userId, room)) {
      complete = true;
      const newly =
        db.prepare('SELECT 1 FROM room_progress WHERE user_id = ? AND room_id = ?').get(userId, room.id) ===
        undefined;
      db.prepare('INSERT OR IGNORE INTO room_progress (user_id, room_id) VALUES (?, ?)').run(userId, room.id);
      if (newly) {
        const first = awardBadge(db, userId, 'first-clear');
        if (first) newBadges.push(first);
        newBadges.push(...checkPathBadges(db, userId));
      }
    }
  }

  const total = getPoints(db, userId);
  return {
    correct,
    alreadySolved: already,
    pointsAwarded,
    totalPoints: total,
    rank: rankForPoints(total),
    roomComplete: complete,
    newBadges,
  };
}

export interface LeaderboardEntry {
  username: string;
  points: number;
  rank: string;
}

export function leaderboard(db: Db, limit = 10): LeaderboardEntry[] {
  const rows = db
    .prepare(
      `SELECT COALESCE(u.display_name, u.username) AS username, s.points AS points
       FROM user_stats s JOIN users u ON u.id = s.user_id
       WHERE s.points > 0 ORDER BY s.points DESC, u.username LIMIT ?`
    )
    .all(limit) as { username: string; points: number }[];
  return rows.map((r) => ({ username: r.username, points: r.points, rank: rankForPoints(r.points) }));
}

export function userBadges(db: Db, userId: number): Badge[] {
  return db
    .prepare(
      `SELECT b.id, b.name, b.icon FROM user_badges ub
       JOIN badges b ON b.id = ub.badge_id WHERE ub.user_id = ? ORDER BY ub.awarded_at`
    )
    .all(userId) as Badge[];
}
