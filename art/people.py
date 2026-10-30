# Human NPC kit -> public/models/people.glb
# Parts are modelled in the standing pose (game coords, facing -Z), then each part's origin is moved to the
# joint it hangs from, matching models/Character.ts (the skeleton is rigid parts on pivots):
#   legL/legR   hip (±0.13, 0.85, 0): thigh        legL_lo/legR_lo   knee (±0.13, 0.43, 0): shin + boot
#   armL/armR   shoulder (±0.37, 1.5, 0): deltoid + upper arm        armL_lo/armR_lo  elbow (±0.37, 1.2, 0): forearm + hand
#   armL_su/armR_su (shoulder) and armL_sl/armR_sl (elbow): optional long-sleeve covers
#   torso (0,0,0)   head (0, 1.62, 0)   gut (0,0,0)   clothes overlays (0,0,0)
# Face features (eyes, lids, brows, mouth, glasses) are NOT here: Character.ts raycasts onto the skin of `head`
# and places them on the surface. Hair / beard / mustache / hats are modelled around the hat band, which sits at
# head-local y = 0.35 (HAT_BAND in Character.ts), head-top radius R = 0.215.
# Materials named tint_* are recolored per character in code.
import os; exec(open(os.path.join(os.environ.get('ART_DIR', r'E:\24H\art'), 'lib.py')).read())
reset()

skin = M('tint_skin', '#e0ac69', 0.7)
shirt = M('tint_shirt', '#78909c', 0.85)
pants = M('tint_pants', '#3e4a5a', 0.9)
shoes = M('tint_shoes', '#3e2723', 0.6)
hairM = M('tint_hair', '#5d4037', 0.95)
beardM = M('tint_beard', '#eeeeee', 0.95)
mustM = M('tint_must', '#eeeeee', 0.95)
hatM = M('tint_hat', '#c62828', 0.75)
vestM = M('tint_vest', '#2f4770', 0.85)
apronM = M('tint_apron', '#fafafa', 0.8)
tieM = M('tint_tie', '#b71c1c', 0.6)
gold = M('gold', '#d4a017', 0.3, 0.8)
dark = M('dark', '#1b1b1b', 0.6)
white = M('white', '#f5f5f5', 0.6)

roots = []


def fin(o, pivot):
    origin(o, pivot)
    roots.append(o)
    return o


def smooth(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def edit(o, fn):
    """Move every vertex through fn(x, y, z) -> (x, y, z), all in game coordinates."""
    for v in o.data.vertices:
        x, y, z = fn(v.co.x, v.co.z, -v.co.y)
        v.co = Vector((x, -z, y))


def keep(o, pred):
    """Delete every face whose centre (game coords) fails pred(x, y, z)."""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bad = []
    for f in bm.faces:
        c = f.calc_center_median()
        if not pred(c.x, c.z, -c.y):
            bad.append(f)
    bmesh.ops.delete(bm, geom=bad, context='FACES')
    for v in [v for v in bm.verts if not v.link_faces]:
        bm.verts.remove(v)
    bm.to_mesh(o.data)
    bm.free()
    return o


# =============================================================================================== legs
# thigh (pivot hip 0.85) and shin + boot (pivot knee 0.43): the leg bends at the knee in code.
for name, s in (('legL', -1), ('legR', 1)):
    x = s * 0.13
    thigh = join([
        ball(name + '_hip', (x, 0.88, 0), 0.135, pants, sub=2),
        tube(name + '_t', [(x, 0.86, 0), (x * 1.02, 0.64, 0), (x * 1.04, 0.45, 0)], [0.132, 0.122, 0.108], pants, n=10, caps=False),
        ball(name + '_kn', (x * 1.04, 0.43, 0), 0.108, pants, sub=2),
    ], name)
    fin(thigh, (x, 0.85, 0))
    kx = x * 1.04
    shin = join([
        tube(name + '_s', [(kx, 0.43, 0), (kx * 1.02, 0.29, 0.005), (kx * 1.04, 0.17, 0)], [0.103, 0.098, 0.09], pants, n=10, caps=False),
        cyl(name + '_cuff', (kx * 1.04, 0.17, 0), 0.108, 0.112, 0.05, pants, n=10, smooth=True),
        cyl(name + '_shaft', (kx * 1.04, 0.1, 0), 0.088, 0.092, 0.1, shoes, n=10, smooth=True),
        box(name + '_b', (kx * 1.04, 0.055, -0.055), (0.18, 0.11, 0.3), shoes, bev=0.045, seg=2),
        ball(name + '_toe', (kx * 1.04, 0.062, -0.18), 0.095, shoes, sub=2, scale=(0.95, 0.72, 1.0)),
        box(name + '_h', (kx * 1.04, 0.022, 0.07), (0.17, 0.045, 0.11), dark, bev=0.012),
        box(name + '_sole', (kx * 1.04, 0.012, -0.06), (0.185, 0.026, 0.34), dark, bev=0.012),
    ], name + '_lo')
    fin(shin, (kx, 0.43, 0))

# ============================================================================================ torso
SX, SZ = 1.1, 0.8  # cross-section: wide shoulders, flat chest


def trad(y):  # torso radius at height y (before SX/SZ), for placing overlays on the surface
    P = [(0.8, 0.0), (0.88, 0.285), (1.05, 0.25), (1.2, 0.262), (1.38, 0.285), (1.47, 0.24), (1.53, 0.17), (1.57, 0.1)]
    for (y0, r0), (y1, r1) in zip(P, P[1:]):
        if y0 <= y <= y1:
            return r0 + (r1 - r0) * (y - y0) / (y1 - y0)
    return 0.1


def tz(y, off=0.0):  # front surface z (negative) of the torso at height y
    return -trad(y) * SZ - off


prof = [(0.0, 0.8), (0.2, 0.805), (0.285, 0.88), (0.25, 1.05), (0.262, 1.2), (0.285, 1.38), (0.24, 1.47), (0.17, 1.53), (0.1, 1.57), (0.0, 1.575)]
t_s = lathe('torso_s', prof, shirt, n=20, sx=SX, sz=SZ)
# pelvis / waistband in the pants colour so the shirt reads as tucked in
pelvis = lathe('torso_p', [(0.0, 0.76), (0.2, 0.77), (0.292, 0.85), (0.292, 0.93), (0.275, 0.95)], pants, n=20, sx=SX, sz=SZ)
belt = lathe('torso_belt', [(0.292, 0.88), (0.299, 0.89), (0.299, 0.95), (0.292, 0.96)], dark, n=20, sx=SX, sz=SZ)
buckle = box('torso_buckle', (0, 0.915, tz(0.915, 0.022)), (0.085, 0.07, 0.025), gold, bev=0.008)
neck = cyl('torso_neck', (0, 1.6, 0), 0.088, 0.1, 0.16, skin, n=12, smooth=True)
collar = []
for s in (-1, 1):
    c = box('torso_col', (s * 0.075, 1.55, tz(1.55, 0.005) + 0.01), (0.13, 0.035, 0.1), shirt, bev=0.012)
    c.rotation_euler = Euler((0.35, 0, -s * 0.45)); collar.append(c)
buttons = [ball('torso_btn', (0, y, tz(y, 0.004)), 0.014, white, sub=1) for y in (1.02, 1.17, 1.32)]
fin(join([t_s, pelvis, belt, buckle, neck] + collar + buttons, 'torso'), (0, 0, 0))

# big belly (added for belly > 1.1): sits over the belt and rolls out the front
gut = ball('gut_s', (0, 1.02, -0.07), 0.3, shirt, sub=3, scale=(1.0, 0.92, 0.95))
fin(gut, (0, 0, 0))

# ================================================================================================ head
hy = 1.62
HC = (0.0, hy + 0.2, 0.012)   # skull centre
RX, RY, RZ = 0.245, 0.268, 0.25


def gauss(d2, sig):
    return math.exp(-d2 / (2 * sig * sig))


def head_point(ux, uy, uz, grow=0.0):
    """Surface of the head for the unit-sphere direction u (game axes, uz < 0 = face)."""
    low = max(0.0, -uy)
    sx = 1 - 0.2 * low ** 1.3
    sz = 1 - 0.07 * low
    x = ux * RX * sx
    y = uy * RY * (0.9 if uy < 0 else 1.0)
    z = uz * RZ * sz
    if uz < 0 and uy < -0.3:  # chin sticks out a little
        z -= 0.034 * ((-uy - 0.3) / 0.7) * (-uz)
    p = [HC[0] + x, HC[1] + y, HC[2] + z]
    n = Vector((ux, uy, uz)).normalized()

    def bump(cx, cy, cz, sig, amp):
        d2 = (p[0] - cx) ** 2 + (p[1] - cy) ** 2 + (p[2] - cz) ** 2
        return amp * gauss(d2, sig)
    d = 0.0
    if uz < 0:
        d += bump(0.125, hy + 0.115, -0.2, 0.05, 0.022) + bump(-0.125, hy + 0.115, -0.2, 0.05, 0.022)   # cheeks
        d += bump(0, hy + 0.0, -0.22, 0.05, 0.02)            # chin
        d += bump(0, hy + 0.092, -0.23, 0.06, 0.012)         # muzzle
        d += bump(0.088, hy + 0.265, -0.215, 0.036, -0.01) + bump(-0.088, hy + 0.265, -0.215, 0.036, -0.01)  # eye sockets
        # brow ridge: a horizontal band
        d += 0.017 * math.exp(-((p[1] - (hy + 0.318)) / 0.03) ** 2) * max(0.0, 1 - (abs(p[0]) / 0.2) ** 2) * min(1.0, -uz * 2)
        d += 0.012 * math.exp(-((p[0]) / 0.05) ** 2) * math.exp(-((p[1] - (hy + 0.3)) / 0.04) ** 2) * min(1.0, -uz * 2)  # glabella
    # jaw line: slightly squarer at the sides
    if uy < -0.2 and abs(ux) > 0.4:
        d += 0.01 * min(1.0, (-uy - 0.2) * 2) * (abs(ux) - 0.4)
    g = grow + d
    return (p[0] + n.x * g, p[1] + n.y * g, p[2] + n.z * g)


def head_shell(name, mat, grow, margin=None, ramp=0.1, seg=(30, 22), deform=None):
    """A shell hugging the head. margin(u) > 0 inside the covered area; the shell thins to nothing over `ramp`
    at its border (so hairlines / beards have soft edges, no stair steps), faces fully outside are deleted."""
    o = ball(name, (0, 0, 0), 1.0, mat, seg=seg)
    if margin:
        keep(o, lambda x, y, z: margin(*[c / (math.sqrt(x * x + y * y + z * z) or 1) for c in (x, y, z)]) > -0.04)

    def f(ux, uy, uz):
        L = math.sqrt(ux * ux + uy * uy + uz * uz) or 1
        ux, uy, uz = ux / L, uy / L, uz / L
        g = grow(ux, uy, uz) if callable(grow) else grow
        if margin:
            g = 0.004 + (g - 0.004) * smooth(0.0, ramp, margin(ux, uy, uz))
        p = head_point(ux, uy, uz, g)
        return deform(p, ux, uy, uz) if deform else p
    edit(o, f)
    return o


skull = head_shell('head_s', skin, 0.0, seg=(36, 26))
nose = join([
    tube('nose_b', [(0, hy + 0.26, -0.228), (0, hy + 0.21, -0.262), (0, hy + 0.18, -0.278)], [0.013, 0.027, 0.04], skin, n=10, caps=True),
    ball('nose_t', (0, hy + 0.163, -0.282), 0.05, skin, sub=2, scale=(0.95, 0.88, 1.0)),
    ball('nose_wl', (-0.036, hy + 0.158, -0.262), 0.03, skin, sub=1),
    ball('nose_wr', (0.036, hy + 0.158, -0.262), 0.03, skin, sub=1),
], 'nose')
ears = []
for s in (-1, 1):
    e = ball('ear', (s * 0.245, hy + 0.2, 0.025), 0.058, skin, sub=2, scale=(0.42, 1.0, 0.78))
    e.rotation_euler = Euler((0, 0, 0))
    ears.append(e)
fin(join([skull, nose] + ears, 'head'), (0, hy, 0))

# ================================================================================================ arms
for name, s in (('armL', -1), ('armR', 1)):
    x = s * 0.36
    upper = join([
        ball(name + '_del', (x, 1.49, 0), 0.108, shirt, sub=2),
        tube(name + '_sl', [(x, 1.5, 0), (x, 1.4, 0), (x, 1.31, 0)], [0.1, 0.094, 0.092], shirt, n=10, caps=False),
        cyl(name + '_hem', (x, 1.31, 0), 0.096, 0.096, 0.04, shirt, n=10, smooth=True),
        tube(name + '_up', [(x, 1.3, 0), (x, 1.2, 0)], [0.078, 0.074], skin, n=10, caps=False),
    ], name)
    fin(upper, (x, 1.5, 0))
    thumb_x = x - s * 0.047
    lower = join([
        ball(name + '_el', (x, 1.2, 0), 0.074, skin, sub=2),
        tube(name + '_fo', [(x, 1.2, 0), (x, 1.08, -0.004), (x, 0.96, 0)], [0.073, 0.066, 0.058], skin, n=10, caps=False),
        box(name + '_palm', (x, 0.895, 0), (0.105, 0.1, 0.07), skin, bev=0.028, seg=2),
        box(name + '_fing', (x, 0.82, -0.012), (0.098, 0.095, 0.06), skin, bev=0.026, seg=2),
        tube(name + '_th', [(thumb_x, 0.92, -0.025), (thumb_x - s * 0.01, 0.865, -0.05), (thumb_x - s * 0.012, 0.825, -0.058)], [0.027, 0.025, 0.022], skin, n=8, caps=True),
    ], name + '_lo')
    fin(lower, (x, 1.2, 0))
    # long sleeves: upper (pivot shoulder) and forearm (pivot elbow) covers, used for jackets / suits / uniforms
    su = join([
        tube(name + '_su', [(x, 1.33, 0), (x, 1.26, 0), (x, 1.2, 0)], [0.1, 0.09, 0.088], shirt, n=10, caps=False),
        ball(name + '_suel', (x, 1.2, 0), 0.088, shirt, sub=1),
    ], name + '_su')
    fin(su, (x, 1.5, 0))
    sl = join([
        ball(name + '_slel', (x, 1.2, 0), 0.09, shirt, sub=2),
        tube(name + '_sl2', [(x, 1.2, 0), (x, 1.08, -0.004), (x, 0.985, 0)], [0.088, 0.08, 0.076], shirt, n=10, caps=False),
        cyl(name + '_cuff', (x, 0.975, 0), 0.082, 0.085, 0.045, shirt, n=10, smooth=True),
    ], name + '_sl')
    fin(sl, (x, 1.2, 0))

# ===================================================================== clothing overlays (torso, pivot 0)
# apron: a curved bib over the front of the body, with a waist tie
ap = lathe('apron_m', [(trad(y) + 0.012, y) for y in (0.8, 0.95, 1.1, 1.25, 1.34)], apronM, n=24, sx=SX, sz=SZ)
keep(ap, lambda x, y, z: z < -0.05 and abs(x) < 0.2)
pocket = box('apron_p', (0, 0.93, tz(0.93, 0.03)), (0.22, 0.12, 0.016), apronM, bev=0.006)
tie_w = lathe('apron_s', [(trad(1.02) + 0.016, 1.0), (trad(1.04) + 0.02, 1.03)], apronM, n=24, sx=SX, sz=SZ)
fin(join([ap, pocket, tie_w], 'apron'), (0, 0, 0))

# vest: a shell over the torso with a V opening at the front
vs = lathe('vest_s', [(trad(y) + 0.014, y) for y in (0.98, 1.1, 1.25, 1.38, 1.47)], vestM, n=24, sx=SX, sz=SZ)
keep(vs, lambda x, y, z: not (z < 0 and abs(x) < 0.02 + (y - 0.98) * 0.16))
fin(join([vs] + [ball('vest_btn', (s * 0.05, 1.12 + k * 0.12, tz(1.12 + k * 0.12, 0.024)), 0.016, gold, sub=1) for s in (-1,) for k in range(2)], 'vest'), (0, 0, 0))

tie_knot = box('tie_k', (0, 1.5, tz(1.5, 0.012)), (0.062, 0.055, 0.03), tieM, bev=0.01)
tie_b = box('tie_b', (0, 1.32, tz(1.32, 0.012)), (0.08, 0.3, 0.016), tieM, bev=0.004)
tip = cyl('tie_t', (0, 1.155, tz(1.2, 0.012)), 0.0, 0.058, 0.07, tieM, n=4)
tip.rotation_euler = Euler((0, 0, 0))
fin(join([tie_knot, tie_b, tip], 'tie'), (0, 0, 0))

star = cyl('badge_s', (-0.14, 1.34, tz(1.34, 0.018)), 0.065, 0.065, 0.016, gold, n=5, axis='z')
fin(join([star], 'badge'), (0, 0, 0))

# ============================================================== hair / beard / mustache (head-local, band 0.35)
B = 0.35


def hair_edge(ux, uy, uz):  # > 0 where the (short) hair covers the head
    front = 0.52 - 0.34 * min(1.0, abs(ux) / 0.9)
    back = -0.3
    w = smooth(-0.1, 0.5, uz)
    c = front * (1 - w) + back * w
    if abs(ux) > 0.75:
        c = max(c, 0.24 * (1 - w) + (-0.3) * w)
    return uy - c


def hair_grow(ux, uy, uz):
    return 0.02 + 0.012 * smooth(0.2, 1.0, uy)


hair = head_shell('hair_s', hairM, hair_grow, margin=hair_edge, ramp=0.1, seg=(32, 24))
fin(join([hair], 'hair_0'), (0, hy + B, 0))


def hairl_edge(ux, uy, uz):
    w = smooth(-0.1, 0.5, uz)
    c = (0.5 - 0.3 * min(1.0, abs(ux) / 0.9)) * (1 - w) + (-0.97) * w
    m = uy - c
    if abs(ux) > 0.8 and abs(uz) < 0.35:  # keep the ears clear
        m = min(m, uy - 0.24)
    return m


# long hair: the same cap plus a curtain that falls to the shoulders
hair_l = head_shell('hairl_s', hairM, lambda ux, uy, uz: 0.024 + 0.012 * smooth(0.2, 1.0, uy), margin=hairl_edge, ramp=0.08, seg=(32, 24),
                    deform=lambda p, ux, uy, uz: (p[0] * (1 + 0.1 * max(0, -uy) * max(0, uz)), p[1] - (0.07 + 0.2 * max(0, -uy)) * smooth(0.0, 0.6, uz) * max(0, -uy + 0.35), p[2] + 0.02 * max(0, uz) * max(0, -uy)))
fin(join([hair_l], 'hair_1'), (0, hy + B, 0))


def beard_edge(ux, uy, uz):
    top = -0.16 + 0.34 * smooth(0.3, 0.9, abs(ux))
    m = min(top - uy, 0.5 - uz)
    if uz < 0:  # the mouth opening: an ellipse, soft edge
        e = math.hypot(ux / 0.26, (uy + 0.44) / 0.085) - 1.0
        m = min(m, e * 0.35)
    return m


def beard_grow(ux, uy, uz):
    return 0.022 + 0.04 * smooth(-0.35, -0.95, uy) * max(0.0, -uz)


def beard_deform(p, ux, uy, uz):
    if uy < -0.35:
        k = (-uy - 0.35) / 0.65
        return (p[0], p[1] - 0.07 * k * (1 + max(0, -uz)), p[2] - 0.02 * k * max(0, -uz))
    return p


beard = head_shell('beard_s', beardM, beard_grow, margin=beard_edge, ramp=0.12, seg=(52, 36), deform=beard_deform)
fin(join([beard], 'beard_0'), (0, hy + B, 0))


def surf_dir(ux, uy, grow):
    uz = -math.sqrt(max(0.0, 1 - ux * ux - uy * uy))
    return head_point(ux, uy, uz, grow)


mst = []
for s in (-1, 1):
    path = [surf_dir(s * a, b, 0.016) for a, b in ((0.0, -0.3), (0.16, -0.33), (0.34, -0.38), (0.5, -0.46))]
    mst.append(tube('mst', path, [0.034, 0.032, 0.026, 0.016], mustM, n=7, caps=True))
fin(join(mst, 'mustache_0'), (0, hy + B, 0))

# ------------------------------------------------------------------------------------------ hats (band at origin)
R = 0.215


def brim_curl(o, k=1.6):
    for v in o.data.vertices:
        r = math.hypot(v.co.x, v.co.y)
        if r > R * 1.1:
            v.co.z += 0.07 * k * (abs(v.co.x) / (R * 2.15)) ** 2.5


def hat_cowboy(name, sheriff=False):
    crown = lathe(name + '_c', [(R * 0.99, 0), (R * 0.96, R * 0.6), (R * 0.84, R * 1.0), (R * 0.42, R * 1.06), (0, R * 0.94)], hatM, n=22, sz=1.12)
    for v in crown.data.vertices:  # pinch the top front, like a creased crown
        if v.co.z > R * 0.8:
            v.co.x *= 0.85
    brim = lathe(name + '_b', [(R * 0.95, 0.0), (R * 1.95, -0.012), (R * 2.15, 0.02), (R * 1.95, 0.034), (R * 0.95, 0.034)], hatM, n=30, sz=1.15, smooth=True)
    brim_curl(brim)
    band = lathe(name + '_band', [(R * 1.0, 0.012), (R * 1.0, R * 0.24)], dark, n=22, sz=1.12)
    parts = [crown, brim, band]
    if sheriff:
        parts.append(cyl(name + '_star', (0, R * 0.5, -R * 1.14), R * 0.26, R * 0.26, 0.012, gold, n=5, axis='z'))
    return join(parts, name)


fin(hat_cowboy('hat_cowboy'), (0, 0, 0))
fin(hat_cowboy('hat_sheriff', True), (0, 0, 0))


def cap(name, trucker=False):
    dome = lathe(name + '_d', [(R * 1.04, 0), (R * 1.02, R * 0.35), (R * 0.82, R * 0.7), (R * 0.42, R * 0.88), (0, R * 0.92)], hatM, n=22)
    bill = lathe(name + '_bill', [(R * 0.9, 0.0), (R * 1.6, -0.02), (R * 1.62, 0.006), (R * 0.9, 0.025)], hatM, n=22, smooth=True)
    keep(bill, lambda x, y, z: z < -R * 0.3)
    button = ball(name + '_btn', (0, R * 0.93, 0), 0.022, hatM, sub=1)
    parts = [dome, bill, button]
    if trucker:  # white mesh crown front
        panel = lathe(name + '_mesh', [(R * 1.055, 0.004), (R * 1.04, R * 0.35), (R * 0.84, R * 0.7), (R * 0.43, R * 0.9)], white, n=22)
        keep(panel, lambda x, y, z: z < -R * 0.15)
        parts.append(panel)
    return join(parts, name)


fin(cap('hat_cap'), (0, 0, 0))
fin(cap('hat_trucker', True), (0, 0, 0))

hh = lathe('hh_d', [(R * 1.1, 0), (R * 1.07, R * 0.45), (R * 0.86, R * 0.88), (R * 0.42, R * 1.04), (0, R * 1.06)], hatM, n=22)
rim = lathe('hh_r', [(R * 1.08, 0), (R * 1.5, -0.005), (R * 1.5, 0.028), (R * 1.08, 0.04)], hatM, n=22, sz=1.1)
brimf = lathe('hh_f', [(R * 1.1, 0.0), (R * 1.7, -0.01), (R * 1.7, 0.026), (R * 1.1, 0.04)], hatM, n=22, smooth=True)
keep(brimf, lambda x, y, z: z < -R * 0.4)
ridge = box('hh_ridge', (0, R * 0.8, 0), (0.05, R * 0.4, R * 1.8), hatM, bev=0.016)
lamp = cyl('hh_lamp', (0, R * 0.5, -R * 1.1), 0.035, 0.03, 0.03, white, n=10, axis='z')
fin(join([hh, rim, brimf, ridge, lamp], 'hat_hardhat'), (0, 0, 0))

hive = lathe('bh_h', [(R * 1.05, -0.02), (R * 1.1, R * 0.4), (R * 0.98, R * 1.2), (R * 0.78, R * 1.8), (R * 0.42, R * 2.15), (0, R * 2.2)], hatM, n=20)
bowM = M('bow', '#e91e63', 0.6)
bow = [ball('bh_bow', (s * 0.055, R * 1.7, R * 0.78), 0.05, bowM, sub=1, scale=(1.2, 0.8, 0.6)) for s in (-1, 1)]
rings = [lathe('bh_ring%d' % i, [(R * (1.1 - 0.12 * i), R * (0.5 + 0.55 * i)), (R * (1.13 - 0.12 * i), R * (0.55 + 0.55 * i)), (R * (1.1 - 0.12 * i), R * (0.6 + 0.55 * i))], hatM, n=20) for i in range(2)]
fin(join([hive] + bow + rings, 'hat_beehive'), (0, 0, 0))

# Dev: PEOPLE_ASM="hair_0,hat_cowboy;beard_0,hat_cap" exports art preview(s) of assembled standing characters
# (one per ';' group) to <ART_OUT>/people_asm.glb, for `art/preview.py --side`. Not used by the game.
ASM = os.environ.get('PEOPLE_ASM')
if ASM:
    byname = {o.name: o for o in roots}
    base = ['legL', 'legR', 'legL_lo', 'legR_lo', 'torso', 'head', 'armL', 'armR', 'armL_lo', 'armR_lo']
    groups = []
    for k, spec in enumerate(ASM.split(';')):
        em = empty('char%d' % k, (k * 1.0, 0, 0))
        for n in base + [x for x in spec.split(',') if x]:
            if n not in byname:
                continue
            c = byname[n].copy()
            c.data = byname[n].data
            bpy.context.scene.collection.objects.link(c)
            if n.startswith('hat_'):
                c.location = G(0, hy + B, 0)
            c.location = c.location + G(k * 1.0, 0, 0)
            bpy.context.view_layer.update()
            parent(c, em)
        groups.append(em)
    for o in roots:
        bpy.data.objects.remove(o, do_unlink=True)
    os.environ['ART_OUT'] = os.environ.get('ART_OUT', '/tmp')
    export('people_asm', groups)
else:
    layout(roots, 1.0)
    export('people', roots)
