import { el } from './labDom';
import { CARD, MUTED, BUTTON, BUTTON_SECONDARY, INPUT, OK_TEXT, WARN_TEXT, ACCENT_TEXT } from './labStyles';
import { Lab } from './labTypes';

/**
 * Why Encryption Matters.
 *
 * Told as a demonstration rather than an explanation: you send a message in
 * the clear and watch every hop on the path read it, then send the same
 * message encrypted and watch the same hops carry something they cannot use.
 * The point lands because the learner performs both sends and reads Eve's
 * capture log both times.
 *
 * The cipher here is a repeating-key XOR. It is chosen because you can see
 * what it does — the same key both encrypts and decrypts, which is the
 * symmetric property the lab is teaching — and the explanation is explicit
 * that it is a teaching toy, not something to protect anything with.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Encrypt to space-separated hex. The key does both jobs — that is the lesson. */
export function xorEncrypt(text: string, key: string): string {
  if (!key) return '';
  const body = encoder.encode(text);
  const k = encoder.encode(key);
  return [...body].map((v, i) => (v ^ k[i % k.length]).toString(16).padStart(2, '0')).join(' ');
}

export function xorDecrypt(hex: string, key: string): string {
  if (!key) return '';
  const bytes = hex.trim().split(/\s+/).filter(Boolean).map((h) => parseInt(h, 16));
  if (bytes.length === 0 || bytes.some((b) => Number.isNaN(b))) return '';
  const k = encoder.encode(key);
  return decoder.decode(new Uint8Array(bytes.map((v, i) => v ^ k[i % k.length])));
}

export interface Hop {
  id: string;
  label: string;
  note: string;
}

/** The path a message takes. Every one of these can read what it forwards. */
export const HOPS: Hop[] = [
  { id: 'wifi', label: 'Café Wi-Fi', note: 'Anyone on the same network, and whoever runs it' },
  { id: 'isp', label: 'Your ISP', note: 'Sees and logs every connection you make' },
  { id: 'transit', label: 'Transit network', note: 'A company you have never heard of, in a country you did not choose' },
  { id: 'host', label: 'Destination host', note: 'The server, and everyone with access to it' },
];

export const DEFAULT_MESSAGE = 'My account number is 4471 9920 and the password is on the card.';

const lab: Lab = {
  id: 'why-encryption',
  title: 'Why Encryption Matters',
  difficulty: 'beginner',
  category: 'Foundations',
  intro() {
    return `<p>A message you send does not travel down a private wire. It is handed from
      network to network, and <strong>every hand it passes through can read it</strong>.</p>
      <p>Send one in the clear and watch what the path sees. Then send the same message
      encrypted and watch the path carry something it cannot use.</p>`;
  },
  render(container, ctx) {
    let sentClear = false;
    let sentEncrypted = false;
    let ciphertext = '';

    const message = el('input', { class: INPUT, type: 'text', value: DEFAULT_MESSAGE }) as HTMLInputElement;
    const wire = el('div', { class: 'space-y-2' });
    const eveLog = el('div', { class: `${CARD} space-y-1` }, el('p', { class: MUTED }, 'Nothing captured yet.'));
    const status = el('p', { class: OK_TEXT });

    const paintWire = (payload: string, readable: boolean) => {
      wire.replaceChildren(
        ...HOPS.map((h) =>
          el(
            'div',
            { class: CARD },
            el('div', { class: 'flex items-center justify-between gap-3' }, el('strong', { class: ACCENT_TEXT }, h.label), el('span', { class: readable ? WARN_TEXT : OK_TEXT }, readable ? 'can read this' : 'carries noise')),
            el('div', { class: MUTED }, h.note),
            el('div', { class: 'break-all mt-1' }, payload)
          )
        )
      );
    };

    const capture = (what: string, readable: boolean) => {
      eveLog.replaceChildren(
        el('strong', { class: readable ? WARN_TEXT : OK_TEXT }, readable ? 'Eve captured, in the clear:' : 'Eve captured, unusable:'),
        el('div', { class: 'break-all' }, what),
        el(
          'p',
          { class: MUTED },
          readable
            ? 'She did not have to break anything. She only had to be on the path.'
            : 'She is still on the path and still capturing. Without the key it buys her nothing.'
        )
      );
    };

    // ---- step 1: in the clear -------------------------------------------
    const sendClear = el('button', { class: BUTTON_SECONDARY }, 'Send in the clear');
    sendClear.addEventListener('click', () => {
      sentClear = true;
      paintWire(message.value, true);
      capture(message.value, true);
      status.className = WARN_TEXT;
      status.textContent = 'Four networks handled that message and all four could read it.';
    });

    // ---- step 2: encrypted ----------------------------------------------
    const key = el('input', { class: INPUT, type: 'text', placeholder: 'Choose a key, e.g. bluebird' }) as HTMLInputElement;
    const sendEncrypted = el('button', { class: BUTTON_SECONDARY }, 'Encrypt and send');
    sendEncrypted.addEventListener('click', () => {
      if (!sentClear) {
        status.className = WARN_TEXT;
        status.textContent = 'Send it in the clear first — the contrast is the whole point.';
        return;
      }
      if (key.value.trim().length < 4) {
        status.className = WARN_TEXT;
        status.textContent = 'Pick a key of at least four characters.';
        return;
      }
      ciphertext = xorEncrypt(message.value, key.value.trim());
      sentEncrypted = true;
      paintWire(ciphertext, false);
      capture(ciphertext, false);
      status.className = ACCENT_TEXT;
      status.textContent = 'Same path, same eavesdropper. Now decrypt it at Bob’s end.';
    });

    // ---- step 3: decrypt at the other end --------------------------------
    const bobKey = el('input', { class: INPUT, type: 'text', placeholder: 'Key Bob uses to decrypt' }) as HTMLInputElement;
    const decrypt = el('button', { class: BUTTON }, 'Decrypt as Bob');
    const bobOut = el('pre', { class: `${CARD} whitespace-pre-wrap break-all` }, '—');
    decrypt.addEventListener('click', () => {
      if (!sentEncrypted) {
        status.className = WARN_TEXT;
        status.textContent = 'Nothing has been sent encrypted yet.';
        return;
      }
      const attempt = xorDecrypt(ciphertext, bobKey.value.trim());
      bobOut.textContent = attempt || '—';
      if (attempt === message.value) {
        status.className = OK_TEXT;
        status.textContent = 'Bob has the message. Eve has the same bytes and nothing to do with them.';
        ctx.complete();
      } else {
        status.className = WARN_TEXT;
        status.textContent =
          'That is not the message. The same key that encrypted it has to decrypt it — which is exactly the ' +
          'problem with symmetric encryption: Bob has to already have that key.';
      }
    });

    container.append(
      el('h3', { class: 'text-base font-bold ink-1' }, 'Send a message'),
      el('p', { class: MUTED }, 'The message Alice wants to get to Bob:'),
      message,
      el('div', { class: 'flex gap-2 flex-wrap mt-2' }, sendClear),

      el('h3', { class: 'text-base font-bold ink-1 mt-4' }, 'The path it takes'),
      wire,

      el('h3', { class: 'text-base font-bold ink-1 mt-4' }, 'Eve, sitting on the path'),
      eveLog,

      el('h3', { class: 'text-base font-bold ink-1 mt-4' }, 'Now encrypt it'),
      el('p', { class: MUTED }, 'Alice picks a key:'),
      key,
      el('div', { class: 'flex gap-2 flex-wrap mt-2' }, sendEncrypted),

      el('h3', { class: 'text-base font-bold ink-1 mt-4' }, 'At Bob’s end'),
      el('p', { class: MUTED }, 'Bob decrypts with the key he and Alice share:'),
      bobKey,
      el('div', { class: 'flex gap-2 flex-wrap mt-2' }, decrypt),
      bobOut,
      status
    );
  },
  explain() {
    return `<p>Nothing was "hacked". Eve read the first message because reading traffic you are
      carrying is not an attack — it is the ordinary function of a network. Encryption does not
      keep her off the path; it makes being on the path worthless.</p>
      <p>Notice what the last step cost you: <strong>the same key</strong> had to be at both ends
      before a single word could be exchanged. Getting it there is the key distribution problem,
      and it is what public-key cryptography exists to solve.</p>
      <p><strong>Honesty about this lab:</strong> the repeating-key XOR used here is a teaching
      toy. It shows the symmetric property clearly and it is breakable by hand. Real systems use
      vetted ciphers such as AES, and encryption alone still proves nothing about
      <em>who</em> sent a message — that is authentication, and it is a separate job.</p>`;
  },
};

export default lab;
