# Human NPC kit -> public/models/people.glb
# Parts are modelled in the standing pose (game coords, facing -Z), then each part's origin is moved to the
# joint it hangs from, matching models/Character.ts:
#   legL/legR pivot (±0.13, 0.85, 0)   torso pivot (0, 0, 0)   head pivot (0, 1.62, 0)
#   armL/armR pivot (±0.33, 1.5, 0), hand at y −0.64 below the shoulder
# Hats / hair / beards are modelled around the hat band at y = 0 (head-local 0.36), for a head radius 0.231.
# Materials named tint_* are recolored per character in code.
import os; exec(open(os.path.join(os.environ.get('ART_DIR', r'E:\24H\art'), 'lib.py')).read())
reset()

skin = M('tint_skin', '#e0ac69', 0.7)
shirt = M('tint_shirt', '#78909c', 0.85)
pants = M('tint_pants', '#3e4a5a', 0.9)
shoes = M('tint_shoes', '#3e2723', 0.6)
hairM = M('tint_hair', '#5d4037', 0.95)
beardM = M('tint_beard', '#eeeeee', 0.95)
browM = M('tint_brow', '#3e2723', 0.95)
hatM = M('tint_hat', '#c62828', 0.75)
vestM = M('tint_vest', '#2f4770', 0.85)
apronM = M('tint_apron', '#fafafa', 0.8)
tieM = M('tint_tie', '#b71c1c', 0.6)
gold = M('gold', '#d4a017', 0.3, 0.8)
dark = M('dark', '#1b1b1b', 0.6)
white = M('white', '#f5f5f5', 0.6)
lip = M('lip', '#b5655b', 0.7)

roots = []
SZ = 0.85  # chest depth squash


def fin(o, pivot):
    origin(o, pivot)
    roots.append(o)
    return o


# ---------- legs ----------
for name, s in (('legL', -1), ('legR', 1)):
    x = s * 0.13
    leg = tube(name + '_p', [(x, 0.9, 0), (x, 0.6, -0.01), (x * 1.05, 0.35, 0), (x * 1.08, 0.14, 0.01)], [0.12, 0.11, 0.095, 0.09], pants, n=10, caps=True)
    cuff = cyl(name + '_c', (x * 1.08, 0.16, 0.01), 0.1, 0.1, 0.06, pants, n=10)
    boot = box(name + '_b', (x * 1.08, 0.06, -0.05), (0.17, 0.12, 0.3), shoes, bev=0.04, seg=2)
    toe = ball(name + '_t', (x * 1.08, 0.07, -0.17), 0.085, shoes, sub=2, scale=(1, 0.75, 1))
    heel = box(name + '_h', (x * 1.08, 0.015, 0.06), (0.16, 0.03, 0.1), dark)
    sole = box(name + '_s', (x * 1.08, 0.01, -0.06), (0.175, 0.025, 0.32), dark, bev=0.01)
    fin(join([leg, cuff, boot, toe, heel, sole], name), (x, 0.85, 0))

# ---------- torso ----------
prof = [(0.0, 0.8), (0.2, 0.8), (0.245, 0.86), (0.25, 0.98), (0.255, 1.12), (0.28, 1.3), (0.275, 1.42), (0.22, 1.5), (0.13, 1.55), (0.0, 1.56)]
t = lathe('torso_s', [(r, y) for (r, y) in prof], shirt, n=18, sz=SZ)
belt = lathe('torso_belt', [(0.255, 0.85), (0.26, 0.86), (0.26, 0.92), (0.255, 0.93)], pants, n=18, sz=SZ)
buckle = box('torso_buckle', (0, 0.89, -0.255 * SZ - 0.012), (0.09, 0.065, 0.02), gold, bev=0.006)
neck = cyl('torso_neck', (0, 1.6, 0), 0.085, 0.095, 0.14, skin, n=10, smooth=True)
collar = []
for s in (-1, 1):
    c = box('torso_col', (s * 0.07, 1.53, -0.12), (0.12, 0.03, 0.09), shirt, bev=0.01)
    c.rotation_euler = Euler((0.3, 0, -s * 0.35)); collar.append(c)
buttons = [ball('torso_btn', (0, y, -0.28 * SZ * (0.98 if y > 1.2 else 0.93) - 0.005), 0.012, white, sub=1) for y in (1.0, 1.15, 1.3)]
fin(join([t, belt, buckle, neck] + collar + buttons, 'torso'), (0, 0, 0))

# ---------- head ----------
hy = 1.62
skull = ball('head_s', (0, hy + 0.2, 0.01), 0.22, skin, sub=3, scale=(1, 1.08, 1))
jaw = ball('head_j', (0, hy + 0.1, -0.03), 0.19, skin, sub=2, scale=(1.05, 0.8, 1))
nose = ball('head_n', (0, hy + 0.18, -0.225), 0.045, skin, sub=2, scale=(0.9, 1.1, 1))
ears = [ball('head_e', (s * 0.215, hy + 0.2, 0.01), 0.05, skin, sub=2, scale=(0.5, 1, 0.8)) for s in (-1, 1)]
brows = []
for s in (-1, 1):
    b = box('head_b', (s * 0.08, hy + 0.3, -0.205), (0.09, 0.022, 0.03), browM, bev=0.008)
    b.rotation_euler = Euler((0, 0, s * 0.12)); brows.append(b)
fin(join([skull, jaw, nose] + ears + brows, 'head'), (0, hy, 0))

# ---------- arms ----------
for name, s in (('armL', -1), ('armR', 1)):
    x = s * 0.33
    sleeve = tube(name + '_sl', [(x, 1.53, 0), (x, 1.38, 0), (x, 1.22, 0)], [0.1, 0.09, 0.088], shirt, n=10, caps=True)
    cuff = cyl(name + '_cu', (x, 1.23, 0), 0.092, 0.092, 0.04, shirt, n=10)
    fore = tube(name + '_f', [(x, 1.25, 0), (x, 1.05, -0.005), (x, 0.92, 0)], [0.07, 0.062, 0.055], skin, n=8, caps=True)
    palm = ball(name + '_h', (x, 0.86, 0), 0.07, skin, sub=2, scale=(0.75, 1.15, 1))
    thumb = ball(name + '_th', (x - s * 0.04, 0.89, -0.04), 0.03, skin, sub=1, scale=(1, 1.4, 1))
    fin(join([sleeve, cuff, fore, palm, thumb], name), (x, 1.5, 0))

# ---------- big belly (added for belly > 1.1) ----------
fin(join([ball('gut_s', (0, 1.02, -0.07), 0.29, shirt, sub=3, scale=(1, 0.9, 0.95))], 'gut'), (0, 0, 0))

# ---------- clothing overlays (on the torso, pivot 0) ----------
ap = box('apron_m', (0, 1.0, -0.245), (0.44, 0.72, 0.02), apronM, bev=0.008)
pocket = box('apron_p', (0, 0.88, -0.258), (0.22, 0.12, 0.012), apronM)
string = lathe('apron_s', [(0.258, 1.0), (0.262, 1.01), (0.262, 1.03), (0.258, 1.04)], apronM, n=18, sz=SZ)
fin(join([ap, pocket, string], 'apron'), (0, 0, 0))
vparts = []
for s in (-1, 1):
    v = box('vest_' + str(s), (s * 0.14, 1.2, -0.232), (0.17, 0.62, 0.03), vestM, bev=0.01)
    vparts.append(v)
    vparts.append(box('vest_strap', (s * 0.14, 1.48, -0.05), (0.08, 0.04, 0.38), vestM))
    vparts.append(ball('vest_btn', (s * 0.14, 1.42, -0.25), 0.018, gold, sub=1))
vparts.append(box('vest_back', (0, 1.2, 0.205), (0.44, 0.62, 0.03), vestM))
fin(join(vparts, 'vest'), (0, 0, 0))
tie_knot = box('tie_k', (0, 1.5, -0.235), (0.06, 0.05, 0.03), tieM, bev=0.008)
tie_b = box('tie_b', (0, 1.32, -0.245), (0.075, 0.3, 0.015), tieM)
tip = cyl('tie_t', (0, 1.16, -0.245), 0.055, 0.0, 0.06, tieM, n=4)
fin(join([tie_knot, tie_b, tip], 'tie'), (0, 0, 0))
star = cyl('badge_s', (-0.13, 1.36, -0.245), 0.06, 0.06, 0.012, gold, n=5, axis='z')
fin(join([star], 'badge'), (0, 0, 0))

# ---------- hair / beard / mustache (head-local around the hat band; the band sits at head y 0.36) ----------
B = 0.36  # band height in head space; build at hy+B then pivot at hy+B


def at(x, y, z):  # head-space -> absolute
    return (x, hy + y, z)


hair = ball('hair_s', at(0, 0.24, 0.035), 0.235, hairM, sub=3, scale=(1.02, 1.0, 1.02))
# cut away the face: squash front verts back
for v in hair.data.vertices:
    gz = -v.co.y  # game z
    gy = v.co.z - hy
    if gz < -0.05 and gy < 0.36:
        v.co.y = -(-0.05 + (gz + 0.05) * 0.2)  # pull toward the skull
    if gy < 0.14:
        v.co.z = hy + 0.14 + (gy - 0.14) * 0.3
sideburns = [box('hair_sb', at(s * 0.205, 0.18, 0.01), (0.03, 0.1, 0.06), hairM) for s in (-1, 1)]
fin(join([hair] + sideburns, 'hair_0'), at(0, B, 0))

beard = ball('beard_s', at(0, 0.06, -0.12), 0.2, beardM, sub=2, scale=(1.05, 1.0, 0.75))
for v in beard.data.vertices:
    v.co.x *= 1 + max(0, (hy + 0.06 - v.co.z)) * 0.4
fin(join([beard], 'beard_0'), at(0, B, 0))
mst = []
for s in (-1, 1):
    m = tube('mst', [at(0, 0.115, -0.228), at(s * 0.05, 0.11, -0.22), at(s * 0.085, 0.08, -0.2)], [0.025, 0.022, 0.01], beardM, n=6)
    mst.append(m)
fin(join(mst, 'mustache_0'), at(0, B, 0))

# ---------- hats (built around the band at origin) ----------
R = 0.231


def brim_curl(o, k=1.6, ymin=0.0):
    for v in o.data.vertices:
        r = math.hypot(v.co.x, v.co.y)
        if r > R * 1.1:
            v.co.z += 0.075 * k * (abs(v.co.x) / (R * 2.15)) ** 2.5


def hat_cowboy(name, sheriff=False):
    crown = lathe(name + '_c', [(R * 0.98, 0), (R * 0.95, R * 0.6), (R * 0.82, R * 1.0), (R * 0.4, R * 1.05), (0, R * 0.92)], hatM, n=20, sz=1.15)
    # pinch the crown top front
    for v in crown.data.vertices:
        if v.co.z > R * 0.8:
            v.co.x *= 0.85
    brim = lathe(name + '_b', [(R * 0.95, 0.0), (R * 2.0, -0.01), (R * 2.15, 0.02), (R * 2.0, 0.03), (R * 0.95, 0.03)], hatM, n=28, sz=1.2, smooth=True)
    brim_curl(brim)
    band = lathe(name + '_band', [(R * 0.99, 0.02), (R * 0.99, R * 0.22)], dark, n=20, sz=1.15)
    parts = [crown, brim, band]
    if sheriff:
        parts.append(cyl(name + '_star', (0, R * 0.5, -R * 1.13), R * 0.26, R * 0.26, 0.012, gold, n=5, axis='z'))
    return join(parts, name)


fin(hat_cowboy('hat_cowboy'), (0, 0, 0))
fin(hat_cowboy('hat_sheriff', True), (0, 0, 0))


def cap(name, trucker=False):
    dome = lathe(name + '_d', [(R * 1.03, 0), (R * 1.0, R * 0.35), (R * 0.8, R * 0.65), (R * 0.4, R * 0.8), (0, R * 0.82)], hatM, n=20)
    bill = lathe(name + '_bill', [(0, 0), (R * 0.85, 0.0), (R * 0.85, 0.022), (0, 0.022)], hatM, n=16, c=(0, 0.0, -R * 0.85), sz=0.75)
    # keep only the front half of the bill: push back verts into the dome
    for v in bill.data.vertices:
        if v.co.y < R * 0.85:  # blender y = -game z; game z > -0.85R => behind the bill hinge
            v.co.y = min(v.co.y, R * 0.85)
        v.co.z -= max(0, (v.co.y - R * 0.85)) * 0.2  # slight droop
    button = ball(name + '_btn', (0, R * 0.82, 0), 0.022, hatM, sub=1)
    parts = [dome, bill, button]
    if trucker:
        panel = lathe(name + '_mesh', [(R * 1.05, 0.02), (R * 1.03, R * 0.33), (R * 0.84, R * 0.62)], white, n=20)
        for v in panel.data.vertices:  # front only
            if v.co.y < R * 0.2:
                v.co.x *= 0.98; v.co.y = min(v.co.y, R * 0.3) * 0.96 + 0.0
        # drop the back half of the panel by shrinking it into the dome
        for v in panel.data.vertices:
            if v.co.y < 0:
                v.co.x *= 0.9; v.co.y *= 0.9
        parts.append(panel)
    return join(parts, name)


fin(cap('hat_cap'), (0, 0, 0))
fin(cap('hat_trucker', True), (0, 0, 0))

hh = lathe('hh_d', [(R * 1.12, 0), (R * 1.08, R * 0.45), (R * 0.85, R * 0.85), (R * 0.4, R * 1.0), (0, R * 1.02)], hatM, n=22)
rim = lathe('hh_r', [(R * 1.1, 0), (R * 1.45, 0.0), (R * 1.45, 0.03), (R * 1.1, 0.04)], hatM, n=22, sz=1.15)
ridge = box('hh_ridge', (0, R * 0.75, 0), (0.05, R * 0.6, R * 1.9), hatM, bev=0.015)
fin(join([hh, rim, ridge], 'hat_hardhat'), (0, 0, 0))

hive = lathe('bh_h', [(R * 1.05, -0.02), (R * 1.08, R * 0.4), (R * 0.95, R * 1.2), (R * 0.75, R * 1.8), (R * 0.4, R * 2.15), (0, R * 2.2)], hatM, n=20)
bow = [ball('bh_bow', (s * 0.05, R * 1.7, R * 0.6), 0.045, M('bow', '#e91e63', 0.6), sub=1, scale=(1.2, 0.8, 0.6)) for s in (-1, 1)]
fin(join([hive] + bow, 'hat_beehive'), (0, 0, 0))

layout(roots, 1.0)
export('people', roots)
