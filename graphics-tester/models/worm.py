# Giant sand worm for the graphics tester. Run in Blender:
# exec(open(r"...\models\worm.py").read())
#
# Four objects in one worm.glb, each Shell + Detail (kit.py):
#   Segment - one plated body ring. graphics-tester/worm.js instances it
#             down the spine, scaled toward the tail.
#   Head    - the mouth end: a heavy plated collar, gums, three rings of
#             teeth and a throat narrowing to a glow. No eyes.
#   Petal   - one of the five jaws, built CLOSED over the top of the mouth
#             with its hinge at the origin; worm.js rotates five copies round
#             the spine and swings each open about its hinge.
#   Tail    - the tapered tip.
# Spine along +X (the head end), radius 1: worm.js scales to px.
exec(open(r"C:\Users\jeffr\OneDrive\Documents\my-games\side-scroller\graphics-tester\models\kit.py").read())

B = Builder()
TAU = math.tau


def grid(fn, nu, nv, closed_v=False):
    """A quad grid from fn(u, v) -> (x, y, z), u and v in 0..1."""
    bm = bmesh.new()
    cols = nv if closed_v else nv + 1
    vs = [[bm.verts.new(fn(i / nu, j / nv)) for j in range(cols)] for i in range(nu + 1)]
    for i in range(nu):
        for j in range(nv):
            j1 = (j + 1) % cols
            bm.faces.new((vs[i][j], vs[i + 1][j], vs[i + 1][j1], vs[i][j1]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    return bm


def flip(bm):
    bmesh.ops.reverse_faces(bm, faces=bm.faces)
    return bm


def solid(o, t, offset=1):
    m = o.modifiers.new("solid", "SOLIDIFY"); m.thickness = t; m.offset = offset
    return o


def tube(r0, r1, x0, x1, sides, inward=False):
    """An open tube along X, radius r0 at x0 to r1 at x1, facing out (or in,
    to be seen from inside)."""
    bm = grid(lambda u, v: (x0 + (x1 - x0) * u, (r0 + (r1 - r0) * u) * math.sin(v * TAU),
                            (r0 + (r1 - r0) * u) * math.cos(v * TAU)), 1, sides, closed_v=True)
    # The grid faces out when it runs toward +x.
    return flip(bm) if (x1 > x0) == inward else bm


def plates(n, x0, x1, r_front, r_back, ridge, gap, phase=0.0, nu=2, nv=3):
    """A ring of n armour plates (scales) round the X axis, from x1 (front,
    tucked in at r_front) back to x0 (flared out to r_back, overhanging what
    is behind). Each plate has a raised keel down its middle."""
    out = []
    for k in range(n):
        a0 = (k + gap / 2 + phase) / n * TAU
        a1 = (k + 1 - gap / 2 + phase) / n * TAU

        def at(u, v, a0=a0, a1=a1):
            x = x1 + (x0 - x1) * u
            a = a0 + (a1 - a0) * v
            keel = ridge * (1 - abs(v * 2 - 1)) * (0.4 + 0.6 * u)
            r = r_front + (r_back - r_front) * u + keel
            return (x, r * math.sin(a), r * math.cos(a))
        out.append(flip(grid(at, nu, nv)))
    return out


def merge(bms):
    bm = bmesh.new()
    me = bpy.data.meshes.new("tmp")
    for b in bms:
        b.to_mesh(me); b.free()
        bm.from_mesh(me)
    bpy.data.meshes.remove(me)
    return bm


def tooth(base, tip, r, sides=4):
    """A cone from `base` (radius r) to the point `tip`."""
    base, tip = Vector(base), Vector(tip)
    d = tip - base
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=sides, radius1=r, radius2=0.0, depth=d.length)
    bmesh.ops.translate(bm, vec=(0, 0, d.length / 2), verts=bm.verts)
    q = Vector((0, 0, 1)).rotation_difference(d.normalized())
    bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=q.to_matrix(), verts=bm.verts)
    bmesh.ops.translate(bm, vec=base, verts=bm.verts)
    return bm


# --- Segment: x -0.5..0.5 -----------------------------------------------------
B.begin()
solid(B.add("SegPlates", merge(plates(7, -0.62, 0.5, 0.9, 1.08, 0.07, 0.06)), smooth=False), 0.045)
B.add("SegCore", tube(0.9, 0.9, -0.5, 0.5, 14), "flesh", smooth=True)
# A dark band of segment joint, so each ring reads against the next.
B.add("SegJoint", tube(0.93, 0.93, 0.44, 0.52, 14), "suit", smooth=True)
seg = B.finish("Segment")

# --- Head: collar x -0.6..0.62, mouth at +0.62 --------------------------------
R = 1.12       # mouth rim radius
MOUTH = 0.62   # mouth rim x
B.begin()
collar = plates(9, -0.62, MOUTH - 0.02, 1.02, 1.2, 0.09, 0.05, phase=0.5)
collar += plates(9, -0.25, MOUTH, 1.08, 1.16, 0.05, 0.12, nu=1)
solid(B.add("HeadPlates", merge(collar), smooth=False), 0.05)
B.add("HeadCore", tube(0.98, 1.0, -0.6, MOUTH - 0.05, 18), "suit", smooth=True)
# The lip: a thick flesh ring the petals hinge on.
bm = bmesh.new()
bmesh.ops.create_cone(bm, cap_ends=False, segments=20, radius1=R + 0.02, radius2=R - 0.12, depth=0.14)
bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=rot(90, "Y"), verts=bm.verts)
bmesh.ops.translate(bm, vec=(MOUTH, 0, 0), verts=bm.verts)
solid(B.add("Lip", bm, "flesh", smooth=True), 0.08)
# The throat: flesh narrowing back into the body, seen from inside.
B.add("Throat", tube(R - 0.1, 0.32, MOUTH, -0.75, 18, inward=True), "flesh", smooth=True)
bm = tube(0.32, 0.0, -0.75, -0.85, 12, inward=True)
B.add("Gullet", bm, "maw", smooth=True)
# Three rings of teeth down the throat, raked inward and back.
for ring, (x, r, n, ln) in enumerate(((MOUTH - 0.06, R - 0.14, 16, 0.3), (0.28, 0.82, 14, 0.26), (-0.08, 0.6, 12, 0.22))):
    bms = []
    for k in range(n):
        a = (k + ring * 0.5) / n * TAU
        rad = Vector((0, math.sin(a), math.cos(a)))
        base = Vector((x, 0, 0)) + rad * r
        tip = base - rad * ln + Vector((-ln * 0.55, 0, 0))
        bms.append(tooth(base, tip, 0.045 + 0.01 * (2 - ring)))
    B.add(f"Teeth{ring}", merge(bms), "bone", smooth=False)
head = B.finish("Head")

# --- Petal: hinge at the origin, built closed over +Z ----------------------------
# In head space the hinge sits on the rim at (MOUTH, 0, R); the petal is
# modelled relative to it. Closed, the five tips meet on the axis ahead of
# the mouth, like a pointed nose.
LEN, SPAN = 1.25, math.radians(36)
B.begin()


def petal_at(u, v, out=0.0):
    a = (v * 2 - 1) * SPAN
    r = R * (1 - u) * (1 + 0.4 * math.sin(math.pi * u)) + out
    return (u * LEN, r * math.sin(a), r * math.cos(a) - R)


outer = grid(lambda u, v: petal_at(u, v), 5, 4)
solid(B.add("PetalShell", outer, smooth=False), 0.06)
# Plate seams: two raised bands across the outside, and a keel down it.
for u0 in (0.28, 0.58):
    bands = grid(lambda u, v, u0=u0: petal_at(u0 + 0.08 * u, v, 0.05), 1, 4)
    solid(B.add(f"PetalBand{u0}", bands, smooth=False), 0.03)
keel = grid(lambda u, v: petal_at(0.05 + 0.85 * u, 0.45 + 0.1 * v, 0.07), 5, 1)
solid(B.add("PetalKeel", keel, smooth=False), 0.04)
# Inside: flesh, and a row of hooked teeth down the middle.
B.add("PetalFlesh", flip(grid(lambda u, v: petal_at(u, v, -0.03), 5, 4)), "flesh", smooth=True)
bms = []
for i, u in enumerate((0.15, 0.32, 0.5, 0.68)):
    for v in ((0.5,) if i % 2 else (0.3, 0.7)):
        base = Vector(petal_at(u, v, -0.03))
        axis = Vector((u * LEN, 0, -R))
        inward = (axis - base).normalized()
        bms.append(tooth(base, base + inward * 0.22 * (1 - u * 0.5) + Vector((-0.08, 0, 0)), 0.04))
B.add("PetalTeeth", merge(bms), "bone", smooth=False)
petal = B.finish("Petal")

# --- Tail: x 0.5 (joins a segment) back to a point ----------------------------
B.begin()
tail_plates = []
for i, (x1, x0, r1, r0) in enumerate(((0.5, -0.4, 0.9, 0.62), (-0.3, -1.1, 0.62, 0.34), (-1.0, -1.7, 0.34, 0.1))):
    tail_plates += plates(6, x0, x1, r1, r0 + 0.08, 0.05, 0.08, phase=0.5 * i, nu=1)
solid(B.add("TailPlates", merge(tail_plates), smooth=False), 0.035)
B.add("TailCore", tube(0.88, 0.04, 0.5, -1.85, 12), "flesh", smooth=True)
bm = tooth((-1.75, 0, 0), (-2.25, 0, 0.05), 0.08, 6)
B.add("TailSpike", bm, "trim", smooth=False)
tail = B.finish("Tail")

result = export_many([seg, head, petal, tail], "worm")
