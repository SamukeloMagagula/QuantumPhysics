import { el } from './dom';
import { INPUT } from './styles';
import { COMMON_SET } from './data/common-passwords';
import { Lab } from './types';

export { COMMON_PASSWORDS } from './data/common-passwords';

export function strengthScore(pw: string): number {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(s, 4);
}

// Simulated guesses/second for a modern attacker (illustrative only).
const GUESSES_PER_SEC = 1e10;

export function estimateCrackSeconds(pw: string): number {
  if (!pw) return 0;
  if (COMMON_SET.has(pw.toLowerCase())) return 0; // in the wordlist: instant
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/\d/.test(pw)) pool += 10;
  if (/[^A-Za-z0-9]/.test(pw)) pool += 33;
  const combos = Math.pow(pool || 1, pw.length);
  return combos / 2 / GUESSES_PER_SEC; // expected half the keyspace
}

export function formatDuration(seconds: number): string {
  if (seconds <= 0) return "instantly (it's on the common list)";
  const units: [string, number][] = [
    ['years', 31557600],
    ['days', 86400],
    ['hours', 3600],
    ['minutes', 60],
    ['seconds', 1],
  ];
  for (const [name, size] of units) {
    if (seconds >= size) return `~${(seconds / size).toFixed(1)} ${name}`;
  }
  return 'under a second';
}

const STRENGTH_LABELS = ['☠ awful', 'weak', 'ok', 'strong', '🔒 excellent'];

const lab: Lab = {
  id: 'password-cracking',
  title: 'Password Cracking',
  difficulty: 'beginner',
  category: 'Social Engineering & Passwords',
  intro() {
    return `<p>Attackers don't guess one password at a time by hand — they run
      billions of guesses per second and start with lists of common passwords.
      Type a password and watch a <em>simulated</em> attacker estimate how long it
      would take. Reach the top strength tier to pass.</p>`;
  },
  render(container, ctx) {
    const input = el('input', { placeholder: 'type a password to test', type: 'text', class: INPUT });
    const meter = el('div', { class: 'space-y-1' });
    const done = { hit: false };

    const update = () => {
      const pw = (input as HTMLInputElement).value;
      const score = strengthScore(pw);
      const secs = estimateCrackSeconds(pw);
      meter.replaceChildren(
        el('div', {}, `Strength: ${STRENGTH_LABELS[score]}`),
        el('div', {}, `Simulated crack time: ${formatDuration(secs)}`)
      );
      if (score >= 4 && !done.hit) {
        done.hit = true;
        ctx.complete();
      }
    };
    input.addEventListener('input', update);
    update();

    container.append(el('h3', { class: 'text-base font-bold text-white' }, 'Test a password'), input, meter);
  },
  explain() {
    return `<p>Short or common passwords fall instantly to wordlist and brute-force
      attacks. Length and character variety explode the keyspace an attacker must
      search.</p><p><strong>Defense:</strong> use long, unique passphrases and a
      password manager; sites should store passwords with slow salted hashes
      (bcrypt/argon2), never plaintext.</p>`;
  },
};

export default lab;
