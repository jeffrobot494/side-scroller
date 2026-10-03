# XCOM: Enemy Unknown-style trooper for the graphics tester: an adult,
# realistically proportioned (7.5 heads, 1.80 m) soldier in a Kevlar vest,
# with a rig and three looping clips. Run in Blender:
# exec(open(r"...\models\trooper.py").read())
#
# Exports models/trooper.glb (tester-only; graphics-tester/trooper.js loads
# it). One skinned mesh, rigidly weighted per piece except the torso, which
# blends hips -> spine -> chest.
#
# Materials (trooper.js reads them by name): Suit, Armor, Accent (tinted with
# the soldier's colour), Webbing, Skin, Hair, Eye, Sclera, Iris, Boot, GunDark, GunMetal,
# Glow.
#
# The rig is driven by controls and IK, and the glTF exporter samples the
# result per frame, so the .glb carries plain FK:
#   gun        - the rifle (child of chest). Both hands are IK'd to it.
#   foot_ik.*  - ankles (child of root). Legs are IK'd to them.
#   hips/spine/chest/neck/head - FK.
#   muzzle     - the barrel tip, for the flash.
# Clips: Idle (2 s), Run (0.667 s, two strides, on the spot), Shoot (1 s,
# a three-round burst at frames 0, 5, 10).
#
# Model space: +X forward, +Z up, -Y towards the camera (the right side).

import bpy, bmesh, math, os
from mathutils import Vector, Matrix, Euler, Quaternion

MODELS = r"C:\Users\jeffr\OneDrive\Documents\my-games\side-scroller\graphics-tester\models"
TAU = math.tau
FPS = 30

# --- clean slate -------------------------------------------------------------
if bpy.context.object and bpy.context.object.mode != "OBJECT":
    bpy.ops.object.mode_set(mode="OBJECT")
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
for coll in (bpy.data.meshes, bpy.data.armatures, bpy.data.actions, bpy.data.materials):
    for d in list(coll):
        coll.remove(d)
bpy.context.scene.render.fps = FPS

# --- materials ---------------------------------------------------------------
MATS = {
    # name: (base sRGB-ish linear, metallic, roughness, emission)
    "Suit":     ((0.06, 0.068, 0.062), 0.0, 0.85, None),
    "Armor":    ((0.34, 0.36, 0.38), 0.25, 0.48, None),
    "Accent":   ((0.55, 0.55, 0.55), 0.2, 0.45, None),
    "Webbing":  ((0.16, 0.13, 0.08), 0.0, 0.8, None),
    "Skin":     ((0.50, 0.30, 0.22), 0.0, 0.55, None),
    "Hair":     ((0.025, 0.018, 0.012), 0.0, 0.9, None),
    "Eye":      ((0.01, 0.01, 0.012), 0.0, 0.2, None),      # pupils, nostrils
    "Sclera":   ((0.52, 0.47, 0.42), 0.0, 0.25, None),
    "Iris":     ((0.07, 0.04, 0.022), 0.0, 0.2, None),
    "Boot":     ((0.035, 0.033, 0.03), 0.0, 0.7, None),
    "GunDark":  ((0.03, 0.032, 0.035), 0.3, 0.55, None),
    "GunMetal": ((0.30, 0.31, 0.33), 0.9, 0.35, None),
    "Glow":     ((0.3, 0.9, 1.0), 0.0, 0.3, (0.3, 0.9, 1.0)),
}
MAT_ORDER = list(MATS)
for name, (col, met, rough, emis) in MATS.items():
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*col, 1)
    b.inputs["Metallic"].default_value = met
    b.inputs["Roughness"].default_value = rough
    if emis:
        b.inputs["Emission Color"].default_value = (*emis, 1)
        b.inputs["Emission Strength"].default_value = 3.0

# --- the skeleton (rest pose: arms hanging, slight A) -------------------------
# name: (head, tail, parent, roll-axis (local Z points this way), deform)
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
G0 = Vector((0.20, -0.16, 1.20))           # the rifle's grip, at rest
GUN_FWD = Vector((1, 0, 0))


def gp(u, v, w):
    """A point on the rifle in its rest frame: u forward, v lateral, w up."""
    return G0 + Vector((u, v, w))


BONES = {
    "root":       ((0, 0, 0), (0, 0, 0.25), None, -Y, False),
    "hips":       ((0, 0, 0.98), (0, 0, 1.10), "root", X, True),
    "spine":      ((0, 0, 1.10), (0, 0, 1.27), "hips", X, True),
    "chest":      ((0, 0, 1.27), (0, 0, 1.48), "spine", X, True),
    "neck":       ((0.01, 0, 1.49), (0.02, 0, 1.59), "chest", X, True),
    "head":       ((0.02, 0, 1.59), (0.02, 0, 1.82), "neck", X, True),
    "gun":        (tuple(G0), tuple(G0 + GUN_FWD * 0.3), "chest", Z, True),
    "muzzle":     (tuple(gp(0.68, 0, 0.06)), tuple(gp(0.78, 0, 0.06)), "gun", Z, True),
}
for s, side in (("R", -1), ("L", 1)):
    BONES.update({
        f"clavicle.{s}": ((0.02, side * 0.03, 1.45), (0.0, side * 0.19, 1.45), "chest", Z, True),
        f"upperarm.{s}": ((0.0, side * 0.19, 1.45), (-0.02, side * 0.22, 1.14), f"clavicle.{s}", X, True),
        f"forearm.{s}":  ((-0.02, side * 0.22, 1.14), (0.0, side * 0.245, 0.875), f"upperarm.{s}", X, True),
        f"hand.{s}":     ((0.0, side * 0.245, 0.875), (0.0, side * 0.25, 0.70), f"forearm.{s}", Y * side, True),
        f"thigh.{s}":    ((0.0, side * 0.095, 0.95), (0.02, side * 0.10, 0.52), "hips", X, True),
        f"shin.{s}":     ((0.02, side * 0.10, 0.52), (0.0, side * 0.10, 0.09), f"thigh.{s}", X, True),
        f"foot.{s}":     ((0.0, side * 0.10, 0.09), (0.14, side * 0.10, 0.02), f"shin.{s}", Z, True),
        f"foot_ik.{s}":  ((0.0, side * 0.10, 0.09), (0.14, side * 0.10, 0.02), "root", Z, False),
        f"knee_pole.{s}": ((0.7, side * 0.10, 0.52), (0.7, side * 0.10, 0.62), "hips", X, False),
        f"elbow_pole.{s}": ((-0.25, side * 0.55, 1.0), (-0.25, side * 0.55, 1.1), "chest", X, False),
    })
# The hands' grips on the rifle (wrist -> knuckles); local Z = back of hand.
BONES["hand_ik.R"] = (tuple(gp(-0.055, -0.025, 0.005)), tuple(gp(0.055, -0.025, -0.075)), "gun", -Y, False)
BONES["hand_ik.L"] = (tuple(gp(0.20, 0.03, -0.015)), tuple(gp(0.30, 0.0, -0.085)), "gun", Y, False)

arm_data = bpy.data.armatures.new("TrooperRig")
rig = bpy.data.objects.new("Trooper", arm_data)
bpy.context.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
for name, (h, t, parent, roll, deform) in BONES.items():
    eb = arm_data.edit_bones.new(name)
    eb.head, eb.tail = Vector(h), Vector(t)
    eb.align_roll(roll)
    eb.use_deform = deform
for name, (h, t, parent, roll, deform) in BONES.items():
    if parent:
        arm_data.edit_bones[name].parent = arm_data.edit_bones[parent]
REST = {eb.name: eb.matrix.copy() for eb in arm_data.edit_bones}
JOINT = {eb.name: (eb.head.copy(), eb.tail.copy()) for eb in arm_data.edit_bones}
bpy.ops.object.mode_set(mode="OBJECT")

# --- mesh helpers ------------------------------------------------------------
# Every piece is a bmesh in rest-pose world space, with a material and either
# one bone or a function co -> {bone: weight}.
PIECES = []


def put(bm, mat, bone, smooth=True, mat_of=None):
    """mat_of(face) may name another material for that face (None = mat)."""
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        f.material_index = MAT_ORDER.index((mat_of and mat_of(f)) or mat)
        f.smooth = smooth
    PIECES.append((bm, bone))
    return bm


def frame(p0, p1, fwd=X):
    """4x4 with local Z along p0->p1 and local X as near to `fwd` as can be."""
    z = (Vector(p1) - Vector(p0)).normalized()
    x = (fwd - z * fwd.dot(z))
    if x.length < 1e-4:
        x = Vector((0, 1, 0)) - z * z.y
    x.normalize()
    y = z.cross(x)
    m = Matrix((x, y, z)).transposed().to_4x4()
    m.translation = Vector(p0)
    return m


def _sgn(v):
    return 1.0 if v >= 0 else -1.0


def loft(secs, n=20, M=Matrix.Identity(4), cap=(True, True)):
    """Superellipse rings along local Z: secs = [(z, rx, ry, cx, cy, p)].
    rx is the forward (local X) half-depth, ry the lateral half-width; p=2
    is an ellipse, higher is boxier."""
    bm = bmesh.new()
    rings = []
    for z, rx, ry, cx, cy, p in secs:
        ring = []
        for i in range(n):
            a = (i + 0.5) / n * TAU
            c, s = math.cos(a), math.sin(a)
            x = cx + rx * _sgn(c) * abs(c) ** (2 / p)
            y = cy + ry * _sgn(s) * abs(s) ** (2 / p)
            ring.append(bm.verts.new(M @ Vector((x, y, z))))
        rings.append(ring)
    for r0, r1 in zip(rings, rings[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((r0[i], r0[j], r1[j], r1[i]))
    if cap[0]:
        bm.faces.new(rings[0][::-1])
    if cap[1]:
        bm.faces.new(rings[-1])
    return bm


def limb(p0, p1, r0, r1, n=14, flat=1.0, M_fwd=X, ends=3, mid=3):
    """A tapered capsule from p0 to p1. flat scales the forward depth."""
    L = (Vector(p1) - Vector(p0)).length
    secs = []
    for k in range(ends + 1):           # start cap, pole to equator
        th = k / ends * math.pi / 2
        r = max(r0 * math.sin(th), 0.002)
        secs.append((-r0 * math.cos(th), r * flat, r, 0, 0, 2))
    for k in range(1, mid):
        u = k / mid
        r = r0 + (r1 - r0) * u
        secs.append((L * u, r * flat, r, 0, 0, 2))
    for k in range(ends, -1, -1):       # end cap, equator to pole
        th = k / ends * math.pi / 2
        r = max(r1 * math.sin(th), 0.002)
        secs.append((L + r1 * math.cos(th), r * flat, r, 0, 0, 2))
    return loft(secs, n, frame(p0, p1, M_fwd), cap=(True, True))


def box(c, size, bevel=0.006, R=Matrix.Identity(3), segs=2):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=bm.edges[:] + bm.verts[:], offset=bevel, segments=segs,
                        affect="EDGES", profile=0.5)
    M = R.to_4x4()
    M.translation = Vector(c)
    bmesh.ops.transform(bm, matrix=M, verts=bm.verts)
    return bm


def blob(c, radii, n=16, rings=10, R=Matrix.Identity(3), zcut=None):
    """An ellipsoid; zcut keeps only local z >= zcut*rz (a dome)."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=n, v_segments=rings, radius=1.0)
    if zcut is not None:
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, zcut), plane_no=(0, 0, 1), clear_inner=True)
    for v in bm.verts:
        v.co = Vector((v.co.x * radii[0], v.co.y * radii[1], v.co.z * radii[2]))
    M = R.to_4x4()
    M.translation = Vector(c)
    bmesh.ops.transform(bm, matrix=M, verts=bm.verts)
    return bm


def rot(deg, axis):
    return Matrix.Rotation(math.radians(deg), 3, axis)


def mirror(fn):
    """Build a piece for both sides: fn(side, s) with side = -1 (R) / +1 (L)."""
    for s, side in (("R", -1), ("L", 1)):
        fn(side, s)


def ramp(z, a, b):
    t = max(0.0, min(1.0, (z - a) / (b - a)))
    return t * t * (3 - 2 * t)


def torso_w(co):
    """Hips -> spine -> chest by height."""
    z = co.z
    a = ramp(z, 1.03, 1.15)
    b = ramp(z, 1.24, 1.34)
    w = {"hips": 1 - a, "spine": a * (1 - b), "chest": b}
    return {k: v for k, v in w.items() if v > 1e-3}


J = lambda b: JOINT[b][0]          # a bone's head (its joint)
T = lambda b: JOINT[b][1]          # a bone's tail

# --- torso -------------------------------------------------------------------
put(loft([
    (0.84, 0.06, 0.08, 0.0, 0, 2.2),
    (0.90, 0.105, 0.155, 0.0, 0, 2.5),
    (0.97, 0.115, 0.17, 0.0, 0, 2.6),
    (1.04, 0.11, 0.16, 0.0, 0, 2.6),
    (1.11, 0.105, 0.148, 0.0, 0, 2.5),
    (1.20, 0.115, 0.162, 0.005, 0, 2.5),
    (1.30, 0.13, 0.182, 0.01, 0, 2.6),
    (1.39, 0.13, 0.196, 0.0, 0, 2.8),
    (1.45, 0.11, 0.185, -0.005, 0, 2.8),
    (1.49, 0.06, 0.075, 0.0, 0, 2),
], n=24), "Suit", torso_w)

# The vest: a boxy shell over chest and belly, a high collar, plates.
put(loft([
    (1.13, 0.125, 0.168, 0.005, 0, 3.0),
    (1.22, 0.138, 0.180, 0.012, 0, 3.2),
    (1.31, 0.155, 0.200, 0.02, 0, 3.4),
    (1.40, 0.153, 0.212, 0.012, 0, 3.4),
    (1.465, 0.13, 0.19, 0.0, 0, 3.0),
    (1.49, 0.09, 0.12, 0.0, 0, 2.4),
], n=28, cap=(False, False)), "Armor", torso_w)
# Chest plate: two slabs angled like a keel, the XCOM Kevlar silhouette.
for side in (-1, 1):
    put(box((0.17, side * 0.075, 1.36), (0.035, 0.15, 0.17), 0.012,
            rot(side * -14, Z) @ rot(-6, Y)), "Armor", "chest")
    put(box((0.168, side * 0.12, 1.255), (0.03, 0.08, 0.05), 0.008, rot(side * -18, Z)), "Accent", "chest")
put(box((0.185, 0, 1.30), (0.025, 0.05, 0.10), 0.008), "Armor", "chest")  # sternum ridge
for i, z in enumerate((1.17, 1.115, 1.065)):                              # belly plates
    put(box((0.135 - i * 0.004, 0, z), (0.03, 0.17 - i * 0.015, 0.045), 0.01), "Armor",
        "spine" if z > 1.1 else "hips")
# Collar: a thick padded ring, open at the front.
put(loft([(1.465, 0.12, 0.15, -0.005, 0, 2.2), (1.50, 0.115, 0.135, -0.01, 0, 2.2),
          (1.535, 0.10, 0.115, -0.015, 0, 2.2)], n=24, cap=(False, False)), "Armor", "chest")
# Back unit: the power/comms pack.
put(box((-0.185, 0, 1.33), (0.07, 0.24, 0.20), 0.015), "Armor", "chest")
put(box((-0.226, 0, 1.33), (0.012, 0.16, 0.14), 0.004), "Accent", "chest")
for side in (-1, 1):
    put(limb((-0.21, side * 0.09, 1.20), (-0.21, side * 0.09, 1.45), 0.025, 0.025, 10), "GunMetal", "chest")
put(limb((-0.19, -0.10, 1.43), (-0.21, -0.12, 1.66), 0.004, 0.003, 6), "GunMetal", "chest")  # antenna
put(blob((-0.211, -0.12, 1.662), (0.008, 0.008, 0.008), 8, 6), "Glow", "chest")

# Webbing: shoulder straps and a utility belt with pouches.
for side in (-1, 1):
    put(box((0.03, side * 0.135, 1.465), (0.30, 0.045, 0.02), 0.006, rot(side * 4, X)), "Webbing", "chest")
put(loft([(0.985, 0.125, 0.18, 0.0, 0, 2.8), (1.04, 0.122, 0.174, 0.0, 0, 2.8)], n=28, cap=(False, False)),
    "Webbing", "hips")
put(box((0.13, 0, 1.012), (0.02, 0.06, 0.04), 0.005), "GunMetal", "hips")      # buckle
for side in (-1, 1):
    for k, (x, y) in enumerate(((0.115, 0.085), (0.04, 0.165), (-0.06, 0.165))):
        R = rot(side * (12 + k * 30), Z)
        put(box((x, side * y, 1.00), (0.055, 0.035, 0.07), 0.008, R), "Webbing", "hips")
        put(box((x + 0.003, side * (y + 0.008), 1.04), (0.057, 0.037, 0.012), 0.003, R), "Webbing", "hips")
# A grenade on the left chest strap.
put(blob((0.17, 0.15, 1.30), (0.03, 0.03, 0.038), 12, 8), "GunDark", "chest")
put(box((0.17, 0.15, 1.345), (0.012, 0.012, 0.016), 0.002), "GunMetal", "chest")
# Groin and kidney plates.
put(box((0.11, 0, 0.92), (0.03, 0.11, 0.10), 0.012, rot(-8, Y)), "Armor", "hips")
put(box((-0.125, 0, 0.98), (0.03, 0.22, 0.08), 0.012, rot(10, Y)), "Armor", "hips")

# --- head --------------------------------------------------------------------
put(limb((0.012, 0, 1.47), (0.02, 0, 1.63), 0.058, 0.052, 14, flat=1.1), "Skin", "neck")
HEAD = [
    (1.575, 0.02, 0.02, 0.085, 0, 2),
    (1.588, 0.042, 0.037, 0.072, 0, 2),       # chin
    (1.612, 0.072, 0.057, 0.048, 0, 2.2),     # jaw
    (1.645, 0.093, 0.068, 0.032, 0, 2.3),     # mouth / cheeks
    (1.69, 0.10, 0.079, 0.024, 0, 2.3),       # eyes
    (1.73, 0.102, 0.082, 0.016, 0, 2.2),      # brow
    (1.77, 0.092, 0.076, 0.008, 0, 2.1),
    (1.80, 0.064, 0.054, 0.0, 0, 2),
    (1.815, 0.025, 0.022, -0.002, 0, 2),
]


def head_section(z):
    """HEAD interpolated smoothly in z (monotone-ish cubic Hermite)."""
    zs = [s[0] for s in HEAD]
    z = min(max(z, zs[0]), zs[-1])
    k = max(i for i in range(len(zs) - 1) if zs[i] <= z) if z < zs[-1] else len(zs) - 2
    u = (z - zs[k]) / (zs[k + 1] - zs[k])
    h00, h10 = 2 * u**3 - 3 * u**2 + 1, u**3 - 2 * u**2 + u
    h01, h11 = -2 * u**3 + 3 * u**2, u**3 - u**2
    out = []
    for j in range(1, 6):
        v = [s[j] for s in HEAD]
        def slope(i):
            if i == 0 or i == len(zs) - 1:
                return 0.0
            return 0.5 * ((v[i] - v[i - 1]) / (zs[i] - zs[i - 1]) + (v[i + 1] - v[i]) / (zs[i + 1] - zs[i]))
        dz = zs[k + 1] - zs[k]
        out.append(h00 * v[k] + h10 * dz * slope(k) + h01 * v[k + 1] + h11 * dz * slope(k + 1))
    return out  # rx, ry, cx, cy, p


def gauss(d2):
    return math.exp(-0.5 * d2)


# Sculpt features: (y, z, amount, sx, sy, sz, mirrored). Each is a soft bump
# (+) or dent (-) centred on the bare skull's surface at (y, z), pushed along
# the surface normal. Lengths in metres; the face is ~13 cm brow to chin.
EYE_Y, EYE_Z = 0.0325, 1.6935
FEATURES = [
    (EYE_Y, EYE_Z, -0.0115, 0.03, 0.0140, 0.0085, True),      # eye socket
    (EYE_Y + 0.002, EYE_Z + 0.0085, 0.0040, 0.02, 0.012, 0.0030, True),  # upper lid fold
    (EYE_Y + 0.001, EYE_Z - 0.0075, 0.0018, 0.02, 0.011, 0.0022, True),  # lower lid
    (0.031, 1.7135, 0.0065, 0.03, 0.021, 0.0065, True),        # brow ridge
    (0.0, 1.711, 0.0035, 0.03, 0.009, 0.008, False),           # glabella
    (0.052, 1.675, 0.0055, 0.03, 0.016, 0.0105, True),         # cheekbone
    (0.058, 1.640, -0.0040, 0.03, 0.017, 0.014, True),         # under the cheekbone
    (0.075, 1.713, -0.0030, 0.02, 0.014, 0.016, True),         # temple
    (0.020, 1.672, 0.0020, 0.02, 0.012, 0.012, True),          # cheek beside the nose
    (0.0042, 1.6385, 0.0011, 0.02, 0.0019, 0.0042, True),      # philtrum ridges
    (0.0255, 1.6275, -0.0022, 0.02, 0.0032, 0.0030, True),     # mouth corners
    (0.0, 1.6125, -0.0030, 0.02, 0.015, 0.0040, False),        # under the lower lip
    (0.0, 1.5975, 0.0070, 0.025, 0.014, 0.0085, False),        # chin
    (0.066, 1.601, 0.0040, 0.03, 0.012, 0.014, True),          # jaw angle
]
# The nose as a profile down the midline: (z, forward of the skull, half-width).
NOSE = [(1.719, 0.0, 0.010), (1.707, 0.0025, 0.0058), (1.692, 0.0075, 0.0055),
        (1.672, 0.0155, 0.0066), (1.6575, 0.0235, 0.0086), (1.6505, 0.0215, 0.0098),
        (1.6435, 0.0095, 0.0100), (1.6385, 0.0, 0.0120)]
# Lips: (z of the centre, forward, half-height); both span |y| < 0.0245.
LIPS = [(1.6318, 0.0050, 0.0036), (1.6228, 0.0068, 0.0042)]
MOUTH_Z, MOUTH_W = 1.6275, 0.0255


def nose_at(z):
    for (z0, a0, w0), (z1, a1, w1) in zip(NOSE, NOSE[1:]):
        if z1 <= z <= z0:
            u = (z0 - z) / (z0 - z1)
            u = u * u * (3 - 2 * u)
            return a0 + (a1 - a0) * u, w0 + (w1 - w0) * u
    return 0.0, 0.01


def sculpt(co, n):
    """co, n: a bare-skull vertex and its normal -> the sculpted position."""
    if co.x < 0.0:
        return co
    x, y, z = co
    d = 0.0
    for fy, fz, amt, sx, sy, sz, mir in FEATURES:
        for s in ((-1, 1) if mir else (1,)):
            cx = SURF_X(fy * s, fz)
            d += amt * gauss(((x - cx) / sx) ** 2 + ((y - fy * s) / sy) ** 2 + ((z - fz) / sz) ** 2)
    fwd = 0.0
    a, w = nose_at(z)
    if a > 0 and abs(y) < w * 2.4:
        # Flat-topped but soft-sided, so no crease lands between two columns.
        fwd += a * math.exp(-0.5 * (abs(y) / (0.62 * w)) ** 2.4)
    for s in (-1, 1):                     # alae: the nostril wings
        fwd += 0.0085 * gauss(((y - s * 0.0128) / 0.0050) ** 2 + ((z - 1.6465) / 0.0052) ** 2)
        fwd -= 0.0028 * gauss(((y - s * 0.0185) / 0.0022) ** 2 + ((z - 1.6475) / 0.0055) ** 2)  # alar crease
        # Nasolabial fold: a crease from the ala down past the mouth corner,
        # with the cheek bulging softly on its outer side.
        p0, p1 = Vector((s * 0.0205, 1.6475)), Vector((s * 0.0335, 1.6195))
        q, e = Vector((y, z)), p1 - p0
        u = max(0.0, min(1.0, (q - p0).dot(e) / e.length_squared))
        nrm = Vector((e.y, -e.x)).normalized() * s          # points out, to the cheek
        if nrm.x * s < 0:
            nrm = -nrm
        sd = (q - (p0 + e * u)).dot(nrm)
        fade = (1 - 0.6 * u) * gauss((((q - p0).dot(e) / e.length - e.length * u) / 0.004) ** 2)
        fwd += (0.0017 * gauss(((sd - 0.0045) / 0.0035) ** 2) - 0.0014 * gauss((sd / 0.0022) ** 2)) * fade
    lw = 0.0245
    if abs(y) < lw * 1.3:
        taper = max(0.0, 1 - (y / lw) ** 2)
        for lz, la, lh in LIPS:
            fwd += la * taper ** 1.1 * gauss(((z - lz) / (lh * (0.5 + 0.5 * taper))) ** 2)
        # The upper lip's tubercle and its rolled border (Cupid's bow).
        fwd += 0.0016 * gauss((y / 0.006) ** 2 + ((z - 1.6295) / 0.0022) ** 2)
        bow = 1.6352 - 0.0010 * gauss((y / 0.0035) ** 2) + 0.0006 * gauss(((abs(y) - 0.0055) / 0.003) ** 2)
        fwd += 0.0011 * taper * gauss(((z - bow) / 0.0011) ** 2)
        fwd -= 0.0055 * max(0.0, 1 - (y / MOUTH_W) ** 2) ** 0.5 * gauss(((z - MOUTH_Z) / 0.0011) ** 2)
    front = ramp(x, 0.035, 0.075)          # keep it all off the cheeks' sides
    return co + n * d + Vector((1, 0, 0)) * fwd * front


def smooth(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


EYES = []   # eyeball centres and radius, for the lash line


def paint(co):
    """Skin tone over the face as a multiplier on the Skin material (rgb):
    lips, brows, nostrils, the lash line, beard shadow, a little colour in
    the cheeks. Smooth per-vertex colour, so no edge follows the mesh."""
    x, y, z = co
    col = Vector((1.0, 1.0, 1.0))

    def mix(target, k):
        nonlocal col
        col = col.lerp(Vector(target), max(0.0, min(1.0, k)))
    if x < 0.0:
        return col
    ay = abs(y)
    fr = smooth(0.04, 0.08, x)
    # Beard shadow: jaw, chin and upper lip, a cool grey-green under the tone.
    beard = smooth(1.652, 1.640, z) * smooth(0.075, 0.055, ay) * smooth(-0.02, 0.03, x)
    beard *= 1 - 0.85 * gauss((ay / 0.026) ** 2 + ((z - 1.6275) / 0.007) ** 2)  # not on the lips
    mix((0.78, 0.80, 0.80), 0.55 * beard)
    # Warmth in the cheeks and the nose tip.
    mix((1.08, 0.86, 0.84), 0.35 * fr * gauss(((ay - 0.045) / 0.014) ** 2 + ((z - 1.664) / 0.012) ** 2))
    mix((1.06, 0.84, 0.82), 0.4 * fr * gauss((y / 0.009) ** 2 + ((z - 1.656) / 0.008) ** 2))
    # Lips: the vermilion, soft at its border, darker in the slit.
    if ay < 0.03:
        w = smooth(0.0255, 0.0195, ay)
        top = 1.6362 - 0.0048 * (ay / 0.0245) ** 1.5 + 0.0009 * gauss(((ay - 0.0055) / 0.003) ** 2)
        bot = 1.6178 + 0.0080 * (ay / 0.0245) ** 2
        lip = w * smooth(bot - 0.0012, bot + 0.0008, z) * smooth(top + 0.0010, top - 0.0008, z)
        mix((0.80, 0.55, 0.58), 0.9 * lip * fr)
        mix((0.30, 0.18, 0.17), 0.9 * w * gauss(((z - MOUTH_Z) / 0.0009) ** 2) * fr)
    # Brows: a tapered band of hair, streaked so it does not read as a stripe.
    if 0.006 < ay < 0.058 and x > 0.08:
        u = (ay - 0.011) / 0.042
        mid = 1.7165 + 0.0045 * math.sin(max(0.0, u) * math.pi * 0.85) - 0.0035 * u * u
        half = 0.0034 * (1 - 0.5 * max(0.0, u)) + 0.0009
        band = smooth(half + 0.0012, half - 0.0006, abs(z - mid)) * smooth(0.008, 0.013, ay) * smooth(0.056, 0.048, ay)
        streak = 0.8 + 0.2 * math.sin(ay * 2900 + (z - mid) * 900)
        mix((0.10, 0.085, 0.08), 0.95 * band * streak)
    # Nostrils: dark under the tip.
    for s in (-1, 1):
        mix((0.12, 0.07, 0.07), gauss(((y - s * 0.0072) / 0.0028) ** 2 + ((z - 1.6428) / 0.0016) ** 2)
            * smooth(0.124, 0.130, x))
    # Lash line: skin that lies within a millimetre of the eyeball.
    for c, r in EYES:
        dy, dz = y - c.y, z - c.z
        if dy * dy + dz * dz < r * r:
            gap = x - (c.x + math.sqrt(r * r - dy * dy - dz * dz))
            mix((0.22, 0.16, 0.15), 0.9 * gauss((max(0.0, gap) / 0.0011) ** 2))
    # A little shadow in the socket above the lid.
    for s in (-1, 1):
        mix((0.86, 0.80, 0.80), 0.5 * fr * gauss(((y - s * (EYE_Y + 0.003)) / 0.012) ** 2 + ((z - EYE_Z - 0.008) / 0.005) ** 2))
    return col


def face():
    """The head: one surface, rings dense where the face has detail."""
    global SURF_X
    zs, z = [], HEAD[0][0]
    while z < HEAD[-1][0]:
        zs.append(z)
        z += 0.0008 if 1.614 < z < 1.640 else 0.0011 if 1.640 <= z < 1.722 else 0.0032
    zs.append(HEAD[-1][0])
    n = 128
    angles = [u - 0.78 * math.sin(u) for u in (i / n * TAU for i in range(n))]  # dense at the front
    base = []
    for z in zs:
        rx, ry, cx, cy, p = head_section(z)
        ring = []
        for a in angles:
            c, s = math.cos(a), math.sin(a)
            ring.append(Vector((cx + rx * _sgn(c) * abs(c) ** (2 / p), cy + ry * _sgn(s) * abs(s) ** (2 / p), z)))
        base.append(ring)
    front = [(v.y, v.z, v.x) for ring in base for v in ring if v.x > 0.0]

    def surf_x(y, z):
        return min(front, key=lambda t: (t[0] - y) ** 2 + (t[1] - z) ** 2)[2]
    cache = {}

    def SURF_X(y, z):
        if (y, z) not in cache:
            cache[(y, z)] = surf_x(y, z)
        return cache[(y, z)]

    bm = bmesh.new()
    rings = [[bm.verts.new(v) for v in ring] for ring in base]
    for r0, r1 in zip(rings, rings[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((r0[i], r0[j], r1[j], r1[i]))
    bot = bm.verts.new((HEAD[0][3], 0, HEAD[0][0] - 0.004))
    top = bm.verts.new((HEAD[-1][3], 0, HEAD[-1][0] + 0.003))
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((rings[0][j], rings[0][i], bot))
        bm.faces.new((rings[-1][i], rings[-1][j], top))
    bm.normal_update()
    moved = {}
    for v in bm.verts:
        nrm = v.normal.copy()
        if nrm.dot(v.co - Vector((head_section(v.co.z)[2], 0, v.co.z))) < 0:
            nrm.negate()
        moved[v] = sculpt(v.co.copy(), nrm)
    for v, co in moved.items():
        v.co = co
    bmesh.ops.triangulate(bm, faces=bm.faces[:], quad_method="BEAUTY")
    put(bm, "Skin", "head")


def eyeball(side):
    """Sclera, iris and pupil on one ball, set into the socket so the lids
    (the socket's rim) cover its top and bottom."""
    r = 0.0118
    y = side * EYE_Y
    sx = SURF_X(y, EYE_Z) - 0.0115           # the socket floor's x at the eye
    c = Vector((sx + 0.0042 - r, y, EYE_Z))   # the ball stands 4 mm proud of it
    EYES.append((c, r))
    look = Vector((1, -side * 0.06, 0)).normalized()   # a hair of convergence
    # Poles on the line of sight, so the iris and pupil edges are rings.
    bm = blob(c, (r, r, r), 32, 24, R=look.to_track_quat("Z", "Y").to_matrix())

    def mat(f):
        d = (f.calc_center_median() - c).normalized().dot(look)
        return "Eye" if d > 0.99 else "Iris" if d > 0.88 else None
    put(bm, "Sclera", "head", mat_of=mat)


def ear(side):
    """A flattened shell, tipped back and standing off the skull, with the
    bowl (concha) and the groove inside the rim pressed into its outer face."""
    c = Vector((0.004, side * 0.0835, 1.684))
    bm = blob((0, 0, 0), (0.0165, 0.0055, 0.0285), 18, 14)
    for v in bm.verts:
        x, y, z = v.co
        if y > 0:   # the outer face, built for the +y side
            bowl = 0.0055 * gauss((x / 0.0085) ** 2 + ((z + 0.006) / 0.011) ** 2)
            rim = 0.002 * gauss(((math.hypot(x / 0.0165, z / 0.0285) - 0.78) / 0.07) ** 2)
            v.co.y -= bowl + rim
        v.co.x -= 0.004 * (z / 0.0285) ** 2   # the helix curls back at top and lobe
    R = (rot(-side * 18, Z) @ rot(-14, Y)).to_4x4()
    R.translation = c
    if side < 0:
        bmesh.ops.scale(bm, vec=(1, -1, 1), verts=bm.verts)
    bmesh.ops.transform(bm, matrix=R, verts=bm.verts)
    put(bm, "Skin", "head")


face()
# Buzz cut: the skull above the hairline, a few mm proud.
# The cap runs down to the ears, then a slanted cut takes the forehead off
# it, so the hairline sits high at the front and low at the back and sides.
# Sampled from the same smooth profile as the face, so the skin under it
# never pokes through between coarse sections.
HAIR_Z = [1.64 + i * 0.004 for i in range(44)] + [HEAD[-1][0]]
hair = loft([(1.69 + (z - 1.69) * 1.06, rx * 1.045, ry * 1.06, cx - 0.004, 0, p)
             for z in HAIR_Z for rx, ry, cx, _, p in [head_section(z)]], n=96)
bmesh.ops.bisect_plane(hair, geom=hair.verts[:] + hair.edges[:] + hair.faces[:],
                       plane_co=(0.07, 0, 1.722), plane_no=Vector((1, 0, -1.4)).normalized(),
                       clear_outer=True)
bmesh.ops.bisect_plane(hair, geom=hair.verts[:] + hair.edges[:] + hair.faces[:],
                       plane_co=(0.0, 0, 1.675), plane_no=(0, 0, -1), clear_outer=True)
put(hair, "Hair", "head")
for side in (-1, 1):
    ear(side)
for side in (-1, 1):
    eyeball(side)
# Tactical headset: band, right earcup, boom mic with a light.
band = [Vector((0.0, -0.092 * math.cos(t), 1.695 + 0.128 * math.sin(t)))
        for t in (i / 10 * math.pi for i in range(11))]
for a, b in zip(band, band[1:]):
    put(limb(a, b, 0.006, 0.006, 6, ends=1, mid=1), "GunDark", "head")
put(limb((0.012, -0.088, 1.682), (0.012, -0.112, 1.682), 0.032, 0.03, 14, M_fwd=X), "GunDark", "head")
put(limb((0.02, -0.10, 1.665), (0.105, -0.07, 1.632), 0.005, 0.004, 6), "GunMetal", "head")
put(blob((0.108, -0.068, 1.631), (0.009, 0.008, 0.008), 8, 6), "GunDark", "head")
put(blob((0.012, -0.118, 1.695), (0.005, 0.004, 0.005), 8, 6), "Glow", "head")

# --- arms --------------------------------------------------------------------
def arm(side, s):
    sh, el, wr, tip = J(f"upperarm.{s}"), J(f"forearm.{s}"), J(f"hand.{s}"), T(f"hand.{s}")
    ua, fa, hd = f"upperarm.{s}", f"forearm.{s}", f"hand.{s}"
    put(limb(sh + Vector((0, 0, 0.01)), el, 0.062, 0.047, 16), "Suit", ua)
    put(limb(el, wr, 0.047, 0.036, 14), "Suit", fa)
    # Pauldron: a big rounded slab capping the shoulder, a lame under it and
    # an accent edge - the XCOM signature. Local z runs up the arm.
    d = (el - sh).normalized()
    R = frame(sh, sh - d).to_3x3()
    out_ = Vector((0, side, 0))
    put(box(sh + out_ * 0.045 - d * 0.005, (0.20, 0.10, 0.15), 0.042, R @ rot(side * -12, X), 4),
        "Armor", ua)
    put(box(sh + out_ * 0.055 + d * 0.085, (0.17, 0.075, 0.06), 0.022, R @ rot(side * -16, X), 3),
        "Accent", ua)
    # Elbow cop, forearm bracer.
    put(blob(el + Vector((-0.03, side * 0.005, 0)), (0.035, 0.042, 0.04), 12, 8), "Armor", fa)
    put(limb(el + (wr - el) * 0.25, el + (wr - el) * 0.85, 0.052, 0.045, 14, flat=1.05), "Armor", fa)
    put(limb(el + (wr - el) * 0.5, el + (wr - el) * 0.62, 0.0535, 0.0535, 14), "Accent", fa)
    # Glove: palm, curled fingers, thumb, knuckle plate. Back of hand is -side
    # world Y at rest (outward); fingers run wrist -> tip.
    h = (tip - wr).normalized()
    back = Vector((0, side, 0))          # back of the hand: outward
    fwd = h.cross(back).normalized()
    Rh = Matrix((fwd, back, h)).transposed()      # local x = thumb side, y = back, z = fingers
    put(box(wr + h * 0.045, (0.08, 0.034, 0.095), 0.012, Rh), "Suit", hd)
    put(box(wr + h * 0.105 - back * 0.012, (0.078, 0.032, 0.05), 0.012, Rh @ rot(35, X)), "Suit", hd)
    put(limb(wr + h * 0.03 + fwd * 0.035 - back * 0.01, wr + h * 0.085 + fwd * 0.048 - back * 0.03,
             0.012, 0.011, 8), "Suit", hd)
    put(box(wr + h * 0.06 + back * 0.02, (0.07, 0.01, 0.05), 0.004, Rh), "Armor", hd)
    put(limb(wr - h * 0.015, wr + h * 0.01, 0.042, 0.042, 14), "Webbing", fa)  # cuff


mirror(arm)

# --- legs --------------------------------------------------------------------
def leg(side, s):
    hp, kn, an, toe = J(f"thigh.{s}"), J(f"shin.{s}"), J(f"foot.{s}"), T(f"foot.{s}")
    th, sh, ft = f"thigh.{s}", f"shin.{s}", f"foot.{s}"
    out = Vector((0, side, 0))
    put(limb(hp + Vector((0, -side * 0.005, 0.03)), kn, 0.092, 0.06, 16, flat=1.05), "Suit", th)
    put(limb(kn, an + Vector((0, 0, 0.06)), 0.06, 0.044, 16, flat=1.1), "Suit", sh)
    # Cargo pocket + thigh plate (outer side), and a holster on the right.
    put(box(hp + (kn - hp) * 0.5 + out * 0.075, (0.10, 0.03, 0.12), 0.01), "Suit", th)
    put(box(hp + (kn - hp) * 0.32 + Vector((0.07, side * 0.03, 0)), (0.025, 0.11, 0.15), 0.012,
            rot(-6, Y)), "Armor", th)
    if side < 0:
        put(box(hp + (kn - hp) * 0.42 + out * 0.105 + Vector((0.01, 0, 0)), (0.09, 0.035, 0.16), 0.01,
                rot(-12, Y)), "Webbing", th)
        put(box(hp + (kn - hp) * 0.32 + out * 0.105 + Vector((0.025, 0, 0.04)), (0.035, 0.03, 0.06), 0.006),
            "GunDark", th)
    # Knee pad: a fat dome on the front of the knee.
    # (rot 90 about Y: radii are vertical, lateral, forward.)
    put(blob(kn + Vector((0.035, 0, 0.0)), (0.075, 0.062, 0.042), 16, 10, rot(90, Y), zcut=-0.2), "Armor", sh)
    put(box(kn + Vector((0.074, 0, 0.0)), (0.012, 0.05, 0.045), 0.005), "Accent", sh)
    # Shin guard.
    put(box(kn + (an - kn) * 0.42 + Vector((0.04, 0, 0)), (0.025, 0.085, 0.22), 0.012, rot(-3, Y)), "Armor", sh)
    # Boot: shaft, foot, toe cap, sole, heel.
    put(limb(an + Vector((0, 0, -0.02)), an + Vector((0, 0, 0.15)), 0.057, 0.06, 14, flat=1.1), "Boot", sh)
    put(loft([(-0.05, 0.035, 0.05, 0, 0, 2.6), (0.0, 0.055, 0.052, 0, 0, 2.6),
              (0.10, 0.048, 0.050, 0, 0, 2.6), (0.17, 0.035, 0.045, -0.01, 0, 2.4),
              (0.205, 0.015, 0.03, -0.015, 0, 2.2)], 16,
             frame(Vector((an.x - 0.0, an.y, 0.055)), Vector((an.x + 1, an.y, 0.055)), Z)), "Boot", ft)
    put(box((an.x + 0.07, an.y, 0.012), (0.27, 0.105, 0.024), 0.006), "GunDark", ft)
    put(box((an.x + 0.175, an.y, 0.045), (0.05, 0.09, 0.04), 0.012), "Armor", ft)


mirror(leg)

# --- rifle: a chunky XCOM-style assault rifle, rest frame at G0 ----------------
GR = Matrix.Identity(3)
gun_parts = [
    # (centre (u,v,w), size, material, bevel, extra rotation)
    ((0.07, 0, 0.05), (0.32, 0.055, 0.095), "GunDark", 0.008, None),     # receiver
    ((0.07, 0, 0.104), (0.30, 0.032, 0.016), "GunMetal", 0.003, None),   # top rail
    ((0.08, -0.0285, 0.05), (0.22, 0.004, 0.03), "Accent", 0.0015, None),  # side stripe
    ((0.30, 0, 0.055), (0.17, 0.065, 0.075), "GunDark", 0.012, None),    # handguard
    ((0.30, -0.033, 0.055), (0.12, 0.004, 0.012), "GunMetal", 0.001, None),  # vent
    ((0.30, -0.033, 0.035), (0.12, 0.004, 0.012), "GunMetal", 0.001, None),
    ((0.12, 0, -0.045), (0.05, 0.032, 0.12), "GunMetal", 0.006, rot(-12, Y)),  # magazine
    ((-0.005, 0, -0.035), (0.035, 0.03, 0.095), "GunDark", 0.008, rot(-18, Y)),  # pistol grip
    ((0.045, 0, -0.015), (0.06, 0.008, 0.006), "GunMetal", 0.0015, None),  # trigger guard
    ((0.275, 0, -0.035), (0.03, 0.028, 0.075), "GunDark", 0.008, rot(-8, Y)),  # foregrip
    ((-0.17, 0, 0.04), (0.22, 0.045, 0.065), "GunDark", 0.01, None),     # stock
    ((-0.20, 0, 0.0), (0.12, 0.035, 0.03), "GunDark", 0.008, rot(10, Y)),   # stock lower
    ((-0.285, 0, 0.02), (0.03, 0.05, 0.12), "Webbing", 0.01, None),      # butt pad
    ((0.62, 0, 0.06), (0.06, 0.034, 0.034), "GunDark", 0.006, None),     # muzzle brake
    ((0.37, -0.036, 0.075), (0.04, 0.012, 0.022), "GunDark", 0.003, None),  # light housing
    ((0.04, 0, 0.13), (0.02, 0.026, 0.035), "GunDark", 0.003, None),     # scope mounts
    ((0.12, 0, 0.13), (0.02, 0.026, 0.035), "GunDark", 0.003, None),
]
for (u, v, w), size, mat, bev, R in gun_parts:
    put(box(gp(u, v, w), size, bev, R or GR, segs=1 if bev < 0.004 else 2), mat, "gun", smooth=False)
put(limb(gp(0.38, 0, 0.06), gp(0.60, 0, 0.06), 0.012, 0.012, 10), "GunMetal", "gun")    # barrel
put(limb(gp(0.0, 0, 0.152), gp(0.17, 0, 0.152), 0.024, 0.026, 14), "GunDark", "gun")   # scope tube
put(blob(gp(0.175, 0, 0.152), (0.004, 0.02, 0.02), 12, 6), "Glow", "gun")               # objective
put(blob(gp(0.39, -0.043, 0.075), (0.004, 0.007, 0.007), 8, 6), "Glow", "gun")          # light lens

# --- one skinned mesh --------------------------------------------------------
me = bpy.data.meshes.new("TrooperMesh")
body = bpy.data.objects.new("TrooperBody", me)
bpy.context.collection.objects.link(body)
for name in MAT_ORDER:
    me.materials.append(bpy.data.materials[name])
master = bmesh.new()
tmp = bpy.data.meshes.new("tmp")
ranges = []
for bm, bone in PIECES:
    start = len(master.verts)
    bm.to_mesh(tmp)
    bm.free()
    master.from_mesh(tmp)
    master.verts.ensure_lookup_table()
    ranges.append((start, len(master.verts), bone))
bpy.data.meshes.remove(tmp)
master.to_mesh(me)
master.free()
paint_layer = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
skin_i = MAT_ORDER.index("Skin")
head_verts = set()
for start, end, bone in ranges:
    if bone == "head":
        head_verts.update(range(start, end))
skin_verts = {vi for p in me.polygons if p.material_index == skin_i for vi in p.vertices}
for v in me.vertices:
    c = paint(v.co) if v.index in head_verts and v.index in skin_verts else Vector((1, 1, 1))
    paint_layer.data[v.index].color = (c.x, c.y, c.z, 1.0)
me.color_attributes.active_color = paint_layer
skin = bpy.data.materials["Skin"].node_tree
attr = skin.nodes.new("ShaderNodeVertexColor")
attr.layer_name = "Col"
mul = skin.nodes.new("ShaderNodeMix")
mul.data_type, mul.blend_type = "RGBA", "MULTIPLY"
mul.inputs["Factor"].default_value = 1.0
mul.inputs[6].default_value = skin.nodes["Principled BSDF"].inputs["Base Color"].default_value
skin.links.new(attr.outputs["Color"], mul.inputs[7])
skin.links.new(mul.outputs[2], skin.nodes["Principled BSDF"].inputs["Base Color"])
groups = {}
for b in BONES:
    if BONES[b][4]:
        groups[b] = body.vertex_groups.new(name=b)
for start, end, bone in ranges:
    for i in range(start, end):
        if callable(bone):
            for b, w in bone(me.vertices[i].co).items():
                groups[b].add([i], w, "REPLACE")
        else:
            groups[bone].add([i], 1.0, "REPLACE")
body.parent = rig
mod = body.modifiers.new("Armature", "ARMATURE")
mod.object = rig

# --- constraints: two-bone IK to the rifle and the ankles --------------------
pose = rig.pose.bones
for s in ("R", "L"):
    for chain, target, pole, end in ((f"forearm.{s}", f"hand_ik.{s}", f"elbow_pole.{s}", f"hand.{s}"),
                                     (f"shin.{s}", f"foot_ik.{s}", f"knee_pole.{s}", f"foot.{s}")):
        c = pose[chain].constraints.new("IK")
        c.target, c.subtarget = rig, target
        c.pole_target, c.pole_subtarget = rig, pole
        c.chain_count = 2
        c.use_tail = True
        cr = pose[end].constraints.new("COPY_ROTATION")
        cr.target, cr.subtarget = rig, target
for pb in pose:
    pb.rotation_mode = "QUATERNION"


def pick_pole_angles():
    """Choose each IK's pole angle so its middle joint bends toward the pole."""
    for s in ("R", "L"):
        for chain, pole in ((f"forearm.{s}", f"elbow_pole.{s}"), (f"shin.{s}", f"knee_pole.{s}")):
            c = pose[chain].constraints["IK"]
            best = None
            for deg in range(-180, 180, 15):
                c.pole_angle = math.radians(deg)
                bpy.context.view_layer.update()
                mid = rig.matrix_world @ pose[chain].head
                d = (mid - rig.matrix_world @ pose[pole].head).length
                if best is None or d < best[0]:
                    best = (d, deg)
            c.pole_angle = math.radians(best[1])


pick_pole_angles()

# --- posing helpers ------------------------------------------------------------
def reset_pose():
    for pb in pose:
        pb.location = (0, 0, 0)
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.scale = (1, 1, 1)


def rotw(name, deg=(0, 0, 0)):
    """Rotate a bone by an armature-space XYZ euler (degrees) about its joint."""
    R = REST[name].to_3x3()
    Q = Euler([math.radians(a) for a in deg], "XYZ").to_matrix()
    pose[name].rotation_quaternion = (R.inverted() @ Q @ R).to_quaternion()


def place(name, loc, deg=(0, 0, 0)):
    """Put a bone's head at an armature-space point, rotated from rest by an
    armature-space euler. Parents must already be posed."""
    bpy.context.view_layer.update()
    Q = Euler([math.radians(a) for a in deg], "XYZ").to_matrix()
    M = (Q @ REST[name].to_3x3()).to_4x4()
    M.translation = Vector(loc)
    pose[name].matrix = M
    bpy.context.view_layer.update()


def offset(name, v):
    """Translate a bone by an armature-space vector (rest-relative)."""
    R = REST[name].to_3x3()
    pose[name].location = R.inverted() @ Vector(v)


KEYED = ["hips", "spine", "chest", "neck", "head", "clavicle.R", "clavicle.L", "gun",
         "foot_ik.R", "foot_ik.L"]


def key(frame):
    for n in KEYED:
        pose[n].keyframe_insert("location", frame=frame)
        pose[n].keyframe_insert("rotation_quaternion", frame=frame)


def new_action(name, end):
    rig.animation_data_create()
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    rig.animation_data.action = act
    act.use_frame_range = True
    act.frame_start, act.frame_end = 0, end
    act.use_cyclic = True
    return act


def stash(act):
    tr = rig.animation_data.nla_tracks.new()
    tr.name = act.name
    st = tr.strips.new(act.name, 0, act)
    if hasattr(st, "action_slot") and len(getattr(act, "slots", [])):
        st.action_slot = act.slots[0]
    tr.mute = True
    rig.animation_data.action = None


def gun_world(at, pitch=0.0, yaw=0.0, roll=0.0):
    """Put the rifle's grip at `at`, pitch + = muzzle down (degrees)."""
    place("gun", at, (roll, pitch, yaw))


def stance(feet, hips_drop=0.0, hips_rot=(0, 0, 0)):
    for s, (x, y, pitch, yaw) in feet.items():
        place(f"foot_ik.{s}", (x, y, 0.09 + max(0.0, -pitch) * 0.0015), (0, pitch, yaw))
    offset("hips", (0, 0, -hips_drop))
    rotw("hips", hips_rot)


# --- IDLE: low ready, weight on the back foot, breathing, a glance ----------
act = new_action("Idle", 60)
for f in (0, 15, 30, 45, 60):
    reset_pose()
    ph = f / 60 * TAU
    br = math.sin(ph)                 # one breath per loop
    stance({"R": (-0.07, -0.13, 0, -8), "L": (0.10, 0.12, 0, 12)},
           hips_drop=0.035 + 0.006 * br, hips_rot=(1.5 * math.sin(ph), 0, -18))
    offset("hips", (0.0, -0.012 + 0.008 * math.sin(ph), -0.035 - 0.006 * br))
    rotw("spine", (0, 3 + 0.8 * br, -6))
    rotw("chest", (0, 2 - 1.6 * br, -4))
    rotw("clavicle.R", (-1.5 * br, 0, 0))
    rotw("clavicle.L", (1.5 * br, 0, 0))
    look = {0: 0, 15: 6, 30: 18, 45: 6, 60: 0}[f]
    rotw("neck", (0, -2, 10 + look * 0.4))
    rotw("head", (look * 0.05, 4, 14 + look * 0.6))
    gun_world((0.24, -0.14, 1.19 + 0.008 * br), 26 - 1.5 * br, 8)
    key(f)
stash(act)

# --- RUN: two strides on the spot, rifle carried at the port -----------------
# Right foot path over 20 frames (x, z-lift, pitch); left is half a cycle on.
FOOT = [  # frame, x, lift, pitch(+ toe down)
    (0, 0.30, 0.025, -18), (2, 0.20, 0.0, -4), (4, 0.06, 0.0, 0), (6, -0.10, 0.01, 8),
    (8, -0.26, 0.07, 40), (10, -0.32, 0.20, 65), (12, -0.24, 0.34, 80), (14, -0.04, 0.36, 40),
    (16, 0.18, 0.24, -5), (18, 0.32, 0.10, -22), (20, 0.30, 0.025, -18)]


def foot_at(fr):
    fr %= 20
    for (f0, x0, z0, p0), (f1, x1, z1, p1) in zip(FOOT, FOOT[1:]):
        if f0 <= fr <= f1:
            u = (fr - f0) / (f1 - f0)
            return x0 + (x1 - x0) * u, z0 + (z1 - z0) * u, p0 + (p1 - p0) * u
    return FOOT[0][1:]


act = new_action("Run", 20)
for f in range(0, 21, 1):
    reset_pose()
    ph = f / 20 * TAU
    for s, y, off in (("R", -0.11, 0), ("L", 0.11, 10)):
        x, lift, pitch = foot_at(f + off)
        place(f"foot_ik.{s}", (x + 0.04, y, 0.09 + lift), (0, pitch, 0))
    # Low at each footfall (frames ~2 and ~12), high mid-flight.
    bob = 0.03 * math.cos(2 * ph - 2 * TAU * 2 / 20)
    offset("hips", (0.06, 0.012 * math.sin(ph), -0.06 + bob))
    rotw("hips", (3 * math.sin(ph), 10, -12 * math.cos(ph)))
    rotw("spine", (0, 8, 7 * math.cos(ph)))
    rotw("chest", (-2 * math.sin(ph), 3, 4 * math.cos(ph) - 8))
    rotw("neck", (0, -6, 0))
    rotw("head", (0, -8, 10 - 6 * math.cos(ph)))
    gun_world((0.30, -0.15, 1.20 - 0.4 * bob), 20 + 3 * math.sin(2 * ph), 14 + 3 * math.cos(ph))
    key(f)
stash(act)

# --- SHOOT: bladed stance, rifle shouldered, a three-round burst ------------
act = new_action("Shoot", 30)
SHOTS = (0, 5, 10)


def kick(f):
    """Recoil, 0..1: snaps to 1 on a shot and decays over ~4 frames."""
    k = 0.0
    for s in SHOTS + (30,):
        d = f - s
        if 0 <= d < 5:
            k = max(k, (1 - d / 5) ** 2)
    return k


for f in range(0, 31):
    reset_pose()
    k = kick(f)
    sway = math.sin(f / 30 * TAU)
    stance({"R": (-0.17, -0.15, 0, -30), "L": (0.19, 0.10, 0, 10)},
           hips_drop=0.05, hips_rot=(0, 0, -18))
    offset("hips", (-0.015 - 0.008 * k, 0, -0.05))
    rotw("spine", (0, 4 - 2.5 * k, -10))
    rotw("chest", (0, 6 - 3.5 * k, -8))
    rotw("clavicle.R", (0, -4 * k, 0))
    rotw("neck", (0, 6, 16))
    rotw("head", (-8, 10 - 2 * k, 20))
    gun_world((0.25 - 0.055 * k, -0.125, 1.465 + 0.012 * k + 0.003 * sway), -11 * k + 0.6 * sway, 0)
    key(f)
stash(act)

# Make every clip loop exactly (linear between keys for Run/Shoot keeps the
# sampled frames honest; Idle stays Bezier, its keys are sparse).
for a in bpy.data.actions:
    if a.name == "Idle":
        continue
    fcs = []
    if hasattr(a, "layers") and len(a.layers):
        for layer in a.layers:
            for strip in layer.strips:
                for cb in strip.channelbags:
                    fcs += list(cb.fcurves)
    else:
        fcs = list(a.fcurves)
    for fc in fcs:
        for kp in fc.keyframe_points:
            kp.interpolation = "LINEAR"

# Leave Idle active so the .blend opens posed.
reset_pose()
rig.animation_data.action = bpy.data.actions["Idle"]
for tr in rig.animation_data.nla_tracks:
    tr.mute = False
bpy.context.scene.frame_set(0)

# --- export ----------------------------------------------------------------
bpy.ops.object.select_all(action="DESELECT")
rig.select_set(True)
body.select_set(True)
bpy.context.view_layer.objects.active = rig
me.calc_loop_triangles()
STATS = {"tris": len(me.loop_triangles), "verts": len(me.vertices),
         "dims": [round(d, 3) for d in body.dimensions], "bones": len(arm_data.bones),
         "actions": [a.name for a in bpy.data.actions]}
bpy.ops.export_scene.gltf(filepath=os.path.join(MODELS, "trooper.glb"), use_selection=True,
                          export_format="GLB", export_animations=True,
                          export_animation_mode="ACTIONS", export_force_sampling=True,
                          export_def_bones=False, export_apply=False,
                          export_vertex_color="ACTIVE")
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(MODELS, "trooper.blend"))
