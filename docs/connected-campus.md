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
