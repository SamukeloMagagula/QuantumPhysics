import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ROOM3D_IDS, ROOM3D_SPECS, build3DRoom, type Facility3DRoomId } from './pqFacility3d';

/**
 * The ten rooms used to be reachable only from a "jump to room" dropdown.
 * They are now joined by real doorways, so the thing worth protecting is
 * that the doorways actually form one connected facility, and that walking
 * up to each one is what `doorAt` detects.
 */
describe('facility 3D door graph', () => {
  it('connects every room to every other room, starting from ops', () => {
    const graph = new Map<Facility3DRoomId, Facility3DRoomId[]>();
    for (const id of ROOM3D_IDS) graph.set(id, ROOM3D_SPECS[id].doors.map((d) => d.to));

    const seen = new Set<Facility3DRoomId>(['ops']);
    const queue: Facility3DRoomId[] = ['ops'];
    while (queue.length) {
      const next = graph.get(queue.shift()!) ?? [];
      for (const room of next) {
        if (!seen.has(room)) {
          seen.add(room);
          queue.push(room);
        }
      }
    }

    expect([...seen].sort()).toEqual([...ROOM3D_IDS].sort());
  });

  it('leads back the way it came, at least one hop deep', () => {
    // Every room but ops has exactly one door back toward the hub; that
    // door's destination must itself have a door returning the favour.
    for (const id of ROOM3D_IDS) {
      for (const door of ROOM3D_SPECS[id].doors) {
        const back = ROOM3D_SPECS[door.to].doors;
        expect(back.some((d) => d.to === id)).toBe(true);
      }
    }
  });

  it('detects standing in a doorway from the inside of each room', () => {
    for (const id of ROOM3D_IDS) {
      const scene = new THREE.Scene();
      const world = build3DRoom(scene, id);
      for (const door of ROOM3D_SPECS[id].doors) {
        const { w, d } = ROOM3D_SPECS[id];
        const [x, z] =
          door.wall === 'N' ? [door.at - w / 2, -d / 2] :
          door.wall === 'S' ? [door.at - w / 2, d / 2] :
          door.wall === 'W' ? [-w / 2, door.at - d / 2] :
          [w / 2, door.at - d / 2];
        expect(world.doorAt(x, z)).toBe(door.to);
      }
      world.dispose();
    }
  });

  it('has no door standing point outside its own room bounds', () => {
    for (const id of ROOM3D_IDS) {
      const { w, d } = ROOM3D_SPECS[id];
      for (const door of ROOM3D_SPECS[id].doors) {
        const lane = door.wall === 'N' || door.wall === 'S' ? w : d;
        expect(door.at - door.width / 2).toBeGreaterThanOrEqual(0);
        expect(door.at + door.width / 2).toBeLessThanOrEqual(lane);
      }
    }
  });
});
