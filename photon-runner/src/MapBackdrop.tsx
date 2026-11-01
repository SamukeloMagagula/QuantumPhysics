import React, { memo } from 'react';
import type { CampusZoneId } from './worldLayout';
import { WORLD_ART, WORLD_HEIGHT, WORLD_WIDTH, WORLD_ZONES, centerOf, doorX, type WorldZone } from './worldLayout';

/**
 * The building artwork and its room labels. Memoised: it only redraws when a
 * room's state changes, not on every frame the player or anyone else moves.
 * `onSelect` must be stable (it is read from a ref by the caller).
 */
export const MapBackdrop = memo(function MapBackdrop({ explored, missionRoom, currentRoom, focusable, onSelect }: {
  explored: readonly CampusZoneId[];
  missionRoom?: string;
  currentRoom?: CampusZoneId;
  focusable: boolean;
  onSelect: (zone: WorldZone) => void;
}) {
  return (
    <>
      <rect x="-4000" y="-4000" width="10000" height="10000" fill="#eeefee" />
      <image href={WORLD_ART} x="0" y="0" width={WORLD_WIDTH} height={WORLD_HEIGHT} aria-label="Detailed connected building interior" />
      {WORLD_ZONES.map((zone, i) => {
        const visited = explored.includes(zone.id);
        const mission = missionRoom === zone.id;
        const centre = centerOf(zone);
        return (
          <g
            key={zone.id}
            className="world-zone"
            role="button"
            tabIndex={focusable ? 0 : -1}
            aria-label={`Walk to ${zone.name}`}
            onClick={() => onSelect(zone)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(zone);
              }
            }}
          >
            <title>
              {zone.name} — {visited ? 'Discovered' : 'Explore for 25 XP'} — {zone.action}
            </title>
            <rect className="world-room-outline" x={zone.x + 1} y={zone.y + 1} width={zone.width - 2} height={zone.height - 2} fill="transparent" stroke="transparent" />
            <g transform={`translate(${zone.x + 8} ${zone.y + 1})`}>
              <rect width="238" height="19" rx="4" fill={currentRoom === zone.id ? '#183744' : '#314650'} />
              <rect width="24" height="19" rx="4" fill={mission ? '#e9b95e' : visited ? '#54b8a5' : '#536872'} />
              <text x="12" y="13" textAnchor="middle" fill={visited || mission ? '#142b37' : '#e8eef0'} fontSize="8" fontWeight="800">
                {String(i + 1).padStart(2, '0')}
              </text>
              <text x="31" y="13" fill="#f2f6f7" fontSize="9" fontWeight="650">
                {zone.short}
              </text>
              <text x="225" y="13" textAnchor="end" fill={mission ? '#f4cb76' : '#77d4c1'} fontSize="9">
                {mission ? '◆' : visited ? '✓' : '+'}
              </text>
            </g>
            {!visited && (
              <g className="world-discovery-token" transform={`translate(${centre.x + 20} ${centre.y})`}>
                <ellipse cy="6" rx="7" ry="3" fill="#263942" opacity=".15" />
                <path d="M0-12L7-7V1L0 6L-7 1V-7Z" fill="#f2c467" stroke="#fff2c9" strokeWidth="1" />
                <path d="M-3-3H3M0-6V0" stroke="#795623" strokeWidth="1.3" />
              </g>
            )}
            {mission && (
              <g className="world-mission-beacon" transform={`translate(${doorX(zone)} ${zone.y + zone.height + 7})`}>
                <ellipse rx="12" ry="4" fill="#e9b95e" opacity=".25" />
                <path d="M-4-7L0-3L4-7" fill="none" stroke="#b58830" strokeWidth="2" />
              </g>
            )}
          </g>
        );
      })}
    </>
  );
});
