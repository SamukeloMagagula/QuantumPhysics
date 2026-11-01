# Connected campus

The app now opens directly into one continuous, illustrated cutaway campus. All 14
departments from the former floor picker share the same coordinates, character,
camera and walkways. The separate Phantom Q entrance and the competing facility
renderers are no longer part of the app's navigation. Their source and artwork
remain in the repository.

Click a room, or use **Places** to find it, and the character walks through the
connecting corridors. WASD, arrow keys and the mobile joystick provide manual
movement. **Whole map** shows the campus; **Follow me** focuses on the character.
The **+ / −** controls, mouse wheel and two-finger pinch adjust zoom between
the full-campus fit and 250%. Zooming out gradually centers the camera on the
campus so the entire map fits at the minimum. Pinch gestures do not select rooms.
The location card opens that department's activity; E also opens it.

**Edit look** on the character badge opens the creator directly. It uses the
same illustrated character as the map for live front, side, back and walking
previews. Players can set skin tone, build, height, hairstyle and colour,
clothing, accessories, accent colours and a callsign. **Save appearance** applies
the draft and persists it in this browser; **Cancel** leaves the saved appearance
untouched. The creator also remains available from More and the Break Room.

Activities open in one shared panel. **Back to map** or Escape closes the panel
without replacing the world or resetting its position. Navigation to an activity
pauses movement. Mission consoles retain their current session when reopened,
and successful missions continue to use the existing saved progression.

`worldLayout.ts` owns the department directory, walkable areas and routing.
`WorldMap.tsx` renders the persistent world. `ActivityOverlay.tsx` supplies the
shared panel, keyboard focus handling and return action. Old scene IDs remain
accepted by App and lead into the same map.

## Generated artwork and exploration

The rooms now display the original nine generated illustrations from
`public/pq/rooms` and `public/pq/expansion-v1`, preserving their proportions.
`worldArtwork.ts` maps conservative clear-floor and entrance bounds to each
image. Operations and Briefing share Communications artwork; Analyst Bay uses
Security Operations; Break Room uses Cryptography; Cryptographic Core uses
Server Hall. These five departments do not yet have dedicated matching images.
No new images were generated or existing image files changed for this update.

The camera starts close to the character so room details remain visible.
Discovery tokens, mission beacons, a rank badge and an exploration bar provide
game feedback. Reaching a room's clear central floor awards 25 exploration XP
once. Completed story missions contribute 100 XP each to the displayed total.
Exploration persists across reloads; revisiting does not award duplicate XP.
Discovering all 14 departments earns the Campus Pathfinder rank.

The character now has shaded clothing, facial features, directional poses,
customization details and an animated walk cycle. Reduced-motion preferences
disable the walk animation. Movement checks a floor footprint around the feet
and sweeps long moves in short steps. Guided travel uses the actual center of
each illustrated doorway; its final step goes through the same collision checks
as manual movement. Walls and door jambs cannot be bypassed by snapping to a
route waypoint.

Validation: 710 tests across 69 files passed, including all 196 department-pair
routes and map persistence across activity navigation. TypeScript and the
production build passed. The optional Three.js activities still produce the
existing large-chunk build warning; the map itself does not require WebGL.

Chrome checks at desktop and phone sizes verified walking to Engineering,
opening and closing its activity without moving the character, completing the
first mission, and walking to the next assignment. Both reported no JavaScript
errors or horizontal page overflow.

After the artwork update, desktop and phone checks also verified that all
illustration assets load, the character can walk from Operations into
Cryptography, and both discoveries persist in local storage. Neither viewport
reported JavaScript errors or horizontal overflow.

## Compact building layout

Superseded by the continuous interior below; retained as implementation history.

Neighbouring room tiles now touch, with a narrow central hallway between the
two wings. Short shared corridors replace the long connections between rows.
The building backdrop, camera fitting and exploration log use the compact
rectangular bounds. Door-only movement and collision checks remain in place.

Validation for this layout: all 11 targeted layout/navigation tests passed,
including every one of the 196 department-pair routes and doorway collision
checks. TypeScript and the production build passed. Chrome checks at 1440px
and 390px widths confirmed whole-map rendering without JavaScript errors or
horizontal overflow. The existing large-chunk build warning remains.

## Continuous interior and cafeteria

The current map uses one generated raster interior,
`public/pq/discovery-building-v1.png`, replacing the temporary SVG furnishings.
It depicts shared partition walls, indoor corridors and distinct department
furniture inside one outer shell. Original image assets remain available for
legacy scenes. The generation prompt is saved in `building-art-prompt.md`.
The complete artwork is 1373 x 1146 pixels; actual room bounds, clear floor
bands and door openings were traced in `worldLayout.ts` after generation.

A fifteenth room, the Cafeteria, includes a serving counter, dining tables and
seating. It is reachable through Places and manual movement, awards discovery
XP, and offers the character customization activity. Exploration totals and
the Pathfinder threshold follow the room count. Interior collision geometry
is independent of the former image bounds; `worldArtwork.ts` has been removed.
Each room's bounds, floor band, door and corridor row live in one table in
`worldLayout.ts`. The Cafeteria is a map-only place (`CampusZoneId`), not a
scene `RoomId`. The badge shows the callsign alongside the explorer rank.

Validation: 15 targeted tests passed, covering all 225 room-pair routes,
shared partition walls, door openings, exploration and activity navigation.
TypeScript and production build passed. Desktop (1440px) and phone (390px)
Chrome checks reached the cafeteria and showed no JavaScript errors or
horizontal overflow. The existing large-chunk warning remains.
