# Building kit + yard props -> public/models/buildings.glb
# Kit pieces face -Z (their front points away from the wall), origin at the wall surface, bottom center.
# Stretchable pieces are 1 m long along X so code can scale them to any wall.
#   window    1.6 w x 1.2 h, sits at y 0 (code lifts it)       door      gap 1 m wide (scale x), 2.7 h
#   awning    1 m wide (scale x), hangs from y 0 down/out         parapet   1 m long, sits on the wall top
#   plinth    1 m long base strip                                 corner    0.42 square pilaster, 1 m tall (scale y)
#   pipe      drain pipe 1 m tall (scale y)                       ac / vent / sconce / sat  roof + wall clutter
# Materials tint_trim / tint_awning / tint_accent are recolored per building in code.
exec(open(r'E:\24H\art\lib.py').read())
reset()

trim = M('tint_trim', '#efe6d2', 0.8)
awn = M('tint_awning', '#c62828', 0.85)
acc = M('tint_accent', '#00695c', 0.7)
white = M('white', '#f5f1e6', 0.8)
glass = M('glass', '#355a6e', 0.08, 0.3)
glassL = M('glassLit', '#ffe6a8', 0.4, 0.0, emit=0.6)
metal = M('metal', '#a7adb2', 0.35, 0.8)
dark = M('dark', '#2a2a2a', 0.7)
rust = M('rust', '#8a4a26', 0.9)
wood = M('wood', '#7a5434', 0.9)
woodD = M('woodDark', '#523621', 0.9)
red = M('red', '#c62828', 0.6)
green = M('green', '#2e7d32', 0.8)
blue = M('blue', '#1565c0', 0.7)
tire = M('tire', '#1c1c1c', 0.95)
yellow = M('yellow', '#f9a825', 0.6)
bulb = M('bulb', '#fff3c4', 0.3, 0.0, emit=3.0)
scorp = M('scorpion', '#c0392b', 0.5, 0.2)
scorpD = M('scorpionDark', '#7b241c', 0.6)

roots = []


def fin(o):
    roots.append(o); return o


# ---------- window: frame, sill, mullion, glass, little shutters ----------
W, H, D = 1.6, 1.2, 0.08
fin(join([
    box('w_g', (0, H / 2, 0.0), (W - 0.12, H - 0.12, 0.02), glass),
    box('w_t', (0, H - 0.04, -D / 2), (W, 0.08, D), trim),
    box('w_b', (0, 0.04, -D / 2), (W, 0.08, D), trim),
    box('w_l', (-W / 2 + 0.04, H / 2, -D / 2), (0.08, H, D), trim),
    box('w_r', (W / 2 - 0.04, H / 2, -D / 2), (0.08, H, D), trim),
    box('w_m', (0, H / 2, -0.03), (0.05, H - 0.1, 0.04), trim),
    box('w_m2', (0, H * 0.55, -0.03), (W - 0.1, 0.04, 0.04), trim),
    box('w_sill', (0, -0.02, -0.1), (W + 0.16, 0.06, 0.16), trim, bev=0.01),
    box('w_head', (0, H + 0.05, -0.07), (W + 0.12, 0.1, 0.12), acc, bev=0.01),
], 'window'))

# ---------- door frame (1 m gap, scale x) with an OPEN plate and a step ----------
fin(join([
    box('d_l', (-0.5 - 0.06, 1.35, -0.06), (0.12, 2.7, 0.14), trim),
    box('d_r', (0.5 + 0.06, 1.35, -0.06), (0.12, 2.7, 0.14), trim),
    box('d_t', (0, 2.62, -0.06), (1.24, 0.16, 0.16), trim),
    box('d_step', (0, 0.05, -0.25), (1.3, 0.1, 0.5), M('concrete', '#b9b2a6', 1)),
], 'door'))

# ---------- awning: striped canvas, 1 m wide, slopes out 0.9 m ----------
stripes = []
n = 6
for i in range(n):
    x0 = -0.5 + i / n
    b = box('a_%d' % i, (x0 + 0.5 / n, -0.25, -0.45), (1 / n + 0.002, 0.03, 0.95), awn if i % 2 == 0 else white)
    b.rotation_euler = Euler((0.0, 0, 0))
    stripes.append(b)
aw = join(stripes, 'awning_c')
# tilt the canopy: front edge lower
for v in aw.data.vertices:
    gz = -v.co.y  # game z (negative = out from the wall)
    v.co.z += gz * 0.45
valance = []
for i in range(n * 2):
    x = -0.5 + (i + 0.5) / (n * 2)
    valance.append(cyl('a_v', (x, -0.25 - 0.95 * 0.45 - 0.08, -0.93), 0.045, 0.045, 0.012, awn if (i // 2) % 2 == 0 else white, n=8, axis='z'))
fin(join([aw] + valance + [box('a_rail', (0, -0.02, -0.02), (1.0, 0.05, 0.05), metal)], 'awning'))

# ---------- parapet / cornice: 1 m long, stepped profile ----------
fin(join([
    box('p_1', (0, 0.15, -0.06), (1.0, 0.3, 0.32), trim),
    box('p_2', (0, 0.36, -0.1), (1.0, 0.12, 0.4), trim),
    box('p_3', (0, 0.45, -0.12), (1.0, 0.06, 0.44), acc),
], 'parapet'))

fin(join([box('pl', (0, 0.15, -0.04), (1.0, 0.3, 0.1), M('plinth', '#8d8478', 1))], 'plinth'))
fin(join([
    box('c_s', (0, 0.5, 0), (0.36, 1.0, 0.36), trim),
], 'corner'))
fin(join([
    cyl('pp', (0, 0.5, -0.12), 0.05, 0.05, 1.0, metal, n=8),
    box('pp_b1', (0, 0.25, -0.06), (0.06, 0.03, 0.12), metal),
    box('pp_b2', (0, 0.75, -0.06), (0.06, 0.03, 0.12), metal),
], 'pipe'))

# ---------- roof clutter ----------
fin(join([
    box('ac_b', (0, 0.45, 0), (1.3, 0.9, 1.0), metal, bev=0.04),
    cyl('ac_f', (0, 0.92, 0), 0.38, 0.38, 0.04, dark, n=16),
    box('ac_x', (0, 0.95, 0), (0.78, 0.03, 0.05), metal),
    box('ac_y', (0, 0.95, 0), (0.05, 0.03, 0.78), metal),
    box('ac_l', (0, 0.05, 0), (1.4, 0.1, 1.1), rust),
    box('ac_d', (0.4, 0.3, 0.55), (0.35, 0.35, 0.3), metal),
], 'ac'))
fin(join([
    cyl('v_p', (0, 0.3, 0), 0.08, 0.08, 0.6, metal, n=8),
    cyl('v_c', (0, 0.66, 0), 0.16, 0.05, 0.12, metal, n=8),
], 'vent'))
fin(join([
    cyl('s_p', (0, 0.9, 0.0), 0.03, 0.03, 1.8, metal, n=6),
    ball('s_d', (0, 1.8, -0.1), 0.45, M('dish', '#e0e0e0', 0.5), seg=(16, 6), scale=(1, 1, 0.25)),
], 'sat'))
fin(join([
    box('sc_b', (0, 0, -0.04), (0.12, 0.18, 0.08), dark),
    tube('sc_arm', [(0, 0.04, -0.06), (0, 0.12, -0.25)], 0.015, dark, n=6),
    cyl('sc_s', (0, 0.06, -0.28), 0.04, 0.13, 0.12, dark, n=10),
    ball('sc_l', (0, 0.0, -0.28), 0.05, bulb, sub=1),
], 'sconce'))

# ---------- diner roof hero: giant scorpion statue (faces -Z, ~4 m long) ----------
parts = []
for i, (z, r) in enumerate([(-1.2, 0.45), (-0.6, 0.55), (0.0, 0.58), (0.6, 0.52), (1.1, 0.42)]):
    parts.append(ball('sc_seg', (0, 0.6, z), r, scorp if i % 2 else scorpD, sub=2, scale=(1.3, 0.55, 0.75), smooth=False))
parts.append(ball('sc_head', (0, 0.6, -1.65), 0.42, scorp, sub=2, scale=(1.1, 0.55, 0.8), smooth=False))
for s in (-1, 1):
    parts.append(ball('sc_eye', (s * 0.18, 0.86, -1.88), 0.09, M('eyeW', '#ffffff', 0.3), sub=1))
    parts.append(ball('sc_pup', (s * 0.18, 0.88, -1.96), 0.045, dark, sub=1))
# tail curling up over the back
tail = [(0, 0.6, 1.3), (0, 0.9, 1.9), (0, 1.6, 2.3), (0, 2.5, 2.2), (0, 3.1, 1.6), (0, 3.15, 1.0)]
parts.append(tube('sc_tail', tail, [0.32, 0.3, 0.27, 0.24, 0.2, 0.16], scorp, n=10, rib=0.12, smooth=False))
parts.append(cyl('sc_sting', (0, 2.85, 0.85), 0.0, 0.14, 0.5, M('sting', '#212121', 0.4), n=8))
# claws
for s in (-1, 1):
    parts.append(tube('sc_arm', [(s * 0.5, 0.55, -1.5), (s * 1.1, 0.6, -1.9), (s * 1.0, 0.65, -2.6)], [0.16, 0.14, 0.13], scorp, n=8, smooth=False))
    parts.append(ball('sc_claw', (s * 1.0, 0.65, -2.9), 0.32, scorpD, sub=2, scale=(0.8, 0.5, 1.2), smooth=False))
    for k in (-1, 1):
        parts.append(cyl('sc_pin', (s * 1.0 + k * 0.12, 0.65, -3.3), 0.08, 0.0, 0.4, scorp, n=6, axis='z'))
    # legs
    for j, z in enumerate((-0.9, -0.3, 0.3, 0.9)):
        parts.append(tube('sc_leg', [(s * 0.6, 0.55, z), (s * 1.2, 0.9, z + 0.05), (s * 1.6, 0.0, z + 0.15)], [0.08, 0.07, 0.05], scorpD, n=6, smooth=False))
fin(join(parts, 'scorpion'))

# ---------- yard props ----------
fin(join([
    cyl('b_b', (0, 0.45, 0), 0.3, 0.3, 0.9, M('barrelBlue', '#1e5aa8', 0.6, 0.3), n=14),
    cyl('b_r1', (0, 0.2, 0), 0.31, 0.31, 0.04, M('barrelRing', '#163f75', 0.6, 0.3), n=14),
    cyl('b_r2', (0, 0.7, 0), 0.31, 0.31, 0.04, M('barrelRing', '#163f75', 0.6, 0.3), n=14),
], 'barrel'))
fin(join([
    box('cr', (0, 0.3, 0), (0.6, 0.6, 0.6), wood, bev=0.02),
    box('cr_x', (0, 0.3, -0.305), (0.08, 0.75, 0.02), woodD),
    box('cr_y', (0, 0.3, 0.305), (0.08, 0.75, 0.02), woodD),
], 'crate'))
fin(join([
    cyl('t_c', (0, 0.45, 0), 0.27, 0.3, 0.9, metal, n=14),
    cyl('t_l', (0, 0.93, 0), 0.31, 0.31, 0.06, metal, n=14),
    box('t_h', (0, 0.99, 0), (0.18, 0.04, 0.04), metal),
    rock('t_trash', (0.05, 1.0, 0.05), (0.22, 0.12, 0.22), M('trash', '#6d6d4a', 1), seed=3),
], 'trashcan'))
fin(join([
    box('dm_b', (0, 0.65, 0), (1.9, 1.1, 1.2), green, bev=0.03),
    box('dm_l', (0, 1.24, 0.1), (1.95, 0.08, 1.15), M('greenD', '#1b5e20', 0.8)),
    box('dm_s', (0, 0.07, 0), (1.7, 0.14, 1.0), dark),
    rock('dm_bag', (0.5, 1.35, 0.2), (0.3, 0.22, 0.3), dark, seed=4),
    rock('dm_bag2', (-0.3, 1.3, -0.1), (0.25, 0.2, 0.25), M('bagW', '#d7d7d7', 0.9), seed=5),
], 'dumpster'))
fin(join([
    box('pt_t', (0, 0.75, 0), (1.8, 0.06, 0.8), wood, bev=0.01),
    box('pt_s1', (0, 0.45, -0.6), (1.8, 0.05, 0.3), wood),
    box('pt_s2', (0, 0.45, 0.6), (1.8, 0.05, 0.3), wood),
] + [box('pt_leg', (s * 0.7, 0.38, 0), (0.08, 0.76, 1.5), woodD) for s in (-1, 1)], 'picnic'))
fin(join([cyl('ts_%d' % i, (0.0 + (i % 2) * 0.05, 0.12 + i * 0.22, 0), 0.38, 0.38, 0.22, tire, n=14) for i in range(4)]
         + [cyl('ts_h', (0.05 * (i % 2), 0.12 + i * 0.22, 0), 0.2, 0.2, 0.23, dark, n=10) for i in range(4)], 'tires'))
fin(join([
    box('bn_s', (0, 0.45, 0), (1.6, 0.06, 0.4), wood),
    box('bn_b', (0, 0.75, 0.18), (1.6, 0.25, 0.05), wood),
] + [box('bn_l', (s * 0.7, 0.22, 0), (0.06, 0.45, 0.38), metal) for s in (-1, 1)], 'bench'))
fin(join([
    box('np_b', (0, 0.6, 0), (0.7, 1.2, 0.6), red, bev=0.03),
    box('np_w', (0, 0.85, -0.31), (0.5, 0.4, 0.02), M('newsW', '#fafafa', 0.9)),
    box('np_l', (0, 1.22, 0), (0.72, 0.06, 0.62), dark),
], 'newsbox'))
# casino portal: gold columns either side of a 4 m door, stepped pediment with bulbs, red carpet
goldM = M('gold', '#e6b422', 0.3, 0.85)
carpet = M('carpet', '#b0102a', 0.9)
pp = []
for s in (-1, 1):
    pp.append(cyl('pt_col', (s * 2.55, 2.7, -0.45), 0.32, 0.28, 5.4, goldM, n=12, smooth=True))
    pp.append(box('pt_base', (s * 2.55, 0.15, -0.45), (0.85, 0.3, 0.85), goldM, bev=0.03))
    pp.append(box('pt_cap', (s * 2.55, 5.45, -0.45), (0.8, 0.2, 0.8), goldM, bev=0.03))
pp.append(box('pt_ent', (0, 5.8, -0.45), (6.2, 0.55, 1.0), goldM, bev=0.03))
pp.append(box('pt_ped1', (0, 6.3, -0.4), (4.6, 0.45, 0.8), carpet, bev=0.02))
pp.append(box('pt_ped2', (0, 6.7, -0.35), (2.8, 0.4, 0.7), goldM, bev=0.02))
pp.append(ball('pt_star', (0, 7.25, -0.35), 0.35, goldM, sub=1, scale=(1, 1, 0.4), smooth=False))
for i in range(13):
    pp.append(ball('pt_b', (-3.0 + i * 0.5, 5.8, -0.97), 0.07, bulb, sub=1))
for i in range(9):
    pp.append(ball('pt_b2', (-2.2 + i * 0.55, 6.3, -0.82), 0.06, bulb, sub=1))
pp.append(box('pt_carpet', (0, 0.02, -3.2), (2.6, 0.04, 6.0), carpet))
for s in (-1, 1):
    for z in (-1.5, -3.5, -5.5):
        pp.append(cyl('pt_post', (s * 1.6, 0.45, z), 0.05, 0.05, 0.9, goldM, n=8))
        pp.append(ball('pt_knob', (s * 1.6, 0.93, z), 0.08, goldM, sub=1))
    pp.append(tube('pt_rope', [(s * 1.6, 0.85, -1.5), (s * 1.6, 0.68, -2.5), (s * 1.6, 0.85, -3.5), (s * 1.6, 0.68, -4.5), (s * 1.6, 0.85, -5.5)], 0.035, carpet, n=6))
fin(join(pp, 'portal'))

# bulb string (casino / motel marquees): 10 bulbs over 1 m (scale x)
fin(join([ball('bl_%d' % i, (-0.45 + i * 0.1, 0, -0.03), 0.035, bulb, sub=1) for i in range(10)], 'bulbs'))

layout(roots, 4.5)
export('buildings', roots)
