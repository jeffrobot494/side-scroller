# Sci-fi helmet for the soldier. Run in Blender: exec(open(r"...\models\helmet.py").read())
exec(open(r"C:\Users\jeffr\OneDrive\Documents\my-games\side-scroller\graphics-tester\models\kit.py").read())

B = Builder()
SX, SY, SZ = 0.52, 0.47, 0.5  # dome radii (X forward, Y depth, Z up)
NEAR = -1                     # -Y is the camera side once exported


def dome(scale, u, v, cuts):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=u, v_segments=v, radius=1)
    bmesh.ops.scale(bm, vec=scale, verts=bm.verts)
    for c in cuts: cut(bm, *c)
    return bm


# Shell: a dome cut flat underneath, thickened; the rim is Detail-dark.
shell = B.add("Shell", dome((SX, SY, SZ), 16, 9, [((0, 0, -0.28), (0, 0, 1), True)]))
m = shell.modifiers.new("solid", "SOLIDIFY"); m.thickness = 0.05

# Visor: a wraparound band proud of the shell.
visor = B.add("Visor", dome((SX * 1.05, SY * 1.05, SZ * 1.05), 20, 12, [
    ((0.12, 0, 0), (1, 0, 0), True), ((0, 0, 0.17), (0, 0, 1), False), ((0, 0, -0.1), (0, 0, 1), True)]), "visor")
m = visor.modifiers.new("solid", "SOLIDIFY"); m.thickness = 0.03; m.offset = 1

# Brow: a dark lip over the visor.
brow = B.add("Brow", dome((SX * 1.08, SY * 1.08, SZ * 1.08), 20, 12, [
    ((0.05, 0, 0), (1, 0, 0), True), ((0, 0, 0.23), (0, 0, 1), False), ((0, 0, 0.17), (0, 0, 1), True)]), "trim")
m = brow.modifiers.new("solid", "SOLIDIFY"); m.thickness = 0.04; m.offset = 1

# Chin guard, with three glowing vent slots.
bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1)
bmesh.ops.scale(bm, vec=(0.26, 0.62, 0.16), verts=bm.verts)
bmesh.ops.translate(bm, vec=(0.36, 0, -0.24), verts=bm.verts)
chin = B.add("Chin", bm, "trim", smooth=False)
m = chin.modifiers.new("bev", "BEVEL"); m.width = 0.05; m.segments = 1
for i, z in enumerate((-0.2, -0.24, -0.28)):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, vec=(0.02, 0.3, 0.018), verts=bm.verts)
    bmesh.ops.translate(bm, vec=(0.495, 0, z), verts=bm.verts)
    B.add(f"Vent{i}", bm, "glow", smooth=False)

# Ear pods, each with a glowing disc.
for side in (1, -1):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=0.2, radius2=0.16, depth=0.12)
    bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=rot(-90 * side, "X"), verts=bm.verts)
    bmesh.ops.translate(bm, vec=(-0.02, side * (SY + 0.03), -0.05), verts=bm.verts)
    B.add(f"Ear{side}", bm, "trim", smooth=False)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=0.09, radius2=0.09, depth=0.03)
    bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=rot(90, "X"), verts=bm.verts)
    bmesh.ops.translate(bm, vec=(-0.02, side * (SY + 0.1), -0.05), verts=bm.verts)
    B.add(f"EarGlow{side}", bm, "visor", smooth=False)

# Crest over the top, with a glowing stripe.
bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1)
bmesh.ops.scale(bm, vec=(0.7, 0.07, 0.12), verts=bm.verts)
for v in bm.verts:
    if v.co.x > 0 and v.co.z > 0: v.co.z -= 0.06
bmesh.ops.translate(bm, vec=(-0.05, 0, SZ - 0.01), verts=bm.verts)
B.add("Crest", bm, "shell", smooth=False)
bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1)
bmesh.ops.scale(bm, vec=(0.45, 0.075, 0.025), verts=bm.verts)
bmesh.ops.translate(bm, vec=(-0.1, 0, SZ + 0.065), verts=bm.verts)
B.add("CrestGlow", bm, "visor", smooth=False)

# Antenna off the near ear pod, raked back, with a glowing tip.
base = Vector((-0.08, NEAR * (SY + 0.06), 0.05))
bm = bmesh.new()
bmesh.ops.create_cone(bm, cap_ends=True, segments=5, radius1=0.018, radius2=0.01, depth=0.45)
bmesh.ops.translate(bm, vec=(0, 0, 0.225), verts=bm.verts)
bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=rot(-28, "Y"), verts=bm.verts)
bmesh.ops.translate(bm, vec=base, verts=bm.verts)
B.add("Antenna", bm, "trim", smooth=False)
bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.035)
bmesh.ops.translate(bm, vec=rot(-28, "Y") @ Vector((0, 0, 0.45)) + base, verts=bm.verts)
B.add("AntennaTip", bm, "glow")

# Neck flare at the back.
bm = bmesh.new()
bmesh.ops.create_cone(bm, cap_ends=False, segments=14, radius1=0.5, radius2=0.42, depth=0.1)
bmesh.ops.scale(bm, vec=(1.0, SY / SX * 1.05, 1), verts=bm.verts)
bmesh.ops.translate(bm, vec=(-0.04, 0, -0.29), verts=bm.verts)
cut(bm, (0.15, 0, 0), (1, 0, 0), False)
neck = B.add("NeckFlare", bm, "shell")
m = neck.modifiers.new("solid", "SOLIDIFY"); m.thickness = 0.03

result = B.export(B.finish("Helmet"), "helmet")
