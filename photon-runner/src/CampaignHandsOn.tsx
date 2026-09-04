import React, { useState } from 'react';
import { AlertTriangle, Check, Mail, Search, Server } from 'lucide-react';
import { PhishExercise, RackExercise, checkPhish, checkRack } from './campaignExercises';
import { ExFrame, ExLabel, Feedback, Primary, Solved, TONE } from './CampaignExerciseBits';

/**
 * The two hands-on tasks: seating hardware in a rack, and handling a
 * phishing attempt.
 *
 * The rack is physical work — you pick a module up, carry it, and seat it in
 * a bay, and a wrongly seated module explains what the chain needs rather
 * than buzzing at you.
 *
 * The phish is deliberately not from Eve. The campaign bible fixes her as
 * authorised security support who is never the attacker, so the message only
 * *claims* to be Phantom Q Security — and it is defeated with the habit the
 * Prologue teaches: authorised activity is logged, so check the log instead
 * of trusting the letterhead. You also cannot report it on instinct; the
 * game asks you to find what is actually wrong with it first.
 */

export function RackView({ ex, onSolved }: { ex: RackExercise; onSolved: () => void }) {
  const [seated, setSeated] = useState<Record<string, string>>({});
  const [held, setHeld] = useState<string | null>(null);
  const [review, setReview] = useState<ReturnType<typeof checkRack> | null>(null);
  const [solved, setSolved] = useState(false);

  const inRack = new Set(Object.values(seated));
  const loose = ex.modules.filter((m) => !inRack.has(m.id));
  const moduleOf = (id?: string) => ex.modules.find((m) => m.id === id);

  const place = (slotId: string) => {
    if (solved) return;
    if (held) {
      setSeated((p) => {
        const next = { ...p };
        for (const k of Object.keys(next)) if (next[k] === held) delete next[k];
        next[slotId] = held;
        return next;
      });
      setHeld(null);
    } else if (seated[slotId]) {
      // Tapping a filled bay pulls the module back out.
      setSeated((p) => {
        const next = { ...p };
        delete next[slotId];
        return next;
      });
    }
    setReview(null);
  };

  const submit = () => {
    const r = checkRack(ex, seated);
    setReview(r);
    if (r.ok) {
      setSolved(true);
      onSolved();
    }
  };

  return (
    <ExFrame prompt={ex.prompt}>
      <ExLabel>rack bays</ExLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
        {ex.slots.map((slot) => {
          const mod = moduleOf(seated[slot.id]);
          const bad = review?.wrong.find((w) => w.slot === slot.id);
          return (
            <div key={slot.id}>
              <button
                onClick={() => place(slot.id)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  textAlign: 'left',
                  padding: '9px 11px',
                  borderRadius: 8,
                  cursor: solved ? 'default' : 'pointer',
                  background: mod ? 'rgba(94,200,232,.1)' : 'rgba(255,255,255,.03)',
                  border: `1px ${mod ? 'solid' : 'dashed'} ${
                    bad ? 'rgba(251,191,36,.5)' : mod ? 'rgba(94,200,232,.32)' : 'rgba(255,255,255,.13)'
                  }`,
                }}
              >
                <Server size={13} color={mod ? TONE.accent : TONE.dim} />
                <span style={{ color: TONE.dim, fontSize: 10.5, fontFamily: 'ui-monospace, monospace', width: 104 }}>
                  {slot.label}
                </span>
                <span style={{ color: mod ? TONE.text : TONE.dim, fontSize: 11.5 }}>
                  {mod ? mod.label : held ? 'tap to seat' : 'empty'}
                </span>
              </button>
              {bad && (
                <div style={{ color: TONE.warn, fontSize: 11, lineHeight: 1.5, margin: '3px 0 0 24px' }}>{bad.why}</div>
              )}
            </div>
          );
        })}
      </div>

      <ExLabel>modules in hand</ExLabel>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {loose.length === 0 && <span style={{ color: TONE.dim, fontSize: 11 }}>All seated.</span>}
        {loose.map((m) => (
          <button
            key={m.id}
            onClick={() => !solved && setHeld(held === m.id ? null : m.id)}
            style={{
              padding: '7px 10px',
              borderRadius: 8,
              fontSize: 11,
              textAlign: 'left',
              cursor: solved ? 'default' : 'pointer',
              color: held === m.id ? '#04121a' : TONE.text,
              background: held === m.id ? TONE.accent : 'rgba(255,255,255,.05)',
              border: '1px solid rgba(255,255,255,.12)',
            }}
          >
            {m.label}
            {m.detail && <span style={{ display: 'block', fontSize: 9.5, opacity: 0.75 }}>{m.detail}</span>}
          </button>
        ))}
      </div>

      {review && !review.ok && review.empty.length > 0 && (
        <Feedback text={`${review.empty.length} bay(s) still empty.`} />
      )}
      {!solved ? <Primary onClick={submit}>Power up the chain</Primary> : <Solved>Capture chain live</Solved>}
    </ExFrame>
  );
}

export function PhishView({ ex, onSolved }: { ex: PhishExercise; onSolved: () => void }) {
  const [examined, setExamined] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [solved, setSolved] = useState(false);

  const flagged = examined.filter((id) => ex.tells.find((t) => t.id === id)?.suspicious);

  const act = (id: string) => {
    const r = checkPhish(ex, examined, id);
    setFeedback(r.message);
    if (r.ok) {
      setSolved(true);
      onSolved();
    }
  };

  return (
    <ExFrame prompt={ex.prompt}>
      <div
        style={{
          padding: 12,
          borderRadius: 10,
          background: 'rgba(255,255,255,.04)',
          border: '1px solid rgba(255,255,255,.1)',
          marginBottom: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
          <Mail size={13} color={TONE.dim} />
          <span style={{ color: TONE.dim, fontSize: 10.5, fontFamily: 'ui-monospace, monospace' }}>{ex.from}</span>
        </div>
        <div style={{ color: TONE.text, fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>{ex.subject}</div>
        <p style={{ color: TONE.text, fontSize: 12, lineHeight: 1.6 }}>{ex.body}</p>
      </div>

      <ExLabel>
        examine the message — {flagged.length}/{ex.requiredTells} warning signs found
      </ExLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
        {ex.tells.map((t) => {
          const seen = examined.includes(t.id);
          return (
            <div key={t.id}>
              <button
                onClick={() => !solved && !seen && setExamined((p) => [...p, t.id])}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  textAlign: 'left',
                  padding: '7px 10px',
                  borderRadius: 8,
                  cursor: seen || solved ? 'default' : 'pointer',
                  background: seen && t.suspicious ? 'rgba(251,191,36,.1)' : 'rgba(255,255,255,.04)',
                  border: `1px solid ${seen && t.suspicious ? 'rgba(251,191,36,.35)' : 'rgba(255,255,255,.11)'}`,
                }}
              >
                {seen ? (
                  t.suspicious ? (
                    <AlertTriangle size={12} color={TONE.warn} />
                  ) : (
                    <Check size={12} color={TONE.dim} />
                  )
                ) : (
                  <Search size={12} color={TONE.dim} />
                )}
                <span style={{ color: TONE.text, fontSize: 11.5 }}>{t.label}</span>
              </button>
              {seen && (
                <div
                  style={{
                    color: t.suspicious ? TONE.warn : TONE.dim,
                    fontSize: 11,
                    lineHeight: 1.5,
                    margin: '3px 0 0 24px',
                  }}
                >
                  {t.why}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!solved && (
        <>
          <ExLabel>what do you do?</ExLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {ex.actions.map((a) => (
              <button
                key={a.id}
                onClick={() => act(a.id)}
                style={{
                  textAlign: 'left',
                  padding: '9px 11px',
                  borderRadius: 9,
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: TONE.text,
                  background: 'rgba(255,255,255,.05)',
                  border: '1px solid rgba(255,255,255,.12)',
                  cursor: 'pointer',
                }}
              >
                {a.label}
              </button>
            ))}
          </div>
        </>
      )}

      <Feedback text={feedback} />
      {solved && <Solved>Message handled correctly</Solved>}
    </ExFrame>
  );
}
