import { beforeEach, expect, it } from 'vitest';
import { ASSIGNMENTS, completeAssignment, readFacilityStory, saveFacilityStory } from './facilityStory';
import { createSession, TARGETS } from './qkdAttack';

beforeEach(() => localStorage.clear());
it('requires a card and a successful extraction in the assigned room', () => {
  const progress = { access: true, completed: 0 };
  const session = { ...createSession(TARGETS[0]), round: 1000, sifted: 500, stolen: 200, status: 'extracted' as const };
  expect(completeAssignment({ access: false, completed: 0 }, session, 'ops').completed).toBe(0);
  expect(completeAssignment(progress, session, 'comms-centre')).toBe(progress);
  expect(completeAssignment(progress, { ...session, status: 'caught' }, 'ops')).toBe(progress);
  expect(completeAssignment(progress, { ...session, stolen: 20 }, 'ops')).toBe(progress);
  expect(completeAssignment(progress, session, 'ops').completed).toBe(1);
  expect(completeAssignment({ access: true, completed: 1 }, session, 'ops').completed).toBe(1);
});
it('progresses through all assignments without crediting a replay twice', () => {
  let progress = { access: true, completed: 0 };
  for (const assignment of ASSIGNMENTS) {
    const target = TARGETS.find(t => t.id === assignment.target)!;
    const session = { ...createSession(target), round: 1000, sifted: 500, stolen: 500, status: 'extracted' as const };
    progress = completeAssignment(progress, session, assignment.room);
    expect(completeAssignment(progress, session, assignment.room)).toBe(progress);
  }
  expect(progress.completed).toBe(4);
});
it('credits a successful natural ending and rejects a short lucky capture', () => {
  const progress = { access: true, completed: 0 };
  const session = { ...createSession(TARGETS[0]), round: 4000, sifted: 2000, stolen: 2000, status: 'exhausted' as const };
  expect(completeAssignment(progress, session, 'ops').completed).toBe(1);
  expect(completeAssignment(progress, { ...session, round: 100, status: 'extracted' }, 'ops')).toBe(progress);
});
it('restores progress and safely handles invalid saved state', () => {
  expect(readFacilityStory()).toEqual({ access: false, completed: 0 });
  saveFacilityStory({ access: true, completed: 2 });
  expect(readFacilityStory()).toEqual({ access: true, completed: 2 });
  localStorage.setItem('photon-runner:facility-story:v1', '{broken');
  expect(readFacilityStory()).toEqual({ access: false, completed: 0 });
});
