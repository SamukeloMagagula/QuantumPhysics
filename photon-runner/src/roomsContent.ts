/**
 * Static content for the "Rooms" learning path — ported from the old Flask
 * app's YAML+Markdown room authoring system (content/rooms/, content/paths/).
 * Answers are pre-hashed (SHA-256 over the normalized plaintext, see
 * roomAnswers.ts) exactly as they were authored there; only the delivery
 * mechanism changed (TS data instead of a YAML loader).
 */

export type AnswerType = 'exact' | 'number' | 'flag' | 'regex';

export interface RoomQuestion {
  id: string;
  prompt: string;
  answerType: AnswerType;
  /** SHA-256 hex digest of the normalized answer (plaintext for 'regex'). */
  answer: string;
  points: number;
  hint: string;
  caseInsensitive: boolean;
  trim: boolean;
}

export interface RoomTask {
  id: string;
  title: string;
  /** Markdown source, rendered client-side. */
  bodyMarkdown: string;
  questions: RoomQuestion[];
}

export interface Room {
  id: string;
  title: string;
  summary: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  estimatedMinutes: number;
  tags: string[];
  prerequisites: string[];
  tasks: RoomTask[];
}

export interface LearningPath {
  id: string;
  title: string;
  description: string;
  roomIds: string[];
}

const q = (
  id: string,
  prompt: string,
  answerType: AnswerType,
  answer: string,
  points: number,
  hint: string,
  overrides: Partial<Pick<RoomQuestion, 'caseInsensitive' | 'trim'>> = {}
): RoomQuestion => ({
  id,
  prompt,
  answerType,
  answer,
  points,
  hint,
  caseInsensitive: overrides.caseInsensitive ?? true,
  trim: overrides.trim ?? true,
});

export const ROOMS: Room[] = [
  {
    id: 'the-shift',
    title: 'The Shift',
    summary: 'Meet the Caesar cipher — the simplest shared-key cipher there is.',
    difficulty: 'Easy',
    estimatedMinutes: 10,
    tags: ['caesar', 'symmetric', 'beginner'],
    prerequisites: [],
    tasks: [
      {
        id: 'learn',
        title: 'What is a Caesar cipher?',
        bodyMarkdown: `# The Caesar cipher

Symmetric cryptography means both sides share **one secret key**. The oldest
example is the **Caesar cipher**: shift every letter forward by a fixed number
of positions. With a shift of 3, \`A → D\`, \`B → E\`, and \`HELLO → KHOOR\`.

Try the Caesar Cipher lab to see the wheel in action. To **decrypt**, shift
back by the same key — that shared number is the whole secret.`,
        questions: [],
      },
      {
        id: 'solve',
        title: 'Decrypt the message',
        bodyMarkdown: `# Your turn

Below is a message encrypted with a Caesar shift of **3**:

\`\`\`
KHOOR ZRUOG
\`\`\`

Decrypt it by shifting each letter back by 3, then answer the questions.`,
        questions: [
          q(
            'plaintext',
            'What does "KHOOR ZRUOG" decrypt to? (shift 3)',
            'exact',
            'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
            15,
            'Shift each letter back by three positions.'
          ),
          q(
            'key',
            'A Caesar cipher has how many possible non-zero keys?',
            'number',
            'b7a56873cd771f2c446d369b649430b65a756ba278ff97ec81bb6f55b2e73569',
            10,
            'There are 26 letters and a shift of 0 does nothing, so how many non-zero shifts remain?'
          ),
        ],
      },
    ],
  },
  {
    id: 'brute-force',
    title: 'Brute Force',
    summary: "If there are only 25 keys, you don't need to be clever — try them all.",
    difficulty: 'Easy',
    estimatedMinutes: 10,
    tags: ['caesar', 'brute-force', 'symmetric'],
    prerequisites: ['the-shift'],
    tasks: [
      {
        id: 'crack',
        title: 'Crack it without the key',
        bodyMarkdown: `# 25 keys is nothing

The Caesar cipher's fatal flaw: there are only **25 possible keys**. A computer
tries them all instantly. This is a **brute-force attack** — no cleverness
required, just try everything and read whichever output makes sense.

Try the Password Cracking lab's brute-force mode, or work it by hand: read
down all 25 decryptions of the intercepted message for the line that turns
into English.

Intercepted message:

\`\`\`
Esp dpncpe qwlr td BFLYEFX
\`\`\``,
        questions: [
          q(
            'secret',
            'The message hides a single secret word in capitals. What is it?',
            'exact',
            '8fb7cf7a46995c95da6ad4cca750efb66946b771aca070d5948ea80ca33237b4',
            20,
            'Read down the brute-force list for the line that becomes English.'
          ),
        ],
      },
    ],
  },
  {
    id: 'frequency-analysis',
    title: 'Frequency Analysis',
    summary: 'Substitution ciphers have too many keys to brute force — but letters betray them.',
    difficulty: 'Medium',
    estimatedMinutes: 15,
    tags: ['substitution', 'frequency-analysis', 'symmetric'],
    prerequisites: ['brute-force'],
    tasks: [
      {
        id: 'analyse',
        title: 'Break the substitution',
        bodyMarkdown: `# When brute force isn't enough

A **substitution cipher** replaces each letter with a different fixed letter
(not just a shift). Now there are 26! ≈ 4×10²⁶ keys — far too many to brute
force. But the cipher leaks a pattern: **letter frequencies survive**.

In English, \`e\` is the most common letter, then \`t\`, \`a\`, \`o\`. Count letters in
the ciphertext, line the peaks up with the expected English order, and the
message falls apart. That is **frequency analysis**.

Analyse this intercept:

\`\`\`
Of eknhzgukqhin yktjxtfen qfqsnlol ol zit lzxrn gy igv gyztf stzztkl qhhtqk.
Zit dglz egddgf stzztk of Tfusoli ol fgkdqssn zit stzztk t. Xlofu zitlt egxfzl
qf qzzqeatk eqf lsgvsn ktwxosr zit dqhhofu qfr ktqr zit dtllqut. Zit iorrtf
hqllvgkr ol tfzkghn.
\`\`\``,
        questions: [
          q(
            'password',
            'The decrypted message ends by revealing a hidden password. What is it?',
            'exact',
            '67671a2f53dd910a8b35840edb6a0a1e751ae5532178ca7f025b823eee317992',
            30,
            "Map the most common cipher letter to 'e', then work outwards. The password is one word."
          ),
        ],
      },
    ],
  },
  {
    id: 'xor-otp',
    title: 'XOR & the One-Time Pad',
    summary: "XOR is perfect — if the key is random, long, and never reused. Watch what happens when it isn't.",
    difficulty: 'Medium',
    estimatedMinutes: 15,
    tags: ['xor', 'one-time-pad', 'symmetric'],
    prerequisites: ['frequency-analysis'],
    tasks: [
      {
        id: 'recover',
        title: 'Recover the flag',
        bodyMarkdown: `# XOR and the one-time pad

Modern symmetric crypto is built on **XOR**. XOR each bit of the message with a
key bit: \`c = m ⊕ k\`. Because XOR is its own inverse, \`c ⊕ k = m\` — the same key
both encrypts and decrypts.

If the key is **truly random, as long as the message, and never reused**, this
is a **one-time pad** — provably unbreakable. The catch is practicality: you
need to securely share a key as long as everything you'll ever send. Reuse the
key, or use a short repeating key, and the guarantee collapses.

Here, a message was XOR'd with a **single repeating byte** — only 256
possibilities. Try all 256 keys and recover the flag:

\`\`\`
242e2325393a2d301d2b311d3027342730312b202e273f
\`\`\``,
        questions: [
          q(
            'flag',
            'Decrypt the hex above (single-byte XOR key). What is the flag?',
            'flag',
            '0d857849630d3e54c823c37aff13c235101a235f142c5f450bf6532edd889955',
            35,
            'Try all 256 keys and read the line that looks like flag{...}.'
          ),
        ],
      },
    ],
  },
];

export const PATHS: LearningPath[] = [
  {
    id: 'symmetric',
    title: 'Symmetric Cryptography',
    description:
      'One shared secret key. Learn the classic ciphers, then break them — Caesar, brute force, frequency analysis, and XOR/one-time pads.',
    roomIds: ['the-shift', 'brute-force', 'frequency-analysis', 'xor-otp'],
  },
];

export function getRoom(id: string): Room | undefined {
  return ROOMS.find((r) => r.id === id);
}

export function getPath(id: string): LearningPath | undefined {
  return PATHS.find((p) => p.id === id);
}

export function findQuestion(room: Room, taskId: string, questionId: string): RoomQuestion | undefined {
  const task = room.tasks.find((t) => t.id === taskId);
  return task?.questions.find((qq) => qq.id === questionId);
}

export function roomQuestionIds(room: Room): string[] {
  return room.tasks.flatMap((t) => t.questions.map((qq) => qq.id));
}
