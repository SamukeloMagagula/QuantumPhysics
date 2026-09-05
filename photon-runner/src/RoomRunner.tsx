import React, { useEffect, useMemo, useState } from 'react';
import { marked } from 'marked';
import { Award, Check, Lightbulb, Loader2, PartyPopper } from 'lucide-react';

interface RoomQuestionView {
  id: string;
  prompt: string;
  points: number;
  hint: string;
  answered: boolean;
}

interface RoomTaskView {
  id: string;
  title: string;
  bodyMarkdown: string;
  questions: RoomQuestionView[];
}

interface RoomView {
  id: string;
  title: string;
  summary: string;
  difficulty: string;
  tasks: RoomTaskView[];
}

interface AnswerResult {
  correct: boolean;
  alreadySolved: boolean;
  pointsAwarded: number;
  totalPoints: number;
  rank: string;
  roomComplete: boolean;
  newBadges: { id: string; name: string; icon: string }[];
}

interface RoomRunnerProps {
  roomId: string;
  onExit: () => void;
}

type Feedback = { state: 'idle' } | { state: 'checking' } | { state: 'wrong' } | { state: 'right'; result: AnswerResult };

function QuestionForm({
  roomId,
  taskId,
  question,
  onSolved,
}: {
  roomId: string;
  taskId: string;
  question: RoomQuestionView;
  onSolved: (result: AnswerResult) => void;
}) {
  const [value, setValue] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>({ state: 'idle' });
  const solved = question.answered || feedback.state === 'right';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim() || solved) return;
    setFeedback({ state: 'checking' });
    try {
      const res = await fetch(`/api/rooms/${roomId}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, questionId: question.id, answer: value }),
      });
      if (res.status === 429) {
        setFeedback({ state: 'wrong' });
        return;
      }
      const result = (await res.json()) as AnswerResult;
      if (result.correct) {
        setFeedback({ state: 'right', result });
        onSolved(result);
      } else {
        setFeedback({ state: 'wrong' });
      }
    } catch {
      setFeedback({ state: 'wrong' });
    }
  };

  return (
    <div className="glass rounded-2xl p-4 space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm ink-1 font-medium leading-relaxed">{question.prompt}</p>
        <span className="shrink-0 text-[10px] font-mono ink-4">{question.points} pts</span>
      </div>

      {solved ? (
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--ok)' }}>
          <Check size={14} /> Solved
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Your answer…"
              className="flex-1 panel rounded-xl px-3 py-2.5 text-sm ink-1 outline-none focus:border-[var(--accent)] transition-colors"
            />
            <button
              type="submit"
              disabled={feedback.state === 'checking' || !value.trim()}
              className="btn btn-primary px-4 text-sm shrink-0"
            >
              {feedback.state === 'checking' ? <Loader2 size={14} className="animate-spin" /> : 'Check'}
            </button>
          </div>
          {feedback.state === 'wrong' && (
            <p className="text-xs" style={{ color: 'var(--danger)' }}>
              Not quite — try again.
            </p>
          )}
          {question.hint && (
            <button
              type="button"
              onClick={() => setShowHint((v) => !v)}
              className="text-[11px] ink-4 flex items-center gap-1 self-start"
            >
              <Lightbulb size={11} /> {showHint ? question.hint : 'Show hint'}
            </button>
          )}
        </form>
      )}
    </div>
  );
}

export function RoomRunner({ roomId, onExit }: RoomRunnerProps) {
  const [room, setRoom] = useState<RoomView | null>(null);
  const [error, setError] = useState(false);
  const [celebration, setCelebration] = useState<AnswerResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/rooms/${roomId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => !cancelled && setRoom(data as RoomView))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  // Each QuestionForm tracks its own "solved" state locally once it succeeds
  // (see `solved` in QuestionForm) — no need to thread that back through
  // `room` here. This handler only surfaces the room-complete/badge banner.
  const handleSolved = (result: AnswerResult) => {
    if (result.roomComplete || result.newBadges.length > 0) setCelebration(result);
  };

  if (error) {
    return (
      <div className="min-h-full grid place-items-center px-4">
        <p className="text-sm ink-2">Room not found.</p>
      </div>
    );
  }
  if (!room) {
    return (
      <div className="min-h-full grid place-items-center px-4">
        <p className="text-sm ink-3">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-full px-4 py-8 md:px-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <header className="pb-4 border-b" style={{ borderColor: 'rgb(var(--glass-border)/.16)' }}>
          <div className="label-mono mb-1.5">Room</div>
          <h1 className="h-section text-[22px] md:text-[26px] ink-1">{room.title}</h1>
          <p className="text-[13px] ink-2 mt-1.5">{room.summary}</p>
        </header>

        {celebration && (
          <div className="a-pop glass rounded-2xl p-4 flex items-start gap-3" style={{ borderColor: 'var(--ok)' }}>
            <PartyPopper size={20} style={{ color: 'var(--ok)' }} className="shrink-0 mt-0.5" />
            <div className="text-sm ink-1 space-y-1">
              {celebration.roomComplete && <p className="font-semibold">Room complete! +{celebration.pointsAwarded} pts this question.</p>}
              {celebration.newBadges.map((b) => (
                <p key={b.id} className="flex items-center gap-1.5">
                  <Award size={13} /> Badge earned: {b.icon} {b.name}
                </p>
              ))}
              <p className="text-xs ink-3">
                Total: {celebration.totalPoints} pts · {celebration.rank}
              </p>
            </div>
          </div>
        )}

        {room.tasks.map((task) => (
          <TaskCard key={task.id} roomId={room.id} task={task} onSolved={handleSolved} />
        ))}

        <button onClick={onExit} className="btn btn-ghost px-4 py-2 text-xs">
          Back to path
        </button>
      </div>
    </div>
  );
}

function TaskCard({
  roomId,
  task,
  onSolved,
}: {
  roomId: string;
  task: RoomTaskView;
  onSolved: (result: AnswerResult) => void;
}) {
  const html = useMemo(() => marked.parse(task.bodyMarkdown, { async: false }) as string, [task.bodyMarkdown]);
  return (
    <section className="a-rise space-y-3">
      <div className="prose-room glass rounded-2xl p-5" dangerouslySetInnerHTML={{ __html: html }} />
      {task.questions.map((q) => (
        <QuestionForm key={q.id} roomId={roomId} taskId={task.id} question={q} onSolved={onSolved} />
      ))}
    </section>
  );
}
