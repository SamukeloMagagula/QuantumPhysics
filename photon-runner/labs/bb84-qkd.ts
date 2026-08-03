import { el } from './dom';
import { CARD, MUTED, BUTTON } from './styles';
import { Lab } from './types';

export interface BB84Row {
  aBit: number;
  aBasis: number;
  eBasis: number | null;
  eBit: number | null;
  bBasis: number;
  bBit: number;
}

export interface BB84Result {
  rows: BB84Row[];
  siftedLength: number;
  qber: number;
  aliceKey: number[];
  bobKey: number[];
  eve: boolean;
  detected: boolean;
}

// Simulate a BB84 quantum key exchange. Bases: 0 = rectilinear (+), 1 = diagonal (x).
// With an eavesdropper (intercept-resend), measuring in the wrong basis disturbs the
// photon, so ~25% of sifted bits mismatch — that's how Eve gets caught.
export function simulateBB84({
  eve = false,
  n = 200,
  rng = Math.random,
}: { eve?: boolean; n?: number; rng?: () => number } = {}): BB84Result {
  const coin = () => (rng() < 0.5 ? 0 : 1);
  const rows: BB84Row[] = [];
  for (let i = 0; i < n; i++) {
    const aBit = coin();
    const aBasis = coin();
    let stateBit = aBit;
    let stateBasis = aBasis;
    let eBasis: number | null = null;
    let eBit: number | null = null;
    if (eve) {
      eBasis = coin();
      eBit = eBasis === aBasis ? aBit : coin(); // wrong basis → random result
      stateBit = eBit;
      stateBasis = eBasis; // Eve re-emits in her basis
    }
    const bBasis = coin();
    const bBit = bBasis === stateBasis ? stateBit : coin();
    rows.push({ aBit, aBasis, eBasis, eBit, bBasis, bBit });
  }
  const sifted = rows.filter((r) => r.aBasis === r.bBasis);
  const errors = sifted.filter((r) => r.aBit !== r.bBit).length;
  const qber = sifted.length ? errors / sifted.length : 0;
  return {
    rows,
    siftedLength: sifted.length,
    qber,
    aliceKey: sifted.map((r) => r.aBit),
    bobKey: sifted.map((r) => r.bBit),
    eve,
    detected: qber > 0.11,
  };
}

const lab: Lab = {
  id: 'bb84-qkd',
  title: 'Quantum Key Distribution (BB84)',
  difficulty: 'advanced',
  category: 'Cryptography',
  intro() {
    return `<p>Quantum Key Distribution (BB84) lets Alice and Bob build a shared secret key
      from single photons. Alice sends each photon polarised with a random <em>bit</em> and a
      random <em>basis</em> (rectilinear + or diagonal ×). Bob measures with his own random
      bases; they keep only the photons where their bases matched — the <em>sifted key</em>.</p>
      <p>The magic: measuring a photon disturbs it. If Eve intercepts and re-sends, she guesses
      the basis wrong about half the time and injects errors. The error rate (QBER) exposes
      her — above ~11%, you abort.</p>
      <p>Run a clean channel, then switch Eve on and catch her.</p>`;
  },
  render(container, ctx) {
    const eveToggle = el('input', { type: 'checkbox' });
    const runBtn = el('button', { class: BUTTON }, 'Send 200 photons');
    const out = el('div', {});
    const seen = { clean: false, caught: false };

    runBtn.addEventListener('click', () => {
      const r = simulateBB84({ eve: (eveToggle as HTMLInputElement).checked, n: 200 });
      const pct = (r.qber * 100).toFixed(1);
      const fillPct = Math.min(100, (r.qber / 0.4) * 100); // bar scaled 0–40%
      const barColorClass = r.detected ? 'bg-rose-500' : 'bg-cyan-500';
      const textColorClass = r.detected ? 'text-rose-400' : 'text-emerald-400';
      out.replaceChildren(
        el(
          'div',
          { class: CARD },
          el('div', {}, `Sifted key length: ${r.siftedLength} bits (from 200 photons)`),
          el('div', {}, `QBER (error rate): ${pct}%`),
          el(
            'div',
            { class: 'relative h-[18px] bg-slate-950 border border-slate-800 rounded my-1' },
            el('div', { class: `h-full ${barColorClass} rounded`, style: `width:${fillPct}%` }),
            el('div', { class: 'absolute top-[-2px] h-[22px] border-l-2 border-dashed border-slate-400', style: 'left:27.5%' })
          ),
          el('div', { class: MUTED }, 'Dashed line = 11% abort threshold'),
          el(
            'div',
            { class: `font-bold mt-1 ${textColorClass}` },
            r.detected ? '🚨 Eavesdropper detected — abort and rekey!' : '✅ Channel clean — safe to keep the key.'
          )
        )
      );
      if (r.detected) seen.caught = true;
      else seen.clean = true;
      if (seen.clean && seen.caught) ctx.complete();
    });

    container.append(
      el('h3', { class: 'text-base font-bold text-white' }, 'BB84 quantum channel'),
      el('label', { class: 'block' }, eveToggle, ' Enable Eve (eavesdropper)'),
      el('p', { class: MUTED }, 'Run once with Eve OFF (clean), then once with Eve ON, and watch the error rate.'),
      runBtn,
      out
    );
  },
  explain() {
    return `<p>With no eavesdropper, every sifted bit matched — QBER 0%. With Eve intercepting
      and re-sending, she measured in the wrong basis about half the time and re-emitted
      disturbed photons, pushing the error rate to ~25% — well past the 11% abort line. Physics,
      not math, caught her: you cannot measure a quantum state without disturbing it.</p>
      <p><strong>Takeaway:</strong> QKD detects eavesdropping itself — something classical key
      exchange cannot do — and underpins quantum-safe communication.</p>`;
  },
};

export default lab;
