# Hand props -> public/models/items.glb. Used by src/items/Items.ts buildItemMesh() when present.
# Each prop is modelled around its centre at real size (metres), "front" toward -Z (pistol barrel, spray nozzle).
import os; exec(open(os.path.join(os.environ.get('ART_DIR', r'E:\24H\art'), 'lib.py')).read())
reset()

red = M('red', '#c62828', 0.35, 0.25)
redD = M('redDark', '#8e1b1b', 0.5, 0.2)
black = M('black', '#17181a', 0.6)
rubber = M('rubber', '#101011', 0.9)
steel = M('steel', '#aab0b6', 0.3, 0.9)
gun = M('gunmetal', '#2b2f33', 0.35, 0.8)
brass = M('brass', '#c9a227', 0.3, 0.9)
wood = M('wood', '#9c6b3f', 0.8)
woodD = M('woodDark', '#4a2c1a', 0.8)
white = M('white', '#f3f1ea', 0.6)
green = M('green', '#2e7d32', 0.6)
jug = M('jug', '#3fa046', 0.3)
blue = M('blue', '#1565c0', 0.5)
yellow = M('yellow', '#fdd835', 0.5)
tapeM = M('tape', '#a7adb3', 0.35, 0.5)
card = M('cardboard', '#d7ccc8', 0.9)
coffee = M('coffee', '#3a1f0e', 0.3)
sleeve = M('sleeve', '#8d6e63', 0.9)

roots = []


def fin(o):
    roots.append(o); return o


def arc(c, r, a0, a1, n=10, plane='xy'):
    pts = []
    for i in range(n + 1):
        a = a0 + (a1 - a0) * i / n
        if plane == 'xy':
            pts.append((c[0] + math.cos(a) * r, c[1] + math.sin(a) * r, c[2]))
        else:  # zy
            pts.append((c[0], c[1] + math.sin(a) * r, c[2] + math.cos(a) * r))
    return pts


# ---------- fire extinguisher ----------
p = []
p.append(lathe('e_body', [(0.0, -0.2), (0.04, -0.198), (0.062, -0.185), (0.066, -0.16), (0.066, 0.12), (0.058, 0.16), (0.035, 0.19), (0.024, 0.2), (0.024, 0.215)], red, n=20))
p.append(lathe('e_foot', [(0.05, -0.2), (0.068, -0.2), (0.068, -0.185), (0.05, -0.185)], black, n=20))
p.append(lathe('e_label', [(0.0672, -0.09), (0.0672, 0.05)], white, n=20))
p.append(lathe('e_band', [(0.0676, 0.02), (0.0676, 0.045)], redD, n=20))
p.append(lathe('e_band2', [(0.0676, -0.085), (0.0676, -0.07)], redD, n=20))
p.append(cyl('e_valve', (0, 0.235, 0), 0.022, 0.026, 0.05, steel, n=10))
p.append(box('e_carry', (0, 0.262, 0.045), (0.022, 0.012, 0.12), black, bev=0.004))
p.append(box('e_lever', (0, 0.292, 0.04), (0.02, 0.01, 0.13), black, bev=0.004))
p[-1].rotation_euler = (0.18, 0, 0)
p.append(tube('e_pin', arc((0.02, 0.275, 0.0), 0.016, 0, 2 * math.pi, 10), 0.003, yellow, n=5, caps=False))
p.append(cyl('e_gauge', (0.03, 0.235, -0.012), 0.02, 0.02, 0.012, white, n=14, axis='z'))
p.append(cyl('e_gaugeG', (0.03, 0.235, -0.019), 0.013, 0.013, 0.003, green, n=12, axis='z'))
p.append(tube('e_hose', [(0, 0.235, -0.02), (0, 0.24, -0.06), (0, 0.22, -0.1), (0, 0.17, -0.12), (0, 0.1, -0.115), (0, 0.04, -0.1)], 0.0085, rubber, n=7))
p.append(cyl('e_noz', (0, 0.0, -0.095), 0.014, 0.026, 0.07, black, n=10))
p.append(box('e_clip', (0, 0.06, -0.075), (0.03, 0.02, 0.03), steel, bev=0.004))
fin(join(p, 'extinguisher'))

# ---------- claw hammer ----------
p = []
p.append(lathe('h_handle', [(0.012, -0.03), (0.014, 0.05), (0.012, 0.13), (0.011, 0.15)], wood, n=10, sx=0.85))
p.append(lathe('h_grip', [(0.0, -0.152), (0.017, -0.148), (0.02, -0.13), (0.017, -0.09), (0.019, -0.06), (0.016, -0.03), (0.013, -0.025)], red, n=12, sx=0.85))
p.append(box('h_head', (0, 0.16, 0), (0.052, 0.04, 0.036), steel, bev=0.008, seg=2))
p.append(cyl('h_neck', (0.038, 0.16, 0), 0.014, 0.017, 0.03, steel, n=10, axis='x'))
p.append(cyl('h_face', (0.06, 0.16, 0), 0.021, 0.021, 0.018, steel, n=12, axis='x', bev=0.003))
for s in (-1, 1):  # the two claws curve down and away
    p.append(tube('h_claw', [(-0.02, 0.165, s * 0.008), (-0.05, 0.168, s * 0.009), (-0.078, 0.158, s * 0.011), (-0.098, 0.138, s * 0.013)], [0.012, 0.011, 0.008, 0.004], steel, n=6))
fin(join(p, 'hammer'))

# ---------- jerrycan ----------
p = []
p.append(box('j_body', (0, -0.02, 0), (0.17, 0.33, 0.26), red, bev=0.022, seg=3))
p.append(box('j_top', (0, 0.16, 0.0), (0.15, 0.05, 0.24), red, bev=0.02, seg=2))
for s in (-1, 1):  # pressed X on both faces
    for a in (0.72, -0.72):
        b = box('j_x', (0, 0, 0), (0.008, 0.26, 0.022), redD, bev=0.003)
        b.data.transform(Matrix.Rotation(a, 4, 'X'))
        b.data.transform(Matrix.Translation(G(s * 0.086, -0.02, 0)))
        p.append(b)
    p.append(box('j_seam', (0, -0.02, s * 0.131), (0.012, 0.31, 0.006), redD))
for z in (-0.045, 0, 0.045):  # three carry bars
    p.append(tube('j_bar', [(z * 0.0, 0.185, -0.09 + 0.0), (0, 0.225, -0.075), (0, 0.225, 0.02), (0, 0.185, 0.035)], 0.011, red, n=6))
    p[-1].data.transform(Matrix.Translation(G(z, 0, 0)))
p.append(cyl('j_spout', (0, 0.2, 0.085), 0.024, 0.028, 0.05, black, n=12))
p[-1].rotation_euler = (0, 0, 0)
p.append(cyl('j_cap', (0, 0.232, 0.085), 0.032, 0.032, 0.016, yellow, n=12, bev=0.003))
p.append(box('j_latch', (0, 0.215, 0.125), (0.02, 0.05, 0.012), steel, bev=0.003))
fin(join(p, 'jerrycan'))

# ---------- coolant jug ----------
p = []
p.append(box('c_body', (0, -0.01, 0), (0.14, 0.19, 0.085), jug, bev=0.02, seg=3))
p.append(lathe('c_neck', [(0.03, 0.08), (0.024, 0.1), (0.022, 0.12)], jug, n=12, c=(0.035, 0, 0)))
p.append(cyl('c_cap', (0.035, 0.132, 0), 0.027, 0.027, 0.026, black, n=14, bev=0.003))
p.append(tube('c_handle', [(-0.005, 0.085, 0), (-0.03, 0.11, 0), (-0.058, 0.1, 0), (-0.064, 0.06, 0), (-0.064, 0.02, 0)], 0.011, jug, n=7))
for s in (-1, 1):
    p.append(box('c_label', (0.005, -0.02, s * 0.0432), (0.105, 0.1, 0.002), white))
    p.append(box('c_labelT', (0.005, 0.015, s * 0.0438), (0.105, 0.03, 0.002), blue))
    p.append(ball('c_drop', (0.005, -0.035, s * 0.0438), 0.018, blue, sub=2, scale=(1, 1.3, 0.1)))
fin(join(p, 'coolant'))

# ---------- pistol (barrel toward -Z) ----------
p = []
p.append(box('p_slide', (0, 0.03, -0.02), (0.03, 0.036, 0.2), gun, bev=0.006, seg=2))
p.append(box('p_frame', (0, 0.004, -0.005), (0.026, 0.022, 0.165), black, bev=0.004))
p.append(cyl('p_barrel', (0, 0.03, -0.124), 0.009, 0.009, 0.012, steel, n=10, axis='z'))
for i in range(6):  # slide serrations
    p.append(box('p_ser', (0, 0.03, 0.045 + i * 0.008), (0.032, 0.03, 0.003), black))
p.append(box('p_sightF', (0, 0.052, -0.11), (0.005, 0.008, 0.012), black))
p.append(box('p_sightR', (0, 0.052, 0.07), (0.018, 0.008, 0.008), black))
g = box('p_grip', (0, 0, 0), (0.03, 0.105, 0.048), woodD, bev=0.008, seg=2)
g.data.transform(Matrix.Rotation(-0.26, 4, 'X')); g.data.transform(Matrix.Translation(G(0, -0.05, 0.062)))
p.append(g)
p.append(tube('p_guard', [(0, -0.006, -0.02), (0, -0.034, -0.016), (0, -0.04, 0.008), (0, -0.03, 0.032), (0, -0.008, 0.036)], 0.004, black, n=6))
p.append(box('p_trig', (0, -0.02, 0.012), (0.008, 0.024, 0.008), steel, bev=0.002))
p.append(box('p_hammer', (0, 0.034, 0.085), (0.01, 0.022, 0.012), black, bev=0.003))
p.append(box('p_mag', (0, -0.105, 0.076), (0.024, 0.012, 0.042), black, bev=0.003))
fin(join(p, 'pistol'))

# ---------- fuel nozzle (spout toward -Z) ----------
p = []
p.append(box('n_body', (0, 0.03, 0.0), (0.045, 0.065, 0.13), black, bev=0.012, seg=2))
g = box('n_grip', (0, 0, 0), (0.038, 0.13, 0.045), black, bev=0.01, seg=2)
g.data.transform(Matrix.Rotation(-0.2, 4, 'X')); g.data.transform(Matrix.Translation(G(0, -0.05, 0.045)))
p.append(g)
p.append(tube('n_spout', [(0, 0.04, -0.06), (0, 0.045, -0.12), (0, 0.03, -0.19), (0, 0.0, -0.25)], 0.012, steel, n=8))
p.append(tube('n_guard', [(0, 0.0, -0.05), (0, -0.07, -0.045), (0, -0.115, -0.01), (0, -0.118, 0.04)], 0.005, steel, n=6))
p.append(box('n_trig', (0, -0.03, -0.01), (0.016, 0.07, 0.014), steel, bev=0.003))
p.append(lathe('n_boot', [(0.02, 0.0), (0.026, 0.01), (0.026, 0.03), (0.02, 0.04)], rubber, n=10))
p[-1].data.transform(Matrix.Rotation(math.pi / 2, 4, 'X')); p[-1].data.transform(Matrix.Translation(G(0, 0.04, -0.06)))
p.append(cyl('n_swivel', (0, 0.03, 0.075), 0.018, 0.018, 0.03, steel, n=10, axis='z'))
fin(join(p, 'nozzle'))

# ---------- duct tape ----------
p = []
prof = [(0.024, -0.022), (0.06, -0.022), (0.062, -0.018), (0.062, 0.018), (0.06, 0.022), (0.024, 0.022)]
p.append(lathe('t_roll', prof, tapeM, n=24))
p.append(lathe('t_core', [(0.024, 0.0225), (0.02, 0.0225), (0.02, -0.0225), (0.024, -0.0225)], card, n=20))
t = box('t_tail', (0, 0, 0), (0.05, 0.002, 0.044), tapeM)
t.data.transform(Matrix.Rotation(0.5, 4, 'Y')); t.data.transform(Matrix.Translation(G(0.07, 0.0, 0.03)))
p.append(t)
fin(join(p, 'tape'))

# ---------- coffee to go ----------
p = []
p.append(lathe('k_cup', [(0.0, -0.055), (0.027, -0.055), (0.036, 0.05), (0.0, 0.05)], white, n=16))
p.append(lathe('k_sleeve', [(0.0302, -0.025), (0.0346, 0.025)], sleeve, n=16))
p.append(lathe('k_lid', [(0.038, 0.048), (0.039, 0.056), (0.034, 0.066), (0.0, 0.066)], black, n=16))
p.append(box('k_sip', (0.0, 0.068, -0.022), (0.014, 0.004, 0.006), coffee))
fin(join(p, 'coffee'))

layout(roots, 0.6)
export('items', roots)
