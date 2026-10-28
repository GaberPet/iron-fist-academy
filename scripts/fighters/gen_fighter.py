# Blender (MPFB2) script: builds one realistic fighter from a JSON spec and exports a GLB.
# Run: blender -b --factory-startup --python gen_fighter.py -- spec.json out.glb
# Everything used is CC0: MakeHuman base mesh / targets / system assets (exported via MPFB).
import bpy, sys, json, os

argv = sys.argv[sys.argv.index("--") + 1:]
spec = json.load(open(argv[0]))
out = argv[1]

from bl_ext.user_default.mpfb.services.humanservice import HumanService
from bl_ext.user_default.mpfb.services.objectservice import ObjectService

# start from an empty scene
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)

info = HumanService._create_default_human_info_dict()
info["name"] = spec["id"]
info["phenotype"].update({k: v for k, v in spec["phenotype"].items() if k != "race"})
info["phenotype"]["race"] = spec["phenotype"]["race"]
info["skin_mhmat"] = spec["skin"]
info["skin_material_type"] = "GAMEENGINE"
info["eyes"] = "low-poly/low-poly.mhclo"
info["eyes_material_type"] = "GAMEENGINE"
info["eyebrows"] = spec.get("eyebrows", "eyebrow001/eyebrow001.mhclo")
info["eyelashes"] = "eyelashes01/eyelashes01.mhclo"
info["hair"] = spec.get("hair", "")
info["clothes"] = spec.get("clothes", [])
info["clothes_material_type"] = "GAMEENGINE"
info["rig"] = "game_engine"
info["alternative_materials"] = {}

settings = HumanService.get_default_deserialization_settings()
settings["subdiv_levels"] = 0
settings["material_instances"] = "NEVER"
basemesh = HumanService.deserialize_from_dict(info, settings)
# the phenotype shape keys are driven: evaluate them, then fit clothes, hair and the rig to the final body
bpy.context.scene.frame_set(1)
bpy.context.view_layer.update()
HumanService.refit(basemesh)
bpy.context.view_layer.update()

# strip shirts / tops above the waist for bare-chested fighters
def deformed_z(o):
    """World z of every vertex after shape keys / modifiers (the phenotype lives in shape keys)."""
    masks = [m for m in o.modifiers if m.type == 'MASK' and m.show_viewport]
    for m in masks:
        m.show_viewport = False  # measure the whole body, not just the visible part
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    ev = o.evaluated_get(dg)
    me = ev.to_mesh()
    zs = [(o.matrix_world @ v.co).z for v in me.vertices]
    ev.to_mesh_clear()
    for m in masks:
        m.show_viewport = True
    bpy.context.view_layer.update()
    if len(zs) != len(o.data.vertices):
        # topology-changing modifiers: fall back to the shape-key mix of the basis
        zs = [(o.matrix_world @ v.co).z for v in o.data.vertices]
    return zs

cut = spec.get("cutAbove")
if cut is not None:
    body_z = deformed_z(basemesh)
    height = max(body_z) - min(body_z)
    cut_z = min(body_z) + cut * height
    for o in bpy.data.objects:
        if o.type == 'MESH' and o is not basemesh and any(k in o.name.lower() for k in spec.get("cutObjects", [])):
            zs = deformed_z(o)
            bpy.ops.object.select_all(action='DESELECT')
            bpy.context.view_layer.objects.active = o
            o.select_set(True)
            bpy.ops.object.mode_set(mode='EDIT')
            bpy.ops.mesh.select_all(action='DESELECT')
            bpy.ops.object.mode_set(mode='OBJECT')
            for v in o.data.vertices:
                v.select = zs[v.index] > cut_z
            bpy.ops.object.mode_set(mode='EDIT')
            bpy.ops.mesh.delete(type='VERT')
            bpy.ops.object.mode_set(mode='OBJECT')
    # the skin under the removed part must show again: drop those vertices from the clothes' delete groups
    hip_z = min(body_z) + 0.47 * height
    for mod in basemesh.modifiers:
        if mod.type == 'MASK' and mod.vertex_group and mod.vertex_group != 'body':
            vg = basemesh.vertex_groups.get(mod.vertex_group)
            if vg:
                vg.remove([i for i, z in enumerate(body_z) if z > hip_z])

# opaque skin / clothes, alpha-clipped hair and lashes (MPFB defaults to blended)
for m in bpy.data.materials:
    cut = any(k in m.name.lower() for k in ("eyelash", "eyebrow", "hair", "short0", "long0", "bob0", "ponytail", "braid", "afro"))
    try:
        m.surface_render_method = 'DITHERED'
        m.blend_method = 'CLIP' if cut else 'OPAQUE'
    except Exception:
        pass
    if not cut and m.use_nodes:
        for n in m.node_tree.nodes:
            if n.type == 'BSDF_PRINCIPLED' and n.inputs['Alpha'].links:
                m.node_tree.links.remove(n.inputs['Alpha'].links[0])
                n.inputs['Alpha'].default_value = 1.0

# downsize textures for the web
maxsize = spec.get("maxTex", 1024)
for img in bpy.data.images:
    if img.size[0] > maxsize:
        img.scale(maxsize, maxsize * img.size[1] // img.size[0])

bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_skins=True,
                          export_animations=False, export_image_format='WEBP', export_image_quality=82,
                          export_morph=False, export_yup=True)
print("EXPORTED", out, os.path.getsize(out))
