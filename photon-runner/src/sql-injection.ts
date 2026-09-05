import { el } from './labDom';
import { CARD, MUTED, BUTTON, INPUT, DANGER_CARD } from './labStyles';
import { Lab } from './labTypes';

export interface DbUser {
  id: number;
  username: string;
  password: string;
  role: 'admin' | 'user';
}

/** The "database" this lab simulates. Small and fully visible on purpose — the
 * point is watching the WHERE clause light rows up in real time, not hiding data. */
export const FAKE_USERS: DbUser[] = [
  { id: 1, username: 'admin', password: 'Sup3rSecret!', role: 'admin' },
  { id: 2, username: 'alice', password: 'hunter2', role: 'user' },
  { id: 3, username: 'bob', password: 'letmein123', role: 'user' },
];

export function buildQuery(username: string, password: string): string {
  return `SELECT * FROM users WHERE username = '${username}' AND password = '${password}';`;
}

// ---------------------------------------------------------------------------
// A small real evaluator for the WHERE clause the query above builds, run
// per-row against FAKE_USERS — not a regex heuristic. This is what makes the
// simulation genuine: type ANY injection, and the row highlighting below
// reflects what a real WHERE clause would actually match, tautologies and all.

type Token =
  | { type: 'STRING'; value: string }
  | { type: 'NUMBER'; value: string }
  | { type: 'IDENT'; value: string }
  | { type: 'AND' }
  | { type: 'OR' }
  | { type: 'EQ' }
  | { type: 'LPAREN' }
  | { type: 'RPAREN' };

/** Tokenizes a WHERE clause. Returns null on malformed SQL (e.g. an unterminated
 * string literal) — a real database would raise a syntax error here too. */
function tokenize(input: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if ((c === '-' && input[i + 1] === '-') || c === '#') break; // comment: rest of the line is ignored
    if (c === "'") {
      let j = i + 1;
      let value = '';
      let closed = false;
      while (j < input.length) {
        if (input[j] === "'") {
          if (input[j + 1] === "'") {
            value += "'"; // '' is an escaped literal quote, standard SQL
            j += 2;
            continue;
          }
          closed = true;
          j++;
          break;
        }
        value += input[j];
        j++;
      }
      if (!closed) return null;
      tokens.push({ type: 'STRING', value });
      i = j;
      continue;
    }
    if (c === '=') {
      tokens.push({ type: 'EQ' });
      i++;
      continue;
    }
    if (c === '(') {
      tokens.push({ type: 'LPAREN' });
      i++;
      continue;
    }
    if (c === ')') {
      tokens.push({ type: 'RPAREN' });
      i++;
      continue;
    }
    let j = i;
    while (j < input.length && /[A-Za-z0-9_]/.test(input[j])) j++;
    if (j === i) return null; // an unrecognized character (e.g. a stray symbol) — syntax error
    const word = input.slice(i, j);
    const upper = word.toUpperCase();
    if (upper === 'AND') tokens.push({ type: 'AND' });
    else if (upper === 'OR') tokens.push({ type: 'OR' });
    else if (/^[0-9]+$/.test(word)) tokens.push({ type: 'NUMBER', value: word }); // bare numeric literal, e.g. 1=1
    else tokens.push({ type: 'IDENT', value: word });
    i = j;
  }
  return tokens;
}

interface ParsePos {
  i: number;
}

/** Bare identifiers (username/password) resolve against this row; string
 * literals are themselves. Recursive-descent: expr := term (OR term)*,
 * term := factor (AND factor)*, factor := '(' expr ')' | operand '=' operand. */
function parseExpr(tokens: Token[], pos: ParsePos, row: Record<string, string>): boolean | null {
  let left = parseTerm(tokens, pos, row);
  if (left === null) return null;
  while (tokens[pos.i]?.type === 'OR') {
    pos.i++;
    const right = parseTerm(tokens, pos, row);
    if (right === null) return null;
    left = left || right;
  }
  return left;
}

function parseTerm(tokens: Token[], pos: ParsePos, row: Record<string, string>): boolean | null {
  let left = parseFactor(tokens, pos, row);
  if (left === null) return null;
  while (tokens[pos.i]?.type === 'AND') {
    pos.i++;
    const right = parseFactor(tokens, pos, row);
    if (right === null) return null;
    left = left && right;
  }
  return left;
}

function parseFactor(tokens: Token[], pos: ParsePos, row: Record<string, string>): boolean | null {
  const t = tokens[pos.i];
  if (!t) return null;
  if (t.type === 'LPAREN') {
    pos.i++;
    const inner = parseExpr(tokens, pos, row);
    if (inner === null) return null;
    if (tokens[pos.i]?.type !== 'RPAREN') return null;
    pos.i++;
    return inner;
  }
  const left = parseOperand(tokens, pos, row);
  if (left === null) return null;
  if (tokens[pos.i]?.type !== 'EQ') return null;
  pos.i++;
  const right = parseOperand(tokens, pos, row);
  if (right === null) return null;
  return left === right;
}

function parseOperand(tokens: Token[], pos: ParsePos, row: Record<string, string>): string | null {
  const t = tokens[pos.i];
  if (!t) return null;
  if (t.type === 'STRING' || t.type === 'NUMBER') {
    pos.i++;
    return t.value;
  }
  if (t.type === 'IDENT') {
    pos.i++;
    // Only username/password are real columns here; any other bare word
    // (not realistic for this lab's injections) falls back to '' on both
    // sides of a comparison, so e.g. `foo = bar` would trivially read as
    // true — an acceptable simplification since nothing in this lab's
    // scope produces that shape.
    return row[t.value.toLowerCase()] ?? '';
  }
  return null;
}

export interface QueryRowResult {
  user: DbUser;
  matched: boolean;
}

export interface QueryResult {
  /** Set when the WHERE clause doesn't parse — a real syntax error, not a "no match". */
  error: string | null;
  rows: QueryRowResult[];
}

export function runQuery(username: string, password: string): QueryResult {
  const full = buildQuery(username, password);
  const whereText = full.slice(full.indexOf('WHERE') + 'WHERE'.length, full.lastIndexOf(';'));
  const tokens = tokenize(whereText);
  if (tokens === null) {
    return { error: 'syntax error: unterminated string literal near the end of the query', rows: [] };
  }
  // Validate the grammar once (row values don't affect whether it parses).
  const dryRun: ParsePos = { i: 0 };
  const parsed = parseExpr(tokens, dryRun, { username: '', password: '' });
  if (parsed === null || dryRun.i !== tokens.length) {
    return { error: 'syntax error: unexpected token in WHERE clause', rows: [] };
  }
  const rows = FAKE_USERS.map((user): QueryRowResult => {
    const pos: ParsePos = { i: 0 };
    const matched = parseExpr(tokens, pos, { username: user.username, password: user.password }) === true;
    return { user, matched };
  });
  return { error: null, rows };
}

const lab: Lab = {
  id: 'sql-injection',
  title: 'SQL Injection',
  difficulty: 'beginner',
  category: 'Web Attacks',
  intro() {
    return `<p>Below is a login for <em>FakeBank</em>, and — unusually for a real attack —
      the database itself, so you can watch what your query actually does to it.
      Its code builds an SQL query by gluing your input straight into a string, the
      classic mistake. Your goal: log in as <strong>admin</strong> without knowing the password.</p>
      <p>Hint: what happens if the username field itself contains SQL?
      Try <code>admin' OR '1'='1' --</code></p>`;
  },
  render(container, ctx) {
    const user = el('input', { placeholder: 'username', value: '', class: INPUT });
    const pass = el('input', { placeholder: 'password', type: 'text', value: '', class: INPUT });
    const preview = el('pre', { class: `${CARD} whitespace-pre-wrap` }, buildQuery('', ''));
    const status = el('p', { class: 'text-[var(--ok)]' });
    const errorBox = el('div', { class: `${DANGER_CARD} hidden` });

    const tbody = el('tbody');
    const table = el(
      'table',
      { class: 'w-full text-xs font-mono border-collapse' },
      el(
        'thead',
        {},
        el(
          'tr',
          { class: 'ink-3 text-left border-b border-slate-800' },
          el('th', { class: 'py-1.5 pr-3' }, 'id'),
          el('th', { class: 'py-1.5 pr-3' }, 'username'),
          el('th', { class: 'py-1.5 pr-3' }, 'password'),
          el('th', { class: 'py-1.5 pr-3' }, 'role'),
          el('th', { class: 'py-1.5' }, 'WHERE match')
        )
      ),
      tbody
    );

    const renderTable = () => {
      const u = (user as HTMLInputElement).value;
      const p = (pass as HTMLInputElement).value;
      const result = runQuery(u, p);

      tbody.innerHTML = '';
      if (result.error) {
        errorBox.textContent = `⚠ Database error: ${result.error}`;
        errorBox.classList.remove('hidden');
      } else {
        errorBox.classList.add('hidden');
      }

      const rows = result.error ? FAKE_USERS.map((u2) => ({ user: u2, matched: false })) : result.rows;
      for (const { user: row, matched } of rows) {
        tbody.append(
          el(
            'tr',
            {
              class: matched
                ? 'bg-emerald-500/15 text-[var(--ok)] border-b border-slate-800/60'
                : 'ink-3 border-b border-slate-800/60',
            },
            el('td', { class: 'py-1.5 pr-3' }, String(row.id)),
            el('td', { class: 'py-1.5 pr-3' }, row.username),
            el('td', { class: 'py-1.5 pr-3' }, row.password),
            el('td', { class: 'py-1.5 pr-3' }, row.role),
            el('td', { class: 'py-1.5 font-bold' }, matched ? 'MATCH' : '—')
          )
        );
      }
      return result;
    };

    const update = () => {
      preview.textContent = buildQuery((user as HTMLInputElement).value, (pass as HTMLInputElement).value);
      renderTable();
    };
    user.addEventListener('input', update);
    pass.addEventListener('input', update);

    const submit = el('button', { class: BUTTON }, 'Log in');
    submit.addEventListener('click', () => {
      const result = runQuery((user as HTMLInputElement).value, (pass as HTMLInputElement).value);
      if (result.error) {
        status.textContent = 'Login failed — the database rejected this query.';
        status.className = 'text-[var(--danger)]';
        return;
      }
      const first = result.rows.find((r) => r.matched);
      if (first) {
        status.textContent = `Access granted — logged in as ${first.user.username} (${first.user.role}). ${
          result.rows.filter((r) => r.matched).length > 1 ? 'The WHERE clause matched every row — that tautology is the bug.' : ''
        }`;
        status.className = 'text-[var(--ok)]';
        ctx.complete();
      } else {
        status.textContent = 'Login failed. 0 rows matched — look at the WHERE match column above.';
        status.className = 'text-[var(--warn)]';
      }
    });

    renderTable();

    container.append(
      el('h3', { class: 'text-base font-bold ink-1' }, 'Try it'),
      el('label', { class: 'block' }, 'Username'),
      user,
      el('label', { class: 'block' }, 'Password'),
      pass,
      el('p', { class: MUTED }, 'The query your input builds:'),
      preview,
      errorBox,
      submit,
      status,
      el('p', { class: `${MUTED} mt-3` }, "The database (server-side — an attacker can't normally see this table, but you can, to learn from it):"),
      el('div', { class: `${CARD} overflow-x-auto` }, table)
    );
  },
  explain() {
    return `<p>Your input closed the string and injected <code>OR '1'='1'</code>, making the
      WHERE clause always true, while <code>--</code> commented out the password check.
      Watch the table: every row's WHERE match column lit up, because <code>'1'='1'</code> is
      true regardless of which row it's checked against — that's the tautology.</p>
      <p><strong>Defense:</strong> never concatenate input into SQL. Use parameterized
      queries / prepared statements so input is treated as data, never as code.</p>`;
  },
};

export default lab;
