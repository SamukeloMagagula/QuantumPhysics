# Room scenes

One `.blend` per row, saved as `<id>.blend` in this folder. Run
`setup_scene.py -- --width <W> --depth <D>` first in each file to size the
camera correctly, then build the floor/walls/props inside the "Room"
collection and instance props in from `../props/*.blend` (File > Append, or
Link if you want prop edits to propagate).

## Wired into the game now (build these first)

| Room id | Width x depth (m) | Export filename |
| --- | --- | --- |
| `crypto-lab` | 10 x 8 | `cryptography-lab.png` |
| `comms-centre` | 12 x 10 | `communications-centre.png` |
| `soc-room` | 12 x 10 | `security-operations-centre.png` |
| `engineering-room` | 12 x 10 | `engineering-workshop.png` |
| `quantum-wing` | 12 x 10 | `quantum-wing.png` |

Export renders to `../renders/<export filename>`, then copy into
`photon-runner/public/pq/rooms/` to replace the current AI-generated art —
`photon-runner/src/pqGeneratedRooms.ts` already points at those exact paths,
so no code changes are needed if dimensions/proportions line up.

**Before replacing an image**, check `pqGeneratedRooms.ts` for that room's
`floor`, `entrance`, and `obstacles` rects — these are normalized (0-1)
coordinates against the image frame that define where the player can walk.
If your Blender render frames the room noticeably differently from the
current PNG (camera angle, floor footprint within the 3:2 frame), those
rects need updating to match, or the walkable area will drift from what's
drawn.

## Not wired in yet (future expansion, per docs/3d-reference-v1)

| Room id (proposed) | Width x depth (m) |
| --- | --- |
| headquarters | 16 x 12 |
| server-hall | 12 x 14 |
| cryogenics-lab | 12 x 10 |
| secure-archive | 10 x 8 |
| power-control | 12 x 10 |

## Export settings

- Render engine: Eevee Next (set by `setup_scene.py`).
- Resolution: 3072x2048, then downscale to 1536x1024 (matches the game's 3:2
  sprite aspect) when exporting the final PNG.
- Format: PNG, no alpha needed (rooms are opaque backgrounds in-game).
