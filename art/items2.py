# Hand props, batch 2 -> public/models/items2.glb. Used by src/items/Items.ts buildItemMesh() when present.
# Each prop is a drop-in for the procedural mesh of the same name: same size, same origin, same colours.
import os; exec(open(os.path.join(os.environ.get('ART_DIR', r'E:\24H\art'), 'lib.py')).read())
reset()

black = M('black', '#17181a', 0.6)
rubber = M('rubber', '#1a1a1a', 0.92)
rubberD = M('rubberDark', '#0d0d0e', 0.95)
steel = M('steel', '#aab0b6', 0.3, 0.9)
chrome = M('chrome', '#cfd4d8', 0.25, 0.85)
white = M('white', '#f3f1ea', 0.6)
red = M('red', '#d32f2f', 0.4)
redD = M('redDark', '#8e1b1b', 0.5)
orange = M('orange', '#ff5722', 0.5)
yellow = M('yellow', '#fdd835', 0.5)
lime = M('lime', '#76ff03', 0.5)
blue = M('blue', '#1565c0', 0.5)
blueL = M('blueLabel', '#0277bd', 0.5)

roots = []


def fin(o):
    roots.append(o); return o


def put(o, t=(0, 0, 0), rx=0.0, ry=0.0, rz=0.0):
    """Rotate about game axes (x, y, z) then move to game point t."""
    if rx: o.data.transform(Matrix.Rotation(rx, 4, 'X'))
    if rz: o.data.transform(Matrix.Rotation(-rz, 4, 'Y'))
    if ry: o.data.transform(Matrix.Rotation(ry, 4, 'Z'))
    o.data.transform(Matrix.Translation(G(*t)))
    return o


def recentre(o):
    """Move the bounding box centre of the joined object to the origin."""
    pts = [Vector(c) for c in o.bound_box]
    ctr = sum(pts, Vector()) / 8
    o.data.transform(Matrix.Translation(-ctr))
    return o


# ---------- rocket fuel (canister, nose up, y -0.14 .. 0.25) ----------
bodyM = M('rocketBody', '#e8e8ec', 0.3, 0.5)
p = []
p.append(lathe('r_body', [(0.0, -0.12), (0.06, -0.12), (0.07, -0.11), (0.07, 0.12), (0.066, 0.13)], bodyM, n=14))
p.append(lathe('r_nose', [(0.066, 0.128), (0.064, 0.15), (0.054, 0.18), (0.038, 0.213), (0.02, 0.235), (0.0, 0.243)], red, n=14))
p.append(lathe('r_cap', [(0.013, 0.236), (0.013, 0.252), (0.0, 0.255)], chrome, n=10))
p.append(lathe('r_base', [(0.06, -0.14), (0.073, -0.14), (0.073, -0.12), (0.06, -0.12)], black, n=14))
p.append(lathe('r_label', [(0.0712, -0.06), (0.0712, 0.06)], black, n=14))
p.append(lathe('r_stripeT', [(0.0716, 0.045), (0.0716, 0.058)], orange, n=14))
p.append(lathe('r_stripeB', [(0.0716, -0.058), (0.0716, -0.045)], orange, n=14))
for s in (-1, 1):  # flame badge on both faces
    p.append(ball('r_f1', (0, -0.006, s * 0.0716), 0.012, yellow, scale=(1, 1.1, 0.25), seg=(8, 5)))
    p.append(ball('r_f2', (0, 0.012, s * 0.0716), 0.008, orange, scale=(0.7, 1.7, 0.25), seg=(8, 5)))
for a in range(3):  # three swept fins
    f = box('r_fin', (0.1, -0.095, 0), (0.05, 0.1, 0.012), red)
    f.data.transform(Matrix.Rotation(a * 2.0944 + 0.5, 4, 'Z'))
    p.append(f)
fin(join(p, 'rocket'))

# ---------- weed stash bag (0.34 x 0.16 x 0.22) ----------
bag = M('bagGreen', '#2e7d32', 0.55)
bagD = M('bagGreenDark', '#1b5e20', 0.6)
leafM = M('leaf', '#76ff03', 0.5)
bud = M('bud', '#558b2f', 0.9)
p = []
p.append(box('w_bag', (0, -0.004, 0), (0.34, 0.14, 0.22), bag, bev=0.03, seg=2))
p.append(box('w_seal', (0, 0.078, 0), (0.335, 0.018, 0.1), bagD, bev=0.004))
for i in range(6):  # crimped top ridges
    p.append(box('w_rib', (-0.125 + i * 0.05, 0.083, 0), (0.016, 0.014, 0.105), bagD))
p.append(box('w_zip', (0, 0.058, 0), (0.33, 0.006, 0.19), M('zip', '#e8e8e0', 0.5), bev=0.002))
for s in (-1, 1):
    p.append(box('w_label', (0, 0.0, s * 0.1115), (0.2, 0.1, 0.008), M('labelW', '#f1f0e8', 0.6)))
    p.append(box('w_labelT', (0, 0.041, s * 0.1155), (0.2, 0.014, 0.004), bagD))
    for k, (a, l) in enumerate(((0.0, 0.05), (0.7, 0.04), (-0.7, 0.04), (1.25, 0.03), (-1.25, 0.03))):  # 5 leaflets
        lf = ball('w_lf', (0, 0, 0), 0.01, leafM, scale=(0.55, l / 0.01 * 0.5, 0.18), seg=(5, 3))
        lf.data.transform(Matrix.Translation(G(0, l * 0.5, 0)))
        put(lf, (0, -0.03, s * 0.1195), rz=a * (1 if s > 0 else -1))
        p.append(lf)
    p.append(box('w_stem', (0, -0.04, s * 0.1195), (0.005, 0.03, 0.004), bagD))
for i, (x, y, z) in enumerate(((-0.12, -0.04, 0.0), (0.13, -0.045, 0.02), (-0.15, 0.03, -0.01), (0.15, 0.02, -0.02))):
    p.append(ball('w_bud', (x, y, z), 0.03, bud, seg=(6, 4), scale=(1, 0.9, 1.5)))
fin(join(p, 'weed'))

# ---------- car battery (0.24 x 0.16 x 0.14) ----------
case = M('batCase', '#263238', 0.55)
caseL = M('batCaseLight', '#37474f', 0.5)
lead = M('lead', '#9aa0a6', 0.35, 0.9)
redT = M('termRed', '#c62828', 0.45)
p = []
p.append(box('b_body', (0, -0.005, 0), (0.24, 0.15, 0.14), case, bev=0.008, seg=2))
p.append(box('b_ledge', (0, -0.072, 0), (0.25, 0.012, 0.15), case, bev=0.003))
p.append(box('b_top', (0, 0.0725, 0), (0.226, 0.012, 0.126), caseL, bev=0.003))
for i in range(3):  # cell caps
    for z in (-0.036, 0.036):
        p.append(cyl('b_cap', (-0.045 + i * 0.045 + (0.02 if i else 0) * 0, 0.082, z * 0.9), 0.012, 0.012, 0.01, black, n=8))
p.append(cyl('b_pBoss', (-0.07, 0.083, -0.025), 0.02, 0.02, 0.012, redT, n=10))
p.append(cyl('b_nBoss', (0.07, 0.083, -0.025), 0.02, 0.02, 0.012, black, n=10))
p.append(cyl('b_pPost', (-0.07, 0.1, -0.025), 0.011, 0.007, 0.03, lead, n=10))
p.append(cyl('b_nPost', (0.07, 0.1, -0.025), 0.011, 0.007, 0.03, lead, n=10))
p.append(box('b_pCl', (-0.07, 0.098, -0.025), (0.026, 0.012, 0.012), redT, bev=0.002))
p.append(box('b_nCl', (0.07, 0.098, -0.025), (0.026, 0.012, 0.012), black, bev=0.002))
p.append(box('b_plusH', (-0.07, 0.0795, 0.04), (0.018, 0.003, 0.005), redT))
p.append(box('b_plusV', (-0.07, 0.0795, 0.04), (0.005, 0.003, 0.018), redT))
p.append(box('b_minus', (0.07, 0.0795, 0.04), (0.018, 0.003, 0.005), white))
p.append(tube('b_handle', [(-0.05, 0.08, 0.034), (-0.05, 0.1, 0.034), (0.05, 0.1, 0.034), (0.05, 0.08, 0.034)], 0.0055, black, n=6))
for s in (-1, 1):
    p.append(box('b_label', (0, -0.005, s * 0.0715), (0.17, 0.09, 0.003), M('batLabel', '#ffb300', 0.5)))
    p.append(box('b_labelS', (0, 0.025, s * 0.0725), (0.17, 0.02, 0.002), black))
    p.append(box('b_bolt', (-0.04, -0.02, s * 0.0725), (0.03, 0.035, 0.002), black))
    p.append(box('b_bolt2', (-0.01, -0.02, s * 0.0725), (0.016, 0.035, 0.002), black))
    p.append(box('b_rib', (0, -0.06, s * 0.0705), (0.22, 0.01, 0.003), caseL))
fin(join(p, 'battery'))

# ---------- catalytic converter (long axis X, 0.30 long, r 0.06) ----------
cBody = M('catBody', '#8d6e63', 0.5, 0.6)
cShield = M('catShield', '#b0a59d', 0.4, 0.7)
cRust = M('catRust', '#5d4037', 0.8, 0.4)
p = []
b = lathe('c_shell', [(0.0, -0.1), (0.045, -0.1), (0.06, -0.085), (0.062, 0.0), (0.06, 0.085), (0.045, 0.1), (0.0, 0.1)], cBody, n=12, sx=1.0, sz=0.82)
put(b, rz=math.pi / 2); p.append(b)
b = lathe('c_shield', [(0.0, -0.075), (0.067, -0.075), (0.071, -0.06), (0.07, 0.06), (0.066, 0.075), (0.0, 0.075)], cShield, n=12, sx=1.0, sz=0.9)
put(b, (0, 0.006, 0), rz=math.pi / 2); p.append(b)
for x in (-0.035, 0.035):  # heat-shield beads
    b = lathe('c_bead', [(0.071, -0.004), (0.075, -0.002), (0.075, 0.002), (0.071, 0.004)], cShield, n=12, sx=1.0, sz=0.9)
    put(b, (x, 0.006, 0), rz=math.pi / 2); p.append(b)
for s in (-1, 1):
    pipe = cyl('c_pipe', (s * 0.13, 0, 0), 0.03, 0.03, 0.06, cRust, n=12, axis='x')
    p.append(pipe)
    p.append(cyl('c_cone', (s * 0.098, 0, 0), 0.03, 0.05, 0.02, cBody, n=12, axis='x'))
    fl = cyl('c_flange', (s * 0.152, 0, 0), 0.052, 0.052, 0.012, cRust, n=12, axis='x')
    p.append(fl)
    for k in range(4):
        a = k * math.pi / 2 + math.pi / 4
        p.append(cyl('c_bolt', (s * 0.16, math.sin(a) * 0.04, math.cos(a) * 0.04), 0.007, 0.007, 0.008, steel, n=5, axis='x'))
p.append(cyl('c_o2', (0.02, 0.072, 0), 0.01, 0.01, 0.025, steel, n=8))
p.append(tube('c_wire', [(0.02, 0.085, 0), (0.03, 0.105, 0.0), (0.06, 0.1, 0.02), (0.08, 0.085, 0.04)], 0.0035, black, n=5))
p.append(box('c_plate', (-0.04, -0.062, 0.0), (0.06, 0.004, 0.04), steel, bev=0.001))
fin(join(p, 'cat'))

# ---------- loose wheel (axis Z, tyre R 0.24, 0.14 wide) ----------
tire = rubber
def tyre(n, hw, rIn, rOut, sw, groove=0.006):
    prof = [(rIn, -hw * 0.75), (rIn + 0.025, -hw), (rOut - sw, -hw * 1.02), (rOut - 0.012, -hw * 0.88), (rOut - 0.002, -hw * 0.62)]
    teeth = 3
    for i in range(teeth * 2 + 1):
        y = -hw * 0.6 + (hw * 1.2) * i / (teeth * 2)
        prof.append((rOut if i % 2 == 0 else rOut - groove, y))
    prof += [(rOut - 0.002, hw * 0.62), (rOut - 0.012, hw * 0.88), (rOut - sw, hw * 1.02), (rIn + 0.025, hw), (rIn, hw * 0.75)]
    return lathe('tyre', prof, rubber, n=n)

p = []
t = tyre(16, 0.07, 0.118, 0.24, 0.07); put(t, rx=math.pi / 2); p.append(t)
rim = lathe('w_rim', [(0.0, 0.052), (0.045, 0.05), (0.075, 0.056), (0.12, 0.072), (0.126, 0.06), (0.126, -0.05), (0.118, -0.058)], chrome, n=16)
put(rim, rx=math.pi / 2); p.append(rim)
cap = lathe('w_cap', [(0.0, 0.07), (0.03, 0.066), (0.04, 0.052)], steel, n=12)
put(cap, rx=math.pi / 2); p.append(cap)
for k in range(5):
    a = k * 2 * math.pi / 5
    p.append(cyl('w_lug', (math.cos(a) * 0.058, math.sin(a) * 0.058, 0.062), 0.0085, 0.0085, 0.014, steel, n=6, axis='z'))
fin(join(p, 'wheel'))

# ---------- RV spare tyre (axis Z, R 0.42, 0.25 thick) ----------
p = []
prof = [(0.235, -0.1), (0.27, -0.126), (0.36, -0.128), (0.405, -0.11), (0.418, -0.08)]
for i in range(3):
    prof.append((0.42 if i % 2 == 0 else 0.408, -0.05 + 0.05 * i))
prof += [(0.418, 0.08), (0.405, 0.11), (0.36, 0.128), (0.27, 0.126), (0.235, 0.1)]
t = lathe('s_tyre', prof, rubber, n=18)
put(t, rx=math.pi / 2); p.append(t)
rim = lathe('s_rim', [(0.0, 0.12), (0.08, 0.115), (0.15, 0.125), (0.245, 0.13), (0.25, 0.1), (0.25, -0.1), (0.235, -0.11)], chrome, n=18)
put(rim, rx=math.pi / 2); p.append(rim)
hub = lathe('s_hub', [(0.0, 0.14), (0.06, 0.135), (0.075, 0.12)], steel, n=12)
put(hub, rx=math.pi / 2); p.append(hub)
for k in range(6):
    a = k * math.pi / 3
    p.append(cyl('s_lug', (math.cos(a) * 0.12, math.sin(a) * 0.12, 0.13), 0.014, 0.014, 0.02, steel, n=5, axis='z'))
fin(join(p, 'spare'))

# ---------- blade fuse (long axis X, 0.04 x 0.025 x 0.012; prongs toward -X) ----------
amber = M('fuseAmber', '#ffb300', 0.35, 0.0, 0.3)
clear = M('fuseClear', '#ffe082', 0.3, 0.0, 0.25)
p = []
p.append(box('f_body', (0.004, 0, 0), (0.032, 0.024, 0.0095), amber, bev=0.002))
p.append(box('f_grip', (0.017, 0, 0), (0.008, 0.016, 0.0125), amber, bev=0.0015))
for s in (-1, 1):
    p.append(box('f_win', (0.002, 0, s * 0.0049), (0.02, 0.012, 0.0014), clear))
    p.append(box('f_prong', (-0.0165, s * 0.0065, 0), (0.0125, 0.005, 0.0022), chrome))
    p.append(box('f_post', (-0.007, s * 0.0065, 0), (0.008, 0.007, 0.004), chrome))
p.append(box('f_link', (0.0, 0, 0.0), (0.012, 0.0022, 0.0105), M('fuseLink', '#5d4037', 0.5, 0.6)))
fin(join(p, 'fuse'))

# ---------- sponge (0.13 x 0.05 x 0.09 yellow on a 0.014 green scrub side, y -0.039 .. 0.025) ----------
spY = M('spongeYellow', '#ffeb3b', 1.0)
spYd = M('spongePore', '#c9a800', 1.0)
spG = M('spongeGreen', '#43a047', 1.0)
spGd = M('spongeGreenDark', '#2e7d32', 1.0)
p = []
p.append(box('sp_body', (0, 0, 0), (0.13, 0.05, 0.09), spY, bev=0.009, seg=2))
p.append(box('sp_scrub', (0, -0.032, 0), (0.13, 0.014, 0.09), spG, bev=0.003))
rnd = random.Random(4)
for i in range(11):
    x = (rnd.random() - 0.5) * 0.1; z = (rnd.random() - 0.5) * 0.066
    p.append(ball('sp_pore', (x, 0.025, z), 0.007 + rnd.random() * 0.004, spYd, seg=(5, 3), scale=(1, 0.35, 1)))
for i in range(5):
    x = (rnd.random() - 0.5) * 0.1; y = (rnd.random() - 0.5) * 0.02
    p.append(ball('sp_poreS', (x, y, 0.045), 0.006, spYd, seg=(5, 3), scale=(1, 1, 0.35)))
for i in range(4):
    z = (rnd.random() - 0.5) * 0.06; y = (rnd.random() - 0.5) * 0.02
    p.append(ball('sp_poreE', (0.065, y, z), 0.006, spYd, seg=(5, 3), scale=(0.35, 1, 1)))
for i in range(6):
    p.append(box('sp_fleck', ((rnd.random() - 0.5) * 0.11, -0.0396, (rnd.random() - 0.5) * 0.07), (0.012, 0.002, 0.004), spGd))
fin(join(p, 'sponge'))

# ---------- suitcase (0.42 x 0.30 x 0.14) ----------
shell = M('caseBrown', '#6d4c41', 0.65)
band = M('caseBand', '#3e2723', 0.7)
brassC = M('caseBrass', '#c9a227', 0.3, 0.85)
p = []
p.append(box('sc_shell', (0, 0, 0), (0.42, 0.3, 0.14), shell, bev=0.014))
p.append(box('sc_band', (0, 0.06, 0), (0.43, 0.04, 0.145), band, bev=0.004))
p.append(box('sc_seam', (0, 0.0, 0), (0.43, 0.006, 0.145), band))
for x in (-0.206, 0.206):
    for y in (-0.135, 0.135):
        p.append(box('sc_guard', (x, y, 0), (0.014, 0.05, 0.15), brassC))
for z in (-0.0725, 0.0725):
    for x in (-0.17, 0.17):
        p.append(box('sc_latch', (x, 0.1, z), (0.04, 0.03, 0.006), chrome))
        p.append(box('sc_latchK', (x, 0.09, z * 1.06), (0.018, 0.008, 0.004), steel))
    for i in range(3):
        p.append(box('sc_rib', (-0.1 + i * 0.1, -0.075, z), (0.012, 0.13, 0.004), band))
p.append(tube('sc_handle', [(-0.05, 0.15, 0), (-0.05, 0.168, 0), (-0.03, 0.18, 0), (0.03, 0.18, 0), (0.05, 0.168, 0), (0.05, 0.15, 0)], 0.009, black, n=6))
p.append(box('sc_hBase', (-0.05, 0.152, 0), (0.026, 0.01, 0.04), steel))
p.append(box('sc_hBase2', (0.05, 0.152, 0), (0.026, 0.01, 0.04), steel, bev=0.002))
for x in (-0.15, 0.15):
    p.append(cyl('sc_foot', (x, -0.153, 0.04), 0.011, 0.011, 0.012, black, n=8))
    p.append(cyl('sc_foot', (x, -0.153, -0.04), 0.011, 0.011, 0.012, black, n=8))
st1 = cyl('sc_st1', (0.08, -0.04, 0.0735), 0.05, 0.05, 0.004, M('stickerY', '#ffca28', 0.5), n=14, axis='z')
p.append(st1)
p.append(cyl('sc_st1b', (0.08, -0.04, 0.0755), 0.028, 0.028, 0.003, M('stickerR', '#e53935', 0.5), n=12, axis='z'))
p.append(box('sc_st2', (-0.1, -0.07, 0.0735), (0.07, 0.04, 0.004), M('stickerB', '#039be5', 0.5), bev=0.002))
p.append(box('sc_st3', (-0.04, -0.01, 0.0735), (0.04, 0.03, 0.004), M('stickerW', '#f3f1ea', 0.6), bev=0.002))
fin(join(p, 'suitcase'))

# ---------- water bottle (r 0.03, y -0.08 .. 0.123) ----------
plastic = M('waterPlastic', '#9fd8f2', 0.2)
p = []
prof = [(0.0, -0.08), (0.018, -0.08), (0.026, -0.076), (0.03, -0.07), (0.0305, -0.056), (0.0275, -0.052), (0.0305, -0.047), (0.0305, 0.01), (0.0275, 0.016),
        (0.0305, 0.022), (0.0305, 0.04), (0.027, 0.062), (0.019, 0.08), (0.0125, 0.092), (0.0118, 0.105), (0.0138, 0.107), (0.0138, 0.109), (0.0118, 0.11)]
p.append(lathe('wa_body', prof, plastic, n=14))
p.append(lathe('wa_label', [(0.0314, -0.044), (0.0314, 0.007)], blueL, n=14))
p.append(lathe('wa_wave', [(0.0318, -0.03), (0.0318, -0.012)], white, n=14))
p.append(lathe('wa_cap', [(0.0132, 0.109), (0.0142, 0.11), (0.0142, 0.122), (0.0, 0.123)], blue, n=12))
for a in range(6):  # grip ridges on the cap
    th = a * math.pi / 3
    p.append(box('wa_ridge', (math.cos(th) * 0.0143, 0.116, math.sin(th) * 0.0143), (0.002, 0.009, 0.002), blue))
fin(join(p, 'water'))

# ---------- bag of ice (0.20 x 0.12 x 0.16) ----------
iceBag = M('iceBag', '#d9f1fb', 0.35)
iceCube = M('iceCube', '#f4fcff', 0.2)
iceBlue = M('iceBlue', '#1e88e5', 0.45)
p = []
p.append(box('i_bag', (0, -0.008, 0), (0.2, 0.104, 0.16), iceBag, bev=0.025, seg=2))
p.append(box('i_crimp', (0, 0.056, 0), (0.19, 0.012, 0.018), iceBag, bev=0.003))
for i in range(7):
    p.append(box('i_crimpR', (-0.08 + i * 0.027, 0.062, 0), (0.008, 0.01, 0.02), iceBag))
p.append(tube('i_tie', [(-0.095, 0.052, 0), (0, 0.044, 0.0), (0.095, 0.052, 0)], 0.005, iceBlue, n=5))
rnd = random.Random(9)
spots = [(-0.06, 0.02, 0.083), (0.04, -0.02, 0.083), (-0.02, -0.035, 0.083), (0.07, 0.025, 0.083), (-0.1, 0.0, 0.03), (-0.1, -0.03, -0.03),
         (0.1, 0.0, 0.0), (0.0, 0.043, 0.04), (-0.05, 0.043, -0.03), (0.05, 0.043, -0.04)]
for (x, y, z) in spots:  # cubes pressing against the plastic
    cb = box('i_cube', (0, 0, 0), (0.034, 0.03, 0.03), iceCube, bev=0.006)
    put(cb, (x, y, z), rx=rnd.random() * 0.6, ry=rnd.random() * 1.5, rz=rnd.random() * 0.6)
    p.append(cb)
p.append(box('i_band', (0, -0.04, 0.0825), (0.19, 0.036, 0.004), iceBlue, bev=0.002))
for k in range(3):  # snowflake
    sf = box('i_flake', (0, 0, 0), (0.026, 0.004, 0.003), white)
    put(sf, (0.0, -0.04, 0.0855), rz=k * math.pi / 3)
    p.append(sf)
fin(join(p, 'ice'))

# ---------- potted cactus (pot y -0.035 .. 0.035, cactus up to 0.2) ----------
terra = M('terracotta', '#bf6a3a', 0.85)
terraD = M('terracottaDark', '#a1552b', 0.85)
soil = M('soil', '#4e342e', 1.0)
cac = M('cactusGreen', '#5b8c3a', 0.7)
cacD = M('cactusDark', '#3f6a28', 0.7)
spine = M('spine', '#f5efd5', 0.6)
flower = M('flowerPink', '#f06292', 0.5)
p = []
p.append(lathe('ca_pot', [(0.0, -0.035), (0.04, -0.035), (0.05, -0.02), (0.058, 0.02), (0.06, 0.028)], terra, n=12))
p.append(lathe('ca_rim', [(0.057, 0.02), (0.066, 0.022), (0.066, 0.037), (0.057, 0.037)], terraD, n=12))
p.append(lathe('ca_soil', [(0.0, 0.03), (0.057, 0.03)], soil, n=12))
p.append(tube('ca_trunk', [(0, 0.028, 0), (0, 0.06, 0), (0, 0.1, 0), (0, 0.14, 0), (0, 0.175, 0), (0, 0.192, 0)], [0.036, 0.038, 0.036, 0.032, 0.022, 0.006], cac, n=10, rib=0.14))
p.append(tube('ca_armR', [(0.02, 0.085, 0), (0.05, 0.088, 0), (0.07, 0.105, 0), (0.07, 0.14, 0), (0.07, 0.15, 0)], [0.015, 0.015, 0.014, 0.013, 0.004], cac, n=8, rib=0.12))
p.append(tube('ca_armL', [(-0.02, 0.06, 0), (-0.045, 0.062, 0), (-0.06, 0.077, 0), (-0.06, 0.1, 0), (-0.06, 0.108, 0)], [0.012, 0.012, 0.011, 0.01, 0.003], cac, n=8, rib=0.12))
for (x, y, z) in ((0.0, 0.1, 0.035), (0.0, 0.14, 0.031), (0.0, 0.07, -0.036), (0.03, 0.12, 0.02), (-0.03, 0.09, 0.02), (0.07, 0.125, 0.012), (-0.06, 0.09, 0.01)):
    p.append(cyl('ca_sp', (x, y, z), 0.0025, 0.0, 0.01, spine, n=3))
p.append(ball('ca_flower', (0.0, 0.194, 0.0), 0.011, flower, seg=(6, 4), scale=(1, 1, 0.7)))
fin(join(p, 'cactus'))

# ---------- cocktail (martini glass, y -0.06 .. ~0.14; bowl rim at 0.06) ----------
glassM = M('glass', '#d9f0f8', 0.15, 0.0)
pink = M('drinkPink', '#ff4081', 0.25)
lemon = M('lime', '#9ccc65', 0.5)
paper = M('umbrella', '#ffeb3b', 0.6)
p = []
p.append(lathe('k_foot', [(0.0, -0.06), (0.03, -0.06), (0.032, -0.057), (0.016, -0.054), (0.005, -0.048), (0.004, 0.0)], glassM, n=14))
p.append(lathe('k_bowl', [(0.004, -0.004), (0.014, 0.004), (0.035, 0.032), (0.05, 0.06), (0.0, 0.06)], glassM, n=16))
p.append(lathe('k_drink', [(0.0, 0.007), (0.012, 0.012), (0.034, 0.034), (0.0465, 0.0535), (0.0, 0.0535)], pink, n=16))
p.append(lathe('k_rim', [(0.0485, 0.056), (0.0525, 0.0585), (0.0525, 0.0625), (0.0485, 0.0625)], glassM, n=16))
st = tube('k_straw', [(-0.012, 0.02, 0.01), (-0.025, 0.07, 0.014), (-0.032, 0.1, 0.012), (-0.026, 0.113, 0.008)], 0.0035, red, n=5)
p.append(st)
p.append(cyl('k_lime', (0.0, 0.0585, 0.0), 0.027, 0.027, 0.005, lemon, n=14, axis='z'))
p[-1].data.transform(Matrix.Translation(G(0.0, 0.0, 0.0)))
put(p[-1], (0.036, 0.02, 0.0), ry=0.0)
p.append(cyl('k_limeW', (0.0, 0, 0), 0.02, 0.02, 0.0055, M('limeWhite', '#f1f8e9', 0.6), n=12, axis='z'))
put(p[-1], (0.036, 0.0775, 0.0))
p[-2].data.transform(Matrix.Translation(G(0, 0, 0)))
p.append(cyl('k_stick', (0.028, 0.095, 0.0), 0.0022, 0.0022, 0.09, M('stick', '#a1887f', 0.8), n=5))
p.append(lathe('k_canopy', [(0.0, 0.0), (0.02, -0.012), (0.036, -0.02), (0.038, -0.024), (0.0, -0.024)], paper, n=8, c=(0, 0.14, 0)))
p[-1].data.transform(Matrix.Translation(G(0.028, 0, 0)))
p.append(ball('k_umbTip', (0.028, 0.142, 0), 0.0045, red, seg=(6, 4)))
p.append(lathe('k_canopy2', [(0.0, 0.0), (0.0235, -0.0125), (0.0385, -0.0225)], red, n=8, c=(0, 0.14, 0)))
p[-1].data.transform(Matrix.Translation(G(0.028, 0.0005, 0)))
p.append(ball('k_cherry', (0.012, 0.062, 0.0), 0.007, M('cherry', '#b71c1c', 0.3), seg=(6, 4)))
fin(join(p, 'cocktail'))

# ---------- rock (about 0.16 x 0.11 x 0.13, centred) ----------
stone = M('stone', '#8a8176', 0.95)
stoneD = M('stoneDark', '#6f675e', 1.0)
stoneL = M('stoneLight', '#a59c90', 0.95)
p = []
p.append(rock('ro_main', (0, 0, 0), (0.082, 0.095, 0.066), stone, seed=11, sub=2, jag=0.2, flat=0.75))
p.append(rock('ro_chip', (0.06, 0.02, 0.04), (0.035, 0.03, 0.03), stoneD, seed=5, sub=1, jag=0.25, flat=0.8))
p.append(rock('ro_chip2', (-0.055, 0.03, -0.045), (0.028, 0.026, 0.026), stoneL, seed=7, sub=1, jag=0.25, flat=0.8))
r = join(p, 'rock')
recentre(r)
fin(r)

# ---------- export ----------
for o in roots:
    print('TRIS', o.name, tris([o]))
layout(roots, 1.0)
export('items2', roots)
