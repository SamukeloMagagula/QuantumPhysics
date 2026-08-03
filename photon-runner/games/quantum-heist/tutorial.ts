/**
 * Guided first run. A veteran operative ("Mentor") walks the player through
 * the loop step by step: move, use a console, read the evidence, understand
 * what Eve is doing, and vote. Each step declares what it's waiting for, so
 * the game can advance it from real play rather than a scripted cutscene.
 */

export type TutorialTrigger =
  | { kind: 'continue' } // player presses Next
  | { kind: 'move' } // player walks any distance
  | { kind: 'reach-station' } // player stands at any console
  | { kind: 'open-terminal' } // player opens a console
  | { kind: 'complete-task' } // player finishes a console
  | { kind: 'complete-count'; count: number } // N consoles this round
  | { kind: 'open-comms' }
  | { kind: 'round-resolved' }
  | { kind: 'vote-cast' };

export interface TutorialStep {
  id: string;
  /** Who is talking — the mentor NPC, or the facility itself. */
  speaker: 'mentor' | 'system';
  title: string;
  body: string;
  trigger: TutorialTrigger;
  /** Optional world point the mentor walks to and the camera hints at. */
  focus?: 'player' | 'nearest-station' | 'tap' | 'meeting';
  /** Freeze the round clock while this step is showing. */
  pause?: boolean;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    speaker: 'mentor',
    title: 'Welcome to the relay',
    body:
      "I'm your handler. Three of us are working this facility tonight — you, and two others. One of the three is secretly tapping the line. It might be you; check your role card, top left.",
    trigger: { kind: 'continue' },
    pause: true,
  },
  {
    id: 'goal',
    speaker: 'mentor',
    title: 'What you are actually doing',
    body:
      "We're building a shared secret key out of single photons. That's quantum key distribution. The physics has a gift for us: anyone who measures a photon in transit changes it. So an eavesdropper leaves errors behind. Our whole job is to generate enough key that those errors become obvious.",
    trigger: { kind: 'continue' },
    pause: true,
  },
  {
    id: 'move',
    speaker: 'mentor',
    title: 'Move',
    body: 'WASD or the arrow keys. On a touchscreen, use the stick bottom-left. Go on — take a few steps.',
    trigger: { kind: 'move' },
  },
  {
    id: 'find-station',
    speaker: 'mentor',
    title: 'Find a console',
    body:
      'Those glowing rings are consoles. Each one is a real step of the protocol. Walk into one — the minimap on the right shows where they all are.',
    trigger: { kind: 'reach-station' },
    focus: 'nearest-station',
  },
  {
    id: 'use-station',
    speaker: 'mentor',
    title: 'Use it',
    body: "Press E, or the Use button. You'll get the actual instrument, not a loading bar.",
    trigger: { kind: 'open-terminal' },
  },
  {
    id: 'first-task',
    speaker: 'mentor',
    title: 'Good',
    body:
      "That's one step of the exchange done. Every console you clear samples more of the key — and a bigger sample makes tampering much harder to hide. A lazy crew is an eavesdropper's best friend.",
    trigger: { kind: 'complete-task' },
    pause: true,
  },
  {
    id: 'more-tasks',
    speaker: 'mentor',
    title: 'Keep working',
    body: 'Clear two more consoles. Watch who else is moving around while you do — that matters later.',
    trigger: { kind: 'complete-count', count: 3 },
  },
  {
    id: 'comms',
    speaker: 'mentor',
    title: 'Talk to the others',
    body:
      "Open comms — the radio button, bottom right. Anything you send is public, so it's how you build an alibi or catch someone in one. Try it.",
    trigger: { kind: 'open-comms' },
  },
  {
    id: 'the-tap',
    speaker: 'mentor',
    title: 'What the eavesdropper is doing',
    body:
      "If you're Eve, the fiber has a tap point and you get one move per round: tap individual photons, spoof the receiver across a stretch, or crack the key offline. Loud attacks steal more but leave a signature. If you're not Eve — someone else is choosing right now.",
    trigger: { kind: 'continue' },
    focus: 'tap',
    pause: true,
  },
  {
    id: 'evidence',
    speaker: 'system',
    title: 'Read the evidence',
    body:
      "Round over. You get two numbers: the error rate, and the shape of those errors. Clustered means someone spoofed a contiguous stretch. Scattered means per-photon tapping. Clean means nothing happened — or the attacker stayed offline.",
    trigger: { kind: 'round-resolved' },
    pause: true,
  },
  {
    id: 'sensors',
    speaker: 'mentor',
    title: 'The sensor gates',
    body:
      "Those rings in the corridors log that someone passed, and when — never who. Cross-reference the timestamps against what people claimed on comms. That's how you catch a liar.",
    trigger: { kind: 'continue' },
    pause: true,
  },
  {
    id: 'vote',
    speaker: 'mentor',
    title: 'The meeting',
    body:
      "After the last round everyone gathers and names a suspect. Get it right and the crew wins. Get it wrong, or tie, and the eavesdropper walks with whatever key they stole. You're on your own from here.",
    trigger: { kind: 'continue' },
    focus: 'meeting',
    pause: true,
  },
];

export interface TutorialState {
  active: boolean;
  index: number;
  /** Progress toward a counted trigger. */
  counter: number;
}

export function initialTutorial(active: boolean): TutorialState {
  return { active, index: 0, counter: 0 };
}

export function currentStep(t: TutorialState): TutorialStep | null {
  if (!t.active || t.index >= TUTORIAL_STEPS.length) return null;
  return TUTORIAL_STEPS[t.index];
}

/**
 * Feed a gameplay event in; returns the next tutorial state. Steps only ever
 * advance on the event they declared, so the player can't outrun the script
 * and can't get stuck behind it either.
 */
export function advanceTutorial(t: TutorialState, event: TutorialTrigger['kind']): TutorialState {
  const step = currentStep(t);
  if (!step) return t;

  if (step.trigger.kind === 'complete-count') {
    if (event !== 'complete-task') return t;
    const counter = t.counter + 1;
    if (counter >= step.trigger.count) return { ...t, index: t.index + 1, counter: 0 };
    return { ...t, counter };
  }

  if (step.trigger.kind !== event) return t;
  return { ...t, index: t.index + 1, counter: 0 };
}

export function finishTutorial(t: TutorialState): TutorialState {
  return { ...t, active: false, index: TUTORIAL_STEPS.length };
}

export function tutorialProgress(t: TutorialState): { step: number; total: number } {
  return { step: Math.min(t.index + 1, TUTORIAL_STEPS.length), total: TUTORIAL_STEPS.length };
}
