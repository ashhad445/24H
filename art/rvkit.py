# RV exterior kit -> public/models/rvkit.glb. Swapped onto the procedural RV by src/rv/RVKit.ts.
# Every piece is modelled around its own origin (code places it); fronts face -Z like the RV.
#   wheel          axis along X, outer face +X, R 0.5, 0.34 wide (rotate 180 deg for the left side)
#   bumper_front   2.76 wide chrome bar, origin at its centre          bumper_rear   same, faces +Z, with step + hitch
#   grille         1.56 x 0.56 egg-crate, origin at its centre        headlight     bezel + turn signal around a r 0.13 lens
#   ac             roof air conditioner, origin bottom centre         ladder        rear ladder, origin floor level between the rails
#   roofrack       luggage rack + cargo, origin bottom centre         awning        rolled awning (right side), origin roll centre
#   antenna / vent roof clutter, origin bottom centre                 mudflap       hangs from y 0, origin top centre
import os; exec(open(os.path.join(os.environ.get('ART_DIR', r'E:\24H\art'), 'lib.py')).read())
reset()

chrome = M('chrome', '#dfe4e8', 0.18, 1.0)
steel = M('steel', '#9aa0a6', 0.4, 0.8)
tire = M('tire', '#18181a', 0.95)
tread = M('tread', '#101011', 1.0)
rimW = M('rimWhite', '#ece6d8', 0.5, 0.2)
dark = M('dark', '#232325', 0.8)
rubber = M('rubber', '#111112', 0.9)
amber = M('amber', '#ff9d1a', 0.35, 0.0, emit=0.4)
red = M('red', '#b3261e', 0.5)
white = M('white', '#f1ede2', 0.7)
cream = M('cream', '#f4efe6', 0.7)
orange = M('orange', '#f0ad4e', 0.8)
maroon = M('maroon', '#d9534f', 0.8)
olive = M('olive', '#6b6f3c', 0.95)
rope = M('rope', '#c9b48a', 0.95)
blue = M('blue', '#1f6fb5', 0.6)
brown = M('brown', '#7a4a26', 0.85)
plate = M('plate', '#f5f3e8', 0.6)

roots = []


def fin(o):
    roots.append(o); return o


def lathe_x(name, pts, mat, n=28, smooth=True):
    """Revolve a profile [(radius, x), ...] around the game X axis."""
    bm = bmesh.new()
    rings = []
    for (r, x) in pts:
        rings.append([bm.verts.new(G(x, math.cos(2 * math.pi * i / n) * r, math.sin(2 * math.pi * i / n) * r)) for i in range(n)])
    for a, b in zip(rings, rings[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    for ring, (r, x) in zip((rings[0], rings[-1]), (pts[0], pts[-1])):
        if r > 0:
            bm.faces.new(ring)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _new(name, bm, mat, smooth)


def circle(c, r, n=20, axis='z'):
    pts = []
    for i in range(n + 1):
        a = 2 * math.pi * i / n
        if axis == 'z':
            pts.append((c[0] + math.cos(a) * r, c[1] + math.sin(a) * r, c[2]))
        else:
            pts.append((c[0], c[1] + math.sin(a) * r, c[2] + math.cos(a) * r))
    return pts


# ---------- wheel ----------
w = []
w.append(lathe_x('w_tire', [(0.30, -0.15), (0.41, -0.172), (0.47, -0.16), (0.497, -0.118), (0.5, -0.06), (0.5, 0.06), (0.497, 0.118), (0.47, 0.16), (0.41, 0.172), (0.30, 0.15)], tire, n=32))
for i in range(28):  # tread blocks, staggered in two rows
    a = 2 * math.pi * i / 28
    for row, off in ((-0.07, 0.0), (0.07, math.pi / 28)):
        b = box('w_tr', (row, 0, 0), (0.105, 0.03, 0.075), tread)
        b.data.transform(Matrix.Translation(G(0, 0.495, 0)))
        b.data.transform(Matrix.Rotation(a + off, 4, 'X'))
        w.append(b)
w.append(lathe_x('w_rim', [(0.305, 0.15), (0.30, 0.165), (0.285, 0.16), (0.27, 0.10), (0.20, 0.075), (0.15, 0.10), (0.15, 0.115)], rimW, n=28))
w.append(lathe_x('w_cap', [(0.15, 0.11), (0.145, 0.15), (0.10, 0.175), (0.04, 0.185), (0.0, 0.186)], chrome, n=24))
w.append(lathe_x('w_lip', [(0.31, 0.148), (0.318, 0.16), (0.305, 0.17), (0.295, 0.162)], chrome, n=28))
for i in range(8):  # vent slots in the steel wheel
    a = 2 * math.pi * i / 8
    s = box('w_slot', (0.086, 0.235, 0), (0.02, 0.045, 0.085), dark, bev=0.008)
    s.data.transform(Matrix.Rotation(a, 4, 'X'))
    w.append(s)
for i in range(6):  # lug nuts
    a = 2 * math.pi * i / 6 + 0.26
    nut = cyl('w_nut', (0.092, 0.185, 0), 0.016, 0.014, 0.03, chrome, n=6, axis='x')
    nut.data.transform(Matrix.Rotation(a, 4, 'X'))
    w.append(nut)
w.append(lathe_x('w_back', [(0.0, -0.10), (0.30, -0.10), (0.30, -0.15)], dark, n=20, smooth=False))
w.append(cyl('w_drum', (-0.13, 0, 0), 0.2, 0.2, 0.08, steel, n=16, axis='x'))
fin(join(w, 'wheel'))

# ---------- bumpers ----------
def bumper(name, front):
    f = -1 if front else 1  # which way the face points along z
    p = []
    p.append(box('b_bar', (0, 0, 0), (2.76, 0.2, 0.13), chrome, bev=0.045, seg=3))
    p.append(box('b_bar2', (0, -0.005, f * 0.03), (2.6, 0.085, 0.13), chrome, bev=0.035, seg=3))  # raised centre rib
    for s in (-1, 1):
        p.append(box('b_wrap', (s * 1.345, 0, -f * 0.16), (0.11, 0.2, 0.42), chrome, bev=0.04, seg=3))
        p.append(box('b_over', (s * 0.62, 0.03, f * 0.05), (0.1, 0.3, 0.16), chrome, bev=0.035, seg=2))
        p.append(box('b_overR', (s * 0.62, 0.03, f * 0.135), (0.06, 0.2, 0.02), rubber, bev=0.008))
        p.append(box('b_brk', (s * 0.9, -0.02, -f * 0.12), (0.08, 0.12, 0.2), dark))
    p.append(box('b_val', (0, -0.14, -f * 0.03), (2.5, 0.1, 0.07), dark, bev=0.02))
    if front:
        p.append(box('b_plate', (0, -0.005, f * 0.103), (0.36, 0.17, 0.012), plate, bev=0.004))
        p.append(box('b_plateF', (0, -0.005, f * 0.098), (0.4, 0.21, 0.012), dark, bev=0.004))
        for s in (-1, 1):
            p.append(cyl('b_fog', (s * 1.02, -0.14, f * 0.05), 0.05, 0.05, 0.05, amber, n=12, axis='z'))
            p.append(tube('b_fogR', circle((s * 1.02, -0.14, f * 0.075), 0.055, 14), 0.01, chrome, n=6, caps=False))
            p.append(cyl('b_tow', (s * 0.3, -0.14, f * 0.04), 0.035, 0.035, 0.1, red, n=8, axis='z'))
    else:
        p.append(box('b_step', (0.2, 0.105, f * 0.02), (1.3, 0.02, 0.15), rubber, bev=0.006))
        for i in range(9):
            p.append(box('b_tr', (0.2 - 0.56 + i * 0.14, 0.118, f * 0.02), (0.05, 0.012, 0.13), dark))
        p.append(box('b_hitch', (0, -0.14, f * 0.05), (0.09, 0.09, 0.3), dark, bev=0.01))
        p.append(box('b_tongue', (0, -0.12, f * 0.22), (0.07, 0.03, 0.14), steel, bev=0.008))
        p.append(ball('b_ball', (0, -0.065, f * 0.26), 0.035, chrome, sub=2))
        p.append(cyl('b_neck', (0, -0.095, f * 0.26), 0.016, 0.016, 0.04, chrome, n=8))
        p.append(box('b_plate', (-0.95, -0.005, f * 0.103), (0.36, 0.17, 0.012), plate, bev=0.004))
        p.append(box('b_plateF', (-0.95, -0.005, f * 0.098), (0.4, 0.21, 0.012), dark, bev=0.004))
    return fin(join(p, name))


bumper('bumper_front', True)
bumper('bumper_rear', False)

# ---------- grille ----------
g = []
GW, GH = 1.56, 0.56
for (c, s) in (((0, GH / 2 - 0.02, -0.03), (GW, 0.05, 0.07)), ((0, -GH / 2 + 0.02, -0.03), (GW, 0.05, 0.07)),
               ((-GW / 2 + 0.02, 0, -0.03), (0.05, GH, 0.07)), ((GW / 2 - 0.02, 0, -0.03), (0.05, GH, 0.07))):
    g.append(box('g_fr', c, s, chrome, bev=0.016, seg=2))
for i in range(7):
    g.append(box('g_h', (0, -0.2 + i * 0.0667, -0.035), (GW - 0.08, 0.018, 0.035), chrome, bev=0.006))
for i in range(15):
    g.append(box('g_v', (-0.7 + i * 0.1, 0, -0.022), (0.012, GH - 0.08, 0.02), steel))
g.append(lathe('g_badge', [(0.0, 0.0), (0.085, 0.004), (0.095, 0.014), (0.0, 0.03)], chrome, n=20, sx=1.5))
g[-1].data.transform(Matrix.Rotation(math.pi / 2, 4, 'X')); g[-1].data.transform(Matrix.Translation(G(0, 0, -0.045)))
g.append(box('g_badgeR', (0, 0, -0.078), (0.16, 0.05, 0.01), red, bev=0.004))
fin(join(g, 'grille'))

# ---------- headlight bezel (lens stays procedural so it can light up) ----------
h = []
for (c, s) in (((0, 0.165, 0), (0.37, 0.04, 0.09)), ((0, -0.165, 0), (0.37, 0.04, 0.09)), ((-0.165, 0, 0), (0.04, 0.37, 0.09)), ((0.165, 0, 0), (0.04, 0.37, 0.09))):
    h.append(box('h_fr', c, s, chrome, bev=0.014, seg=2))
h.append(tube('h_ring', circle((0, 0, -0.045), 0.142, 22), 0.02, chrome, n=8, caps=False))
h.append(box('h_back', (0, 0, 0.03), (0.31, 0.31, 0.02), dark))
h.append(box('h_sig', (0, -0.235, -0.01), (0.3, 0.07, 0.06), amber, bev=0.012))
h.append(box('h_sigF', (0, -0.235, 0.005), (0.34, 0.1, 0.05), chrome, bev=0.012))
fin(join(h, 'headlight'))

# ---------- roof AC ----------
a = []
a.append(box('ac_base', (0, 0.03, 0), (0.98, 0.06, 1.08), dark, bev=0.01))
a.append(box('ac_body', (0, 0.2, 0), (0.9, 0.3, 1.0), white, bev=0.09, seg=4))
a.append(box('ac_top', (0, 0.36, 0.05), (0.62, 0.05, 0.6), white, bev=0.02, seg=2))
for s in (-1, 1):
    for i in range(7):
        a.append(box('ac_lv', (s * 0.452, 0.2, -0.3 + i * 0.1), (0.012, 0.16, 0.05), dark))
for i in range(6):
    a.append(box('ac_in', (-0.25 + i * 0.1, 0.2, -0.502), (0.06, 0.14, 0.012), dark))
a.append(cyl('ac_fan', (0, 0.39, 0.05), 0.2, 0.2, 0.012, dark, n=16))
fin(join(a, 'ac'))

# ---------- rear ladder ----------
l = []
for s in (-1, 1):
    l.append(tube('l_rail', [(s * 0.2, 0.72, 0), (s * 0.2, 3.1, 0), (s * 0.2, 3.26, -0.04), (s * 0.2, 3.32, -0.16), (s * 0.2, 3.28, -0.3), (s * 0.2, 3.13, -0.36)], 0.022, chrome, n=8))
    for y in (0.95, 2.85):
        l.append(cyl('l_off', (s * 0.2, y, -0.05), 0.016, 0.016, 0.1, steel, n=6, axis='z'))
        l.append(cyl('l_pad', (s * 0.2, y, -0.1), 0.04, 0.04, 0.012, steel, n=10, axis='z'))
y = 0.9
while y < 3.05:
    l.append(tube('l_rung', [(-0.2, y, 0), (0.2, y, 0)], 0.018, chrome, n=8))
    y += 0.31
fin(join(l, 'ladder'))

# ---------- roof rack + cargo ----------
r = []
RW, RD = 1.0, 0.85  # half sizes
loop = [(-RW, 0.2, -RD), (RW, 0.2, -RD), (RW, 0.2, RD), (-RW, 0.2, RD), (-RW, 0.2, -RD)]
r.append(tube('r_rail', loop, 0.022, chrome, n=8, caps=False))
for (x, z) in ((-RW, -RD), (RW, -RD), (RW, RD), (-RW, RD), (-RW, 0), (RW, 0)):
    r.append(cyl('r_post', (x, 0.1, z), 0.018, 0.018, 0.2, chrome, n=8))
    r.append(cyl('r_foot', (x, 0.008, z), 0.045, 0.045, 0.016, steel, n=10))
for z in (-0.55, 0, 0.55):
    r.append(box('r_slat', (0, 0.03, z), (2 * RW, 0.025, 0.09), steel, bev=0.006))
# tarp bundle with rope
r.append(ball('r_tarp', (-0.4, 0.27, -0.2), 0.42, olive, sub=2, scale=(1.15, 0.55, 1.4), smooth=False))
for z in (-0.5, 0.1):
    r.append(tube('r_rope', [(-0.92, 0.05, z), (-0.8, 0.36, z), (-0.4, 0.51, z), (0.0, 0.36, z), (0.12, 0.05, z)], 0.012, rope, n=6))
# cooler
r.append(box('r_cool', (0.52, 0.2, -0.45), (0.62, 0.3, 0.4), blue, bev=0.03, seg=2))
r.append(box('r_coolLid', (0.52, 0.375, -0.45), (0.64, 0.06, 0.42), white, bev=0.02, seg=2))
r.append(tube('r_coolH', [(0.3, 0.41, -0.45), (0.3, 0.46, -0.45), (0.74, 0.46, -0.45), (0.74, 0.41, -0.45)], 0.012, white, n=6))
# old suitcase with straps
r.append(box('r_case', (0.5, 0.15, 0.35), (0.7, 0.22, 0.5), brown, bev=0.03, seg=2))
for x in (0.3, 0.7):
    r.append(box('r_strap', (x, 0.15, 0.35), (0.05, 0.235, 0.515), rope))
r.append(box('r_caseH', (0.5, 0.15, 0.61), (0.16, 0.03, 0.03), dark, bev=0.008))
# folded lawn chair
r.append(box('r_chair', (-0.45, 0.07, 0.62), (0.75, 0.05, 0.3), orange, bev=0.01))
r.append(tube('r_chairF', [(-0.83, 0.07, 0.47), (-0.83, 0.07, 0.78), (-0.07, 0.07, 0.78), (-0.07, 0.07, 0.47)], 0.014, chrome, n=6))
fin(join(r, 'roofrack'))

# ---------- rolled awning (right side, along z) ----------
aw = []
L = 3.9
segs = 13
for i in range(segs):
    z = -L / 2 + (i + 0.5) * L / segs
    aw.append(cyl('aw_roll', (0, 0, z), 0.075, 0.075, L / segs + 0.002, orange if i % 2 == 0 else cream, n=14, axis='z', smooth=True))
for s in (-1, 1):
    aw.append(cyl('aw_cap', (0, 0, s * (L / 2 + 0.02)), 0.085, 0.085, 0.05, chrome, n=14, axis='z'))
    aw.append(box('aw_arm', (-0.03, -0.8, s * (L / 2 - 0.05)), (0.03, 1.6, 0.045), steel, bev=0.006))
    aw.append(box('aw_foot', (-0.04, -1.6, s * (L / 2 - 0.05)), (0.05, 0.08, 0.08), dark, bev=0.01))
    aw.append(box('aw_brk', (-0.05, 0.02, s * (L / 2 - 0.05)), (0.08, 0.1, 0.07), steel, bev=0.01))
aw.append(box('aw_rail', (-0.07, 0.08, 0), (0.02, 0.03, L), steel))
fin(join(aw, 'awning'))

# ---------- batwing TV antenna ----------
an = []
an.append(cyl('an_base', (0, 0.02, 0), 0.09, 0.11, 0.04, white, n=12))
an.append(cyl('an_mast', (0, 0.2, 0), 0.014, 0.014, 0.36, steel, n=8))
an.append(box('an_head', (0, 0.39, 0), (0.12, 0.05, 0.1), white, bev=0.012))
for s in (-1, 1):
    an.append(box('an_wing', (s * 0.36, 0.39, 0), (0.6, 0.012, 0.11), steel, bev=0.004))
    for i in range(3):
        an.append(cyl('an_el', (s * (0.2 + i * 0.18), 0.39, 0), 0.006, 0.006, 0.34 - i * 0.06, steel, n=6, axis='z'))
fin(join(an, 'antenna'))

# ---------- roof vent ----------
v = []
v.append(box('v_base', (0, 0.025, 0), (0.5, 0.05, 0.5), white, bev=0.012))
v.append(box('v_lid', (0, 0.1, 0), (0.44, 0.1, 0.44), white, bev=0.045, seg=3))
v.append(box('v_crank', (0, 0.06, -0.24), (0.06, 0.03, 0.04), dark))
fin(join(v, 'vent'))

# ---------- mud flap ----------
m = []
m.append(box('m_flap', (0, -0.19, 0), (0.42, 0.38, 0.018), rubber, bev=0.006))
m.append(box('m_bar', (0, -0.01, 0), (0.46, 0.035, 0.035), steel, bev=0.008))
m.append(box('m_wt', (0, -0.355, 0.002), (0.4, 0.035, 0.024), chrome, bev=0.006))
m.append(ball('m_logo', (0, -0.17, 0.012), 0.07, chrome, sub=2, scale=(1.3, 0.8, 0.12)))
fin(join(m, 'mudflap'))

layout(roots, 3.4)
export('rvkit', roots)
