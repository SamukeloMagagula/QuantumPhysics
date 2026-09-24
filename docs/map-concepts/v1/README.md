# Map artwork concepts — first pass

Generated with the built-in image generation tool, using `photon-runner/public/pq/facility-master.jpg` as an architectural style reference.

## Saved concepts

Additional images and exact prompts: [Communications, SOC, Engineering and Quantum Wing](MORE-ROOMS.md).

- [Cryptography lab](cryptography-lab.png): subsection interior with perimeter workstations, a central walkable floor and entrance corridor.
- [Door states](door-states.png): closed/open architectural study with access-reader indicators.

These are concept assets, not runtime replacements. The game still uses the existing map. No collision coordinates or interaction anchors have been derived from these concepts yet. The two door panels need pixel registration and separate transparent overlays before use as an animation or state swap.

## Proposed playable asset structure

Keep the facility overview as the navigation hub. Open detailed subsection scenes at actual door approaches, with a return doorway that restores the correct arrival position.

For each subsection, author:
1. A background with no people, gameplay labels, lock icons or moving door leaves baked in.
2. Walkable floor polygons, obstacle footprints, spawn and doorway approaches in normalized coordinates traced against the final image.
3. Foreground furniture and wall overlays, precisely registered against the background, for character occlusion.
4. Door-frame and door-leaf overlays: closed, opening and open states with identical canvas dimensions and a shared hinge anchor.
5. Interaction anchors for workstations, consoles and equipment. Draw names, prompts and access indicators in code.

Door rendering and collision must share a state: locked/closed blocks the opening; fully open permits passage. An unlocked connector also needs to be included in the walkable floor geometry, not merely removed from the obstacle list. Verify passage and destination spawn in tests before wiring it into navigation.

Generate subsections one at a time against the same approved camera and material reference. Suggested sequence: cryptography lab, communications centre, SOC, engineering workshop, quantum wing, training room. Prototype one complete room and doorway before expanding the set.

## Validation before integration

- Match the camera, tile scale and door height across adjoining assets.
- Ensure a player-sized route connects each entrance, exit and station.
- Check door registration and opening direction; this concept sheet is not a guaranteed frame-aligned atlas.
- Remove baked-in people and gameplay UI from final art.
- Test actor depth ordering at furniture, thresholds and wall edges.
- Keep original artwork and save new versions alongside it.

## Exact generation prompts

### Cryptography lab

Use case: stylized-concept. Asset type: concept background for a subsection of an existing 2D educational exploration game. Input image: reference only for the facility architecture, materials, palette and elevated cutaway camera; do not edit or reproduce the whole facility. Create ONE detailed CRYPTOGRAPHY LAB interior viewed from the same elevated, nearly orthographic front-facing cutaway angle as the reference. Wide landscape composition. A believable modest research room: off-white walls, pale square floor tiles, dark server cabinets along the back left wall, an electronics workbench and two blue monitors against the back wall, a small optical experiment bench on the right, and a clearly open doorway in the front wall connecting to a short corridor. The front wall is cut away so the generous central walkable floor remains completely visible. Furnishings around the perimeter, clear uninterrupted routes between entrance and stations, no objects blocking passage. Match the reference's grounded polished architectural game illustration, soft neutral lighting, restrained blue screen glow, realistic proportions, readable silhouettes. The lab should fill the frame with a small clean margin. No people, no baked-in labels, no letters or text, no logos, no padlock icons, no arrows, no UI. This is a standalone subsection concept, not an exact-position replacement of the reference master.

### Door states

Use case: stylized-concept. Asset type: a two-panel architectural game doorway state CONCEPT SHEET, not a finished animation atlas. Input image is a style reference for this facility's off-white walls, pale floor tiles, wooden security doors with small glazed windows, and elevated front-facing near-orthographic cutaway camera. Create a wide landscape sheet with exactly TWO equal panels separated by a broad blank white gutter. Each panel depicts the SAME compact wall section and doorway at precisely the same scale, camera, lighting and framing; show a strip of tiled floor in front and beyond the doorway. LEFT PANEL: door fully closed, brushed metal handle and unobtrusive keycard reader alongside the frame with a tiny red indicator. RIGHT PANEL: same door hinged open about 95 degrees, clearly revealing a traversable empty opening and the continuation of pale tiled corridor beyond, reader has a tiny green indicator. Keep the door frame, wall segment, threshold, camera and floor grid consistent between panels. Grounded high-quality architectural game illustration, restrained realistic materials, soft neutral shadows, matching the existing facility. Single doorway in each panel. No text, no labels, no people, no furniture, no logos, no icons, no UI, no extra panels or camera angles. White background outside the small wall-and-floor study. Make the open state legible and functional with no door slab floating in the passage.
