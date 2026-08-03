import React from 'react';
import { MapDef } from '../games/lab/maps';

export interface MapBlip {
  id: string;
  x: number;
  z: number;
  color: string;
  /** Draws a white ring — used for "this is you". */
  isYou?: boolean;
}

export interface MapObjective {
  x: number;
  z: number;
  color: string;
  done?: boolean;
}

interface MinimapProps {
  map: MapDef;
  blips: MapBlip[];
  objectives?: MapObjective[];
}

const MAX_W = 132;
const MAX_H = 176;

/** Overhead schematic: rooms, outstanding objectives, and who is where. */
export function Minimap({ map, blips, objectives = [] }: MinimapProps) {
  // Fit the map's own playfield into the widget, preserving aspect ratio so
  // a wide map (Deep Cut) and a tall one (Greenhouse) both read correctly.
  const pf = map.playfield;
  const worldW = pf.xMax - pf.xMin;
  const worldH = pf.zMax - pf.zMin;
  const scale = Math.min(MAX_W / worldW, MAX_H / worldH);
  const MAP_W = worldW * scale;
  const MAP_H = worldH * scale;
  const toMapX = (worldX: number) => (worldX - pf.xMin) * scale;
  const toMapY = (worldZ: number) => (worldZ - pf.zMin) * scale;

  return (
    <div
      className="relative rounded-xl overflow-hidden glass"
      style={{ width: MAP_W, height: MAP_H }}
      aria-label="Lab minimap"
    >
      {map.rooms.map((room) => {
        const halfW = room.size.w / 2;
        const halfD = room.size.d / 2;
        const left = toMapX(room.center.x - halfW);
        const top = toMapY(room.center.z - halfD);
        const color = `#${room.color.toString(16).padStart(6, '0')}`;
        return (
          <div
            key={room.id}
            className="absolute border rounded-[3px]"
            style={{
              left,
              top,
              width: toMapX(room.center.x + halfW) - left,
              height: toMapY(room.center.z + halfD) - top,
              borderColor: `${color}66`,
              backgroundColor: `${color}1a`,
            }}
          />
        );
      })}

      {objectives.map((o, i) => (
        <div
          key={i}
          className={`absolute w-1.5 h-1.5 rounded-full ${o.done ? 'opacity-25' : 'animate-pulse'}`}
          style={{ left: toMapX(o.x) - 3, top: toMapY(o.z) - 3, backgroundColor: o.color }}
        />
      ))}

      {blips.map((b) => (
        <div
          key={b.id}
          className="absolute rounded-full transition-[left,top] duration-200 ease-linear"
          style={{
            left: toMapX(b.x) - (b.isYou ? 4 : 3),
            top: toMapY(b.z) - (b.isYou ? 4 : 3),
            width: b.isYou ? 8 : 6,
            height: b.isYou ? 8 : 6,
            backgroundColor: b.color,
            border: b.isYou ? '1.5px solid #fff' : '1px solid rgba(255,255,255,.45)',
            boxShadow: b.isYou ? '0 0 8px 2px rgba(255,255,255,.35)' : 'none',
          }}
        />
      ))}
    </div>
  );
}
