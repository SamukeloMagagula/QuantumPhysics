# Blender room-art pipeline

Offline asset source for `photon-runner/public/pq/rooms/*.png`. Nothing
here runs at build time or ships to the browser — model and render in
Blender, export a PNG, copy it into the web app.

## Layout

- `palette.py` — the base-color material palette from
  `docs/3d-reference-v1/README.md`, as Blender materials.
- `setup_scene.py` — run once per new `.blend` (units, Eevee, isometric
  camera, lighting, palette materials, `Props`/`Room` collections).
- `props/` — one `.blend` per reusable prop (desk, server cabinet, chair,
  ...). See `props/PROPS.md` for dimensions.
- `rooms/` — one `.blend` per room scene, assembled from `props/*.blend`.
  See `rooms/ROOMS.md` for dimensions and which rooms are wired into the
  game already.
- `renders/` — PNG output lands here before you copy the finished ones into
  `photon-runner/public/pq/rooms/`.

## Quick start

1. Install Blender (4.x) if you haven't: https://www.blender.org/download/
2. Open Blender, create a new file, switch to the Scripting tab, open
   `setup_scene.py`, and run it (or pass `--width`/`--depth` via the
   headless CLI form documented at the top of that file).
3. Build a prop or room per the specs in `props/PROPS.md` / `rooms/ROOMS.md`,
   using the `PQ_*` materials `setup_scene.py` created rather than new ones.
4. Render (Render > Render Image), export as PNG into `renders/`.
5. Copy the finished PNG into `photon-runner/public/pq/rooms/`, matching the
   existing filename exactly so `pqGeneratedRooms.ts` picks it up with no
   code changes.
6. Run the game (`npm run dev` in `photon-runner/`) and check the room still
   reads correctly — walkable-area rects in `pqGeneratedRooms.ts` are
   normalized against the image frame, so a very different camera framing
   may need those rects nudged.

## Hardware notes

Room art is flat pre-rendered sprites, not live 3D in the game, so none of
this touches runtime performance. For modeling/rendering on a laptop with
integrated graphics: keep props low-poly (the dimension table is the
modeling authority, not a sculpting target), and render with Eevee — Cycles
is CPU-bound without a dedicated GPU and much slower for no visual benefit
in this flat isometric style.
