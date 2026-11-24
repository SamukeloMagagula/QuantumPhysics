"""Base-color material palette, values from docs/3d-reference-v1/README.md.

Import into any Blender script with bpy's text-editor "Run Script", or via
`exec(open("palette.py").read())` from setup_scene.py.
"""

import bpy


PALETTE_HEX = {
    "wall_paint": "D8DCDD",
    "floor_ceramic": "C7C8C3",
    "grout": "929590",
    "painted_steel": "727C86",
    "equipment_charcoal": "242D38",
    "black_polymer": "151B23",
    "oak_base": "B99162",
    "upholstery": "30343B",
    "screen_blue": "164C72",
    "led_cyan": "54C8E8",
    "safety_yellow": "D6AE36",
    "foliage_green": "42663B",
}


def hex_to_linear_rgb(hex_str):
    """sRGB hex -> linear RGB tuple, the color space Blender's shader nodes expect."""
    hex_str = hex_str.lstrip("#")
    srgb = [int(hex_str[i : i + 2], 16) / 255 for i in (0, 2, 4)]

    def to_linear(c):
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    return tuple(to_linear(c) for c in srgb) + (1.0,)


def build_palette_materials():
    """Create (or reuse) one Principled BSDF material per palette entry.

    Metalness/roughness are left at defaults — author those per-material by
    hand once a prop needs them (e.g. painted_steel should stay dielectric;
    exposed metal needs its own material, per the modeling contract).
    """
    created = []
    for name, hex_value in PALETTE_HEX.items():
        mat_name = f"PQ_{name}"
        mat = bpy.data.materials.get(mat_name)
        if mat is None:
            mat = bpy.data.materials.new(mat_name)
            mat.use_nodes = True
            bsdf = mat.node_tree.nodes.get("Principled BSDF")
            if bsdf is not None:
                bsdf.inputs["Base Color"].default_value = hex_to_linear_rgb(hex_value)
            created.append(mat_name)
    return created


if __name__ == "__main__":
    names = build_palette_materials()
    print(f"Created/verified {len(PALETTE_HEX)} palette materials: {names or '(all already existed)'}")
