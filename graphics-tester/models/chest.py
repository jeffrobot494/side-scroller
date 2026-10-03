# Chest armour for the soldier, to go with the helmet. Run in Blender:
# exec(open(r"...\models\chest.py").read())
# Built in a unit box (X, Y, Z in -0.5..0.5); graphics-tester stretches it to
# the torso part's box, so proportions here are fractions of the torso.
exec(open(r"C:\Users\jeffr\OneDrive\Documents\my-games\side-scroller\graphics-tester\models\kit.py").read())

B = Builder()
NEAR = -1  # -Y is the camera side once exported


def box(size, at, taper=None):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    if taper:
        for v in bm.verts: taper(v)
    bmesh.ops.translate(bm, vec=at, verts=bm.verts)
    return bm


def bevel(o, w, seg=1):
    m = o.modifiers.new("bev", "BEVEL"); m.width = w; m.segments = seg
    return o


# Back plate first: the joined object's first material is Shell.
bevel(B.add("Back", box((0.34, 0.92, 0.66), (-0.3, 0, 0.14)), smooth=False), 0.05)

# Undersuit: the dark body everything bolts onto.
bevel(B.add("Suit", box((0.86, 0.84, 1.0), (0, 0, 0)), "suit", smooth=False), 0.06)


# Chest plate: a V of armour, wide at the shoulders, narrow at the sternum,
# sloping back at the bottom.
def pec(v):
    if v.co.z < 0:
        v.co.y *= 0.62
        v.co.x -= 0.06
bevel(B.add("Chest", box((0.3, 0.94, 0.52), (0.34, 0, 0.2), pec), smooth=False), 0.06, 2)

# Ab plates: two stacked bands, the lower one narrower.
for i, (z, wid) in enumerate(((-0.13, 0.8), (-0.29, 0.72))):
    bevel(B.add(f"Ab{i}", box((0.18, wid, 0.13), (0.38, 0, z)), smooth=False), 0.04)

# Belt with a glowing buckle.
bevel(B.add("Belt", box((0.96, 0.9, 0.13), (0, 0, -0.43)), "trim", smooth=False), 0.03)
B.add("Buckle", box((0.04, 0.16, 0.08), (0.49, 0, -0.43)), "glow", smooth=False)

# Chest core: a glowing hexagon in a dark hex bezel.
for name, r, d, x, slot in (("CoreRing", 0.15, 0.05, 0.5, "trim"), ("Core", 0.1, 0.04, 0.52, "visor")):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=r, radius2=r, depth=d)
    bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=rot(90, "Y"), verts=bm.verts)
    bmesh.ops.translate(bm, vec=(x, 0, 0.24), verts=bm.verts)
    B.add(name, bm, slot, smooth=False)

# Collar: a dark ring the helmet sits in.
bm = bmesh.new()
bmesh.ops.create_cone(bm, cap_ends=False, segments=10, radius1=0.34, radius2=0.27, depth=0.12)
bmesh.ops.scale(bm, vec=(1, 1.2, 1), verts=bm.verts)
bmesh.ops.translate(bm, vec=(0.02, 0, 0.52), verts=bm.verts)
m = B.add("Collar", bm, "trim").modifiers.new("solid", "SOLIDIFY"); m.thickness = 0.04

# Shoulders are separate: the shoulder squares in src/mission/view3d/soldier.js.

# A glowing status strip down the near flank, where the camera sees it.
B.add("Flank", box((0.04, 0.02, 0.36), (-0.12, NEAR * 0.44, 0.02)), "glow", smooth=False)
B.add("Flank2", box((0.04, 0.02, 0.24), (-0.04, NEAR * 0.44, -0.04)), "glow", smooth=False)

result = B.export(B.finish("Chest"), "chest")
