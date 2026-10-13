# Rig a cyclops GLB with a simple humanoid skeleton and an in-place walk loop.
# Writes <model>-rigged.glb (and .blend) beside it; the source GLB is never touched.
#
# Run headless from WSL (the model name defaults to cyclops-01):
#   "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup \
#     --python 'C:\Users\jeffr\OneDrive\Documents\my-games\side-scroller\p2-lab\rig-cyclops.py' -- cyclops-02 5000
#
# The optional second argument is a vertex target: the mesh is decimated until
# the GLB carries at most that many vertices (seam splits included). Generated
# UV atlases are cut into thousands of islands, and decimation will not collapse
# across a seam, so the reduced mesh drops the UVs, gets a fresh Smart UV layout,
# and has base colour, roughness, metallic and a tangent-space normal map baked
# onto it from the full mesh. Output is <model>-<n>v-rigged.glb (and .blend).
# The reduced mesh is weighted directly (it is under PROXY_FACES).
# Reduction needs a clean source mesh: collapse decimation stalls at non-manifold
# geometry (cyclops-02 floors near 4,160 vertices / 12,000 faces however it is
# run), and a voxel remesh to clean it shatters the thin robe into ~1,500 shells.
#
# Blender space: +Z up, the model faces -Y, its left side is +X. Joint positions
# were read off front/side renders of each model's T-pose (PROFILES). Every pose
# is authored as a rotation in WORLD axes relative to the parent, and converted
# to the bone's local frame by conjugating with its rest matrix, so bone roll
# never matters.
import bpy, math, os, sys
from mathutils import Vector, Quaternion, Matrix

HERE = r"C:\Users\jeffr\OneDrive\Documents\my-games\side-scroller\p2-lab"
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
MODEL = ARGS[0] if ARGS else "cyclops-01"
TARGET_VERTS = next((int(a) for a in ARGS[1:] if a.isdigit()), None)
GAIT = "run" if "run" in ARGS[1:] else "walk"
SRC = next(p for p in (os.path.join(HERE, f"{MODEL}{ext}") for ext in (".glb", ".blend")) if os.path.exists(p))
STEM = MODEL + (f"-{TARGET_VERTS}v" if TARGET_VERTS else "") + ("-run" if GAIT == "run" else "")
OUT = os.path.join(HERE, f"{STEM}-rigged.glb")
COLOR_MAP = 2048     # baked base colour and normal map size, px
DATA_MAP = 1024      # baked roughness / metallic size, px
BAKE_REACH = 0.012   # how far (model units, height ~0.84) the bake searches for the full surface

FPS = 30
CYCLE = 36          # frames per full stride (two steps): a heavy, slow gait
THIGH_SWING = 24    # degrees either side of vertical
KNEE_BEND = 42      # extra flexion while the leg swings through
ARM_DOWN = 68       # T-pose -> arms at the sides
ARM_SWING = 16
BOB = 0.012         # pelvis rise at the passing pose (model units; height ~0.83)
SWAY = 0.010        # pelvis shift over the stance foot
# run: a heavy, loping bound — long strides, a deep dip on each landing, a short
# flight, the torso pitched into it and the arms pumping
RUN_CYCLE = 22      # frames per stride
RUN_THIGH = 38
RUN_KNEE = 88       # swing-leg tuck
RUN_STANCE_KNEE = 26  # stance leg absorbing the landing
RUN_LEAN = 13       # spine pitch forward
RUN_FLIGHT = 0.022  # extra lift between footfalls (model units)
RUN_ARM = 38
RUN_ELBOW = 72
PROXY_FACES = 20000  # above this, weights are solved on a decimated copy and transferred

# Where the joints are, per model. Both share a T-pose and scale; cyclops-02's
# knees sit higher and its feet sit further back.
# cyclops-03 is a different sculpt: a hunched brute, shorter in the leg, with
# wider shoulders and a lower head, so it carries its own torso and arm joints.
UPPER = dict(hip=(0.095, -0.08), pelvis=(-0.07, 0.04), spine=0.20, head=((0, -0.01, 0.25), (0, -0.01, 0.41)),
             shoulder=(0.14, 0, 0.205), elbow=(0.31, 0, 0.19), wrist=(0.43, 0, 0.185), hand=(0.50, 0, 0.18))
PROFILES = {
    "cyclops-01": dict(ground=-0.414, knee=(-0.01, -0.27), ankle=(0.0, -0.385), toe=(-0.11, -0.41)),
    "cyclops-02": dict(ground=-0.423, knee=(-0.01, -0.21), ankle=(0.025, -0.365), toe=(-0.08, -0.42)),
    "cyclops-03": dict(ground=-0.407, knee=(0.03, -0.25), ankle=(0.03, -0.365), toe=(-0.06, -0.40),
                       hip=(0.095, -0.06), pelvis=(-0.07, 0.06), spine=0.24, head=((0, -0.02, 0.26), (0, -0.06, 0.40)),
                       shoulder=(0.16, 0.02, 0.225), elbow=(0.345, 0.02, 0.20), wrist=(0.43, 0.02, 0.205), hand=(0.50, 0.02, 0.20)),
}
P = {**UPPER, **PROFILES[MODEL]}
KNEE, ANKLE, TOE = P["knee"], P["ankle"], P["toe"]   # (y, z)

GROUND = P["ground"]
# name: (head, tail, parent)
BONES = {
    "root":       ((0, 0, GROUND), (0, 0, GROUND + 0.08), None),
    "pelvis":     ((0, 0, P["pelvis"][0]), (0, 0, P["pelvis"][1]), "root"),
    "spine":      ((0, 0, P["pelvis"][1]), (0, 0, P["spine"]), "pelvis"),
    "head":       (P["head"][0], P["head"][1], "spine"),
}
def mirror(v, s):
    return (s * v[0], v[1], v[2])
for side, s in (("L", 1), ("R", -1)):
    BONES.update({
        f"upperarm.{side}": (mirror(P["shoulder"], s), mirror(P["elbow"], s), "spine"),
        f"forearm.{side}":  (mirror(P["elbow"], s), mirror(P["wrist"], s), f"upperarm.{side}"),
        f"hand.{side}":     (mirror(P["wrist"], s), mirror(P["hand"], s), f"forearm.{side}"),
        f"thigh.{side}":    ((s * P["hip"][0], 0, P["hip"][1]), (s * 0.09, *KNEE), "pelvis"),
        f"shin.{side}":     ((s * 0.09, *KNEE), (s * 0.088, *ANKLE), f"thigh.{side}"),
        f"foot.{side}":     ((s * 0.088, *ANKLE), (s * 0.088, *TOE), f"shin.{side}"),
    })

# ---- load ----------------------------------------------------------------
bpy.ops.wm.read_factory_settings(use_empty=True)
if SRC.endswith(".blend"):
    # an imported GLB saved from Blender: still split at every UV seam, so weld it
    bpy.ops.wm.open_mainfile(filepath=SRC)
    mesh = next(o for o in bpy.data.objects if o.type == "MESH")
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.remove_doubles(threshold=1e-6)
    bpy.ops.object.mode_set(mode="OBJECT")
else:
    bpy.ops.import_scene.gltf(filepath=SRC, merge_vertices=True)
    mesh = next(o for o in bpy.data.objects if o.type == "MESH")
mw = mesh.matrix_world.copy()
mesh.parent = None
mesh.matrix_world = mw
for o in [o for o in bpy.data.objects if o is not mesh]:
    bpy.data.objects.remove(o)
mesh.name = "cyclops"


# ---- reduce + bake ----------------------------------------------------------
def glb_verts(obj):
    """Vertices the GLB will carry: one per (vertex, uv) pair on a smooth mesh."""
    uv = obj.data.uv_layers.active.data
    return len({(l.vertex_index, round(uv[l.index].uv.x, 5), round(uv[l.index].uv.y, 5)) for l in obj.data.loops})


def smooth(obj):
    obj.data.shade_smooth()
    if obj.data.has_custom_normals:
        bpy.context.view_layer.objects.active = obj
        bpy.ops.mesh.customdata_custom_splitnormals_clear()


def reduce(hi, target):
    ratio = 0.85 * target / len(hi.data.vertices)
    for attempt in range(8):
        lo = hi.copy()
        lo.data = hi.data.copy()
        bpy.context.scene.collection.objects.link(lo)
        while lo.data.uv_layers:
            lo.data.uv_layers.remove(lo.data.uv_layers[0])
        if attempt == 0:
            ratio = 0.85 * target / len(lo.data.vertices)
        dec = lo.modifiers.new("dec", "DECIMATE")
        dec.ratio = ratio
        bpy.context.view_layer.objects.active = lo
        bpy.ops.object.modifier_apply(modifier="dec")
        lo.data.uv_layers.new(name="UVMap")
        bpy.ops.object.select_all(action="DESELECT")
        lo.select_set(True)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.004)
        bpy.ops.object.mode_set(mode="OBJECT")
        n = glb_verts(lo)
        smooth(lo)
        print(f"RIG decimate ratio {ratio:.5f}: {len(lo.data.vertices)} vertices, {n} in the GLB")
        if n <= target:
            return lo
        bpy.data.objects.remove(lo)
        ratio *= 0.98 * target / n
    raise RuntimeError(f"could not reach {target} vertices")


def bake_maps(hi, lo):
    """Bake hi's base colour, roughness, metallic and surface normals onto lo's fresh UVs."""
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = 1
    mat = bpy.data.materials.new(f"{STEM}")
    mat.use_nodes = True
    lo.data.materials.clear()
    lo.data.materials.append(mat)
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")

    def image(name, size, data):
        img = bpy.data.images.new(f"{STEM}-{name}", size, size, alpha=False)
        if data:
            img.colorspace_settings.name = "Non-Color"
        tex = nodes.new("ShaderNodeTexImage")
        tex.image = img
        return tex

    def select_for_bake(tex):
        nodes.active = tex
        bpy.ops.object.select_all(action="DESELECT")
        hi.select_set(True)
        lo.select_set(True)
        bpy.context.view_layer.objects.active = lo

    # Each material channel is baked as emission: whatever feeds that socket on
    # hi's Principled BSDF is routed to the output, then put back.
    src = hi.data.materials[0].node_tree
    s_bsdf = next(n for n in src.nodes if n.type == "BSDF_PRINCIPLED")
    s_out = next(n for n in src.nodes if n.type == "OUTPUT_MATERIAL")
    surface = s_out.inputs["Surface"].links[0].from_socket
    emit = src.nodes.new("ShaderNodeEmission")
    for socket, size, data in (("Base Color", COLOR_MAP, False), ("Roughness", DATA_MAP, True), ("Metallic", DATA_MAP, True)):
        tex = image(socket.lower().replace(" ", ""), size, data)
        feed = s_bsdf.inputs[socket]
        if feed.links:
            src.links.new(feed.links[0].from_socket, emit.inputs["Color"])
        else:
            for l in list(emit.inputs["Color"].links):
                src.links.remove(l)
            v = feed.default_value
            emit.inputs["Color"].default_value = tuple(v)[:3] + (1,) if hasattr(v, "__len__") else (v, v, v, 1)
        src.links.new(emit.outputs["Emission"], s_out.inputs["Surface"])
        select_for_bake(tex)
        bpy.ops.object.bake(type="EMIT", use_selected_to_active=True,
                            cage_extrusion=BAKE_REACH, max_ray_distance=BAKE_REACH * 2, margin=8)
        links.new(tex.outputs["Color"], bsdf.inputs[socket])
        tex.image.pack()
        print("RIG baked", socket)
    src.links.new(surface, s_out.inputs["Surface"])
    src.nodes.remove(emit)

    tex = image("normal", COLOR_MAP, True)
    select_for_bake(tex)
    bpy.ops.object.bake(type="NORMAL", normal_space="TANGENT", use_selected_to_active=True,
                        cage_extrusion=BAKE_REACH, max_ray_distance=BAKE_REACH * 2, margin=8)
    nm = nodes.new("ShaderNodeNormalMap")
    links.new(tex.outputs["Color"], nm.inputs["Color"])
    links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    tex.image.pack()
    print("RIG baked normals")


if TARGET_VERTS:
    smooth(mesh)
    lo = reduce(mesh, TARGET_VERTS)
    bake_maps(mesh, lo)
    bpy.data.objects.remove(mesh)
    mesh = lo
    mesh.name = "cyclops"

# ---- skeleton -------------------------------------------------------------
arm_data = bpy.data.armatures.new("cyclops_rig")
rig = bpy.data.objects.new("cyclops_rig", arm_data)
bpy.context.scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="EDIT")
for name, (h, t, parent) in BONES.items():
    b = arm_data.edit_bones.new(name)
    b.head, b.tail = Vector(h), Vector(t)
    b.use_deform = name != "root"
for name, (h, t, parent) in BONES.items():
    if parent:
        b = arm_data.edit_bones[name]
        b.parent = arm_data.edit_bones[parent]
        b.use_connect = Vector(h) == Vector(BONES[parent][1])
bpy.ops.object.mode_set(mode="OBJECT")

# ---- skin -----------------------------------------------------------------
# Heat weighting; if it fails on this (non-manifold, generated) mesh, vertices
# come back unweighted and the soft nearest-bone fallback catches them. A dense
# mesh is weighted through a decimated proxy: heat on 300k vertices is slow and
# fails more often, and the weights are smooth enough to interpolate.
def seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
    return (p - (a + ab * t)).length


deform = [n for n in BONES if n != "root"]
FALLOFF = 0.035     # soft-skin width: weight ~ exp(-(d / FALLOFF)^2) relative to the nearest bone


def weigh(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    groups = {n: obj.vertex_groups.get(n) or obj.vertex_groups.new(name=n) for n in deform}
    idx = {g.index: n for n, g in groups.items()}
    orphans = 0
    for v in obj.data.vertices:
        if sum(g.weight for g in v.groups if g.group in idx) > 1e-4:
            continue
        orphans += 1
        p = obj.matrix_world @ v.co
        d = {}
        for n in deform:
            # a limb on the far side of the midline never claims a vertex
            if (n.endswith(".L") and p.x < -0.015) or (n.endswith(".R") and p.x > 0.015):
                continue
            d[n] = seg_dist(p, Vector(BONES[n][0]), Vector(BONES[n][1]))
        near = min(d.values())
        for n, dist in d.items():
            w = math.exp(-((dist - near) / FALLOFF) ** 2)
            if w > 0.02:
                groups[n].add([v.index], w, "REPLACE")
    print(f"RIG {obj.name}: weighted by heat {len(obj.data.vertices) - orphans}, soft fallback {orphans}")


if len(mesh.data.polygons) <= PROXY_FACES:
    weigh(mesh)
else:
    proxy = mesh.copy()
    proxy.data = mesh.data.copy()
    proxy.name = "proxy"
    bpy.context.scene.collection.objects.link(proxy)
    dec = proxy.modifiers.new("dec", "DECIMATE")
    dec.ratio = PROXY_FACES / len(mesh.data.polygons)
    bpy.context.view_layer.objects.active = proxy
    bpy.ops.object.modifier_apply(modifier="dec")
    weigh(proxy)
    for n in deform:
        mesh.vertex_groups.new(name=n)
    dt = mesh.modifiers.new("weights", "DATA_TRANSFER")
    dt.object = proxy
    dt.use_vert_data = True
    dt.data_types_verts = {"VGROUP_WEIGHTS"}
    dt.vert_mapping = "POLYINTERP_NEAREST"
    dt.layers_vgroup_select_src = "ALL"
    dt.layers_vgroup_select_dst = "NAME"
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.modifier_apply(modifier="weights")
    bpy.data.objects.remove(proxy)
    mesh.parent = rig
    mesh.matrix_parent_inverse = rig.matrix_world.inverted()
    mesh.modifiers.new("rig", "ARMATURE").object = rig
    print(f"RIG transferred proxy weights onto {len(mesh.data.vertices)} vertices")

# glTF carries at most 4 influences per vertex in the base set; keep the top 4.
bpy.context.view_layer.objects.active = mesh
bpy.ops.object.mode_set(mode="WEIGHT_PAINT")
bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=4)
bpy.ops.object.vertex_group_normalize_all(group_select_mode="ALL", lock_active=False)
bpy.ops.object.mode_set(mode="OBJECT")

# ---- walk -----------------------------------------------------------------
rest = {b.name: b.matrix_local.to_3x3() for b in arm_data.bones}


def world_q(axis, deg):
    return Quaternion(Vector(axis), math.radians(deg))


def pose(name, q, frame):
    r = rest[name].to_quaternion()
    pb = rig.pose.bones[name]
    pb.rotation_mode = "QUATERNION"
    pb.rotation_quaternion = r.inverted() @ q @ r
    pb.keyframe_insert("rotation_quaternion", frame=frame)


def move(name, offset, frame):
    pb = rig.pose.bones[name]
    pb.location = rest[name].inverted() @ Vector(offset)
    pb.keyframe_insert("location", frame=frame)


# +X rotation swings a down-pointing limb backwards (-Z -> +Y), so "forward"
# for a leg is a negative angle about X.
X, Y, Z = (1, 0, 0), (0, 1, 0), (0, 0, 1)
action = bpy.data.actions.new("Run" if GAIT == "run" else "Walk")
rig.animation_data_create().action = action
for f in range(CYCLE + 1 if GAIT == "walk" else 0):
    p = 2 * math.pi * f / CYCLE
    move("pelvis", (SWAY * math.sin(p), 0, BOB * math.cos(2 * p) - BOB * 0.5), f)
    pose("pelvis", world_q(Z, 5 * math.sin(p)) @ world_q(Y, -2.5 * math.sin(p)), f)
    pose("spine", world_q(Z, -7 * math.sin(p)) @ world_q(X, -3), f)
    pose("head", world_q(Z, 2 * math.sin(p)) @ world_q(X, 2 + 1.5 * math.cos(2 * p)), f)
    for side, s, ph in (("L", 1, 0.0), ("R", -1, math.pi)):
        q = p + ph
        fwd = THIGH_SWING * math.sin(q)                 # + = thigh forward
        knee = 6 + KNEE_BEND * max(0.0, math.cos(q)) ** 1.6   # bends while swinging through
        ankle = -0.7 * (fwd - knee) + 6 * max(0.0, -math.sin(q))  # roughly flat, toe-off push
        pose(f"thigh.{side}", world_q(X, -fwd), f)
        pose(f"shin.{side}", world_q(X, knee), f)
        pose(f"foot.{side}", world_q(X, ankle), f)
        # arms swing against the leg on their own side
        swing = -ARM_SWING * math.sin(q)                # + = arm forward
        pose(f"upperarm.{side}", world_q(X, -swing) @ world_q(Y, s * ARM_DOWN), f)
        pose(f"forearm.{side}", world_q(Z, -s * (14 + 8 * max(0.0, swing / ARM_SWING))), f)
        pose(f"hand.{side}", world_q(Z, -s * 5), f)


def run():
    """Pose every frame, then drop the pelvis until the lower foot meets the ground."""
    for f in range(RUN_CYCLE + 1):
        p = 2 * math.pi * f / RUN_CYCLE
        pose("pelvis", world_q(Z, 9 * math.sin(p)) @ world_q(Y, -4 * math.sin(p)), f)
        pose("spine", world_q(Z, -12 * math.sin(p)) @ world_q(X, RUN_LEAN + 3 * math.cos(2 * p)), f)
        pose("head", world_q(Z, 4 * math.sin(p)) @ world_q(X, -RUN_LEAN * 0.7 - 4 * math.cos(2 * p)), f)
        for side, s, ph in (("L", 1, 0.0), ("R", -1, math.pi)):
            q = p + ph
            fwd = RUN_THIGH * math.sin(q) + 6                # carried a little forward
            swing = max(0.0, math.cos(q))                     # 0..1 while the leg comes through
            stance = max(0.0, -math.cos(q))
            knee = 10 + RUN_KNEE * swing ** 1.3 + RUN_STANCE_KNEE * math.sin(math.pi * stance ** 0.8) * (stance > 0)
            ankle = -0.8 * (fwd - knee) + 22 * max(0.0, -math.sin(q)) * swing ** 0.3
            pose(f"thigh.{side}", world_q(X, -fwd), f)
            pose(f"shin.{side}", world_q(X, knee), f)
            pose(f"foot.{side}", world_q(X, ankle), f)
            arm = -RUN_ARM * math.sin(q)                      # + = forward
            pose(f"upperarm.{side}", world_q(X, -arm - 10) @ world_q(Y, s * (ARM_DOWN - 8)), f)
            pose(f"forearm.{side}", world_q(Z, -s * (RUN_ELBOW + 18 * max(0.0, arm / RUN_ARM))), f)
            pose(f"hand.{side}", world_q(Z, -s * 10), f)
        move("pelvis", (0, 0, 0), f)
    # ground contact: the foot points (ankle, toe) sit this far above the ground at rest
    # The lowest foot point jumps between ankle, toe and the other foot, so the
    # raw drop is jagged frame to frame; keep only its smooth per-step shape
    # (the step frequency and its first overtone — two steps per stride).
    rest_gap = {"head": ANKLE[1] - GROUND, "tail": TOE[1] - GROUND}
    drop = []
    for f in range(RUN_CYCLE):
        bpy.context.scene.frame_set(f)
        low = min(
            (rig.matrix_world @ getattr(rig.pose.bones[f"foot.{side}"], end)).z - gap
            for side in "LR" for end, gap in rest_gap.items()
        )
        drop.append(GROUND - low)
    n = len(drop)
    terms = [(k, sum(d * math.cos(2 * math.pi * k * i / n) for i, d in enumerate(drop)) * 2 / n,
                 sum(d * math.sin(2 * math.pi * k * i / n) for i, d in enumerate(drop)) * 2 / n) for k in (2, 4)]
    mean = sum(drop) / n
    for f in range(RUN_CYCLE + 1):
        p = 2 * math.pi * f / RUN_CYCLE
        z = mean + sum(a * math.cos(k * p) + b * math.sin(k * p) for k, a, b in terms)
        flight = RUN_FLIGHT * max(0.0, -math.cos(2 * p + 0.5)) ** 1.5
        move("pelvis", (0.016 * math.sin(p), 0, z + flight), f)


if GAIT == "run":
    CYCLE = RUN_CYCLE
    run()

for fc in action.fcurves if hasattr(action, "fcurves") else []:
    for k in fc.keyframe_points:
        k.interpolation = "LINEAR"
sc = bpy.context.scene
sc.render.fps = FPS
sc.frame_start, sc.frame_end = 0, CYCLE

# ---- export ---------------------------------------------------------------
bpy.ops.object.select_all(action="DESELECT")
mesh.select_set(True)
rig.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=OUT, export_format="GLB", use_selection=True,
    export_animations=True, export_skins=True, export_def_bones=True,
    export_anim_single_armature=True, export_force_sampling=True,
)
bpy.ops.wm.save_as_mainfile(filepath=OUT.replace(".glb", ".blend"))
print("RIG wrote", OUT)
