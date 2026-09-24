# Phantom Q — 3D modeling reference pack

Generated using the built-in image generation tool. Open [the gallery](index.html) for the 15 completed sheets and seven pending entries. Exact prompts are in [prompts.json](prompts.json).

## Modeling contract

These sheets propose coherent designs based on the facility artwork. Hidden sides are newly designed, not recovered measurements. Generated orthographic views can contain perspective, alignment, dimension-label, or object-count discrepancies. Use the values below as the modeling authority; do not derive dimensions by measuring pixels. These are reference images, not meshes, CAD drawings, or ready-to-use PBR texture maps.

- World units: 1 unit = 1 metre. Y up; X east/west; Z north/south. North is negative Z.
- Planning grid: 0.5 m. Floor tile module: 0.6 m (independent of the planning grid).
- Finished ceiling height: 3.2 m. Wall thickness: 0.2 m.
- Door clear opening: 1.0 m wide by 2.1 m high. Frame envelope: 1.1 × 0.2 × 2.2 m.
- Standard desk top: 0.75 m. Chair seat: 0.46 m. Reception counter: 1.1 m.
- Scale silhouette: 1.75 m. Design target for circulation: 1.2 m clear.
- Dimensions below are width × depth × height; room width runs east/west.
- Orthographic FRONT/BACK/LEFT/RIGHT refer to the object. Room elevations are interior views looking toward the named compass wall.
- Room layouts include invented rear and side geometry; use top plans to settle layout conflicts.
- The existing playable Server Hall prototype has different rack proportions; this pack proposes the standard for a subsequent modeling pass. No gameplay code or existing images are replaced.

## Rooms

| Sheet | Internal width × depth | Ceiling |
| --- | --- | --- |
| Headquarters | 16 × 12 m | 3.2 m |
| Server hall | 12 × 14 m | 3.2 m |
| Cryptography lab | 10 × 8 m | 3.2 m |
| Communications centre | 12 × 10 m | 3.2 m |
| Security operations | 12 × 10 m | 3.2 m |
| Engineering workshop | 12 × 10 m | 3.2 m |
| Quantum wing | 12 × 10 m | 3.2 m |
| Cryogenics lab | 12 × 10 m | 3.2 m |
| Secure archive | 10 × 8 m | 3.2 m |
| Power control | 12 × 10 m | 3.2 m |

## Reusable props

| Asset | Width × depth × height (m) |
| --- | --- |
| Analyst desk | 1.6 × 0.8 × 0.75 |
| Server cabinet | 0.6 × 1.0 × 2.0 |
| Workstation cluster | 3.2 × 1.6 × 0.75; 1.25 overall with monitors |
| Door frame | 1.1 × 0.2 × 2.2 |
| Reception desk | 2.4 × 0.9 × 1.1 |
| Task chair | 0.65 × 0.65 × 1.1 |
| Monitor | 0.62 × 0.2 × 0.48 |
| Potted plant | 0.45 × 0.45 × 1.2 |
| Double locker | 0.8 × 0.5 × 1.8 |
| Storage cabinet | 1.2 × 0.5 × 2.0 |

## Base colors

Use these exact sRGB values in material authoring, rather than sampling the generated image. Lighting, exposure and color management affect their rendered appearance. Metalness and roughness still need separate authoring.

| Material | sRGB hex |
| --- | --- |
| Wall paint | #D8DCDD |
| Floor ceramic | #C7C8C3 |
| Grout | #929590 |
| Painted steel | #727C86 |
| Equipment charcoal | #242D38 |
| Black polymer | #151B23 |
| Oak base | #B99162 |
| Upholstery | #30343B |
| Screen blue | #164C72 |
| LED cyan | #54C8E8 |
| Safety yellow | #D6AE36 |
| Foliage green | #42663B |

The palette's small texture samples describe surface detail only. Do not bake shadows, reflections or light emission into base-color textures. Painted steel should use a dielectric paint material; exposed metal needs its own material.


## Generation status

15 sheets completed. The built-in tool returned `usage_limit_reached` for the final seven. Their exact prompts remain in `prompts.json`. Written dimensions and base-color values above are available now.

Pending:

- prop-chair
- prop-monitor
- prop-plant
- prop-locker
- prop-storage-cabinet
- scale-grid-guide
- material-palette

## Review notes

- Orthographic panels sometimes retain slight perspective. Use dimensions, not pixel scaling.
- Security operations: labels calling the 0.5 m grid cells ?tiles? are incorrect; tile module remains 0.6 m.
- Secure archive: the side-wall elevation label says 10 m, but the north?south wall length is 8 m.
- Engineering: the scale bar repeats a numeral; use the written room dimensions.
- Quantum wing: the top-plan drawn aspect ratio does not match the 12 ? 10 m specification.
- Room door illustrations sometimes show double leaves: the standard reusable door opening remains 1.0 ? 2.1 m.
- Opposing room elevations and prop details need reconciliation during modeling; these sheets establish appearance and hidden-side design intent.
