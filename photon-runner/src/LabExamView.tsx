import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, Check, RotateCcw, X } from 'lucide-react';
import {
  ExamAnswers,
  ExamQuestion,
  ExamResult,
  loadExamProgress,
  markExam,
  recordAttempt,
  saveExamProgress,
  shuffle,
} from './labExam';
import { getExam } from './labExams';

/**
 * Sitting a section test.
 *
 * The review is the part that matters, so it is not a score and a "try
 * again" — every question comes back with the reasoning behind its answer,
 * including the ones that were right. Attempts are unlimited and the best
 * score is kept, because a test you can fail once and never revisit teaches
 * nothing to the person who needed it most.
 */

export function LabExamView({ examId, onBack }: { examId: string; onBack: () => void }) {
  const exam = getExam(examId);
  const [answers, setAnswers] = useState<ExamAnswers>({});
  const [result, setResult] = useState<ExamResult | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Options are shuffled per attempt so a retake cannot be passed by
  // remembering that the answer was the third one down.
  const seed = useMemo(() => attempt * 7919 + 13, [attempt]);

  if (!exam) {
    return (
      <div className="p-8">
        <p className="text-[var(--danger)] text-sm font-mono">That test does not exist.</p>
        <button onClick={onBack} className="btn btn-ghost px-3 py-2 text-xs mt-4">
          <ArrowLeft size={13} /> Back to labs
        </button>
      </div>
    );
  }

  const submit = () => {
    const r = markExam(exam, answers);
    setResult(r);
    saveExamProgress(recordAttempt(loadExamProgress(), exam.id, r));
  };

  const retake = () => {
    setAnswers({});
    setResult(null);
    setAttempt((a) => a + 1);
  };

  const answered = exam.questions.filter((q) => answers[q.id] !== undefined).length;

  return (
    <div className="min-h-full px-4 py-6 md:px-8">
      <div className="max-w-3xl mx-auto space-y-4">
        <button onClick={onBack} className="btn btn-ghost px-3 py-2 text-xs">
          <ArrowLeft size={13} /> Back to labs
        </button>

        <header className="panel rounded-2xl p-5">
          <div className="label-mono !text-[9px] ink-3">{exam.section}</div>
          <h1 className="h-section text-2xl ink-1 mt-1">{exam.title}</h1>
          <p className="text-sm ink-2 mt-2 leading-relaxed">{exam.blurb}</p>
          <div className="label-mono !text-[9px] ink-3 mt-3">
            {exam.questions.length} questions · pass at {exam.passPercent}% · unlimited attempts
          </div>
        </header>

        {result ? (
          <Review exam={exam} result={result} onRetake={retake} onBack={onBack} />
        ) : (
          <>
            {exam.questions.map((q, i) => (
              <QuestionCard
                key={`${attempt}:${q.id}`}
                index={i + 1}
                question={q}
                seed={seed}
                value={answers[q.id]}
                onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
              />
            ))}

            <div className="panel rounded-2xl p-4 flex items-center gap-4 flex-wrap">
              <span className="text-xs ink-3 font-mono">
                {answered} of {exam.questions.length} answered
              </span>
              <button onClick={submit} className="btn btn-primary px-4 py-2 text-sm ml-auto">
                Submit answers
              </button>
            </div>
            <p className="text-[11px] ink-4 text-center">
              You can submit with questions unanswered — they simply count as wrong.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------- questions

function QuestionCard({
  index,
  question,
  seed,
  value,
  onChange,
}: {
  index: number;
  question: ExamQuestion;
  seed: number;
  value: string | string[] | undefined;
  onChange: (v: string | string[]) => void;
}) {
  return (
    <section className="panel rounded-2xl p-5">
      <div className="flex gap-3">
        <span className="label-mono !text-[10px] ink-4 pt-0.5">{String(index).padStart(2, '0')}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm ink-1 font-semibold leading-relaxed">{question.prompt}</p>
          {question.kind === 'multi' && (
            <p className="text-[11px] ink-4 mt-1">Select every one that applies.</p>
          )}
          <div className="mt-3">
            {question.kind === 'choose' && (
              <ChooseInput question={question} seed={seed} value={value as string} onChange={onChange} />
            )}
            {question.kind === 'multi' && (
              <MultiInput question={question} seed={seed} value={(value as string[]) ?? []} onChange={onChange} />
            )}
            {question.kind === 'order' && (
              <OrderInput question={question} seed={seed} value={value as string[]} onChange={onChange} />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

const optionStyle = (on: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'flex-start',
  gap: 10,
  width: '100%',
  textAlign: 'left',
  padding: '10px 12px',
  borderRadius: 11,
  fontSize: 13,
  lineHeight: 1.5,
  color: on ? 'var(--ink-1)' : 'var(--ink-2)',
  background: on ? 'color-mix(in oklab, var(--accent) 14%, transparent)' : 'rgb(var(--glass-tint)/var(--glass-alpha))',
  border: `1px solid ${on ? 'var(--accent)' : 'rgb(var(--glass-border)/var(--glass-border-alpha))'}`,
  cursor: 'pointer',
});

const marker = (on: boolean, round: boolean): React.CSSProperties => ({
  width: 15,
  height: 15,
  marginTop: 2,
  flexShrink: 0,
  borderRadius: round ? '50%' : 4,
  border: `1.5px solid ${on ? 'var(--accent)' : 'var(--ink-4)'}`,
  background: on ? 'var(--accent)' : 'transparent',
});

function ChooseInput({
  question,
  seed,
  value,
  onChange,
}: {
  question: Extract<ExamQuestion, { kind: 'choose' }>;
  seed: number;
  value: string | undefined;
  onChange: (v: string) => void;
}) {
  const options = useMemo(() => shuffle(question.options, seed), [question, seed]);
  return (
    <div className="flex flex-col gap-2">
      {options.map((o) => (
        <button key={o.id} onClick={() => onChange(o.id)} style={optionStyle(value === o.id)}>
          <span style={marker(value === o.id, true)} />
          <span>{o.text}</span>
        </button>
      ))}
    </div>
  );
}

function MultiInput({
  question,
  seed,
  value,
  onChange,
}: {
  question: Extract<ExamQuestion, { kind: 'multi' }>;
  seed: number;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const options = useMemo(() => shuffle(question.options, seed), [question, seed]);
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  return (
    <div className="flex flex-col gap-2">
      {options.map((o) => (
        <button key={o.id} onClick={() => toggle(o.id)} style={optionStyle(value.includes(o.id))}>
          <span style={marker(value.includes(o.id), false)} />
          <span>{o.text}</span>
        </button>
      ))}
    </div>
  );
}

function OrderInput({
  question,
  seed,
  value,
  onChange,
}: {
  question: Extract<ExamQuestion, { kind: 'order' }>;
  seed: number;
  value: string[] | undefined;
  onChange: (v: string[]) => void;
}) {
  // Start from a shuffle so the authored order is not handed over for free.
  const initial = useMemo(() => shuffle(question.items, seed).map((i) => i.id), [question, seed]);
  const order = value ?? initial;
  const label = (id: string) => question.items.find((i) => i.id === id)?.text ?? id;

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-1.5">
      {order.map((id, i) => (
        <div
          key={id}
          className="flex items-center gap-2 rounded-xl px-3 py-2"
          style={{
            background: 'rgb(var(--glass-tint)/var(--glass-alpha))',
            border: '1px solid rgb(var(--glass-border)/var(--glass-border-alpha))',
          }}
        >
          <span className="label-mono !text-[10px] ink-4 w-4">{i + 1}</span>
          <span className="text-[13px] ink-2 flex-1 leading-snug">{label(id)}</span>
          <button
            onClick={() => move(i, -1)}
            disabled={i === 0}
            className="btn btn-ghost w-7 h-7 !p-0 disabled:opacity-35"
            aria-label="Move up"
          >
            <ArrowUp size={12} />
          </button>
          <button
            onClick={() => move(i, 1)}
            disabled={i === order.length - 1}
            className="btn btn-ghost w-7 h-7 !p-0 disabled:opacity-35"
            aria-label="Move down"
          >
            <ArrowDown size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- review

function Review({
  exam,
  result,
  onRetake,
  onBack,
}: {
  exam: NonNullable<ReturnType<typeof getExam>>;
  result: ExamResult;
  onRetake: () => void;
  onBack: () => void;
}) {
  const tone = result.passed ? 'var(--ok)' : 'var(--warn)';
  return (
    <>
      <section className="panel rounded-2xl p-6 text-center">
        <ScoreRing percent={result.percent} tone={tone} />
        <div className="h-section text-lg mt-3" style={{ color: tone }}>
          {result.passed ? 'Passed' : 'Not passed yet'}
        </div>
        <p className="text-xs ink-3 mt-1 font-mono">
          {result.correct} of {result.total} correct · pass mark {exam.passPercent}%
        </p>
        <p className="text-[12px] ink-2 mt-3 max-w-md mx-auto leading-relaxed">
          {result.passed
            ? 'Read the reasoning below anyway — the questions you got right by instinct are the ones worth understanding.'
            : 'Every answer is explained below. Read them, then take it again — the score kept is your best one.'}
        </p>
      </section>

      {exam.questions.map((q, i) => {
        const mark = result.marks.find((m) => m.id === q.id)!;
        return (
          <section key={q.id} className="panel rounded-2xl p-5">
            <div className="flex gap-3">
              <span
                className="grid place-items-center w-6 h-6 rounded-lg shrink-0"
                style={{
                  background: `color-mix(in oklab, ${mark.correct ? 'var(--ok)' : 'var(--warn)'} 18%, transparent)`,
                  color: mark.correct ? 'var(--ok)' : 'var(--warn)',
                }}
              >
                {mark.correct ? <Check size={13} /> : <X size={13} />}
              </span>
              <div className="flex-1 min-w-0">
                <div className="label-mono !text-[9px] ink-4">
                  Question {i + 1}
                  {!mark.answered && ' · not answered'}
                </div>
                <p className="text-sm ink-1 font-semibold leading-relaxed mt-0.5">{q.prompt}</p>
                <p className="text-[12.5px] ink-2 mt-2 leading-relaxed">{mark.why}</p>
                <CorrectAnswer question={q} />
              </div>
            </div>
          </section>
        );
      })}

      <div className="panel rounded-2xl p-4 flex gap-3 flex-wrap">
        <button onClick={onRetake} className="btn btn-ghost px-4 py-2 text-sm">
          <RotateCcw size={13} /> Take it again
        </button>
        <button onClick={onBack} className="btn btn-primary px-4 py-2 text-sm ml-auto">
          Back to labs
        </button>
      </div>
    </>
  );
}

function CorrectAnswer({ question }: { question: ExamQuestion }) {
  const items = question.kind === 'order' ? question.items : question.options;
  const ids = question.kind === 'choose' ? [question.answer] : question.answer;
  const text = ids.map((id) => items.find((o) => o.id === id)?.text ?? id);
  return (
    <div className="mt-2">
      <div className="label-mono !text-[9px] ink-4">
        {question.kind === 'order' ? 'correct order' : 'answer'}
      </div>
      {question.kind === 'order' ? (
        <ol className="text-[12px] ink-3 list-decimal pl-5 mt-0.5 space-y-0.5">
          {text.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ol>
      ) : (
        <div className="text-[12px] mt-0.5" style={{ color: 'var(--ok)' }}>
          {text.join(' · ')}
        </div>
      )}
    </div>
  );
}

/** The reference dashboard's gauge, reused for the score. */
export function ScoreRing({ percent, tone, size = 96 }: { percent: number; tone: string; size?: number }) {
  const r = size / 2 - 6;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="mx-auto block">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="rgb(var(--glass-border)/.25)"
        strokeWidth={5}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={tone}
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray={`${(c * percent) / 100} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dasharray .7s cubic-bezier(.2,.9,.25,1)' }}
      />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        style={{ fill: 'var(--ink-1)', fontSize: size * 0.26, fontWeight: 700 }}
      >
        {percent}%
      </text>
    </svg>
  );
}
