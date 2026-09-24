import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, FileText, Send } from 'lucide-react';
import {
  ClassifyExercise,
  Exercise,
  OrderExercise,
  TransferExercise,
  checkClassify,
  checkOrder,
  checkTransfer,
  shuffleEvents,
} from './campaignExercises';
import { PhishView, RackView } from './CampaignHandsOn';
import { ExFrame as Frame, ExLabel as Label, Feedback, Primary, Solved, TONE } from './CampaignExerciseBits';

/**
 * The interactive half of the campaign — the parts the player does rather
 * than reads.
 *
 * Feedback follows the bible: a bad timeline names the causal impossibility,
 * a misplaced statement explains where it belongs and why, and a wrong file
 * produces a consequence rather than a buzzer. Nothing here says "wrong".
 */

export function CampaignExerciseView({ exercise, onSolved }: { exercise: Exercise; onSolved: () => void }) {
  if (exercise.kind === 'order') return <OrderView ex={exercise} onSolved={onSolved} />;
  if (exercise.kind === 'classify') return <ClassifyView ex={exercise} onSolved={onSolved} />;
  if (exercise.kind === 'rack') return <RackView ex={exercise} onSolved={onSolved} />;
  if (exercise.kind === 'phish') return <PhishView ex={exercise} onSolved={onSolved} />;
  return <TransferView ex={exercise} onSolved={onSolved} />;
}

// ------------------------------------------------------------------ order

/** Nudge control for reordering a timeline row. */
function IconBtn({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 22,
        height: 22,
        borderRadius: 6,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: disabled ? 'rgba(124,139,160,.4)' : TONE.dim,
        background: 'rgba(255,255,255,.05)',
        border: '1px solid rgba(255,255,255,.1)',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function OrderView({ ex, onSolved }: { ex: OrderExercise; onSolved: () => void }) {
  // Seeded per mount so the puzzle is stable while you work on it, but not
  // the same arrangement every playthrough.
  const seed = useMemo(() => Math.floor(Math.random() * 100000) + 1, []);
  const [items, setItems] = useState<string[]>(() => shuffleEvents(ex, seed).map((e) => e.id));
  const [feedback, setFeedback] = useState<string | null>(null);
  const [solved, setSolved] = useState(false);

  const label = (id: string) => ex.events.find((e) => e.id === id)?.label ?? id;

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    setItems(next);
    setFeedback(null);
  };

  const submit = () => {
    const r = checkOrder(ex, items);
    if (r.ok) {
      setSolved(true);
      setFeedback(null);
      onSolved();
      return;
    }
    setFeedback(
      r.message ??
        `Not yet — ${r.misplaced.length} ${r.misplaced.length === 1 ? 'event is' : 'events are'} out of position.`
    );
  };

  return (
    <Frame prompt={ex.prompt}>
      {ex.baseline && (
        <div style={{ marginBottom: 12, paddingBottom: 10, borderBottom: '1px dashed rgba(255,255,255,.12)' }}>
          <Label>normal baseline</Label>
          {ex.baseline.map((b) => (
            <div key={b} style={{ color: TONE.good, fontSize: 11, fontFamily: 'ui-monospace, monospace' }}>
              {b}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.map((id, i) => (
          <div
            key={id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '7px 10px',
              borderRadius: 9,
              background: 'rgba(255,255,255,.045)',
              border: '1px solid rgba(255,255,255,.09)',
            }}
          >
            <span style={{ color: TONE.dim, fontSize: 10, fontFamily: 'ui-monospace, monospace', width: 16 }}>
              {i + 1}
            </span>
            <span style={{ color: TONE.text, fontSize: 12, flex: 1 }}>{label(id)}</span>
            {!solved && (
              <>
                <IconBtn onClick={() => move(i, -1)} disabled={i === 0}>
                  <ArrowUp size={12} />
                </IconBtn>
                <IconBtn onClick={() => move(i, 1)} disabled={i === items.length - 1}>
                  <ArrowDown size={12} />
                </IconBtn>
              </>
            )}
          </div>
        ))}
      </div>

      <Feedback text={feedback} />
      {!solved ? (
        <Primary onClick={submit}>Check the sequence</Primary>
      ) : (
        <Solved>Timeline reconstructed</Solved>
      )}
    </Frame>
  );
}

// --------------------------------------------------------------- classify

function ClassifyView({ ex, onSolved }: { ex: ClassifyExercise; onSolved: () => void }) {
  const [placed, setPlaced] = useState<Record<string, string>>({});
  const [review, setReview] = useState<ReturnType<typeof checkClassify> | null>(null);
  const [solved, setSolved] = useState(false);

  const submit = () => {
    const r = checkClassify(ex, placed);
    setReview(r);
    if (r.ok) {
      setSolved(true);
      onSolved();
    }
  };

  return (
    <Frame prompt={ex.prompt}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {ex.items.map((item) => {
          const miss = review?.wrong.find((w) => w.id === item.id);
          const right = review?.correct.includes(item.id);
          return (
            <div key={item.id}>
              <div style={{ color: TONE.text, fontSize: 12, lineHeight: 1.5, marginBottom: 5 }}>{item.text}</div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {ex.buckets.map((b) => {
                  const on = placed[item.id] === b.id;
                  return (
                    <button
                      key={b.id}
                      onClick={() => !solved && setPlaced((p) => ({ ...p, [item.id]: b.id }))}
                      title={b.hint}
                      style={{
                        padding: '5px 10px',
                        borderRadius: 8,
                        fontSize: 10.5,
                        fontWeight: 700,
                        letterSpacing: 0.4,
                        cursor: solved ? 'default' : 'pointer',
                        color: on ? '#04121a' : TONE.dim,
                        background: on ? (miss ? TONE.warn : right ? TONE.good : TONE.accent) : 'rgba(255,255,255,.05)',
                        border: `1px solid ${on ? 'transparent' : 'rgba(255,255,255,.12)'}`,
                      }}
                    >
                      {b.label}
                    </button>
                  );
                })}
              </div>
              {miss && (
                <div style={{ color: TONE.warn, fontSize: 11, lineHeight: 1.5, marginTop: 4 }}>
                  Belongs in {ex.buckets.find((b) => b.id === miss.belongs)?.label}. {miss.why}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {review && !review.ok && review.unplaced.length > 0 && (
        <Feedback text={`${review.unplaced.length} statement(s) still unplaced.`} />
      )}
      {!solved ? (
        <Primary onClick={submit}>Submit the board</Primary>
      ) : (
        <Solved>Board agreed with the evidence</Solved>
      )}
    </Frame>
  );
}

// --------------------------------------------------------------- transfer

function TransferView({ ex, onSolved }: { ex: TransferExercise; onSolved: () => void }) {
  const [picked, setPicked] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [solved, setSolved] = useState(false);

  const send = () => {
    if (!picked) return;
    const r = checkTransfer(ex, picked);
    if (r.ok) {
      setSolved(true);
      setFeedback(null);
      onSolved();
      return;
    }
    setFeedback(r.message ?? null);
  };

  return (
    <Frame prompt={ex.prompt}>
      <Label>alice&apos;s usb</Label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {ex.files.map((f) => {
          const on = picked === f.id;
          return (
            <button
              key={f.id}
              onClick={() => !solved && (setPicked(f.id), setFeedback(null))}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                textAlign: 'left',
                padding: '9px 11px',
                borderRadius: 9,
                cursor: solved ? 'default' : 'pointer',
                background: on ? 'rgba(94,200,232,.12)' : 'rgba(255,255,255,.04)',
                border: `1px solid ${on ? 'rgba(94,200,232,.45)' : 'rgba(255,255,255,.1)'}`,
              }}
            >
              <FileText size={14} color={on ? TONE.accent : TONE.dim} />
              <span style={{ flex: 1 }}>
                <span style={{ color: TONE.text, fontSize: 12, fontFamily: 'ui-monospace, monospace' }}>{f.label}</span>
                {f.note && <span style={{ display: 'block', color: TONE.dim, fontSize: 10.5 }}>{f.note}</span>}
              </span>
            </button>
          );
        })}
      </div>

      <Feedback text={feedback} />
      {!solved ? (
        <Primary onClick={send} disabled={!picked}>
          <Send size={13} /> Send to Bob
        </Primary>
      ) : (
        <Solved>Transfer sent</Solved>
      )}
    </Frame>
  );
}
