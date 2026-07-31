import { el } from './dom';
import { CARD, ACCENT_CARD, MUTED, BUTTON } from './styles';
import { Lab } from './types';

// --- Toy RSA primitives (small numbers, so all math fits in JS numbers) ---

export function factor(n: number): [number, number] {
  for (let i = 2; i * i <= n; i++) {
    if (n % i === 0) return [i, n / i];
  }
  return [1, n]; // n is prime
}

export function modPow(base: number, exp: number, mod: number): number {
  base %= mod;
  let result = 1;
  while (exp > 0) {
    if (exp % 2 === 1) result = (result * base) % mod;
    exp = Math.floor(exp / 2);
    base = (base * base) % mod;
  }
  return result;
}

export function modInverse(a: number, m: number): number {
  let [oldR, r] = [((a % m) + m) % m, m];
  let [oldS, s] = [1, 0];
  while (r !== 0) {
    const q = Math.floor(oldR / r);
    [oldR, r] = [r, oldR - q * r];
    [oldS, s] = [s, oldS - q * s];
  }
  return ((oldS % m) + m) % m;
}

export function rsaDecrypt(c: number, d: number, n: number): number {
  return modPow(c, d, n);
}

// --- Lab scenario ---
const P = 61;
const Q = 53;
const N = P * Q;
const E = 17; // n = 3233
const MESSAGE = 1729; // the secret vault code (< n)
const CIPHERTEXT = modPow(MESSAGE, E, N);

const lab: Lab = {
  id: 'rsa-factoring',
  title: 'RSA Factoring',
  difficulty: 'intermediate',
  category: 'Cryptography',
  intro() {
    return `<p>RSA public-key crypto lets anyone encrypt with your <em>public</em> key while
      only your <em>private</em> key decrypts. Its security rests on one thing: factoring a
      big number <code>n</code> back into its two prime factors is infeasible.</p>
      <p>But this toy key uses tiny primes. Factor <code>n</code>, derive the private key,
      and read the secret.</p>`;
  },
  render(container, ctx) {
    const status = el('div', {});
    const factorBtn = el('button', { class: BUTTON }, 'Factor n and break it');
    factorBtn.addEventListener('click', () => {
      const [p, q] = factor(N);
      const phi = (p - 1) * (q - 1);
      const d = modInverse(E, phi);
      const m = rsaDecrypt(CIPHERTEXT, d, N);
      status.replaceChildren(
        el(
          'div',
          { class: ACCENT_CARD },
          el('div', {}, `Factored n = ${N} → p = ${p}, q = ${q}`),
          el('div', {}, `φ(n) = (p-1)(q-1) = ${phi}`),
          el('div', {}, `private key d = e⁻¹ mod φ(n) = ${d}`),
          el('div', {}, el('strong', {}, `Decrypted secret: m = ${m}`)),
          el('p', { class: MUTED }, 'You recovered the secret without ever being handed the private key.')
        )
      );
      ctx.complete();
    });
    container.append(
      el('h3', { class: 'text-base font-bold text-white' }, 'Break the toy RSA'),
      el(
        'div',
        { class: CARD },
        el('div', {}, `Public key:  n = ${N},  e = ${E}`),
        el('div', {}, `Ciphertext:  c = ${CIPHERTEXT}`)
      ),
      el(
        'p',
        { class: MUTED },
        'Someone encrypted a secret code with this PUBLIC key. Only the matching PRIVATE ' +
          'key should decrypt it — but with these tiny primes you can factor n and derive it yourself.'
      ),
      factorBtn,
      status
    );
  },
  explain() {
    return `<p>You factored <code>n</code> into <code>p·q</code>, computed
      <code>φ(n) = (p-1)(q-1)</code>, inverted <code>e</code> to get the private key
      <code>d</code>, then decrypted <code>c</code> — all without being given <code>d</code>.
      That is the whole game: RSA is only as strong as factoring <code>n</code> is hard.</p>
      <p><strong>Takeaway:</strong> real RSA uses a ~2048-bit <code>n</code> (600+ digits),
      where factoring would take longer than the age of the universe. Small keys = broken keys.</p>`;
  },
};

export default lab;
