/**
 * Scene 2 — "You Can Share the Lock." Resolves Scene 1's key-distribution
 * problem with public/private keypairs, then twists into a man-in-the-middle
 * reveal: encryption alone doesn't prove who you're really talking to.
 */

export type Scene2Trigger =
  | { kind: 'continue' }
  | { kind: 'keypair-generated' } // Bob generated + published his keypair
  | { kind: 'message-encrypted' } // Alice encrypted with Bob's public key
  | { kind: 'eve-decrypt-failed' } // Eve tried to decrypt and got garbage
  | { kind: 'mitm-key-swapped' } // Eve substituted her public key for Bob's
  | { kind: 'mitm-message-encrypted' } // Alice (unknowingly) encrypted to Eve
  | { kind: 'mitm-decrypted-by-eve' } // Eve decrypted and read the plaintext
  | { kind: 'mitm-forwarded' } // Eve re-encrypted with Bob's real key and forwarded it
  | { kind: 'bob-decrypted' }; // Bob decrypted, none the wiser

export interface Scene2Step {
  id: string;
  speaker: 'alice' | 'bob' | 'eve' | 'system';
  title: string;
  body: string;
  trigger: Scene2Trigger;
}

export const SCENE2_STEPS: Scene2Step[] = [
  {
    id: 'intro',
    speaker: 'system',
    title: 'You Can Share the Lock.',
    body:
      'Alice and Bob now have a public key and a private key each. Anyone can encrypt with your public key — ' +
      'only your private key decrypts it. That solves the problem of sharing a secret in advance.',
    trigger: { kind: 'continue' },
  },
  {
    id: 'bob-generates',
    speaker: 'bob',
    title: 'Bob generates a keypair',
    body: 'Bob generates a public key and a private key, then publishes the public key on the facility network.',
    trigger: { kind: 'keypair-generated' },
  },
  {
    id: 'alice-encrypts',
    speaker: 'alice',
    title: "Alice's terminal",
    body: "Alice fetches Bob's public key and encrypts her message with it.",
    trigger: { kind: 'message-encrypted' },
  },
  {
    id: 'eve-fails',
    speaker: 'eve',
    title: 'Eve intercepts — and fails',
    body: "Eve can intercept the encrypted message, but she cannot decrypt it: she doesn't have Bob's private key.",
    trigger: { kind: 'eve-decrypt-failed' },
  },
  {
    id: 'explain-asymmetric',
    speaker: 'system',
    title: 'Asymmetric encryption solves key distribution',
    body:
      'Asymmetric encryption protects the message even over a public channel. But there is another problem: ' +
      "how do you know Bob's public key actually belongs to Bob?",
    trigger: { kind: 'continue' },
  },
  {
    id: 'mitm-swap',
    speaker: 'eve',
    title: 'Eve forges a keypair',
    body: 'Eve creates her own key pair and hands Alice a fake public key, pretending it belongs to Bob.',
    trigger: { kind: 'mitm-key-swapped' },
  },
  {
    id: 'mitm-alice-encrypts',
    speaker: 'alice',
    title: '"This is Bob\'s public key."',
    body: "Alice believes it — she encrypts her message with what she thinks is Bob's key.",
    trigger: { kind: 'mitm-message-encrypted' },
  },
  {
    id: 'mitm-eve-reads',
    speaker: 'eve',
    title: 'Eve reads it',
    body: 'Eve decrypts the message with her own private key. She can read every word.',
    trigger: { kind: 'mitm-decrypted-by-eve' },
  },
  {
    id: 'mitm-forward',
    speaker: 'eve',
    title: 'Eve forwards it',
    body: "Then Eve re-encrypts the message with Bob's real public key and forwards it on, so nothing looks wrong.",
    trigger: { kind: 'mitm-forwarded' },
  },
  {
    id: 'mitm-bob-decrypts',
    speaker: 'bob',
    title: 'Bob decrypts normally',
    body: 'Bob decrypts the message with his private key and reads it — completely unaware Eve ever saw it.',
    trigger: { kind: 'bob-decrypted' },
  },
  {
    id: 'reveal',
    speaker: 'system',
    title: '💥 MAN-IN-THE-MIDDLE',
    body:
      'Asymmetric encryption protects the message, but authentication is still critical. Encrypting to a key ' +
      "you can't verify is no safer than sharing the key in the open.",
    trigger: { kind: 'continue' },
  },
  {
    id: 'transition',
    speaker: 'system',
    title: 'What if the key itself could tell you when someone was spying on you?',
    body: 'Time to see what a real quantum key exchange looks like — with Alice, Bob, and Eve for real.',
    trigger: { kind: 'continue' },
  },
];

export interface Scene2State {
  index: number;
}

export function initialScene2(): Scene2State {
  return { index: 0 };
}

export function currentScene2Step(s: Scene2State): Scene2Step | null {
  if (s.index >= SCENE2_STEPS.length) return null;
  return SCENE2_STEPS[s.index];
}

export function advanceScene2(s: Scene2State, event: Scene2Trigger['kind']): Scene2State {
  const step = currentScene2Step(s);
  if (!step) return s;
  if (step.trigger.kind !== event) return s;
  return { index: s.index + 1 };
}

export function isScene2Finished(s: Scene2State): boolean {
  return s.index >= SCENE2_STEPS.length;
}
