Generated with the built-in image generation tool. Saved asset:
`photon-runner/public/pq/discovery-building-v1.png`.

The generated artwork was inspected and its actual door, furniture and room
positions traced in `worldLayout.ts`; those measured coordinates take precedence
over the requested coordinates below. Original room illustrations are retained.

## Final generation prompt

Use case: stylized-concept.
Asset type: production game map background, one seamless building interior, landscape aspect 1076:899, at least 2048 pixels wide.
Input image 1 is a reference for detailed polished rendered room materials, desks, screens, lighting. Input image 2 is the EXACT FLOOR PLAN reference only: recreate its building area without any surrounding webpage UI, player, labels, tokens or interface.
Primary request: detailed beautiful 3D-rendered top-down cutaway of ONE connected science discovery building, fifteen distinct rooms sharing interior partition walls, indoor tiled corridors, cafeteria. No separate buildings or outdoor roads. Orthographic straight overhead camera, axis aligned horizontal/vertical walls, no perspective taper. Match the floor plan proportions exactly.
Layout in normalized design coordinates 1076 wide by 899 high: outer shell bounds x14..1062 y12..887. Room width250 height184.667. Four room columns start x20,270,556,806. Central indoor vertical corridor x520..556. Four room rows start y20,234.667,449.334,664.001. Each row has a 30-wide horizontal indoor corridor immediately below the rooms. Adjacent rooms have SHARED walls and no margins or exterior facades. Each room has ONE OPEN doorway in its bottom wall spanning local x107.5..142.5. Preserve these door openings. Floor extends continuously through doors into halls, no steps, no porches.
Room identities left to right:
row1 Operations command screens; Cryptography lab with cipher equipment; Communications radio consoles; Security operations monitor desks.
row2 Engineering tool benches; Quantum optics laser bench; Analyst computer workstations; Briefing meeting table.
row3 Break room sofas; Cryptographic core computer cabinets; Server hall dark racks; Cryogenics tanks and instruments.
row4 Secure archive storage cabinets; Power control electrical consoles; CAFETERIA warm wood serving counter food trays coffee station and three dining tables with seats; last cell is a quiet lobby information area.
Critical gameplay constraints: keep all room furniture confined to the TOP 35 percent of each room and thin strips along side walls. Lower 60 percent of every room must remain clear walkable tile floor with fine textures, no obstacles. Cafeteria dining tables compactly grouped in upper band. Corridors completely clear. Draw walls thin and low with subtle bevel shading to preserve coordinates and open entrances. Room floors warm offwhite with subtle department tint, realistic polished furnishings, blue screens, inviting warm cafeteria. Rich detail like reference1, not flat diagrams. No people. No text at all, no signs, no room numbers, no UI, no floating markers. Fill frame with just this single building floorplan, very narrow neutral surround.
