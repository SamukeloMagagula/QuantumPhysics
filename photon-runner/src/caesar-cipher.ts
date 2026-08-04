import { el } from './labDom';
import { CARD, BUTTON_SECONDARY, MUTED } from './labStyles';
import { Lab } from './labTypes';

export function caesarShift(text: string, key: number): string {
  const k = ((key % 26) + 26) % 26;
  let out = '';
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    if (c >= 65 && c <= 90) out += String.fromCharCode(((c - 65 + k) % 26) + 65);
    else if (c >= 97 && c <= 122) out += String.fromCharCode(((c - 97 + k) % 26) + 97);
    else out += ch;
  }
  return out;
}

export function caesarDecrypt(text: string, key: number): string {
  return caesarShift(text, -key);
}

const PLAINTEXT = 'MEET ALICE AT THE DOCKS AT DAWN';
const SECRET_SHIFT = 7;
const CIPHERTEXT = caesarShift(PLAINTEXT, SECRET_SHIFT);

const lab: Lab = {
  id: 'caesar-cipher',
  title: 'Caesar Cipher',
  difficulty: 'beginner',
  category: 'Cryptography',
  intro() {
    return `<p>You intercepted a message scrambled with a <em>Caesar cipher</em> — every
      letter shifted along the alphabet by a secret amount. The catch: there are only 25
      possible shifts, so you can simply try them all.</p>
      <p>Slide through the shifts (or hit "Crack all 25") until the message reads clearly.</p>`;
  },
  render(container, ctx) {
    const shift = el('input', { type: 'range', min: '0', max: '25', value: '0', class: 'w-full' });
    const shiftLabel = el('span', { class: 'text-cyan-400 font-bold' }, '0');
    const out = el('pre', { class: `${CARD} whitespace-pre-wrap` }, CIPHERTEXT);
    const status = el('p', { class: 'text-emerald-400' });
    const crackList = el('div', { class: `${MUTED} space-y-1 max-h-40 overflow-y-auto` });
    let done = false;

    const update = () => {
      const g = Number((shift as HTMLInputElement).value);
      shiftLabel.textContent = String(g);
      const dec = caesarDecrypt(CIPHERTEXT, g);
      out.textContent = dec;
      if (dec === PLAINTEXT && !done) {
        done = true;
        status.textContent = `✅ Cracked! The shift was ${g}.`;
        ctx.complete();
      }
    };
    shift.addEventListener('input', update);

    const crackBtn = el('button', { class: BUTTON_SECONDARY }, 'Crack all 25');
    crackBtn.addEventListener('click', () => {
      crackList.replaceChildren(
        el('strong', { class: 'text-white' }, 'Every shift:'),
        ...Array.from({ length: 25 }, (_, i) => i + 1).map((k) =>
          el('div', {}, `#${k}: ${caesarDecrypt(CIPHERTEXT, k)}`)
        )
      );
    });

    container.append(
      el('h3', { class: 'text-base font-bold text-white' }, 'Intercepted message'),
      el('p', { class: MUTED }, 'Ciphertext (encrypted with an unknown Caesar shift):'),
      el('pre', { class: `${CARD} whitespace-pre-wrap` }, CIPHERTEXT),
      el('label', { class: 'block' }, 'Try shift: ', shiftLabel),
      shift,
      el('p', { class: MUTED }, 'Result:'),
      out,
      crackBtn,
      crackList,
      status
    );
  },
  explain() {
    return `<p>With only 25 keys, a Caesar cipher falls to brute force in seconds — you just
      tried every shift until English appeared. That is why key <em>size</em> matters: modern
      ciphers have astronomically many keys, so trying them all is infeasible.</p>
      <p><strong>Takeaway:</strong> never rely on a tiny keyspace or a "secret" algorithm.
      Use vetted modern ciphers (e.g. AES) with large random keys.</p>`;
  },
};

export default lab;
