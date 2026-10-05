# The game's enemy roster, re-modelled for the graphics tester. Run in Blender:
#   exec(open(r"...\models\enemies.py").read())
# or headless:  blender -b --factory-startup --python enemies.py
#
# One enemies.glb, tester-only. Each enemy is an armature (named after its
# spec id) with ONE rigidly skinned mesh, so it costs two draw calls whatever
# moves: every part is weighted 1.0 to a single bone, and
# graphics-tester/enemies.js animates the bones by name.
#   Shell  - the armour / hull; enemies.js tints it with the spec's colour.
#   Detail - everything else, colour and glow from PALETTE below (16x1).
# Units are game pixels: the origin is the centre of the spec's box, +X is the
# facing side, +Z up, -Y towards the camera (glTF maps it to three's +Z).
# Every bone points straight up (+Z) with no roll, so in three each bone's
# local axes are the world's: rotation.z swings a part in the screen plane.
#
# Budget (phones): ~300-700 triangles a regular enemy, the boss ~1,500 with
# both wings. export() prints the counts.
exec(open(r"C:\Users\jeffr\OneDrive\Documents\my-games\side-scroller\graphics-tester\models\kit.py").read())

# kit.py's palette serves the armour; the roster needs more glows. Redefined
# here only, so helmet/chest exports are untouched.
PALETTE = {
    "trim":     ((0.27, 0.29, 0.35), (0, 0, 0)),
    "chitin":   ((0.22, 0.19, 0.25), (0.02, 0.015, 0.03)),
    "bone":     ((0.86, 0.80, 0.66), (0, 0, 0)),
    "flesh":    ((0.42, 0.08, 0.09), (0.08, 0.0, 0.0)),
    "eye":      ((1.00, 0.35, 0.24), (1.00, 0.30, 0.18)),
    "orb":      ((0.54, 1.00, 0.76), (0.40, 0.95, 0.62)),
    "spore":    ((0.75, 0.95, 0.60), (0.60, 0.90, 0.40)),
    "gold":     ((1.00, 0.85, 0.45), (0.95, 0.70, 0.25)),
    "teal":     ((0.45, 1.00, 0.85), (0.28, 0.90, 0.72)),
    "violet":   ((0.85, 0.55, 1.00), (0.72, 0.38, 0.95)),
    "metal":    ((0.62, 0.65, 0.70), (0, 0, 0)),
    "gunmetal": ((0.26, 0.28, 0.33), (0, 0, 0)),
    "membrane": ((0.55, 0.82, 0.85), (0.06, 0.16, 0.18)),
    "engine":   ((1.00, 0.90, 0.70), (1.00, 0.72, 0.42)),
    "skin":     ((0.58, 0.64, 0.56), (0, 0, 0)),
    "seeker":   ((1.00, 0.48, 0.35), (0.95, 0.40, 0.25)),
}
SLOTS = list(PALETTE)
PW = len(SLOTS)

for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
for a in list(bpy.data.armatures):
    bpy.data.armatures.remove(a)
SHELL, DETAIL = materials()
TAU = math.tau


# --- primitives (each returns a fresh bmesh) ---------------------------------
def tidy(bm):
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=1e-4)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def ell(c, r, seg=8, rings=5):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1)
    bmesh.ops.scale(bm, vec=r, verts=bm.verts)
    bmesh.ops.translate(bm, vec=c, verts=bm.verts)
    return bm


def cone(p0, p1, r0, r1=0.0, sides=5):
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=sides,
                          radius1=r0, radius2=r1, depth=d.length)
    bmesh.ops.translate(bm, vec=(0, 0, d.length / 2), verts=bm.verts)
    q = Vector((0, 0, 1)).rotation_difference(d.normalized())
    bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=q.to_matrix(), verts=bm.verts)
    bmesh.ops.translate(bm, vec=p0, verts=bm.verts)
    return tidy(bm)


def limb(pts, radii, sides=5):
    """A chain of cones through pts; radii[i] at pts[i]."""
    return merge([cone(pts[i], pts[i + 1], radii[i], radii[i + 1], sides) for i in range(len(pts) - 1)])


def loft(rings, sides=8, caps=True):
    """rings: (centre, U, V) - each ring is centre + cos(a)U + sin(a)V. A
    zero-size ring is a single point (a pointed end)."""
    bm = bmesh.new()
    vs = []
    for c, U, W in rings:
        c, U, W = Vector(c), Vector(U), Vector(W)
        if U.length < 1e-5 and W.length < 1e-5:
            vs.append([bm.verts.new(c)])
        else:
            vs.append([bm.verts.new(c + math.cos(k / sides * TAU) * U + math.sin(k / sides * TAU) * W)
                       for k in range(sides)])
    for A, B in zip(vs, vs[1:]):
        for j in range(sides):
            j1 = (j + 1) % sides
            if len(A) == 1: bm.faces.new((A[0], B[j], B[j1]))
            elif len(B) == 1: bm.faces.new((A[j], A[j1], B[0]))
            else: bm.faces.new((A[j], A[j1], B[j1], B[j]))
    if caps:
        if len(vs[0]) > 1: bm.faces.new(vs[0][::-1])
        if len(vs[-1]) > 1: bm.faces.new(vs[-1])
    return tidy(bm)


def rx(x, yc, zc, ry, rz):
    """A ring across the X axis (bodies that run nose to tail)."""
    return ((x, yc, zc), (0, ry, 0), (0, 0, rz))


def rz(x, y, z, rxx, ryy):
    """A horizontal ring (bodies that stand up)."""
    return ((x, y, z), (rxx, 0, 0), (0, ryy, 0))


def grid(fn, nu, nv):
    bm = bmesh.new()
    vs = [[bm.verts.new(fn(i / nu, j / nv)) for j in range(nv + 1)] for i in range(nu + 1)]
    for i in range(nu):
        for j in range(nv):
            bm.faces.new((vs[i][j], vs[i + 1][j], vs[i + 1][j + 1], vs[i][j + 1]))
    return bm


def thick(bm, t):
    """Give an open sheet thickness (closed, normals out)."""
    bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=t)
    return tidy(bm)


def arc_plate(xf, xb, rf, rb, zc, span=1.9, ridge=0.6, nu=2, nv=6, t=0.8, yc=0.0):
    """A shell plate arched over the X axis: from xf (front, radius rf) back to
    xb (radius rb), spanning +-span radians either side of straight up, with
    a keel down the middle."""
    def at(u, v):
        a = (v * 2 - 1) * span
        r = rf + (rb - rf) * u + ridge * (1 - abs(v * 2 - 1))
        return (xf + (xb - xf) * u, yc + r * math.sin(a), zc + r * math.cos(a))
    return thick(grid(at, nu, nv), t)


def slab(pts, plane="xz", at=0.0, t=1.0):
    """A flat polygon with thickness t, centred on `at` along the third axis."""
    bm = bmesh.new()
    if plane == "xz": vs = [bm.verts.new((p[0], at - t / 2, p[1])) for p in pts]; n = Vector((0, t, 0))
    else: vs = [bm.verts.new((p[0], p[1], at - t / 2)) for p in pts]; n = Vector((0, 0, t))
    f = bm.faces.new(vs)
    ext = bmesh.ops.extrude_face_region(bm, geom=[f])
    bmesh.ops.translate(bm, vec=n, verts=[e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)])
    return tidy(bm)


def cut(bm, co, no):
    """Keep the side of the plane `no` points to."""
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=Vector(no), clear_inner=True)
    return bm


def merge(bms):
    bm = bmesh.new()
    me = bpy.data.meshes.new("tmp")
    for b in bms:
        b.to_mesh(me); b.free()
        bm.from_mesh(me)
    bpy.data.meshes.remove(me)
    return bm


def xform(bm, m=None, t=(0, 0, 0), about=(0, 0, 0)):
    if m is not None:
        bmesh.ops.rotate(bm, cent=about, matrix=m, verts=bm.verts)
    bmesh.ops.translate(bm, vec=t, verts=bm.verts)
    return bm


def both(fn):
    """fn(s) for s = +1 and -1 (the two sides in Y), merged."""
    return merge([fn(1), fn(-1)])


# --- one enemy: an armature + one rigidly skinned mesh ------------------------
class Enemy:
    def __init__(self, name):
        self.name = name
        self.parts = []
        self.bones = {"root": ((0, 0, 0), None)}

    def bone(self, name, head, parent="root"):
        self.bones[name] = (head, parent)

    def add(self, bm, slot="shell", bone="root", smooth=False):
        self.parts.append((bm, slot, bone, smooth))

    def build(self, skinned=True):
        objs = []
        for i, (bm, slot, bone, smooth) in enumerate(self.parts):
            me = bpy.data.meshes.new(f"{self.name}.{i}")
            uv = bm.loops.layers.uv.new("UVMap")
            u = 0.0 if slot == "shell" else (SLOTS.index(slot) + 0.5) / PW
            for f in bm.faces:
                for l in f.loops: l[uv].uv = (u, 0.5)
            bm.to_mesh(me); bm.free()
            for p in me.polygons: p.use_smooth = smooth
            me.materials.append(SHELL if slot == "shell" else DETAIL)
            o = bpy.data.objects.new(me.name, me)
            bpy.context.collection.objects.link(o)
            o.vertex_groups.new(name=bone).add(range(len(me.vertices)), 1.0, "REPLACE")
            objs.append(o)
        bpy.ops.object.select_all(action="DESELECT")
        for o in objs: o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        bpy.ops.object.join()
        mesh = bpy.context.active_object
        mesh.name = self.name if not skinned else self.name + "_mesh"
        # Shell first, whichever part came first.
        mats = [m.name for m in mesh.data.materials]
        if mats == ["Detail", "Shell"]:
            for p in mesh.data.polygons: p.material_index = 1 - p.material_index
            mesh.data.materials[0], mesh.data.materials[1] = SHELL, DETAIL
        if not skinned:
            return mesh, None
        arm = bpy.data.objects.new(self.name, bpy.data.armatures.new(self.name + "_rig"))
        bpy.context.collection.objects.link(arm)
        bpy.ops.object.select_all(action="DESELECT")
        bpy.context.view_layer.objects.active = arm
        bpy.ops.object.mode_set(mode="EDIT")
        eb = {}
        for n, (head, parent) in self.bones.items():
            b = arm.data.edit_bones.new(n)
            b.head = Vector(head)
            b.tail = Vector(head) + Vector((0, 0, 4))
            b.roll = 0
            eb[n] = b
        for n, (head, parent) in self.bones.items():
            if parent: eb[n].parent = eb[parent]
        bpy.ops.object.mode_set(mode="OBJECT")
        mesh.parent = arm
        mod = mesh.modifiers.new("rig", "ARMATURE")
        mod.object = arm
        return mesh, arm


BUILT = []   # (mesh, armature or None)


# =============================================================================
# HUSK CHARGER - 30x26, red, chases and rams. A low pill-bug hound: three
# overlapping carapace plates, a horned ram skull, four claw legs.
# =============================================================================
E = Enemy("husk_charger")
E.bone("head", (6, 0, 0))
for n, x in (("legFL", 4), ("legBL", -8)):
    E.bone(n, (x, 6, -3))
    E.bone(n.replace("L", "R"), (x, -6, -3))
E.add(loft([rx(-13.5, 0, 1, 0, 0), rx(-11, 0, 1, 4, 4), rx(-6, 0, 1.5, 7, 6.5), rx(0, 0, 1, 7.5, 6),
            rx(5, 0, 0, 6, 5), rx(8, 0, -0.5, 4, 3.6)], 8), "flesh", smooth=True)
for xf, xb, rf, rb, zc in ((7.5, 0, 6.2, 8.6, 0.6), (2, -6, 7.8, 9.4, 1.2), (-4.5, -12.5, 8.6, 6.6, 1.2)):
    E.add(arc_plate(xf, xb, rf, rb, zc, span=1.75, ridge=0.9, nu=2, nv=6, t=0.9))
    E.add(cone((xb + 1.2, 0, zc + rb), (xb - 2.2, 0, zc + rb + 3.6), 1.1, 0, 4), "bone")
# The skull, horns, mandibles and eyes ride the head bone.
E.add(loft([rx(5, 0, 0.8, 4.8, 5), rx(9.5, 0, 0.2, 4.6, 4.2), rx(13.5, 0, -1.4, 3, 2.6), rx(16.5, 0, -2.6, 0, 0)], 7), bone="head")
E.add(both(lambda s: limb([(8.5, 3.4 * s, 3), (11.5, 6.4 * s, 6.2), (16.5, 6.8 * s, 7.4)], [1.6, 1.0, 0.1], 5)), "bone", "head")
E.add(both(lambda s: cone((13, 2.2 * s, -3), (17.8, 1.2 * s, -5.8), 0.9, 0, 4)), "bone", "head")
E.add(both(lambda s: ell((12.2, 3.1 * s, 0.9), (1.5, 0.7, 0.8), 6, 4)), "eye", "head")
for n, (hip, knee, foot) in {
    "legFL": ((4, 6, -3), (7.5, 8.8, -6.5), (5.5, 8.2, -13)),
    "legBL": ((-8, 6.5, -2), (-12.5, 9, -5.5), (-9.5, 8.6, -13)),
}.items():
    for s, bn in ((1, n), (-1, n.replace("L", "R"))):
        f = lambda p: (p[0], p[1] * s, p[2])
        E.add(limb([f(hip), f(knee), f(foot)], [2.0, 1.4, 0.3], 5), "chitin", bn)
        E.add(cone(f((hip[0], hip[1] + 0.5, hip[2] + 0.3)), f((knee[0], knee[1] + 0.4, knee[2] + 1.2)), 1.6, 0.6, 4), bone=bn)
BUILT.append(E.build())


# =============================================================================
# LURK GUNNER - 34x46, purple, keeps its distance and lobs green orbs. A
# hunched biped under a domed back shell, three eyes down a long head, and a
# heavy orb cannon on its near arm.
# =============================================================================
E = Enemy("lurk_gunner")
# Each leg is three bones - hip, knee, ankle - so enemies.js can plant the
# foot (two-bone IK on hip and knee, the ankle keeps the foot level).
for s, side in ((1, "L"), (-1, "R")):
    E.bone("leg" + side, (-1, 4 * s, -5))
    E.bone("shin" + side, (4, 5 * s, -12), "leg" + side)
    E.bone("foot" + side, (-2, 5 * s, -19), "shin" + side)
E.bone("head", (6, 0, 11))
E.bone("gun", (3, -7, 6))
for s, side in ((1, "L"), (-1, "R")):
    f = lambda p: (p[0], p[1] * s, p[2])
    E.add(cone(f((-1, 4, -5)), f((4, 5, -12)), 2.8, 1.9, 5), "chitin", "leg" + side)          # thigh
    E.add(cone(f((4, 5, -12)), f((-2, 5, -19)), 1.9, 1.3, 5), "chitin", "shin" + side)        # shin
    E.add(merge([cone(f((-2, 5, -19)), f((-1, 5, -22.5)), 1.3, 1.0, 5),
                 cone(f((-1.5, 5, -22.5)), f((5, 5, -23)), 1.5, 0.3, 4)]), "chitin", "foot" + side)  # ankle + foot
    E.add(cone(f((-1.5, 5, -21.5)), f((-5, 5, -22.8)), 0.9, 0, 4), "bone", "foot" + side)   # heel spur
    bn = "leg" + side
    E.add(ell(f((1.5, 5.3, -8.5)), (3.4, 1.8, 4.2), 6, 4), bone=bn)                  # thigh plate
E.add(loft([rz(-1, 0, -7, 5, 4.5), rz(0, 0, -1, 7, 6), rz(2, 0, 5, 7.5, 6.5), rz(5, 0, 9.5, 5.5, 5),
            rz(7, 0, 12, 0, 0)], 8), smooth=True)
# The back shell: a tilted dome, cut to the back half, with a spine of spurs.
dome = ell((0, 0, 0), (10.5, 9, 12), 8, 6)
cut(dome, (1.5, 0, 0), (-1, 0, 0.25))
xform(dome, rot(-28, "Y"), (0, 0, 3.5))
E.add(thick(dome, 1.0))
for i, (x, z) in enumerate(((-7.5, 11), (-9.6, 6), (-10.4, 0.5))):
    E.add(cone((x + 1.2, 0, z), (x - 2.6, 0, z + 2.2 - i * 0.6), 1.4, 0, 4), "bone")
# Head: a long armoured snout, three eyes down the near side.
E.add(loft([rx(5.5, 0, 12, 3.4, 3.4), rx(10, 0, 12.3, 4, 3.8), rx(14, 0, 10.8, 2.8, 2.6), rx(16.5, 0, 9.6, 0, 0)], 7), bone="head")
E.add(both(lambda s: merge([ell((x, 3.2 * s, z), (0.9, 0.5, 0.9), 6, 4) for x, z in ((9.5, 13.6), (11.6, 13.1), (13.4, 11.9))])), "eye", "head")
# Far arm hangs; near arm carries the cannon.
E.add(limb([(2, 7, 6), (4, 8, 0), (7, 7.5, -3)], [2, 1.5, 1.1], 5), "chitin")
E.add(limb([(3, -7, 6), (5, -8.5, 0.5)], [2.4, 1.8], 5), "chitin", "gun")
E.add(loft([rx(1, -9, -0.5, 3.2, 3.2), rx(4, -9, -0.5, 3.6, 3.6), rx(13, -9, 0, 2.6, 2.6), rx(16, -9, 0.2, 2.9, 2.9),
            rx(17, -9, 0.2, 2.4, 2.4)], 8), "gunmetal", "gun")
E.add(merge([loft([rx(x, -9, -0.3, 3.0, 3.0), rx(x + 1.4, -9, -0.3, 3.0, 3.0)], 8) for x in (6, 9.5)]), bone="gun")
E.add(ell((17.2, -9, 0.2), (1.4, 2.0, 2.0), 6, 4), "orb", "gun")                    # the round, in the muzzle
E.add(ell((3.5, -9.5, 3.6), (2.2, 1.9, 1.7), 6, 4), "orb", "gun", smooth=True)     # the orb sac on top
BUILT.append(E.build())


# =============================================================================
# SPORE WISP - 36x24, cyan, drifts and rains spores. A jellyfish sac: a ribbed
# bell, a glowing core inside it, three spore pods and trailing tendrils.
# =============================================================================
E = Enemy("spore_wisp")
E.bone("pods", (0, 0, -4))
for i, (x, y) in enumerate(((-9, 4), (-11, -3), (8, -4), (10, 3), (-1, 6))):
    E.bone(f"t{i}", (x, y, -2.5))
bell = ell((0, 0, 0), (17, 12, 11), 12, 7)
cut(bell, (0, 0, -2), (0, 0, 1))
xform(bell, t=(0, 0, 1))
E.add(thick(bell, 1.0), smooth=True)
E.add(merge([cone((0, 0, 12.2), (16.5 * math.cos(a), 11.5 * math.sin(a), -0.6), 0.7, 0.5, 3)
             for a in (k / 8 * TAU for k in range(8))]), "trim")                      # ribs
frill = bmesh.new()
bmesh.ops.create_cone(frill, cap_ends=False, segments=12, radius1=19, radius2=16.5, depth=2.4)
bmesh.ops.scale(frill, vec=(1, 0.72, 1), verts=frill.verts)
xform(frill, t=(0, 0, -1.6))
E.add(thick(frill, 0.6), "membrane")
E.add(ell((0, 0, -1), (10, 7, 6), 8, 5), "spore", smooth=True)                     # the core
E.add(merge([merge([cone((x, 0, -2), (x * 1.1, 0, -5.5), 0.6, 0.5, 3), ell((x * 1.12, 0, -7.5), (2.4, 2.4, 2.8), 6, 4)])
             for x in (-6, 0, 6)]), "spore", "pods")
E.add(both(lambda s: ell((13.5, 5 * s, 2.2), (1.2, 0.8, 1.2), 6, 4)), "eye")
for i, (x, y) in enumerate(((-9, 4), (-11, -3), (8, -4), (10, 3), (-1, 6))):
    ln = 14 + (i % 3) * 3
    E.add(limb([(x, y, -2.5), (x - 2, y, -2.5 - ln * 0.4), (x - 1, y, -2.5 - ln * 0.75), (x - 4, y, -2.5 - ln)],
               [1.1, 0.8, 0.55, 0.1], 4), "membrane", f"t{i}")
BUILT.append(E.build())


# =============================================================================
# STRAFE RAIDER - 34x20, orange, racetrack strafing passes. An alien fighter:
# hexagonal fuselage, anhedral swept wings (so they read side-on), twin
# canted fins, an underslung twin gun pod and a lit engine.
# =============================================================================
E = Enemy("strafe_raider")
E.add(loft([rx(-15, 0, 0.5, 3.2, 2.6), rx(-8, 0, 1, 4.2, 3.6), rx(2, 0, 0.5, 4, 3.3), rx(10, 0, -0.5, 2.4, 2),
            rx(17.5, 0, -1.5, 0, 0)], 6))
E.add(ell((3, 0, 3.2), (5.5, 2.2, 2.2), 6, 4), "teal")                                 # canopy
for s in (1, -1):
    w = slab([(4, 3), (-6, 15), (-11, 15.5), (-9, 3)], "xy", 0, 1.0)
    if s < 0: bmesh.ops.scale(w, vec=(1, -1, 1), verts=w.verts); bmesh.ops.reverse_faces(w, faces=w.faces)
    xform(w, rot(-28 * s, "X"), about=(0, 3 * s, 0))
    E.add(tidy(w))
    fin = slab([(-15.5, 2), (-9, 2), (-12, 9), (-16.5, 9.5)], "xz", 0, 0.9)
    xform(fin, rot(-14 * s, "X"), (0, 1.8 * s, 0))
    E.add(tidy(fin))
    E.add(cone((-1, 2 * s, -4.2), (11, 2 * s, -4.4), 1.2, 0.9, 5), "gunmetal")        # gun barrels
    E.add(cone((-8, 13.5 * s, -6.8), (-4, 13.5 * s, -6.8), 0.6, 0.4, 3), "gold")       # wingtip lights
E.add(loft([rx(-3, 0, -3, 2.4, 1.6), rx(3, 0, -3.5, 2.4, 1.6)], 6), "gunmetal")      # gun pod
E.add(cone((-14, 0, 0.5), (-18, 0, 0.5), 2.6, 3.0, 6), "trim")                        # nozzle
E.add(ell((-17.6, 0, 0.5), (0.8, 2.6, 2.4), 6, 4), "engine")
E.add(cone((9, 0, 1.2), (3, 0, 2.6), 0.7, 0.3, 3), "gold")                           # nose stripe
BUILT.append(E.build())


# =============================================================================
# COWARDLY DUELIST - 26x44, gold, snipes with a pistol and back-hops. A tall,
# narrow alien in a long tailed coat and high collar, crested head, gun arm
# out, the other hand behind its back.
# =============================================================================
E = Enemy("cowardly_duelist")
E.bone("legL", (0, 2.6, -4))
E.bone("legR", (0, -2.6, -4))
E.bone("head", (1, 0, 12))
E.bone("gun", (1, -4.2, 9))
E.bone("coat", (-1, 0, -2))
for s, bn in ((1, "legL"), (-1, "legR")):
    f = lambda p: (p[0], p[1] * s, p[2])
    E.add(limb([f((0, 2.6, -4)), f((1.5, 2.8, -13)), f((-0.5, 2.8, -20.5))], [1.8, 1.3, 0.9], 5), "gunmetal", bn)
    E.add(cone(f((-2, 2.8, -21.6)), f((4, 2.8, -22)), 1.4, 0.4, 4), "trim", bn)
E.add(loft([rz(0, 0, -4.5, 3.6, 3.0), rz(0.5, 0, 2, 3.6, 3.2), rz(1, 0, 7, 4.6, 3.8), rz(1, 0, 10, 4.2, 3.6),
            rz(1, 0, 11.6, 1.5, 1.5)], 7))
E.add(loft([rz(0.8, 0, 3.6, 3.8, 3.4), rz(0.8, 0, 4.6, 3.8, 3.4)], 7), "gold")       # sash
skirt = bmesh.new()
bmesh.ops.create_cone(skirt, cap_ends=False, segments=12, radius1=6.5, radius2=3.9, depth=13)
xform(skirt, t=(-0.5, 0, -8.5))
cut(skirt, (-0.2, 0, 0), (-1, 0, 0))
E.add(thick(skirt, 0.7), bone="coat")
collar = bmesh.new()
bmesh.ops.create_cone(collar, cap_ends=False, segments=10, radius1=3.4, radius2=4.6, depth=4.5)
xform(collar, t=(0.6, 0, 11.6))
cut(collar, (1.6, 0, 0), (-1, 0, 0))
E.add(thick(collar, 0.6))
E.add(loft([rx(-0.5, 0, 14.5, 2.2, 2.4), rx(2, 0, 15.8, 2.6, 3), rx(4, 0, 15.6, 2, 2.4), rx(5.2, 0, 14.6, 0, 0)], 7), "skin", "head")
E.add(loft([rx(0, 0, 12, 1.4, 1.4), rx(0.2, 0, 14, 2.0, 2.0)], 6), "skin", "head")   # neck
E.add(slab([(0.5, 16.6), (-4.5, 19.6), (-3.4, 20.2), (2.4, 17.8)], "xz", 0, 0.9), bone="head")  # crest
E.add(both(lambda s: ell((3.4, 1.9 * s, 16), (1.3, 0.5, 0.6), 6, 4)), "eye", "head")
E.add(limb([(1, -4.2, 9), (5.5, -5, 6.2), (10.5, -5, 7.4)], [1.6, 1.2, 0.9], 5), "gunmetal", "gun")
E.add(cone((5, -5, 6.2), (8.5, -5, 6.9), 1.6, 1.4, 5), bone="gun")                   # cuff
E.add(merge([cone((10, -5, 7.8), (19, -5, 8.2), 0.9, 0.7, 5), cone((10.4, -5, 7.4), (9.4, -5, 4.8), 0.8, 0.7, 4),
             cone((11, -5.6, 8.6), (16, -5.6, 8.8), 0.35, 0.3, 3)]), "metal", "gun")
E.add(cone((12, -5.7, 8.3), (17, -5.7, 8.6), 0.4, 0.3, 3), "gold", "gun")            # charge line
E.add(limb([(1, 4.2, 9), (-3.5, 4.6, 4.5), (-1.5, 3.4, 0.5)], [1.6, 1.2, 0.9], 5), "gunmetal")  # hand behind back
BUILT.append(E.build())


# =============================================================================
# SKY DUELIST - 40x26, teal, hovers and strafes. The duelist's kind on a
# hover skiff: a flat hull with a glow ring under it and side engines, the
# rider standing in it from the waist, bolt pistol out.
# =============================================================================
E = Enemy("sky_duelist")
Z = -4   # everything sits 4px low so the crest stays near the box
E.bone("rider", (-2, 0, -1 + Z))
E.bone("gun", (-1.5, -3.6, 6 + Z), "rider")
E.add(loft([rx(-19, 0, -3 + Z, 1.8, 1.2), rx(-12, 0, -3 + Z, 7, 2.6), rx(0, 0, -3.5 + Z, 9, 3.2), rx(12, 0, -4 + Z, 6, 2.2),
            rx(20, 0, -4.8 + Z, 0, 0)], 8))
E.add(slab([(8, -1.5 + Z), (12.5, -2 + Z), (8, 4 + Z), (6.5, 4 + Z)], "xz", 0, 0.8), "teal")       # windscreen
E.add(ell((-1, 0, -6.6 + Z), (10, 5.5, 0.9), 10, 3), "teal")                                    # glow ring
E.add(both(lambda s: merge([cone((-14, 8 * s, -3 + Z), (-2, 8 * s, -3.4 + Z), 2.0, 1.6, 6)])), "gunmetal")
E.add(both(lambda s: ell((-14.3, 8 * s, -3 + Z), (0.6, 1.8, 1.8), 6, 4)), "teal")
E.add(loft([rz(-3, 0, -2 + Z, 3, 2.8), rz(-2, 0, 3.6 + Z, 3.6, 3), rz(-1.5, 0, 6.6 + Z, 3.2, 2.8),
            rz(-1, 0, 8.2 + Z, 1.2, 1.2)], 7), bone="rider")
collar = bmesh.new()
bmesh.ops.create_cone(collar, cap_ends=False, segments=10, radius1=3.0, radius2=4.0, depth=3.6)
xform(collar, t=(-1.2, 0, 8 + Z))
cut(collar, (-0.2, 0, 0), (-1, 0, 0))
E.add(thick(collar, 0.6), bone="rider")
E.add(loft([rx(-2.5, 0, 10 + Z, 1.9, 2.1), rx(0, 0, 11.2 + Z, 2.3, 2.6), rx(1.8, 0, 11 + Z, 1.7, 2.1), rx(2.8, 0, 10.1 + Z, 0, 0)], 7), "skin", "rider")
E.add(slab([(-1.5, 12.2 + Z), (-7.5, 16.5 + Z), (-6, 17 + Z), (0, 13.2 + Z)], "xz", 0, 0.9), bone="rider")
E.add(both(lambda s: ell((1.4, 1.7 * s, 11.4 + Z), (1.1, 0.5, 0.55), 6, 4)), "eye", "rider")
E.add(limb([(-1.5, 3.6, 6 + Z), (1.5, 4, 2 + Z), (4, 3, -0.5 + Z)], [1.4, 1.1, 0.8], 5), "gunmetal", "rider")
E.add(limb([(-1.5, -3.6, 6 + Z), (3, -4, 3.5 + Z), (7, -4, 4.5 + Z)], [1.4, 1.1, 0.8], 5), "gunmetal", "gun")
E.add(merge([cone((6.5, -4, 4.9 + Z), (15, -4, 5.3 + Z), 0.9, 0.6, 5), cone((7, -4, 4.4 + Z), (6.2, -4, 2.2 + Z), 0.7, 0.6, 4)]),
      "metal", "gun")
E.add(merge([loft([rx(x, -4, 5.1 + Z, 1.0, 1.0), rx(x + 0.5, -4, 5.1 + Z, 1.0, 1.0)], 6) for x in (9.5, 12)]), "teal", "gun")
BUILT.append(E.build())


# =============================================================================
# IRON MOTH (boss) - core 96x44, violet; wings 58x26 at +-62. Seen face-on,
# as the game lays it out: a wide armoured head and thorax, two huge faceted
# compound eyes, a glowing maw between hooked mandibles, an iron mane and
# feathered antennae. The wing is its own model (one; enemies.js mirrors it).
# =============================================================================
E = Enemy("iron_moth")
E.bone("antL", (9, -6, 15))
E.bone("antR", (-9, -6, 15))
E.bone("jawL", (8, -12, -9))
E.bone("jawR", (-8, -12, -9))
# Thorax: a wide armoured dome facing the camera, banded.
E.add(ell((0, 2, 1), (38, 17, 19), 14, 8), smooth=True)
E.add(merge([loft([((0, 2, z), (38 * k, 0, 0), (0, 17.6 * k, 0)), ((0, 2, z + 1.6), (38 * k, 0, 0), (0, 17.6 * k, 0))], 14)
             for z, k in ((8, 0.9), (-2, 0.99), (-11, 0.82))]), "trim")
# Face plate: a darker mask between the eyes, ridged down the middle.
E.add(ell((0, -12, 0), (15, 6, 15), 10, 6), "gunmetal", smooth=True)
E.add(cone((0, -16.5, 14), (0, -18.5, -6), 2.0, 1.2, 4), "trim")
E.add(both(lambda s: ell((23 * s, -12, 2), (11, 8, 12), 7, 5)), "violet")             # compound eyes, faceted
E.add(both(lambda s: loft([((23 * s, -6, 2), (12.6, 0, 0), (0, 0, 13.6)), ((23 * s, -11, 2), (12.6, 0, 0), (0, 0, 13.6))], 10)), "gunmetal")  # socket rims
# The mane: iron blades fanned over the top of the head.
E.add(merge([cone((x * 0.8, 4, 12 + (1 - abs(x) / 32) * 4), (x * 1.25, 8, 27 - abs(x) * 0.25), 3.2, 0, 4)
             for x in (-28, -20, -12, -4, 4, 12, 20, 28)]), "metal")
# The maw: a glowing throat ringed with teeth, under the face.
E.add(ell((0, -13, -12), (7, 3, 5), 8, 5), "violet")
E.add(merge([cone((6.5 * math.cos(a), -13.5, -12 + 4.5 * math.sin(a)), (3 * math.cos(a), -15.5, -12 + 2 * math.sin(a)), 0.9, 0, 3)
             for a in (k / 10 * TAU for k in range(10))]), "bone")
for s, bn in ((1, "jawL"), (-1, "jawR")):
    E.add(limb([(8 * s, -12, -9), (11 * s, -15, -18), (4 * s, -17, -26)], [2.6, 1.8, 0.1], 5), "metal", bn)
# Feathered antennae: a shaft and a comb of barbs.
for s, bn in ((1, "antL"), (-1, "antR")):
    shaft = [(9 * s, -6, 15), (20 * s, -6, 30), (34 * s, -4, 38)]
    E.add(limb(shaft, [1.3, 0.9, 0.2], 4), "trim", bn)
    barbs = []
    for i in range(7):
        u = (i + 1) / 8
        a = Vector(shaft[0]).lerp(Vector(shaft[1]), min(1, u * 2)) if u < 0.5 else Vector(shaft[1]).lerp(Vector(shaft[2]), u * 2 - 1)
        ln = 6 * math.sin(math.pi * u) + 1.5
        barbs.append(slab([(a.x, a.z), (a.x + 1.6 * s, a.z), (a.x + (3 + ln * 0.5) * s, a.z + ln)], "xz", a.y, 0.4))
    E.add(merge(barbs), "metal", bn)
# Legs folded under, and the abdomen trailing away from the camera.
E.add(merge([limb([(x * s, -4, -15), ((x + 7) * s, -8, -22), ((x + 4) * s, -9, -30)], [1.4, 1.0, 0.2], 4)
             for s in (1, -1) for x in (8, 16)]), "gunmetal")
E.add(loft([rx(0, 14, 0, 0, 0), ((0, 16, 0), (14, 0, 0), (0, 0, 14)), ((0, 26, -3), (12, 0, 0), (0, 0, 11)),
            ((0, 36, -7), (8, 0, 0), (0, 0, 8)), ((0, 44, -11), (0, 0, 0), (0, 0, 0))], 8), "trim", smooth=True)
E.add(both(lambda s: cone((36 * s, 0, 5), (43 * s, 2, 4), 4.5, 3.2, 6)), "gunmetal")   # wing hinges
BUILT.append(E.build())

# The wing: centred on its part (58x26), root at -X, built as the RIGHT wing
# (the core sits to its -X). Fore and hind wing plates face the camera; iron
# veins over them; the seeker port (the wing's missile emitter) near the tip.
E = Enemy("iron_moth_wing")
E.add(slab([(-28, 4), (-10, 13), (16, 15), (29, 9), (22, -1), (-28, -2)], "xz", 0, 1.6))
E.add(slab([(-27, -3), (12, -4), (19, -11), (6, -15), (-20, -10)], "xz", 1.2, 1.4))
E.add(merge([cone((-28, -1.4, 1), tip, 1.1, 0.4, 4)
             for tip in ((-10, -1.4, 12.5), (14, -1.4, 13.8), (27, -1.4, 8.5), (21, -1.4, -0.5))]), "trim")
E.add(merge([cone((-27, 0.2, -3), tip, 0.9, 0.3, 4) for tip in ((10, 0.2, -5), (17, 0.2, -11), (4, 0.2, -14.2))]), "trim")
E.add(slab([(-24, 3), (-12, 10), (-12, 3)], "xz", -1.1, 0.5), "gunmetal")
port = loft([((12, -1.2, 5), (0, 0, 0), (0, 0, 0)), ((12, -1.6, 5), (5, 0, 0), (0, 0, 5)),
             ((12, -2.6, 5), (5.4, 0, 0), (0, 0, 5.4)), ((12, -1, 5), (0, 0, 0), (0, 0, 0))], 10)
E.add(port, "gunmetal")
E.add(ell((12, -2.4, 5), (3.6, 0.8, 3.6), 8, 4), "seeker")
E.add(ell((-2, -1.2, -8), (3, 0.6, 2.4), 6, 3), "violet")
wing, _ = E.build(skinned=False)

# --- export -------------------------------------------------------------------
bpy.ops.object.select_all(action="DESELECT")
for mesh, arm in BUILT:
    mesh.select_set(True); arm.select_set(True)
wing.select_set(True)
bpy.context.view_layer.objects.active = wing
bpy.ops.export_scene.gltf(filepath=os.path.join(MODELS, "enemies.glb"), use_selection=True,
                          export_format="GLB", export_apply=False, export_animations=False)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(MODELS, "enemies.blend"))
for mesh, arm in BUILT + [(wing, None)]:
    mesh.data.calc_loop_triangles()
    print("TRIS", mesh.name, len(mesh.data.loop_triangles), [round(d, 1) for d in mesh.dimensions])
