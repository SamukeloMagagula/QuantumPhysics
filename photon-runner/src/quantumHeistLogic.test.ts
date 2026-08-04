import { describe, expect, it } from 'vitest';
import {
  CREW_SIZE,
  CRISIS_INFO,
  GameState,
  KILL_COOLDOWN,
  aliveCrew,
  aliveOf,
  botVote,
  callEmergency,
  canCompromise,
  canVote,
  castVote,
  checkOutcome,
  compromise,
  completeTask,
  createGame,
  eveOf,
  holdCrisisConsole,
  reportBody,
  resolveMeeting,
  startCrisis,
  tickCooldown,
  tickCrisis,
  votingComplete,
} from './quantumHeistLogic';

/** A game in play with the cooldown already burned off. */
function playing(): GameState {
  const s = createGame();
  return { ...s, phase: 'play', killCooldown: 0 };
}

const crewOf = (s: GameState) => s.operatives.filter((o) => o.role === 'crew');

describe('createGame', () => {
  it('seats six operatives with exactly one Eve', () => {
    for (let i = 0; i < 30; i++) {
      const s = createGame();
      expect(s.operatives).toHaveLength(CREW_SIZE);
      expect(s.operatives.filter((o) => o.role === 'eve')).toHaveLength(1);
      expect(s.operatives.every((o) => o.alive)).toBe(true);
    }
  });

  it('marks exactly one operative as you, and state.you points at them', () => {
    for (let i = 0; i < 30; i++) {
      const s = createGame();
      const mine = s.operatives.filter((o) => o.isYou);
      expect(mine).toHaveLength(1);
      expect(s.you).toBe(mine[0]);
    }
  });

  it('can seat the player as Eve', () => {
    expect(Array.from({ length: 80 }, () => createGame()).some((s) => s.you.role === 'eve')).toBe(true);
  });

  it('starts with a kill cooldown so Eve cannot open on a compromise', () => {
    expect(createGame().killCooldown).toBe(KILL_COOLDOWN);
  });
});

describe('tasks', () => {
  it('advances the shared key and wins the shift at 100%', () => {
    let s = playing();
    for (let i = 0; i < 8; i++) s = completeTask(s, 8);
    expect(s.keyProgress).toBeCloseTo(1);
    expect(s.phase).toBe('ended');
    expect(s.outcome).toMatchObject({ winner: 'crew', reason: 'key-established' });
  });

  it('never overshoots 100%', () => {
    let s = playing();
    for (let i = 0; i < 20; i++) s = completeTask(s, 8);
    expect(s.keyProgress).toBe(1);
  });

  it('does nothing outside play', () => {
    const s = createGame(); // briefing
    expect(completeTask(s, 8).keyProgress).toBe(0);
  });
});

describe('compromise', () => {
  it('is blocked while the cooldown is running', () => {
    const s = createGame();
    const eve = eveOf(s);
    const victim = crewOf(s)[0];
    expect(canCompromise({ ...s, phase: 'play' }, eve.id, victim.id)).toBe(false);
  });

  it('is allowed once the cooldown clears', () => {
    const s = playing();
    expect(canCompromise(s, eveOf(s).id, crewOf(s)[0].id)).toBe(true);
  });

  it('refuses to let crew compromise anyone', () => {
    const s = playing();
    const [a, b] = crewOf(s);
    expect(canCompromise(s, a.id, b.id)).toBe(false);
  });

  it('refuses to target Eve herself', () => {
    const s = playing();
    expect(canCompromise(s, eveOf(s).id, eveOf(s).id)).toBe(false);
  });

  it('downs the target, drops a node, and resets the cooldown', () => {
    const s = playing();
    const victim = crewOf(s)[0];
    const after = compromise(s, victim.id, { x: 3, z: -4 });
    expect(after.operatives.find((o) => o.id === victim.id)!.alive).toBe(false);
    expect(after.nodes).toHaveLength(1);
    expect(after.nodes[0]).toMatchObject({ id: victim.id, x: 3, z: -4, reported: false });
    expect(after.killCooldown).toBe(KILL_COOLDOWN);
  });

  it('raises channel noise — burning a key share leaves a scar', () => {
    const s = playing();
    const after = compromise(s, crewOf(s)[0].id, { x: 0, z: 0 });
    expect(after.channelNoise).toBeGreaterThan(s.channelNoise);
  });

  it('ends the game for Eve once she equals the remaining crew', () => {
    let s = playing();
    const crew = crewOf(s);
    // 5 crew vs 1 Eve -> compromise 4 leaves 1 v 1.
    for (let i = 0; i < 4; i++) {
      s = { ...compromise(s, crew[i].id, { x: 0, z: 0 }), killCooldown: 0 };
    }
    expect(aliveCrew(s)).toHaveLength(1);
    expect(s.phase).toBe('ended');
    expect(s.outcome).toMatchObject({ winner: 'eve', reason: 'outnumbered' });
  });
});

describe('reporting and meetings', () => {
  it('reporting a node opens a meeting and cancels any sabotage', () => {
    let s = playing();
    const victim = crewOf(s)[0];
    s = compromise(s, victim.id, { x: 1, z: 1 });
    s = startCrisis({ ...s, phase: 'play' }, 'keypurge', ['c1']);
    expect(s.crisis).not.toBeNull();

    s = reportBody(s, victim.id, eveOf(s).id);
    expect(s.phase).toBe('meeting');
    expect(s.crisis).toBeNull();
    expect(s.nodes[0].reported).toBe(true);
  });

  it('will not report the same node twice', () => {
    let s = playing();
    const victim = crewOf(s)[0];
    s = compromise(s, victim.id, { x: 1, z: 1 });
    s = reportBody(s, victim.id, eveOf(s).id);
    const again = reportBody({ ...s, phase: 'play' }, victim.id, eveOf(s).id);
    expect(again.phase).toBe('play');
  });

  it('limits each operative to one emergency alarm', () => {
    const s = playing();
    const caller = crewOf(s)[0];
    const first = callEmergency(s, caller.id);
    expect(first.phase).toBe('meeting');
    const second = callEmergency({ ...first, phase: 'play', meeting: null }, caller.id);
    expect(second.phase).toBe('play');
  });

  it('blocks the alarm while a sabotage is running', () => {
    const s = startCrisis(playing(), 'decoherence', ['a', 'b']);
    expect(callEmergency(s, crewOf(s)[0].id).phase).toBe('play');
  });

  it('lets only living operatives vote, once each', () => {
    let s = playing();
    const victim = crewOf(s)[0];
    s = compromise(s, victim.id, { x: 0, z: 0 });
    s = reportBody(s, victim.id, eveOf(s).id);

    expect(canVote(s, victim.id)).toBe(false);
    s = castVote(s, victim.id, 'skip');
    expect(s.meeting!.votes[victim.id]).toBeUndefined();

    const alive = aliveOf(s)[0];
    s = castVote(s, alive.id, 'skip');
    s = castVote(s, alive.id, aliveOf(s)[1].id); // second vote ignored
    expect(s.meeting!.votes[alive.id]).toBe('skip');
  });

  it('knows when every living operative has voted', () => {
    let s = playing();
    s = callEmergency(s, crewOf(s)[0].id);
    expect(votingComplete(s)).toBe(false);
    for (const o of aliveOf(s)) s = castVote(s, o.id, 'skip');
    expect(votingComplete(s)).toBe(true);
  });

  it('ejects a majority target and returns to play', () => {
    let s = playing();
    s = callEmergency(s, crewOf(s)[0].id);
    const target = crewOf(s)[1];
    for (const o of aliveOf(s)) s = castVote(s, o.id, target.id);
    s = resolveMeeting(s);
    expect(s.meeting!.result).toMatchObject({ ejected: target.id, wasEve: false });
    expect(s.operatives.find((o) => o.id === target.id)!.alive).toBe(false);
    expect(s.phase).toBe('play');
  });

  it('ejecting Eve wins it for the crew', () => {
    let s = playing();
    s = callEmergency(s, crewOf(s)[0].id);
    const eve = eveOf(s);
    for (const o of aliveOf(s)) s = castVote(s, o.id, eve.id);
    s = resolveMeeting(s);
    expect(s.meeting!.result).toMatchObject({ ejected: eve.id, wasEve: true });
    expect(s.phase).toBe('ended');
    expect(s.outcome).toMatchObject({ winner: 'crew', reason: 'eve-ejected' });
  });

  it('ejects nobody on a tie', () => {
    let s = playing();
    s = callEmergency(s, crewOf(s)[0].id);
    const alive = aliveOf(s);
    // Three votes each way.
    s = castVote(s, alive[0].id, alive[3].id);
    s = castVote(s, alive[1].id, alive[3].id);
    s = castVote(s, alive[2].id, alive[3].id);
    s = castVote(s, alive[3].id, alive[0].id);
    s = castVote(s, alive[4].id, alive[0].id);
    s = castVote(s, alive[5].id, alive[0].id);
    s = resolveMeeting(s);
    expect(s.meeting!.result!.ejected).toBeNull();
    expect(aliveOf(s)).toHaveLength(6);
  });

  it('ejects nobody when skip wins', () => {
    let s = playing();
    s = callEmergency(s, crewOf(s)[0].id);
    for (const o of aliveOf(s)) s = castVote(s, o.id, 'skip');
    s = resolveMeeting(s);
    expect(s.meeting!.result!.ejected).toBeNull();
    expect(s.phase).toBe('play');
  });

  it('resets the kill cooldown coming out of a meeting', () => {
    let s = playing();
    s = callEmergency(s, crewOf(s)[0].id);
    for (const o of aliveOf(s)) s = castVote(s, o.id, 'skip');
    s = resolveMeeting(s);
    expect(s.killCooldown).toBe(KILL_COOLDOWN);
  });
});

describe('sabotage', () => {
  it('requires every console to be held before it clears', () => {
    let s = startCrisis(playing(), 'decoherence', ['a', 'b']);
    expect(s.crisis!.required).toEqual(['a', 'b']);
    s = holdCrisisConsole(s, 'a');
    expect(s.crisis).not.toBeNull();
    s = holdCrisisConsole(s, 'b');
    expect(s.crisis).toBeNull();
  });

  it('ignores a console that is not part of the crisis', () => {
    const s = startCrisis(playing(), 'decoherence', ['a', 'b']);
    expect(holdCrisisConsole(s, 'zzz').crisis!.held).toHaveLength(0);
  });

  it('ignores holding the same console twice', () => {
    let s = startCrisis(playing(), 'decoherence', ['a', 'b']);
    s = holdCrisisConsole(s, 'a');
    s = holdCrisisConsole(s, 'a');
    expect(s.crisis!.held).toEqual(['a']);
  });

  it('will not start a second crisis on top of a running one', () => {
    const first = startCrisis(playing(), 'keypurge', ['a']);
    const second = startCrisis(first, 'decoherence', ['b', 'c']);
    expect(second.crisis!.kind).toBe('keypurge');
  });

  it('hands Eve the win when a timed crisis expires', () => {
    let s = startCrisis(playing(), 'keypurge', ['a']);
    s = tickCrisis(s, CRISIS_INFO.keypurge.seconds + 1);
    expect(s.phase).toBe('ended');
    expect(s.outcome).toMatchObject({ winner: 'eve', reason: 'crisis-expired' });
  });

  it('never expires the blackout — it only blinds until fixed', () => {
    let s = startCrisis(playing(), 'blackout', ['a']);
    s = tickCrisis(s, 9999);
    expect(s.phase).toBe('play');
    expect(s.crisis!.kind).toBe('blackout');
  });

  it('scrubs some channel noise when a crisis is repaired', () => {
    let s = startCrisis(playing(), 'keypurge', ['a']);
    const noisy = s.channelNoise;
    s = holdCrisisConsole(s, 'a');
    expect(s.channelNoise).toBeLessThan(noisy);
  });
});

describe('cooldown', () => {
  it('counts down but never goes negative', () => {
    let s: GameState = { ...createGame(), phase: 'play' };
    s = tickCooldown(s, 5);
    expect(s.killCooldown).toBe(KILL_COOLDOWN - 5);
    s = tickCooldown(s, 9999);
    expect(s.killCooldown).toBe(0);
  });
});

describe('checkOutcome', () => {
  it('reports nothing while the game is live', () => {
    expect(checkOutcome(playing())).toBeNull();
  });

  it('always names the real Eve, whoever won', () => {
    const s = playing();
    const finished = { ...s, keyProgress: 1 };
    expect(checkOutcome(finished)!.eveId).toBe(eveOf(s).id);
  });
});

describe('botVote', () => {
  it('never votes for itself', () => {
    const s = playing();
    for (const o of s.operatives) expect(botVote(s, o.id, {})).not.toBe(o.id);
  });

  it('crew bots follow suspicion when it is strong', () => {
    const s = playing();
    const voter = crewOf(s)[0];
    const target = crewOf(s)[1];
    expect(botVote(s, voter.id, { [target.id]: 100 }, () => 0)).toBe(target.id);
  });

  it('crew bots abstain rather than lynch at random with no evidence', () => {
    const s = playing();
    const voter = crewOf(s)[0];
    expect(botVote(s, voter.id, {}, () => 0)).toBe('skip');
  });

  it('an Eve bot never votes for herself and can skip to stay quiet', () => {
    const s = playing();
    const eve = eveOf(s);
    expect(botVote(s, eve.id, {}, () => 0.1)).toBe('skip');
    const accused = botVote(s, eve.id, {}, () => 0.9);
    expect(accused).not.toBe(eve.id);
  });
});
