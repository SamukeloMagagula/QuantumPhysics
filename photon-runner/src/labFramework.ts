import { el } from './labDom';
import { CARD, DONE_TEXT } from './labStyles';
import { Lab, LabContext } from './labTypes';

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

  // The title lives in the runner's header now, so the Learn card is just the
  // briefing — repeating it here read as a stutter.
  const learn = el('section', { class: CARD }, el('div', { class: 'prose-room', html: lab.intro() }));
  const tryZone = el('section', { class: CARD });
  const explainZone = el('section', { class: `${CARD} hidden` });

  const ctx: LabContext = {
    complete() {
      explainZone.classList.remove('hidden');
      explainZone.replaceChildren(
        el('p', { class: DONE_TEXT }, 'Challenge complete — you can keep experimenting.'),
        el('details', {},
          el('summary', { class: 'cursor-pointer text-base font-bold ink-1' }, 'Why it worked & how to defend'),
          el('div', { class: 'prose-room mt-3', html: lab.explain() })
        )
      );
      store.markComplete(lab.id);
      onComplete?.(lab.id);
    },
  };

  lab.render(tryZone, ctx);
  container.append(learn, tryZone, explainZone);
}
