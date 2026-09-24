import React from 'react';
import { ROOMS, type RoomId } from './pqRooms';

/** The same room directory in both renderers: one destination per room. */
export function FacilityNavigation({ roomId, onSelect, disabled = false }: {
  roomId: RoomId; onSelect: (room: RoomId) => void; disabled?: boolean;
}) {
  return <label className="absolute top-4 right-4 z-10 rounded-2xl bg-slate-950/90 text-white p-3 max-w-[220px]">
    <span className="block text-xs font-semibold mb-2">Explore facility</span>
    <select aria-label="Facility room" value={roomId} disabled={disabled}
      className="w-full rounded-lg bg-slate-800 text-white text-xs p-2 border border-slate-600"
      onChange={event => onSelect(event.target.value as RoomId)}>
      {ROOMS.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}
    </select>
  </label>;
}
