import { el } from './labDom';
import { CARD, MUTED, BUTTON, SELECT, OK_TEXT, WARN_TEXT, ACCENT_TEXT, DANGER_TEXT } from './labStyles';
import { Lab } from './labTypes';

/**
 * Denial of Service — run the service, not a quiz about it.
 *
 * Three waves of increasing size arrive at a small site and the learner
 * configures the defences before each one. The model is deliberately crude
 * but it is honest about the one thing people get wrong: once the *link* is
 * saturated, nothing you do on your own servers helps, because the traffic
 * has already used up the road before it reaches your door. Only filtering
 * further upstream does anything at that point.
 *
 * All the arithmetic is pure and exported, so the balance can be tested
 * without a browser.
 */

export type RateLimit = 'off' | 'moderate' | 'strict';

export interface Defenses {
  rateLimit: RateLimit;
  /** Serve repeat requests from cache so they never reach the application. */
  cache: boolean;
  /** Filter upstream, before the traffic reaches your own link. */
  scrubbing: boolean;
  /** Application capacity multiplier: 1, 2 or 4. */
  capacity: number;
}

export interface Wave {
  id: string;
  name: string;
  brief: string;
  /** Requests per second from real visitors. */
  legit: number;
  /** Requests per second from the attack. */
  attack: number;
  /** How many distinct sources the attack comes from. */
  sources: number;
  lesson: string;
}

/** Requests per second the site's own network link can carry. */
export const LINK_CAPACITY = 20_000;

/** Requests per second one unit of application capacity can serve. */
export const APP_CAPACITY = 1_200;

/** Fraction of requests a warm cache answers without touching the app. */
export const CACHE_OFFLOAD = 0.7;

export const WAVES: Wave[] = [
  {
    id: 'w1',
    name: 'Wave 1 — a single loud source',
    brief:
      'One machine is hammering the site with about 6,000 requests a second. Real visitors are making a handful of requests each.',
    legit: 400,
    attack: 6_000,
    sources: 1,
    lesson:
      'One source making thousands of requests looks nothing like a person, so a strict per-source limit removes almost all of it. Note what it cost: a few genuine visitors were caught too. Buying more servers would have carried the attacker just as willingly as the visitors.',
  },
  {
    id: 'w2',
    name: 'Wave 2 — a botnet',
    brief:
      'The same volume, now spread across 60,000 machines. Each one individually looks almost reasonable.',
    legit: 600,
    attack: 14_000,
    sources: 60_000,
    lesson:
      'Spread thin enough, per-source limits catch less of it. You need headroom as well — caching keeps most requests away from the application entirely.',
  },
  {
    id: 'w3',
    name: 'Wave 3 — amplification',
    brief:
      'Small forged queries to open servers, whose much larger replies all land on you: about 90,000 requests a second, far beyond what your link can carry.',
    legit: 600,
    attack: 90_000,
    sources: 40_000,
    lesson:
      'Once the link itself is full, your servers are irrelevant — the traffic never gets a chance to reach them. This one can only be handled before it arrives.',
  },
];

/** How much of the attack a per-source limit removes, given how spread out it is. */
export function rateLimitEffect(rate: RateLimit, sources: number): number {
  if (rate === 'off') return 0;
  // A limit works by catching sources that behave unlike people. The more
  // machines the load is spread across, the more human each one looks.
  const concentration = 1 / (1 + sources / 2_000);
  const ceiling = rate === 'strict' ? 0.96 : 0.8;
  return ceiling * (0.35 + 0.65 * concentration);
}

/** What a limit costs real visitors. Strict limits catch some of them too. */
export function rateLimitFalsePositives(rate: RateLimit): number {
  if (rate === 'strict') return 0.04;
  return 0;
}

export interface Outcome {
  /** Requests per second arriving at your link after upstream filtering. */
  atLink: number;
  /** True when the link itself is saturated. */
  linkSaturated: boolean;
  legitServed: number;
  legitTotal: number;
  /** Percentage of real visitors served, 0–100. */
  successPercent: number;
  held: boolean;
  notes: string[];
}

/** The bar for calling a wave held. */
export const HOLD_PERCENT = 95;

export function simulate(wave: Wave, d: Defenses): Outcome {
  const notes: string[] = [];

  // 1. Upstream scrubbing happens before the traffic reaches your link.
  const scrubbed = d.scrubbing ? wave.attack * 0.06 : wave.attack;
  if (d.scrubbing) notes.push('Upstream filtering absorbed most of the attack before it reached your link.');

  const atLink = scrubbed + wave.legit;
  const linkSaturated = atLink > LINK_CAPACITY;

  // 2. A full link drops traffic indiscriminately — including real visitors.
  const linkSurvival = linkSaturated ? LINK_CAPACITY / atLink : 1;
  if (linkSaturated) {
    notes.push(
      `Your link carries ${LINK_CAPACITY.toLocaleString()} requests a second and ${Math.round(
        atLink
      ).toLocaleString()} arrived. What it cannot carry is dropped, and it cannot tell visitors from the attack.`
    );
  }

  // 3. Per-source rate limiting, applied at your edge.
  const removed = rateLimitEffect(d.rateLimit, wave.sources);
  const attackAfterLimit = scrubbed * linkSurvival * (1 - removed);
  let legit = wave.legit * linkSurvival * (1 - rateLimitFalsePositives(d.rateLimit));
  if (d.rateLimit !== 'off') {
    notes.push(`Rate limiting removed ${Math.round(removed * 100)}% of the attack traffic.`);
  }
  if (rateLimitFalsePositives(d.rateLimit) > 0) {
    notes.push('A strict limit also caught a few genuine visitors — that is its cost.');
  }

  // 4. Caching answers most requests without waking the application.
  const offload = d.cache ? CACHE_OFFLOAD : 0;
  if (d.cache) notes.push(`Cache served ${Math.round(offload * 100)}% of requests without touching the application.`);

  const appLoad = (attackAfterLimit + legit) * (1 - offload);
  const appCapacity = APP_CAPACITY * d.capacity;

  // 5. An overloaded application also fails indiscriminately.
  if (appLoad > appCapacity) {
    const survival = appCapacity / appLoad;
    notes.push(
      `The application can serve ${Math.round(appCapacity).toLocaleString()} a second and ${Math.round(
        appLoad
      ).toLocaleString()} got through. It is overloaded, and it fails for everyone.`
    );
    legit = legit * (offload + (1 - offload) * survival);
  }

  const successPercent = wave.legit === 0 ? 100 : Math.max(0, Math.min(100, (legit / wave.legit) * 100));
  return {
    atLink,
    linkSaturated,
    legitServed: legit,
    legitTotal: wave.legit,
    successPercent,
    held: successPercent >= HOLD_PERCENT,
    notes,
  };
}

const lab: Lab = {
  id: 'ddos-defense',
  title: 'Denial of Service',
  difficulty: 'intermediate',
  category: 'Network & Availability',
  intro() {
    return `<p>Nothing is stolen and nothing is altered. The site is simply unreachable — and a
      service nobody can use has failed just as completely as one that leaked.</p>
      <p>You are running a small site. Three waves are coming. Configure the defences before
      each one and keep <strong>at least ${HOLD_PERCENT}% of real visitors served</strong>.
      All three have to be held.</p>`;
  },
  render(container, ctx) {
    const defenses: Defenses = { rateLimit: 'off', cache: false, scrubbing: false, capacity: 1 };
    const held = new Set<string>();
    let waveIndex = 0;

    const brief = el('div', { class: CARD });
    const result = el('div', { class: CARD }, el('p', { class: MUTED }, 'No traffic yet. Set your defences and run the wave.'));
    const scoreboard = el('div', { class: MUTED });
    const status = el('p', { class: ACCENT_TEXT });

    const control = (label: string, hint: string, node: HTMLElement) =>
      el(
        'div',
        { class: CARD },
        el('div', { class: 'font-bold ink-1' }, label),
        el('div', { class: MUTED }, hint),
        node
      );

    const rate = el(
      'select',
      { class: SELECT },
      el('option', { value: 'off' }, 'Off'),
      el('option', { value: 'moderate' }, 'Moderate — 60 requests per minute per source'),
      el('option', { value: 'strict' }, 'Strict — 10 requests per minute per source')
    ) as HTMLSelectElement;
    rate.addEventListener('change', () => {
      defenses.rateLimit = rate.value as RateLimit;
    });

    const cache = el('input', { type: 'checkbox' }) as HTMLInputElement;
    cache.addEventListener('change', () => {
      defenses.cache = cache.checked;
    });

    const scrub = el('input', { type: 'checkbox' }) as HTMLInputElement;
    scrub.addEventListener('change', () => {
      defenses.scrubbing = scrub.checked;
    });

    const capacity = el(
      'select',
      { class: SELECT },
      el('option', { value: '1' }, '1× — one server'),
      el('option', { value: '2' }, '2× — double it'),
      el('option', { value: '4' }, '4× — four times the servers')
    ) as HTMLSelectElement;
    capacity.addEventListener('change', () => {
      defenses.capacity = Number(capacity.value);
    });

    const paintBrief = () => {
      const w = WAVES[waveIndex];
      brief.replaceChildren(
        el('div', { class: ACCENT_TEXT + ' font-bold' }, w.name),
        el('p', {}, w.brief),
        el(
          'div',
          { class: MUTED },
          `Real visitors: ${w.legit.toLocaleString()}/s · Attack: ${w.attack.toLocaleString()}/s from ` +
            `${w.sources.toLocaleString()} source${w.sources === 1 ? '' : 's'}`
        )
      );
      scoreboard.textContent = `Waves held: ${held.size} of ${WAVES.length}`;
    };

    const run = el('button', { class: BUTTON }, 'Run the wave');
    run.addEventListener('click', () => {
      const w = WAVES[waveIndex];
      const out = simulate(w, defenses);

      result.replaceChildren(
        el(
          'div',
          { class: 'flex items-baseline gap-3' },
          el('span', { class: `text-2xl font-bold ${out.held ? 'ink-1' : 'ink-1'}` }, `${out.successPercent.toFixed(1)}%`),
          el('span', { class: out.held ? OK_TEXT : DANGER_TEXT }, out.held ? 'wave held' : 'visitors were turned away')
        ),
        el(
          'div',
          { class: MUTED },
          `${Math.round(out.legitServed).toLocaleString()} of ${out.legitTotal.toLocaleString()} real visitors served · ` +
            `${Math.round(out.atLink).toLocaleString()}/s arriving at your link`
        ),
        ...out.notes.map((n) => el('div', { class: out.linkSaturated ? WARN_TEXT : MUTED }, `— ${n}`))
      );

      if (!out.held) {
        status.className = WARN_TEXT;
        status.textContent = 'Not held. Read what the run reported, change something, and send it again.';
        return;
      }

      held.add(w.id);
      result.append(el('p', { class: OK_TEXT }, `Held. ${w.lesson}`));

      if (held.size === WAVES.length) {
        status.className = OK_TEXT;
        status.textContent = 'All three waves held. The site stayed up.';
        scoreboard.textContent = `Waves held: ${held.size} of ${WAVES.length}`;
        ctx.complete();
        return;
      }

      waveIndex = Math.min(waveIndex + 1, WAVES.length - 1);
      status.className = ACCENT_TEXT;
      status.textContent = 'Next wave incoming. Adjust your defences.';
      paintBrief();
    });

    paintBrief();

    container.append(
      el('h3', { class: 'text-base font-bold ink-1' }, 'Incoming'),
      brief,
      el('h3', { class: 'text-base font-bold ink-1 mt-4' }, 'Your defences'),
      control('Per-source rate limit', 'Cut off any single source behaving unlike a person.', rate),
      control('Cache', 'Answer repeat requests without waking the application.', el('label', { class: 'flex items-center gap-2' }, cache, 'Enabled')),
      control('Upstream scrubbing', 'Filter the traffic before it reaches your own link.', el('label', { class: 'flex items-center gap-2' }, scrub, 'Enabled')),
      control('Application capacity', 'More servers behind the same link.', capacity),
      el('div', { class: 'flex items-center gap-3 flex-wrap mt-2' }, run, scoreboard),
      el('h3', { class: 'text-base font-bold ink-1 mt-4' }, 'Result'),
      result,
      status
    );
  },
  explain() {
    return `<p>Each wave defeats a different defence, which is the whole point:</p>
      <ul>
        <li><strong>One loud source</strong> is a rate-limiting problem. A limit discriminates —
          a visitor making a few requests a minute never notices, a source making thousands is cut
          off. Raising capacity instead would have helped the attacker just as much as everyone else.</li>
        <li><strong>A botnet</strong> blunts per-source limits, because spread across enough
          machines each one looks nearly human. Headroom is what carries you: caching keeps most
          requests away from the application entirely.</li>
        <li><strong>Amplification</strong> beats everything you own. Small forged queries produce
          much larger replies addressed to you, and once your link is full the traffic is dropped
          before your servers get a say. Only filtering further upstream can help.</li>
      </ul>
      <p>DDoS attacks availability — the third property alongside confidentiality and integrity,
      and the one most often treated as somebody else's problem until it is yours.</p>`;
  },
};

export default lab;
