# Shared helpers for the graphics tester's Blender-built models.
#
# Run a model script inside Blender (the MCP's execute_blender_code, or the
# Text Editor) with:  exec(open(r"<this folder>\helmet.py").read())
# Each model script execs this file first.
#
# Budget (the game may run on phones): ~1,000 triangles per model.
# Every model has exactly TWO materials, so it costs two draw calls:
#   Shell  - the armour; graphics-tester tints it with the soldier's colour.
#   Detail - everything else; its colour and glow come from PALETTE, an 8x1
#            texture, by pointing each part's UVs at one pixel.
# Model space: +X is forward (the way the soldier faces), +Z up, Y depth.
# The glTF export maps Blender -Y to three's +Z, i.e. towards the camera.

import bpy, bmesh, math, os, mathutils
from mathutils import Vector, Matrix

MODELS = r"C:\Users\jeffr\OneDrive\Documents\my-games\side-scroller\graphics-tester\models"
# The .glb is what the game loads (src/mission/view3d/armour.js); the .blend
# and this script stay here with the tester.
# Models the game loads; anything else (tester-only subjects) exports here.
GAME_STEMS = {"helmet", "chest"}
GAME_MODELS = r"C:\Users\jeffr\OneDrive\Documents\my-games\side-scroller\src\mission\view3d\models"

# name -> (base sRGB, emissive sRGB); emissive is pre-tuned for the game's
# bloom (the old visor glows at about this level).
PALETTE = {
    "trim":  ((0.27, 0.29, 0.35), (0, 0, 0)),
    "visor": ((0.58, 0.91, 1.00), (0.37, 0.60, 0.70)),
    "glow":  ((1.00, 0.63, 0.42), (0.95, 0.56, 0.33)),
    "suit":  ((0.18, 0.20, 0.24), (0, 0, 0)),
    "metal": ((0.62, 0.65, 0.70), (0, 0, 0)),
    "bone":  ((0.86, 0.80, 0.66), (0, 0, 0)),
    "flesh": ((0.42, 0.08, 0.09), (0.06, 0.0, 0.0)),
    "maw":   ((1.00, 0.45, 0.16), (0.90, 0.32, 0.08)),
}
SLOTS = list(PALETTE)
PW = 8  # palette width in pixels


def _image(name, pick):
    img = bpy.data.images.get(name)
    if img: bpy.data.images.remove(img)
    img = bpy.data.images.new(name, PW, 1, alpha=False)
    px = [0.0] * (PW * 4)
    for i, k in enumerate(SLOTS):
        r, g, b = pick(PALETTE[k])
        px[i * 4:i * 4 + 4] = [r, g, b, 1.0]
    img.pixels = px
    img.pack()
    return img


def materials():
    for n in ("Shell", "Detail"):
        m = bpy.data.materials.get(n)
        if m: bpy.data.materials.remove(m)
    shell = bpy.data.materials.new("Shell")
    shell.use_nodes = True
    b = shell.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (0.75, 0.78, 0.82, 1)
    b.inputs["Metallic"].default_value = 0.35
    b.inputs["Roughness"].default_value = 0.45

    det = bpy.data.materials.new("Detail")
    det.use_nodes = True
    nt = det.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Metallic"].default_value = 0.55
    b.inputs["Roughness"].default_value = 0.3
    for img, sock in ((_image("palette", lambda c: c[0]), "Base Color"),
                      (_image("palette_glow", lambda c: c[1]), "Emission Color")):
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = img
        t.interpolation = "Closest"
        nt.links.new(t.outputs["Color"], b.inputs[sock])
    b.inputs["Emission Strength"].default_value = 1.0
    return shell, det


def clear():
    for o in list(bpy.data.objects):
        if o.type == "MESH": bpy.data.objects.remove(o, do_unlink=True)


def cut(bm, co, no, keep_positive=True):
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=Vector(no),
                           clear_inner=keep_positive, clear_outer=not keep_positive)


class Builder:
    def __init__(self):
        clear()
        self.shell, self.detail = materials()
        self.parts = []

    def begin(self):
        """Start the next object of a multi-object model."""
        self.parts = []

    def add(self, name, bm, slot="shell", smooth=True):
        """slot = "shell" or a PALETTE key."""
        me = bpy.data.meshes.new(name)
        uv = bm.loops.layers.uv.new("UVMap")
        u = 0.0 if slot == "shell" else (SLOTS.index(slot) + 0.5) / PW
        for f in bm.faces:
            for l in f.loops: l[uv].uv = (u, 0.5)
        bm.to_mesh(me); bm.free()
        for p in me.polygons: p.use_smooth = smooth
        o = bpy.data.objects.new(name, me)
        bpy.context.collection.objects.link(o)
        me.materials.append(self.shell if slot == "shell" else self.detail)
        self.parts.append(o)
        return o

    def finish(self, name):
        bpy.ops.object.select_all(action="DESELECT")
        for o in self.parts:
            bpy.context.view_layer.objects.active = o
            o.select_set(True)
            for m in list(o.modifiers):
                bpy.ops.object.modifier_apply(modifier=m.name)
            o.select_set(False)
        for o in self.parts: o.select_set(True)
        bpy.context.view_layer.objects.active = self.parts[0]
        bpy.ops.object.join()
        obj = bpy.context.active_object
        obj.name = name
        # Join already merges slots that share a material.
        assert [m.name for m in obj.data.materials] == ["Shell", "Detail"], obj.data.materials[:]
        return obj

    def export(self, obj, stem):
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.export_scene.gltf(filepath=os.path.join(GAME_MODELS if stem in GAME_STEMS else MODELS, stem + ".glb"),
                                  use_selection=True, export_format="GLB", export_apply=True)
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(MODELS, stem + ".blend"))
        obj.data.calc_loop_triangles()
        return {"tris": len(obj.data.loop_triangles), "dims": [round(d, 3) for d in obj.dimensions],
                "mats": [m.name for m in obj.data.materials]}


def export_many(objs, stem):
    """Several finished objects into one .glb (each stays its own node)."""
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(filepath=os.path.join(GAME_MODELS if stem in GAME_STEMS else MODELS, stem + ".glb"),
                              use_selection=True, export_format="GLB", export_apply=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(MODELS, stem + ".blend"))
    out = {}
    for o in objs:
        o.data.calc_loop_triangles()
        out[o.name] = {"tris": len(o.data.loop_triangles), "dims": [round(d, 3) for d in o.dimensions]}
    return out


def rot(deg, axis):
    return Matrix.Rotation(math.radians(deg), 3, axis)
