import { describe, expect, it } from 'vitest';
import { canStandAt, isNearStation, OBSTACLES, ROOM_WIDTH, ROOM_DEPTH, SPAWN, STATION, DOOR_X_RANGE } from './cryptoLabLayout';

describe('the cryptography lab 3D pilot layout', () => {
  it('lets the player stand at the spawn point', () => {
    expect(canStandAt(SPAWN)).toBe(true);
  });

  it('keeps the player inside the room walls', () => {
    expect(canStandAt({ x: 0, z: 0 })).toBe(true);
    expect(canStandAt({ x: ROOM_WIDTH, z: 0 })).toBe(false);
    expect(canStandAt({ x: 0, z: -ROOM_DEPTH })).toBe(false);
  });

  it('blocks the player from standing inside an obstacle', () => {
    const [desk] = OBSTACLES;
    const center = { x: (desk.minX + desk.maxX) / 2, z: (desk.minZ + desk.maxZ) / 2 };
    expect(canStandAt(center)).toBe(false);
  });

  it('lets the player walk through the door opening', () => {
    const doorCenter = (DOOR_X_RANGE[0] + DOOR_X_RANGE[1]) / 2;
    expect(canStandAt({ x: doorCenter, z: ROOM_DEPTH / 2 + 0.5 })).toBe(true);
  });

  it('detects proximity to the station only within its hit radius', () => {
    expect(isNearStation(STATION)).toBe(true);
    expect(isNearStation({ x: STATION.x, z: STATION.z - STATION.hitRadius - 1 })).toBe(false);
  });
});
