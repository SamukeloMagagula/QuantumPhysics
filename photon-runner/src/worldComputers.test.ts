import { describe, expect, it } from 'vitest';
import { WORLD_COMPUTERS, SIT_RANGE, appsFor, computerById, computerNear } from './worldComputers';
import { WORLD_ZONES, canStand, zoneAt } from './worldLayout';

describe('campus computers', () => {
  it('have unique ids and sit inside their own room', () => {
    expect(new Set(WORLD_COMPUTERS.map(c => c.id)).size).toBe(WORLD_COMPUTERS.length);
    for (const c of WORLD_COMPUTERS) {
      expect(zoneAt(c.seat)?.id).toBe(c.zone);
      expect(zoneAt(c.stand)?.id).toBe(c.zone);
    }
  });
  it('can be reached: the spot in front of every chair is open floor', () => {
    for (const c of WORLD_COMPUTERS) expect(canStand(c.stand), c.id).toBe(true);
  });
  it('offers the nearest free computer only within reach', () => {
    const desk = WORLD_COMPUTERS[0];
    expect(computerNear(desk.stand)?.id).toBe(desk.id);
    expect(computerNear({ x: desk.stand.x, y: desk.stand.y + SIT_RANGE + 20 })).toBeUndefined();
  });
  it('skips a computer someone else is using', () => {
    const desk = WORLD_COMPUTERS[0];
    expect(computerNear(desk.stand, new Set([desk.id]))?.id).not.toBe(desk.id);
  });
  it('lists the room\'s own program first', () => {
    for (const c of WORLD_COMPUTERS) {
      const own = WORLD_ZONES.find(z => z.id === c.zone)!.activity;
      const apps = appsFor(c);
      if (apps.some(a => a.activity === own)) expect(apps[0].activity).toBe(own);
    }
  });
  it('looks up by id and treats unknown seats as standing', () => {
    expect(computerById(WORLD_COMPUTERS[3].id)).toBe(WORLD_COMPUTERS[3]);
    expect(computerById('nowhere-9')).toBeUndefined();
    expect(computerById(null)).toBeUndefined();
  });
});
