/**
 * Ported from quantumbreach/rooms/routes.py + the /leaderboard and /api/rooms
 * bits of quantumbreach/main.py.
 */
import type { Express } from 'express';
import type { Db } from './serverDb';
import { ROOMS, PATHS, getRoom, getPath, findQuestion } from './roomsContent';
import { checkAnswer } from './roomAnswers';
import { answeredQuestionIds, leaderboard, recordAnswer, userBadges } from './roomProgress';

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 12;

function completedRoomIds(db: Db, userId: number): Set<string> {
  const rows = db.prepare('SELECT room_id FROM room_progress WHERE user_id = ?').all(userId) as {
    room_id: string;
  }[];
  return new Set(rows.map((r) => r.room_id));
}

export function mountRoomsRoutes(app: Express, db: Db): void {
  // In-memory sliding-window rate limiter, scoped to this app instance (not
  // module-level) so separate `createApp()` calls — separate servers, or
  // separate tests each on their own in-memory db — never share state.
  // Keyed by `${userId}:${questionId}` -> timestamps (ms).
  const attempts = new Map<string, number[]>();
  const rateLimited = (userId: number, questionId: string): boolean => {
    const key = `${userId}:${questionId}`;
    const now = Date.now();
    const hits = (attempts.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
    hits.push(now);
    attempts.set(key, hits);
    return hits.length > MAX_ATTEMPTS;
  };

  app.get('/api/rooms', (_req, res) => {
    res.json({ rooms: ROOMS.map((r) => ({ id: r.id, title: r.title })) });
  });

  app.get('/api/paths', (req, res) => {
    const completed = completedRoomIds(db, req.user!.id);
    const cards = PATHS.map((path) => {
      const rooms = path.roomIds.map(getRoom).filter((r): r is NonNullable<typeof r> => Boolean(r));
      const done = rooms.filter((r) => completed.has(r.id)).length;
      return { path, rooms: rooms.map((r) => ({ id: r.id, title: r.title, summary: r.summary })), done, total: rooms.length };
    });
    res.json({ paths: cards });
  });

  app.get('/api/paths/:pathId', (req, res) => {
    const path = getPath(req.params.pathId);
    if (!path) {
      res.status(404).json({ error: 'Unknown path.' });
      return;
    }
    const completed = completedRoomIds(db, req.user!.id);
    const rooms = path.roomIds.map(getRoom).filter((r): r is NonNullable<typeof r> => Boolean(r));
    res.json({
      path,
      rooms: rooms.map((r) => ({
        id: r.id,
        title: r.title,
        summary: r.summary,
        difficulty: r.difficulty,
        estimatedMinutes: r.estimatedMinutes,
        completed: completed.has(r.id),
      })),
    });
  });

  app.get('/api/rooms/:roomId', (req, res) => {
    const room = getRoom(req.params.roomId);
    if (!room) {
      res.status(404).json({ error: 'Unknown room.' });
      return;
    }
    const answered = [...answeredQuestionIds(db, req.user!.id, room.id)];
    // Never send answer hashes to the client — only what's needed to render + grade client-side hints.
    const tasks = room.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      bodyMarkdown: t.bodyMarkdown,
      questions: t.questions.map((q) => ({
        id: q.id,
        prompt: q.prompt,
        points: q.points,
        hint: q.hint,
        answered: answered.includes(q.id),
      })),
    }));
    res.json({ id: room.id, title: room.title, summary: room.summary, difficulty: room.difficulty, tasks });
  });

  app.post('/api/rooms/:roomId/answer', (req, res) => {
    const room = getRoom(req.params.roomId);
    if (!room) {
      res.status(404).json({ error: 'Unknown room.' });
      return;
    }
    const { taskId, questionId, answer } = (req.body ?? {}) as {
      taskId?: string;
      questionId?: string;
      answer?: unknown;
    };
    const question = taskId && questionId ? findQuestion(room, taskId, questionId) : undefined;
    if (!question) {
      res.status(404).json({ error: 'Unknown question.' });
      return;
    }
    if (rateLimited(req.user!.id, question.id)) {
      res.status(429).json({ error: 'Too many attempts. Wait a moment.' });
      return;
    }
    const correct = checkAnswer({
      submitted: answer ?? '',
      stored: question.answer,
      answerType: question.answerType,
      caseInsensitive: question.caseInsensitive,
      trim: question.trim,
    });
    const result = recordAnswer(db, req.user!.id, room, question, correct);
    res.json(result);
  });

  app.get('/api/leaderboard', (_req, res) => {
    res.json({ leaderboard: leaderboard(db, 10) });
  });

  app.get('/api/badges', (req, res) => {
    res.json({ badges: userBadges(db, req.user!.id) });
  });
}
