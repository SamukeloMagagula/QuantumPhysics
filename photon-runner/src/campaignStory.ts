/**
 * The Phantom Q campaign — story engine.
 *
 * Implements the client's campaign bible: the Prologue ("First Shift at
 * Phantom Q") and the stage structure of the incidents that follow. Several
 * of their rules are load-bearing and are enforced here rather than left to
 * the UI, because getting them wrong would break the teaching:
 *
 *   - "EVE ≠ VILLAIN." Eve is authorised Phantom Q security support. She
 *     performs a legitimate credential test early, and later confirms that
 *     the suspicious activity is *not* hers. Accusing her is not a "wrong
 *     answer" — it is a claim the evidence does not support, and the game
 *     says so in those terms.
 *   - "The Prologue is evidence creation, not explanation." No CIA
 *     vocabulary, no encryption, no attacker, no method. Incident 01 names
 *     what the player has already lived through.
 *   - "Poor decisions create believable consequences, not generic wrong
 *     answer popups."
 *   - The learner must never be taught to type a real password. The
 *     credential step says so explicitly.
 *   - Information is role-specific: the player knows only what they have
 *     personally observed, which `knownFacts` tracks.
 *
 * Everything here is pure and serialisable, so the whole campaign can be
 * played and asserted in tests without a DOM.
 */

import { Exercise } from './campaignExercises';

export type ChapterId = 'prologue' | 'incident-01' | 'incident-02' | 'incident-03' | 'incident-04' | 'incident-05' | 'incident-06';

export type Speaker = 'system' | 'alice' | 'bob' | 'eve' | 'reception' | 'trainee' | 'workstation';

export const SPEAKER_NAMES: Record<Speaker, string> = {
  system: 'Phantom Q',
  alice: 'Alice',
  bob: 'Bob',
  eve: 'Eve',
  reception: 'Reception',
  trainee: 'You',
  workstation: 'Workstation 04',
};

/** Where in the HQ a beat takes place. Matches the canonical map. */
export type Area =
  | 'entrance'
  | 'reception'
  | 'central-ops'
  | 'training'
  | 'crypto'
  | 'communications'
  | 'soc'
  | 'red-team';

export const AREA_NAMES: Record<Area, string> = {
  entrance: 'Entrance',
  reception: 'Reception / ID',
  'central-ops': 'Central Operations',
  training: 'Training & Foundations',
  crypto: 'Cryptography Laboratory',
  communications: 'Communications',
  soc: 'Security Operations Centre',
  'red-team': 'Red Team Operations',
};

/** An option the player can take at a beat. */
export interface Choice {
  id: string;
  label: string;
  /** Shown after choosing — the consequence, in world terms. */
  outcome: string;
  /** Advances the story. A choice that does not advance is a detour the
   * player can take (and learn from) before continuing. */
  advances: boolean;
  /** Facts this choice establishes. */
  records?: string[];
  /** Evidence filed into the case. */
  evidence?: EvidenceItem;
  /** Marks the choice as an unsupported accusation — handled specially so
   * it reads as evidential discipline rather than a wrong answer. */
  unsupported?: boolean;
}

export interface EvidenceItem {
  id: string;
  label: string;
  detail: string;
}

/**
 * Where in the building a beat happens.
 *
 * Most of the campaign is desk work at Workstation 04. Hardware is not: the
 * capture chain is rebuilt at the equipment row, which means getting up and
 * walking there while the stage clock runs.
 */
export type Place = 'workstation' | 'rack';

export interface Beat {
  id: string;
  /** Defaults to the workstation when absent. */
  at?: Place;
  area: Area;
  speaker: Speaker;
  /** What is said or shown. */
  text: string;
  /** The contextual objective, if this beat sets one. */
  objective?: string;
  /** Player options. A beat with no choices is advanced by continuing. */
  choices?: Choice[];
  /** Facts established simply by reaching this beat. */
  records?: string[];
  evidence?: EvidenceItem;
  /** Areas unlocked on completing this beat. */
  unlocks?: Area[];
  /** Something the player must actually do before the beat will advance. */
  exercise?: Exercise;
}

export interface Chapter {
  id: ChapterId;
  title: string;
  subtitle: string;
  /** One-line statement of what this chapter is for. */
  purpose: string;
  beats: Beat[];
  /** Shown on the case board when the chapter completes. */
  endState?: { label: string; value: string }[];
}

// ---------------------------------------------------------------- prologue

const F1 = '01_LAYOUT.PNG';
const F2 = '02_REPORT.PDF';
const F3 = '03_ACCESS_SCHEDULE.XLSX';

const PROLOGUE: Chapter = {
  id: 'prologue',
  title: 'Prologue',
  subtitle: 'First Shift at Phantom Q',
  purpose:
    'Normal work, then something small feels wrong. Verify it, preserve what you know, and escalate. You are not expected to solve anything yet.',
  beats: [
    {
      id: 'arrival',
      area: 'entrance',
      speaker: 'system',
      objective: 'Report to Reception',
      text:
        'Phantom Q Headquarters. Staff move between the operations floor and the wings beyond; most of the doors past reception carry access readers. This is a working secure facility, and you are new here.',
    },
    {
      id: 'registration',
      area: 'reception',
      speaker: 'reception',
      text:
        'Welcome to Phantom Q. I will open a trainee profile for you. These are in-world training details only — nothing here touches your real account.',
      objective: 'Complete registration',
      records: ['I am a new Phantom Q trainee.'],
    },
    {
      id: 'credential',
      area: 'reception',
      speaker: 'system',
      objective: 'Create your Phantom Q training credential',
      text:
        'TRAINING ENVIRONMENT — Create a Phantom Q training credential. Use a fictional password. Do not enter or reuse a real password. This credential is an in-world security object; it will matter later.',
      evidence: {
        id: 'credential-created',
        label: 'Trainee credential created',
        detail: 'A Phantom Q training credential was created at Reception during onboarding.',
      },
      records: ['My training credential exists.'],
    },
    {
      id: 'eve-check',
      area: 'reception',
      speaker: 'eve',
      text:
        "I'm Eve — security support here. I run an authorised credential check on every new trainee: I verify your training credential works in the Phantom Q training environment. Routine, logged, and with your participation.",
      objective: 'Participate in the authorised credential test',
      choices: [
        {
          id: 'approve',
          label: 'Take part in the authorised test',
          outcome: 'LOGIN TEST: SUCCESS. SECURITY CHECK: COMPLETE. Eve records the test against her authorised activity log.',
          advances: true,
          records: [
            'My training credential works.',
            'Eve performed an authorised security test, and I saw what an authorised security action looks like.',
          ],
          evidence: {
            id: 'eve-authorised-test',
            label: 'Eve authorised credential test',
            detail: 'Authorised by Phantom Q Security. Completed at onboarding, with the trainee present.',
          },
        },
        {
          id: 'refuse',
          label: 'Decline — ask why security needs your credential',
          outcome:
            'Eve does not push back. She shows you the authorisation record and explains that the check is logged precisely so it can be told apart from activity that is not authorised. You take part once you have read it.',
          advances: true,
          records: [
            'My training credential works.',
            'Eve performed an authorised security test, and I saw what an authorised security action looks like.',
            'Authorised security activity is recorded so it can be distinguished later.',
          ],
          evidence: {
            id: 'eve-authorised-test',
            label: 'Eve authorised credential test',
            detail: 'Authorised by Phantom Q Security. Completed at onboarding, with the trainee present.',
          },
        },
      ],
    },
    {
      id: 'clearance',
      area: 'reception',
      speaker: 'system',
      text:
        'CLEARANCE: TRAINEE / BASIC. Your badge is active. Reception is open and Central Operations is limited. Training, Cryptography, Red Team and the Quantum wing stay locked — you can see them, but not enter.',
      objective: 'Pass through the access gate',
      unlocks: ['central-ops'],
    },
    {
      id: 'workstation',
      area: 'central-ops',
      speaker: 'workstation',
      text:
        'WORKSTATION 04 — USER: TRAINEE — STATUS: ACTIVE. This is your desk for the whole of your time here. Not a different machine each shift: this one.',
      objective: 'Log in to Workstation 04',
      records: ['Workstation 04 is my assigned workstation.'],
    },
    {
      id: 'alice-arrives',
      area: 'central-ops',
      speaker: 'alice',
      text:
        "Morning — I'm Alice. I need two files sent across to Bob; he's working remotely today. They're on this USB. Nothing complicated, just get them to him and confirm he has them.",
      objective: 'Inspect the USB',
      evidence: {
        id: 'usb-source',
        label: 'Alice USB — source record',
        detail: `Alice delivered ${F1} and ${F2} in person at Workstation 04.`,
      },
      records: ['Alice is the source of the files. Bob is the receiver.'],
    },
    {
      id: 'send-1',
      area: 'central-ops',
      speaker: 'bob',
      text: `${F1} — RECEIVED. Got it, thanks. Clean copy.`,
      objective: `Send ${F1} to Bob`,
      exercise: {
        kind: 'transfer',
        prompt: 'Alice asked for the layout first. Choose the file to send.',
        files: [
          { id: F1, label: F1, note: 'Floor layout · 2.1 MB' },
          { id: F2, label: F2, note: 'Site report · 840 KB' },
        ],
        correct: F1,
        wrongMessage:
          'That is not the file Alice asked for first. Bob receives it and sets it aside, and you now have a delivery on record that nobody requested — worth avoiding when the record is the point.',
      },
      evidence: {
        id: 'transfer-1',
        label: `${F1} — delivered`,
        detail: 'Sent from Workstation 04. Bob confirmed receipt.',
      },
    },
    {
      id: 'send-2',
      area: 'central-ops',
      speaker: 'bob',
      text: `${F2} — RECEIVED. That's both. All good on my side.`,
      objective: `Send ${F2} to Bob`,
      exercise: {
        kind: 'transfer',
        prompt: 'One left on the USB.',
        files: [
          { id: F1, label: F1, note: 'Already delivered' },
          { id: F2, label: F2, note: 'Site report · 840 KB' },
        ],
        correct: F2,
        wrongMessage: 'Bob already has that one. He confirms a duplicate and asks for the report instead.',
      },
      evidence: {
        id: 'transfer-2',
        label: `${F2} — delivered`,
        detail: 'Sent from Workstation 04. Bob confirmed receipt.',
      },
      records: ['Alice gives me a file, I send it, Bob receives it. That is the normal pattern.'],
    },
    {
      id: 'alice-returns',
      area: 'central-ops',
      speaker: 'alice',
      text:
        "Sorry — one more. I forgot the access schedule. Same as before, straight to Bob. It's the last one, I promise.",
      objective: `Accept ${F3}`,
      evidence: {
        id: 'usb-source-3',
        label: `${F3} — source record`,
        detail: `Alice delivered ${F3} in person at Workstation 04, after the first two transfers.`,
      },
    },
    {
      id: 'send-3-fail',
      area: 'central-ops',
      speaker: 'bob',
      text: "TRANSFER SENT — but nothing has arrived here. I haven't received anything.",
      objective: `Send ${F3} to Bob`,
      exercise: {
        kind: 'transfer',
        prompt: 'Alice has added a third file. Send it.',
        files: [
          { id: F1, label: F1, note: 'Already delivered' },
          { id: F2, label: F2, note: 'Already delivered' },
          { id: F3, label: F3, note: 'Access schedule · added just now' },
        ],
        correct: F3,
        wrongMessage: 'Bob already has that. It is the access schedule Alice just added that needs to go across.',
      },
      evidence: {
        id: 'transfer-3a',
        label: `${F3} — attempt 1: not received`,
        detail: 'Sent from Workstation 04. Bob reports no receipt.',
      },
      records: ['I sent the third file. Bob did not receive it.'],
    },
    {
      id: 'verify-source',
      area: 'central-ops',
      speaker: 'system',
      text: 'Bob has not received the file. Before sending it again, decide what to do.',
      objective: 'Decide how to respond',
      choices: [
        {
          id: 'check-alice',
          label: 'Check with Alice that this is the correct file',
          outcome:
            "Alice looks at the USB and confirms it: this is the access schedule she meant to send, and the copy on the USB is the one she prepared. You now have her confirmation on record before you try again.",
          advances: true,
          records: ['Alice confirmed her original file before the retry.'],
          evidence: {
            id: 'alice-confirm',
            label: 'Alice source confirmation',
            detail: `Alice confirmed ${F3} on the USB is her original, prior to the second transfer attempt.`,
          },
        },
        {
          id: 'retry-blind',
          label: 'Just send it again',
          outcome:
            'The transfer goes out again without reconfirming the source. It will still be possible to compare later, but you will not be able to show what the source looked like at this moment — the record simply is not there.',
          advances: true,
          records: ['I retried without reconfirming the source first.'],
        },
        {
          id: 'blame-eve',
          label: 'Report Eve — she was in your credential earlier',
          outcome:
            'CLAIM NOT SUPPORTED. Known: Eve performed an authorised credential test at onboarding. Unknown: whether anything unauthorised has happened at all. There is no file-transfer evidence connecting her to this, and no event to attribute yet. The report is not filed.',
          advances: false,
          unsupported: true,
        },
      ],
    },
    {
      id: 'send-3-altered',
      area: 'central-ops',
      speaker: 'bob',
      text: `${F3} — RECEIVED. Hold on. I have a file this time, but this doesn't look right to me.`,
      objective: `Send ${F3} again`,
      evidence: {
        id: 'transfer-3b',
        label: `${F3} — attempt 2: received, altered`,
        detail: 'Sent from Workstation 04. Bob confirmed receipt but reports the contents do not match.',
      },
    },
    {
      id: 'mismatch',
      area: 'central-ops',
      speaker: 'alice',
      text:
        "Let me see. No — that's not the version I gave you. Those aren't the details I put in the schedule. Where did that come from?",
      objective: 'Record the mismatch',
      evidence: {
        id: 'mismatch',
        label: 'Alice original ≠ Bob received',
        detail: `Alice confirms the copy Bob received differs from her original ${F3}.`,
      },
      records: ['The file Bob received does not match what Alice gave me.'],
    },
    {
      id: 'credential-anomaly',
      area: 'central-ops',
      speaker: 'workstation',
      text:
        'TRAINING CREDENTIAL ACTIVITY — LOGIN EVENT: UNRECOGNISED. STATUS: REQUIRES REVIEW. The notice names no user and no origin. It records only that an event occurred which does not match expected activity.',
      objective: 'Open the credential notice',
      evidence: {
        id: 'credential-anomaly',
        label: 'Unrecognised credential activity',
        detail: 'A login event against the trainee credential that does not match expected activity. Origin unknown.',
      },
      records: ['Something unusual also happened with my training credential.'],
    },
    {
      id: 'phish',
      area: 'central-ops',
      speaker: 'workstation',
      objective: 'Deal with the message in your inbox',
      text:
        'A message has arrived at Workstation 04 while you were checking the transfer. It is addressed to you by name and it is asking for your training credential.',
      exercise: {
        kind: 'phish',
        prompt: 'Examine the message before you do anything with it.',
        from: 'Phantom Q Security <security@phantomq-support.co.za>',
        subject: 'URGENT: credential re-verification required within 1 hour',
        body:
          'Following a security event on the network we must re-verify your trainee credential immediately. Reply to this message with your Phantom Q training username and password so the check can be completed. Accounts not verified within 1 hour will be suspended and your access badge deactivated.',
        tells: [
          {
            id: 'domain',
            label: 'Sender domain: phantomq-support.co.za',
            suspicious: true,
            why: 'Phantom Q security mail comes from the Phantom Q domain. This is a lookalike domain that merely resembles it.',
          },
          {
            id: 'asks-password',
            label: 'It asks you to send your password',
            suspicious: true,
            why: 'Eve ran her credential check with you present and never asked for your password. No legitimate security process needs it sent in a message.',
          },
          {
            id: 'urgency',
            label: 'One-hour deadline, with a threat to suspend access',
            suspicious: true,
            why: 'Manufactured time pressure exists to stop you verifying. That is the point of it.',
          },
          {
            id: 'addressed',
            label: 'It uses your name and knows you are a trainee',
            suspicious: false,
            why: 'Not a tell on its own — you registered at Reception today, and plenty of legitimate mail would know this.',
          },
          {
            id: 'security-topic',
            label: 'It refers to a real security event',
            suspicious: false,
            why: 'There genuinely is one. A message referencing something true is not thereby suspicious — it is what makes this one plausible.',
          },
        ],
        requiredTells: 3,
        correctAction: 'verify',
        actions: [
          {
            id: 'comply',
            label: 'Reply with your training credential',
            outcome:
              'You send it. Nothing appears to happen — no confirmation, no follow-up. That silence is the problem: your credential is now somewhere you cannot account for, on the same day an unrecognised login already appeared against it. Whatever the investigation concludes, you have made it harder.',
          },
          {
            id: 'verify',
            label: "Check it against Eve's authorised activity log",
            outcome:
              'Eve has no re-verification exercise open, and Phantom Q Security does not request credentials by message. The domain is a lookalike. The message goes to the incident, not the sender — and the habit that caught it is the one you learned this morning: authorised activity is logged, so check the log rather than the letterhead.',
          },
          {
            id: 'report',
            label: 'Forward it to the incident without reading it',
            outcome:
              'Filed — but with nothing attached about *why* it is suspicious. A report that says "this felt wrong" is much easier to set aside than one naming a lookalike domain and a credential request.',
          },
          {
            id: 'ignore',
            label: 'Delete it and carry on',
            outcome:
              'It is gone from your inbox and gone from the record. If the same message reached anyone else today, nobody now knows.',
          },
        ],
      },
      evidence: {
        id: 'phish-message',
        label: 'Credential request message',
        detail:
          'A message claiming to be Phantom Q Security requested the trainee credential. Lookalike sender domain, one-hour deadline. No authorised exercise explains it.',
      },
      records: [
        'Someone asked me for my training credential in a message that only looked like it came from security.',
      ],
    },
    {
      id: 'ask-eve',
      area: 'central-ops',
      speaker: 'system',
      text:
        'Eve ran an authorised credential test earlier today. The question worth asking is a narrow one: does her authorised activity account for this event?',
      objective: 'Decide what to do about the credential notice',
      choices: [
        {
          id: 'check-eve-record',
          label: "Ask Eve to check her authorised test record",
          outcome:
            'Eve pulls her log without hesitation. EARLIER CREDENTIAL TEST: COMPLETE. CURRENT ACTIVITY: NOT AUTHORISED — not hers, not scheduled, not part of any active test. So security activity exists, and it is not explained by the one authorised test we know about. That is as far as the evidence goes.',
          advances: true,
          records: [
            'The suspicious event was not part of Eve’s authorised activity.',
            'Security activity exists that nothing authorised explains — but we do not know who caused it.',
          ],
          evidence: {
            id: 'eve-not-explained',
            label: 'Eve authorised test does not explain the event',
            detail:
              'Eve’s authorised credential test is complete and logged. The current unrecognised activity is not part of it.',
          },
        },
        {
          id: 'accuse-eve',
          label: 'Conclude Eve is responsible — she had your credential',
          outcome:
            'CLAIM NOT SUPPORTED. Known: Eve performed an authorised earlier test, with you present. Known: current activity is unrecognised. Unknown: who caused it. Having performed an authorised test is not evidence of an unauthorised one — if anything it is the record that lets the two be told apart. Check her log instead of concluding from it.',
          advances: false,
          unsupported: true,
        },
        {
          id: 'ignore',
          label: 'Ignore it — the file problem matters more',
          outcome:
            'You set it aside. The incident report cannot be completed with an unreviewed security event attached to it, so this will have to be looked at before anything can be escalated.',
          advances: false,
        },
      ],
    },
    {
      id: 'escalate',
      area: 'central-ops',
      speaker: 'system',
      text:
        'You have enough to escalate, and not enough to solve. That is the correct position to be in. Phantom Q gathers what you can actually support and opens a case.',
      objective: 'Submit the incident report',
      unlocks: ['training'],
      records: ['I opened PQ-001. Something failed; the cause and the actor are unknown.'],
    },
  ],
  endState: [
    { label: F1, value: 'Delivered normally' },
    { label: F2, value: 'Delivered normally' },
    { label: F3, value: 'Attempt 1: not received · Attempt 2: received altered' },
    { label: 'Alice source', value: 'Confirmed' },
    { label: 'Bob destination', value: 'Mismatch confirmed' },
    { label: 'Credential activity', value: 'Suspicious — requires review' },
    { label: 'Eve authorised test', value: 'Does not explain current activity' },
    { label: 'Actor', value: 'UNKNOWN' },
    { label: 'Root cause', value: 'UNKNOWN' },
  ],
};

// -------------------------------------------------------------- incident 01

const INCIDENT_01: Chapter = {
  id: 'incident-01',
  title: 'Incident 01',
  subtitle: 'Understand the Incident',
  purpose:
    'Turn what you lived through into disciplined reasoning. Not "who attacked us" — what can we actually prove happened?',
  beats: [
    {
      id: 'i1-open',
      area: 'central-ops',
      speaker: 'system',
      text:
        'CLEARANCE UPDATED — TRAINING & FOUNDATIONS: ACCESS GRANTED. PQ-001 is open and assigned to you. The objective is not to solve it. It is to separate what you know from what you are assuming.',
      objective: 'Report to Training & Foundations',
      unlocks: ['training'],
    },
    {
      id: 'i1-reconstruct',
      area: 'training',
      speaker: 'system',
      text:
        'The incident table holds every event from PQ-001, unordered. Rebuild the sequence. Files 1 and 2 sit above the line as the normal baseline — the contrast is the point.',
      objective: 'Stage 1 — Reconstruct the timeline',
      exercise: {
        kind: 'order',
        prompt: 'Put the events in the order they happened.',
        baseline: [`${F1} — delivered normally`, `${F2} — delivered normally`],
        events: [
          { id: 'e1', label: 'Alice provides File 3' },
          { id: 'e2', label: 'Trainee sends File 3' },
          { id: 'e3', label: 'Bob receives nothing' },
          { id: 'e4', label: 'Trainee checks with Alice' },
          { id: 'e5', label: 'Alice confirms the source' },
          { id: 'e6', label: 'Trainee retries the transfer' },
          { id: 'e7', label: 'Bob receives File 3' },
          { id: 'e8', label: 'Bob reports a mismatch' },
          { id: 'e9', label: 'Credential anomaly reviewed' },
        ],
        constraints: [
          {
            before: 'e2',
            after: 'e3',
            message: 'SEQUENCE CONFLICT — Bob cannot report a missing transfer before the transfer occurs.',
          },
          {
            before: 'e6',
            after: 'e7',
            message: 'SEQUENCE CONFLICT — Bob cannot receive File 3 before it is sent a second time.',
          },
          {
            before: 'e4',
            after: 'e6',
            message: 'MISSING STEP — the retry cannot be evaluated without confirming the source first.',
          },
          {
            before: 'e7',
            after: 'e8',
            message: 'SEQUENCE CONFLICT — Bob cannot report a mismatch in a file he has not received.',
          },
          {
            before: 'e1',
            after: 'e2',
            message: 'SEQUENCE CONFLICT — the file cannot be sent before Alice provides it.',
          },
        ],
      },
    },
    {
      id: 'i1-fact-assumption',
      area: 'training',
      speaker: 'system',
      text:
        'Sort each statement by what the evidence actually supports. This board stays with the case for the rest of the investigation, so it is worth getting right.',
      objective: 'Stage 2 — Fact vs assumption',
      exercise: {
        kind: 'classify',
        prompt: 'Place every statement.',
        buckets: [
          { id: 'fact', label: 'FACT', hint: 'Directly evidenced' },
          { id: 'assumption', label: 'ASSUMPTION', hint: 'Plausible, unevidenced' },
          { id: 'unknown', label: 'UNKNOWN', hint: 'Not established either way' },
        ],
        items: [
          {
            id: 's1',
            text: 'Bob did not receive the first File 3 transfer.',
            bucket: 'fact',
            why: 'Bob reported it directly from the destination.',
          },
          {
            id: 's2',
            text: "The second copy differs from Alice's original.",
            bucket: 'fact',
            why: 'Alice and Bob compared their versions.',
          },
          {
            id: 's3',
            text: 'An unrecognised credential event occurred.',
            bucket: 'fact',
            why: 'The workstation raised it and Eve confirmed it was outside her authorised test.',
          },
          {
            id: 's4',
            text: 'Someone read the contents of File 3.',
            bucket: 'unknown',
            why: 'Nothing in evidence establishes whether the contents were viewed.',
          },
          {
            id: 's5',
            text: 'Eve changed the file.',
            bucket: 'assumption',
            why: 'There is no evidence establishing Eve as responsible — only that she ran an authorised test earlier.',
          },
          {
            id: 's6',
            text: 'The credential activity caused the File 3 problem.',
            bucket: 'unknown',
            why: 'Both happened. Correlation between them has not been proven.',
          },
        ],
      },
    },
    {
      id: 'i1-trace',
      area: 'training',
      speaker: 'system',
      text:
        'Source, transfer, receiver. Alice’s original is available and internally consistent, so a source error is not currently supported. Transfer 1 did not complete as expected; transfer 2 completed but the result was wrong.',
      objective: 'Stage 3 — Trace the evidence',
    },
    {
      id: 'i1-cia',
      area: 'training',
      speaker: 'system',
      text:
        'Three security properties. Judge each one against the evidence you have — and only against the evidence you have. A suspicious event does not mean every property failed.',
      objective: 'Stage 4 — Identify what failed',
      exercise: {
        kind: 'classify',
        prompt: 'Assess each property.',
        buckets: [
          { id: 'affected', label: 'AFFECTED', hint: 'Evidence shows it failed' },
          { id: 'question', label: 'IN QUESTION', hint: 'Cannot be established' },
          { id: 'intact', label: 'NOT AFFECTED', hint: 'Evidence shows it held' },
        ],
        items: [
          {
            id: 'availability',
            text: 'Availability — could an authorised user obtain the information when required?',
            bucket: 'affected',
            why: 'Bob was authorised to receive File 3 and could not obtain it on the first attempt.',
          },
          {
            id: 'integrity',
            text: 'Integrity — did the information remain accurate and unaltered?',
            bucket: 'affected',
            why: "The copy Bob received did not match Alice's original.",
          },
          {
            id: 'confidentiality',
            text: 'Confidentiality — was the information kept from unauthorised parties?',
            bucket: 'question',
            why: 'Tempting to call this failed, but there is no proof anyone read the contents. In question is as far as the evidence goes.',
          },
        ],
      },
    },
    {
      id: 'i1-identity',
      area: 'training',
      speaker: 'system',
      text:
        'A credential represents authority to act. Eve’s check was expected and authorised. The later event was neither. That makes the identity activity suspicious — not conclusively compromised.',
      objective: 'Stage 5 — Identity and access',
    },
    {
      id: 'i1-rack',
      at: 'rack',
      area: 'training',
      speaker: 'system',
      objective: 'Stage 5b — Rebuild the capture chain',
      text:
        'Before the identity evidence can be trusted it has to be captured properly. The training rack has been stripped; seat the modules so the chain runs in order — the line comes in, is split for monitoring, is timestamped, and only then is written to the log.',
      exercise: {
        kind: 'rack',
        prompt: 'Seat each module in the bay it belongs to.',
        slots: [
          {
            id: 'u1',
            label: 'U1 — line in',
            accepts: 'tap',
            why: 'The optical tap is what the incoming line lands on. Nothing downstream sees anything until it is seated here.',
          },
          {
            id: 'u2',
            label: 'U2 — monitoring split',
            accepts: 'splitter',
            why: 'The splitter has to sit after the tap and before the clock, or monitoring gets a copy of nothing.',
          },
          {
            id: 'u3',
            label: 'U3 — timing',
            accepts: 'clock',
            why: 'Events are timestamped before they are written. A log with no reliable clock cannot support a timeline, which is the whole point of Stage 1.',
          },
          {
            id: 'u4',
            label: 'U4 — capture',
            accepts: 'logger',
            why: 'The logger is the end of the chain. Put it earlier and it records events that have not been timestamped yet.',
          },
        ],
        modules: [
          { id: 'tap', label: 'Optical tap', detail: 'Passive line tap' },
          { id: 'splitter', label: 'Monitoring splitter', detail: '90/10 split' },
          { id: 'clock', label: 'Timing reference', detail: 'GPS-disciplined' },
          { id: 'logger', label: 'Capture logger', detail: 'Write-once store' },
        ],
      },
      records: ['A log without a reliable clock cannot support a timeline.'],
      evidence: {
        id: 'capture-chain',
        label: 'Capture chain rebuilt',
        detail: 'Training rack restored to tap → splitter → clock → logger, so identity events are timestamped before capture.',
      },
    },
    {
      id: 'i1-trust',
      area: 'training',
      speaker: 'system',
      text:
        'What can Phantom Q currently trust? Alice’s original, Bob’s report of what arrived, and Eve’s authorised log. What it cannot yet trust is the path between them.',
      objective: 'Stage 6 — Trust and verification',
      unlocks: ['crypto'],
    },
  ],
  endState: [
    { label: 'Timeline', value: 'Reconstructed' },
    { label: 'Confidentiality', value: 'In question' },
    { label: 'Integrity', value: 'Affected' },
    { label: 'Availability', value: 'Affected' },
    { label: 'Identity activity', value: 'Suspicious' },
    { label: 'Actor', value: 'STILL UNKNOWN' },
  ],
};

export const CHAPTERS: Chapter[] = [PROLOGUE, INCIDENT_01];

export function getChapter(id: ChapterId): Chapter | null {
  return CHAPTERS.find((c) => c.id === id) ?? null;
}

// ------------------------------------------------------------------- state

export interface CampaignState {
  chapter: ChapterId;
  beatIndex: number;
  /** Areas the player may enter. Reception and the entrance are always open. */
  unlocked: Area[];
  /** What the player has personally established — the information boundary. */
  knownFacts: string[];
  evidence: EvidenceItem[];
  /** Outcomes of choices already taken, newest last. */
  log: { beatId: string; choiceId: string; outcome: string }[];
  complete: boolean;
}

export function initialCampaign(): CampaignState {
  return {
    chapter: 'prologue',
    beatIndex: 0,
    unlocked: ['entrance', 'reception'],
    knownFacts: [],
    evidence: [],
    log: [],
    complete: false,
  };
}

export function currentBeat(s: CampaignState): Beat | null {
  const ch = getChapter(s.chapter);
  if (!ch) return null;
  return ch.beats[s.beatIndex] ?? null;
}

const addUnique = <T,>(list: T[], items: T[], keyOf: (t: T) => string): T[] => {
  const seen = new Set(list.map(keyOf));
  return [...list, ...items.filter((i) => !seen.has(keyOf(i)))];
};

/** Applies whatever a beat or choice establishes. */
function accrue(
  s: CampaignState,
  src: { records?: string[]; evidence?: EvidenceItem; unlocks?: Area[] }
): CampaignState {
  return {
    ...s,
    knownFacts: addUnique(s.knownFacts, src.records ?? [], (f) => f),
    evidence: addUnique(s.evidence, src.evidence ? [src.evidence] : [], (e) => e.id),
    unlocked: addUnique(s.unlocked, src.unlocks ?? [], (a) => a),
  };
}

/**
 * Move to the next beat, completing the chapter at the end.
 *
 * A chapter deliberately does *not* roll into the next one. Each chapter is
 * a stage (see campaignStages.ts), and the stage gate — clear this one to
 * unlock the next — is the progression mechanic. Chaining chapters here
 * would walk straight past that gate and past the timer's stage boundary.
 */
function step(s: CampaignState): CampaignState {
  const ch = getChapter(s.chapter);
  if (!ch) return s;
  const next = s.beatIndex + 1;
  if (next >= ch.beats.length) return { ...s, beatIndex: next, complete: true };
  return { ...s, beatIndex: next };
}

/** Advance a beat that has no choices. */
export function advance(s: CampaignState): CampaignState {
  const beat = currentBeat(s);
  if (!beat || beat.choices?.length) return s;
  return step(accrue(s, beat));
}

/**
 * Take a choice. An unsupported accusation records its outcome and holds
 * the player on the beat — deliberately not framed as a wrong answer, and
 * deliberately not blocking any other route forward.
 */
export function choose(s: CampaignState, choiceId: string): CampaignState {
  const beat = currentBeat(s);
  const choice = beat?.choices?.find((c) => c.id === choiceId);
  if (!beat || !choice) return s;

  const logged: CampaignState = {
    ...accrue(s, beat),
    log: [...s.log, { beatId: beat.id, choiceId: choice.id, outcome: choice.outcome }],
  };
  const withChoice = accrue(logged, choice);
  return choice.advances ? step(withChoice) : withChoice;
}

export function isUnlocked(s: CampaignState, area: Area): boolean {
  return s.unlocked.includes(area);
}

/** Progress through the current chapter, 0..1. */
export function chapterProgress(s: CampaignState): number {
  const ch = getChapter(s.chapter);
  if (!ch) return 0;
  return Math.min(1, s.beatIndex / ch.beats.length);
}
