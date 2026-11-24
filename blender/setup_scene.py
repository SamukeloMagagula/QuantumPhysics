"""Run once per .blend (Scripting tab -> Run Script, or headless via the CLI
example below) to configure units, render settings, and a reusable isometric
camera rig consistent across every room/prop file in this pipeline.

Headless, e.g. for a prop file:
    blender --background --python setup_scene.py

Headless for a room, sized to its footprint (reads rooms/ROOMS.md numbers
yourself and pass them in — this script doesn't parse that file):
    blender --background --python setup_scene.py -- --width 12 --depth 10
"""

import sys
import bpy

sys.path.insert(0, __file__.rsplit("/", 1)[0] if "/" in __file__ else ".")
from palette import build_palette_materials  # noqa: E402


RENDER_WIDTH = 3072   # 2x the game's 1536x1024 sprites; downscale on export
RENDER_HEIGHT = 2048  # keeps the 3:2 aspect pqGeneratedRooms.ts expects


def parse_args(defaults):
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    else:
        argv = []
    out = dict(defaults)
    it = iter(argv)
    for arg in it:
        if arg == "--width":
            out["width"] = float(next(it))
        elif arg == "--depth":
            out["depth"] = float(next(it))
    return out


def configure_units_and_render():
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0  # 1 Blender unit = 1 metre, per the modeling contract
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = RENDER_WIDTH
    scene.render.resolution_y = RENDER_HEIGHT
    scene.render.film_transparent = False


def get_or_create_collection(name):
    coll = bpy.data.collections.get(name)
    if coll is None:
        coll = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(coll)
    return coll


def build_isometric_camera(width, depth, height=3.2):
    """Orthographic camera framing a width x depth room from a 3/4 isometric
    angle, matching the top-down-ish look of the existing /pq/rooms/*.png art.
    """
    cam_coll = get_or_create_collection("Camera Rig")

    cam_data = bpy.data.cameras.get("PQ_IsoCamera") or bpy.data.cameras.new("PQ_IsoCamera")
    cam_data.type = "ORTHO"
    # Fit the larger room dimension with margin; retune per-room if props clip.
    cam_data.ortho_scale = max(width, depth) * 1.35

    cam_obj = bpy.data.objects.get("PQ_IsoCamera")
    if cam_obj is None:
        cam_obj = bpy.data.objects.new("PQ_IsoCamera", cam_data)
        cam_coll.objects.link(cam_obj)

    # Classic 3/4 isometric: 45deg around Z, ~55deg down from horizontal.
    distance = max(width, depth, height) * 2.0
    cam_obj.location = (distance * 0.7071, -distance * 0.7071, distance * 0.8192)
    cam_obj.rotation_euler = (1.0472, 0.0, 0.7854)  # ~60deg, 0, 45deg in radians
    bpy.context.scene.camera = cam_obj
    return cam_obj


def build_three_point_light():
    light_coll = get_or_create_collection("Lighting")
    sun_data = bpy.data.lights.get("PQ_Sun") or bpy.data.lights.new("PQ_Sun", type="SUN")
    sun_data.energy = 3.0
    sun_obj = bpy.data.objects.get("PQ_Sun")
    if sun_obj is None:
        sun_obj = bpy.data.objects.new("PQ_Sun", sun_data)
        light_coll.objects.link(sun_obj)
    sun_obj.rotation_euler = (0.9599, 0.0, 0.7854)  # matches the camera's downward angle


def main():
    args = parse_args({"width": 10.0, "depth": 8.0})
    configure_units_and_render()
    build_palette_materials()
    build_isometric_camera(args["width"], args["depth"])
    build_three_point_light()
    get_or_create_collection("Props")
    get_or_create_collection("Room")
    print(f"PQ scene configured for a {args['width']}x{args['depth']}m room.")


if __name__ == "__main__":
    main()
