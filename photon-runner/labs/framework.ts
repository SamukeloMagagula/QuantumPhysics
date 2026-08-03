import { el } from './dom';
import { CARD, DONE_TEXT } from './styles';
import { Lab, LabContext } from './types';

const STORAGE_KEY = 'photon-runner:labProgress';

export interface ProgressStore {
  all(): string[];
  isComplete(id: string): boolean;
  markComplete(id: string): void;
}

function readCompleted(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCompleted(ids: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // localStorage unavailable — progress just won't persist this session.
  }
}

/** Guest progress store: localStorage only, no accounts/backend. */
export function createGuestStore(): ProgressStore {
  return {
    all: () => readCompleted(),
    isComplete: (id) => readCompleted().includes(id),
    markComplete: (id) => {
      const cur = readCompleted();
      if (!cur.includes(id)) writeCompleted([...cur, id]);
    },
  };
}

/**
 * Mounts a lab's Learn / Try / Explain flow into a container, matching
 * CyberRange's original framework.js. Ported to a plain function (not a
 * React component) since labs manipulate the "Try" container imperatively.
 */
export function mountLab(container: HTMLElement, lab: Lab, store: ProgressStore, onComplete?: (id: string) => void): void {
  container.replaceChildren();

  const learn = el('section', { class: CARD }, el('h2', { class: 'text-xl font-bold text-white' }, lab.title), el('div', { html: lab.intro() }));
  const tryZone = el('section', { class: CARD });
  const explainZone = el('section', { class: `${CARD} hidden` });

  const ctx: LabContext = {
    complete() {
      explainZone.classList.remove('hidden');
      explainZone.replaceChildren(
        el('h3', { class: 'text-base font-bold text-white' }, 'Why it worked & how to defend'),
        el('div', { html: lab.explain() }),
        el('p', { class: DONE_TEXT }, '✅ Lab complete.')
      );
      store.markComplete(lab.id);
      onComplete?.(lab.id);
      explainZone.scrollIntoView({ behavior: 'smooth' });
    },
  };

  lab.render(tryZone, ctx);
  container.append(learn, tryZone, explainZone);
}
