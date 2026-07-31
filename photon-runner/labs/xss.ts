import { el } from './dom';
import { CARD, DANGER_CARD, MUTED, BUTTON, INPUT } from './styles';
import { Lab } from './types';

// Detect a comment that would execute as code if pasted into the page as raw
// HTML: a <script> tag, an inline event handler (onerror=, onload=, ...), or a
// javascript: URI. No real execution happens — we only detect + simulate.
export function isXssPayload(input: string): boolean {
  const s = String(input);
  return /<script\b/i.test(s) || /\bon\w+\s*=/i.test(s) || /javascript:/i.test(s);
}

const lab: Lab = {
  id: 'xss',
  title: 'Cross-Site Scripting (XSS)',
  difficulty: 'intermediate',
  category: 'Web Attacks',
  intro() {
    return `<p>Below is <em>FriendBook</em>'s guestbook. Its code drops your comment
      straight into the page as HTML — with no escaping. That means your comment can
      contain <em>code</em>, and the browser will run it for everyone who views the page.</p>
      <p>Goal: post a comment that would execute a script. Try
      <code>&lt;script&gt;alert('xss')&lt;/script&gt;</code> or
      <code>&lt;img src=x onerror=alert(1)&gt;</code>.</p>`;
  },
  render(container, ctx) {
    const input = el('textarea', { placeholder: 'Leave a comment...', rows: '2', class: INPUT });
    const feed = el('div', { class: CARD }, el('em', { class: MUTED }, 'No comments yet.'));
    const result = el('div', {});
    const comments: string[] = [];

    const post = el('button', { class: BUTTON }, 'Post comment');
    post.addEventListener('click', () => {
      const text = (input as HTMLTextAreaElement).value.trim();
      if (!text) return;
      comments.push(text);
      // Safe render: el() uses text nodes, so nothing actually executes here.
      feed.replaceChildren(
        el('strong', { class: 'text-white' }, 'Guestbook'),
        ...comments.map((c) => el('div', { class: 'mt-1' }, c))
      );
      (input as HTMLTextAreaElement).value = '';
      if (isXssPayload(text)) {
        result.replaceChildren(
          el(
            'div',
            { class: DANGER_CARD },
            el('strong', {}, '💥 Your script executed! '),
            "In a vulnerable app that renders this comment as HTML, that code just ran in " +
              'every visitor\'s browser — an attacker could steal their session cookie ' +
              '(document.cookie) or act as them.'
          )
        );
        ctx.complete();
      } else {
        result.replaceChildren(
          el(
            'p',
            { class: MUTED },
            "Comment posted and shown as plain text. Try injecting a <script> tag or an " +
              "onerror handler to make it 'run'."
          )
        );
      }
    });

    container.append(
      el('h3', { class: 'text-base font-bold text-white' }, 'FriendBook guestbook'),
      el('p', { class: MUTED }, "This board pastes your comment straight into the page's HTML."),
      input,
      post,
      result,
      feed
    );
  },
  explain() {
    return `<p>Because the app inserted your comment into the page as raw HTML, the browser
      treated your <code>&lt;script&gt;</code> / event handler as code and ran it — that is
      Cross-Site Scripting (XSS). Attackers use it to steal cookies, hijack sessions, or
      deface the page for every visitor.</p>
      <p><strong>Defense:</strong> encode user input on output (render as text, not HTML),
      sanitize any allowed HTML, and set a Content-Security-Policy that blocks inline scripts.</p>`;
  },
};

export default lab;
