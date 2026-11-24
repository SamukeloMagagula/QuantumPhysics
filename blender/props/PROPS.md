# Reusable props

One `.blend` per row, saved as `<name>.blend` in this folder. Build each at
the origin, real-world scale (1 unit = 1 m), facing -Y, so it drops into any
room scene at a known orientation. Dimensions and materials are the modeling
authority from `docs/3d-reference-v1/README.md` — don't measure the
reference PNGs.

| File | Width x depth x height (m) | Notes |
| --- | --- | --- |
| `desk.blend` | 1.6 x 0.8 x 0.75 | Analyst desk |
| `server-cabinet.blend` | 0.6 x 1.0 x 2.0 | |
| `workstation-cluster.blend` | 3.2 x 1.6 x 0.75 (1.25 with monitors) | |
| `door.blend` | 1.1 x 0.2 x 2.2 frame; 1.0 x 2.1 clear opening | |
| `reception-desk.blend` | 2.4 x 0.9 x 1.1 | |
| `chair.blend` | 0.65 x 0.65 x 1.1 | seat height 0.46 |
| `monitor.blend` | 0.62 x 0.2 x 0.48 | |
| `plant.blend` | 0.45 x 0.45 x 1.2 | |
| `locker.blend` | 0.8 x 0.5 x 1.8 | double locker |
| `storage-cabinet.blend` | 1.2 x 0.5 x 2.0 | |

Run `setup_scene.py` in each new file first (units + palette materials), then
model using the `PQ_*` materials it creates rather than new ones, so every
prop shares the same palette when instanced into a room.

Reference renders for silhouette/placement only (not meshes or textures):
`docs/3d-reference-v1/prop-*.png`.
