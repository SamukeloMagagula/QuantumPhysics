/**
 * Scene 1 — "One Secret. Two People." A scripted narrative walking the
 * player through symmetric encryption, then showing why sharing the key
 * itself is the unsolved problem. Steps only advance on the gameplay event
 * they declare, same contract as quantumHeistTutorial.ts.
 */

export type Scene1Trigger =
  | { kind: 'continue' } // player presses Next
  | { kind: 'message-encrypted' } // Alice encrypted the message
  | { kind: 'message-decrypted' } // Bob decrypted it with the same key
  | { kind: 'key-intercepted' }; // Eve's interception beat has played out

export interface Scene1Step {
  id: string;
  speaker: 'alice' | 'bob' | 'eve' | 'system';
  title: string;
  body: string;
  trigger: Scene1Trigger;
}

export const SCENE1_STEPS: Scene1Step[] = [
  {
    id: 'intro',
    speaker: 'system',
    title: 'One Secret. Two People.',
    body:
      'Alice and Bob need to get a message across a cybersecurity lab without anyone else reading it. ' +
      "They agree on one thing beforehand: a shared secret key. That's symmetric encryption.",
    trigger: { kind: 'continue' },
  },
  {
    id: 'alice-encrypts',
    speaker: 'alice',
    title: "Alice's terminal",
    body: 'Alice types her message and encrypts it with the shared key before sending it.',
    trigger: { kind: 'message-encrypted' },
  },
  {
    id: 'bob-decrypts',
    speaker: 'bob',
    title: "Bob's terminal",
    body: 'Bob receives the scrambled bytes. With the same shared key, he decrypts them back to plain text.',
    trigger: { kind: 'message-decrypted' },
  },
  {
    id: 'explain-symmetric',
    speaker: 'system',
    title: 'SYMMETRIC ENCRYPTION',
    body:
      'Symmetric encryption uses the same secret key to encrypt and decrypt information. Alice and Bob must ' +
      'both possess the key. But there is a problem: how do Alice and Bob securely share the key in the first place?',
    trigger: { kind: 'continue' },
  },
  {
    id: 'eve-appears',
    speaker: 'eve',
    title: 'EVE APPEARS',
    body: 'Eve intercepts the key while Alice is attempting to send it to Bob.',
    trigger: { kind: 'key-intercepted' },
  },
  {
    id: 'compromised',
    speaker: 'system',
    title: 'THE KEY HAS BEEN COMPROMISED.',
    body: 'There must be another way.',
    trigger: { kind: 'continue' },
  },
];

export interface Scene1State {
  index: number;
}

export function initialScene1(): Scene1State {
  return { index: 0 };
}

export function currentScene1Step(s: Scene1State): Scene1Step | null {
  if (s.index >= SCENE1_STEPS.length) return null;
  return SCENE1_STEPS[s.index];
}

export function advanceScene1(s: Scene1State, event: Scene1Trigger['kind']): Scene1State {
  const step = currentScene1Step(s);
  if (!step) return s;
  if (step.trigger.kind !== event) return s;
  return { index: s.index + 1 };
}

export function isScene1Finished(s: Scene1State): boolean {
  return s.index >= SCENE1_STEPS.length;
}
