import { describe, expect, it } from 'vitest';
import {
  CHAPTERS,
  CampaignState,
  advance,
  choose,
  chapterProgress,
  currentBeat,
  getChapter,
  initialCampaign,
  isUnlocked,
} from './campaignStory';

/**
 * These guard the client's narrative rules, not just the plumbing. Several
 * of them ("Eve is not the villain", "no security vocabulary in the
 * Prologue") are the difference between teaching evidence discipline and
 * teaching the player to jump to conclusions.
 */

/** Play straight through, always taking the first advancing choice. */
function playThrough(limit = 200): CampaignState {
  let s = initialCampaign();
  for (let i = 0; i < limit; i++) {
    const beat = currentBeat(s);
    if (!beat) break;
    if (beat.choices?.length) {
      const first = beat.choices.find((c) => c.advances);
      if (!first) break;
      s = choose(s, first.id);
    } else {
      s = advance(s);
    }
    if (s.complete) break;
  }
  return s;
}

describe('campaign structure', () => {
  it('starts in the Prologue at the entrance', () => {
    const s = initialCampaign();
    expect(s.chapter).toBe('prologue');
    expect(currentBeat(s)?.area).toBe('entrance');
  });

  it('gives every beat an area and a speaker', () => {
    for (const ch of CHAPTERS) {
      for (const b of ch.beats) {
        expect(b.area, `${ch.id}/${b.id}`).toBeTruthy();
        expect(b.speaker, `${ch.id}/${b.id}`).toBeTruthy();
        expect(b.text.length, `${ch.id}/${b.id}`).toBeGreaterThan(20);
      }
    }
  });

  it('uses unique beat ids within a chapter', () => {
    for (const ch of CHAPTERS) {
      expect(new Set(ch.beats.map((b) => b.id)).size).toBe(ch.beats.length);
    }
  });

  it('plays from the entrance to the end of the written chapters', () => {
    const s = playThrough();
    expect(s.complete).toBe(true);
  });
});

describe('the information boundary', () => {
  it('knows nothing at the start', () => {
    expect(initialCampaign().knownFacts).toEqual([]);
  });

  it('never names the attacker, the method, or any security vocabulary in the Prologue', () => {
    // The client's rule: "The Prologue is evidence creation, not
    // explanation." Incident 01 is where these words are allowed to appear.
    const prologue = getChapter('prologue')!;
    const corpus = prologue.beats
      .flatMap((b) => [b.text, ...(b.choices ?? []).flatMap((c) => [c.label, c.outcome])])
      .join(' ')
      .toLowerCase();
    for (const banned of [
      'man-in-the-middle',
      'malware',
      'encryption',
      'decrypt',
      'confidentiality',
      'integrity',
      'availability',
      'ip address',
      'relay',
      'phantom identity',
    ]) {
      expect(corpus.includes(banned), `Prologue leaks "${banned}"`).toBe(false);
    }
  });

  it('records the normal baseline before the anomaly', () => {
    let s = initialCampaign();
    const seen: string[] = [];
    for (let i = 0; i < 40; i++) {
      const b = currentBeat(s);
      if (!b) break;
      seen.push(b.id);
      if (b.id === 'send-3-fail') break;
      s = b.choices?.length ? choose(s, b.choices.find((c) => c.advances)!.id) : advance(s);
    }
    expect(seen.indexOf('send-1')).toBeLessThan(seen.indexOf('send-3-fail'));
    expect(seen.indexOf('send-2')).toBeLessThan(seen.indexOf('send-3-fail'));
    expect(s.knownFacts.some((f) => f.includes('normal pattern'))).toBe(true);
  });

  it('warns against reusing a real password when the credential is created', () => {
    const beat = getChapter('prologue')!.beats.find((b) => b.id === 'credential')!;
    expect(beat.text.toLowerCase()).toContain('do not enter or reuse a real password');
  });
});

describe('Eve is not the villain', () => {
  it('offers accusing Eve, and refuses it as unsupported rather than wrong', () => {
    const beat = getChapter('prologue')!.beats.find((b) => b.id === 'ask-eve')!;
    const accuse = beat.choices!.find((c) => c.id === 'accuse-eve')!;
    expect(accuse.unsupported).toBe(true);
    expect(accuse.advances).toBe(false);
    expect(accuse.outcome).toContain('CLAIM NOT SUPPORTED');
    // It must explain the evidential position, not simply scold.
    expect(accuse.outcome.toLowerCase()).toContain('unknown');
  });

  it('does not let an accusation advance the story or record a fact', () => {
    let s = initialCampaign();
    for (let i = 0; i < 40 && currentBeat(s)?.id !== 'ask-eve'; i++) {
      const b = currentBeat(s)!;
      s = b.choices?.length ? choose(s, b.choices.find((c) => c.advances)!.id) : advance(s);
    }
    const before = s.beatIndex;
    const factsBefore = s.knownFacts.length;
    s = choose(s, 'accuse-eve');
    expect(s.beatIndex, 'accusation advanced the story').toBe(before);
    expect(s.knownFacts.length, 'accusation recorded a fact').toBe(factsBefore);
    expect(s.log[s.log.length - 1].outcome).toContain('CLAIM NOT SUPPORTED');
  });

  it('lets the player recover and take the supported route afterwards', () => {
    // An unsupported claim must not dead-end the campaign.
    let s = initialCampaign();
    for (let i = 0; i < 40 && currentBeat(s)?.id !== 'ask-eve'; i++) {
      const b = currentBeat(s)!;
      s = b.choices?.length ? choose(s, b.choices.find((c) => c.advances)!.id) : advance(s);
    }
    s = choose(s, 'accuse-eve');
    s = choose(s, 'check-eve-record');
    expect(currentBeat(s)?.id).toBe('escalate');
    expect(s.knownFacts.some((f) => f.includes('not part of Eve'))).toBe(true);
  });

  it('clears Eve for the specific event without clearing the event itself', () => {
    const s = playThrough();
    expect(s.evidence.some((e) => e.id === 'eve-authorised-test')).toBe(true);
    expect(s.evidence.some((e) => e.id === 'eve-not-explained')).toBe(true);
    // The actor stays unknown — the Prologue must not resolve it.
    const ends = getChapter('prologue')!.endState!;
    expect(ends.find((e) => e.label === 'Actor')?.value).toBe('UNKNOWN');
    expect(ends.find((e) => e.label === 'Root cause')?.value).toBe('UNKNOWN');
  });
});

describe('evidence and consequences', () => {
  it('files the full PQ-001 evidence chain on a careful playthrough', () => {
    const s = playThrough();
    for (const id of [
      'credential-created',
      'eve-authorised-test',
      'usb-source',
      'transfer-1',
      'transfer-2',
      'transfer-3a',
      'alice-confirm',
      'transfer-3b',
      'mismatch',
      'credential-anomaly',
      'eve-not-explained',
    ]) {
      expect(s.evidence.some((e) => e.id === id), `missing evidence ${id}`).toBe(true);
    }
  });

  it('leaves weaker evidence when the player retries without checking the source', () => {
    // The client's rule: poor decisions create believable consequences. The
    // transfer still happens; what is lost is the source confirmation.
    let s = initialCampaign();
    for (let i = 0; i < 40 && currentBeat(s)?.id !== 'verify-source'; i++) {
      const b = currentBeat(s)!;
      s = b.choices?.length ? choose(s, b.choices.find((c) => c.advances)!.id) : advance(s);
    }
    s = choose(s, 'retry-blind');
    expect(s.evidence.some((e) => e.id === 'alice-confirm')).toBe(false);
    expect(currentBeat(s)?.id).toBe('send-3-altered'); // story still proceeds
  });

  it('does not advance when the credential notice is ignored', () => {
    let s = initialCampaign();
    for (let i = 0; i < 40 && currentBeat(s)?.id !== 'ask-eve'; i++) {
      const b = currentBeat(s)!;
      s = b.choices?.length ? choose(s, b.choices.find((c) => c.advances)!.id) : advance(s);
    }
    const before = s.beatIndex;
    s = choose(s, 'ignore');
    expect(s.beatIndex).toBe(before);
    expect(s.log[s.log.length - 1].outcome).toContain('cannot be completed');
  });
});

describe('clearance', () => {
  it('starts with only the entrance and reception open', () => {
    const s = initialCampaign();
    expect(isUnlocked(s, 'reception')).toBe(true);
    expect(isUnlocked(s, 'central-ops')).toBe(false);
    expect(isUnlocked(s, 'training')).toBe(false);
  });

  it('opens Central Operations only once clearance is issued', () => {
    let s = initialCampaign();
    while (currentBeat(s) && currentBeat(s)!.id !== 'clearance') {
      const b = currentBeat(s)!;
      s = b.choices?.length ? choose(s, b.choices.find((c) => c.advances)!.id) : advance(s);
    }
    expect(isUnlocked(s, 'central-ops')).toBe(false);
    s = advance(s);
    expect(isUnlocked(s, 'central-ops')).toBe(true);
  });

  it('unlocks Training only after PQ-001 is filed', () => {
    const s = playThrough();
    expect(isUnlocked(s, 'training')).toBe(true);
  });
});

describe('chapterProgress', () => {
  it('runs from 0 toward 1 across a chapter', () => {
    const s = initialCampaign();
    expect(chapterProgress(s)).toBe(0);
    expect(chapterProgress({ ...s, beatIndex: getChapter('prologue')!.beats.length })).toBe(1);
  });
});
