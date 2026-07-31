import { el } from './dom';
import { CARD, MUTED, BUTTON, BUTTON_SECONDARY } from './styles';
import { Lab } from './types';

export interface PhishingSample {
  id: string;
  from: string;
  subject: string;
  body: string;
  phishing: boolean;
  tell: string;
}

export const SAMPLES: PhishingSample[] = [
  {
    id: 's1',
    from: 'security@paypa1.com',
    subject: 'Unusual sign-in — verify now',
    body: 'We locked your account. Click http://paypa1-security.co/verify within 24h.',
    phishing: true,
    tell: "Lookalike domain 'paypa1' + urgency + off-brand link.",
  },
  {
    id: 's2',
    from: 'no-reply@github.com',
    subject: 'Your monthly digest',
    body: 'Here are repositories trending this week. Manage email settings in your profile.',
    phishing: false,
    tell: 'Legit sender, no urgency, no credential ask.',
  },
  {
    id: 's3',
    from: 'it-support@yourcompany.com.helpdesk-portal.ru',
    subject: 'Password expires today',
    body: 'Reset immediately at the portal or lose access.',
    phishing: true,
    tell: 'Real domain buried before a foreign suffix; pressure tactic.',
  },
  {
    id: 's4',
    from: 'receipts@amazon.com',
    subject: 'Your order shipped',
    body: 'Track your package from Your Orders. We never ask for your password by email.',
    phishing: false,
    tell: 'Consistent domain, no link-baiting, no secrets requested.',
  },
];

export const PASS_THRESHOLD = 3;

export function scoreAnswers(answers: Record<string, boolean>): { correct: number; total: number } {
  let correct = 0;
  for (const s of SAMPLES) if (answers[s.id] === s.phishing) correct++;
  return { correct, total: SAMPLES.length };
}

const lab: Lab = {
  id: 'phishing-spotter',
  title: 'Phishing Spotter',
  difficulty: 'beginner',
  category: 'Social Engineering & Passwords',
  intro() {
    return `<p>Read each message and decide: <strong>phishing or legit?</strong>
      Watch for lookalike domains, urgency, and requests for secrets.
      Get ${PASS_THRESHOLD} of ${SAMPLES.length} right to pass.</p>`;
  },
  render(container, ctx) {
    const answers: Record<string, boolean> = {};
    const status = el('p', { class: 'text-emerald-400' });
    container.append(el('h3', { class: 'text-base font-bold text-white' }, 'Triage the inbox'));

    for (const s of SAMPLES) {
      const verdict = el('span', { class: MUTED });
      const mark = (isPhish: boolean) => {
        answers[s.id] = isPhish;
        verdict.textContent = isPhish ? ' flagged: phishing' : ' marked: legit';
      };
      container.append(
        el(
          'div',
          { class: CARD },
          el('div', {}, el('strong', { class: 'text-white' }, 'From: '), s.from),
          el('div', {}, el('strong', { class: 'text-white' }, 'Subject: '), s.subject),
          el('p', { class: MUTED }, s.body),
          el('button', { class: BUTTON_SECONDARY, onClick: () => mark(true) }, 'Phishing'),
          ' ',
          el('button', { class: BUTTON_SECONDARY, onClick: () => mark(false) }, 'Legit'),
          verdict
        )
      );
    }

    const check = el('button', { class: BUTTON }, 'Check my answers');
    check.addEventListener('click', () => {
      const { correct, total } = scoreAnswers(answers);
      if (correct >= PASS_THRESHOLD) {
        status.textContent = `You got ${correct}/${total}.`;
        ctx.complete();
      } else {
        status.textContent = `You got ${correct}/${total}. Re-examine the domains and links, then try again.`;
      }
    });
    container.append(check, status);
  },
  explain() {
    return (
      '<ul>' +
      SAMPLES.map(
        (s) =>
          `<li><code>${s.from}</code> — <strong>${s.phishing ? 'phishing' : 'legit'}</strong>: ${s.tell}</li>`
      ).join('') +
      '</ul><p><strong>Defense:</strong> check the real domain, distrust urgency, ' +
      'and never enter credentials from an emailed link.</p>'
    );
  },
};

export default lab;
