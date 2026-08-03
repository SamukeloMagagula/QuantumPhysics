import { el } from './dom';
import { CARD, MUTED, BUTTON, INPUT } from './styles';
import { Lab } from './types';

export function buildQuery(username: string, password: string): string {
  return `SELECT * FROM users WHERE username = '${username}' AND password = '${password}';`;
}

// The fake DB "runs" the query. Login succeeds if a tautology neutralizes the
// password check — i.e. the classic ' OR '1'='1 style bypass. No real DB.
export function isBypass(username: string, password: string): boolean {
  const q = buildQuery(username, password).toLowerCase();
  const tautology = /or\s+('1'='1|1=1)/.test(q);
  const commentsOutPassword = /--|#/.test(username);
  return tautology && (commentsOutPassword || /or\s+('1'='1|1=1)/.test(username.toLowerCase()));
}

const lab: Lab = {
  id: 'sql-injection',
  title: 'SQL Injection',
  difficulty: 'beginner',
  category: 'Web Attacks',
  intro() {
    return `<p>Below is a login for <em>FakeBank</em>. Its code builds an SQL query by
      gluing your input straight into a string — the classic mistake. Your goal:
      log in as <strong>admin</strong> without knowing the password.</p>
      <p>Hint: what happens if the username field itself contains SQL?
      Try <code>admin' OR '1'='1' --</code></p>`;
  },
  render(container, ctx) {
    const user = el('input', { placeholder: 'username', value: '', class: INPUT });
    const pass = el('input', { placeholder: 'password', type: 'text', value: '', class: INPUT });
    const preview = el('pre', { class: `${CARD} whitespace-pre-wrap` }, buildQuery('', ''));
    const status = el('p', { class: 'text-emerald-400' });

    const update = () => {
      preview.textContent = buildQuery((user as HTMLInputElement).value, (pass as HTMLInputElement).value);
    };
    user.addEventListener('input', update);
    pass.addEventListener('input', update);

    const submit = el('button', { class: BUTTON }, 'Log in');
    submit.addEventListener('click', () => {
      if (isBypass((user as HTMLInputElement).value, (pass as HTMLInputElement).value)) {
        status.textContent = '✅ Access granted — you bypassed the login!';
        ctx.complete();
      } else {
        status.textContent = '❌ Login failed. Look at the query being built above.';
      }
    });

    container.append(
      el('h3', { class: 'text-base font-bold text-white' }, 'Try it'),
      el('label', { class: 'block' }, 'Username'),
      user,
      el('label', { class: 'block' }, 'Password'),
      pass,
      el('p', { class: MUTED }, 'The query your input builds:'),
      preview,
      submit,
      status
    );
  },
  explain() {
    return `<p>Your input closed the string and injected <code>OR '1'='1'</code>, making the
      WHERE clause always true, while <code>--</code> commented out the password check.</p>
      <p><strong>Defense:</strong> never concatenate input into SQL. Use parameterized
      queries / prepared statements so input is treated as data, never as code.</p>`;
  },
};

export default lab;
