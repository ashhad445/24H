# Road vehicles -> public/models/vehicles.glb   (traffic cars, the semi, the freight train, the rail crossing)
# Build:  BPY_PY=<bpy python> scripts/art-build.sh vehicles      (ONLY=sedan,cop ... builds a subset for previews)
#
# Every vehicle faces -Z with its origin on the ground, centred between the wheels, like the RV. Sizes match the
# collision HALF sizes in traffic/TrafficSim.ts (NPC_DIMS). Wheels, drivers and hats are separate nodes so the game
# can spin / place them:
#   car_<kind>        body, glass, interior, lights, bumpers (no wheels, no driver)
#   wheel_<kind>      one wheel, axle at the origin, outer face toward +X (the game turns it 180 deg on the left side)
#   driver, dhat_*    a bust at the wheel, origin at the torso centre (game puts it at the seat)
# Materials named tint_* are recolored per use: tint_paint, tint_trim, tint_trailer, tint_shirt, tint_skin, tint_hat.
# Materials the game animates (cloned per vehicle): head, tail, sigL, sigR, lbRed, lbBlue, lampA, lampB.
import os; exec(open(os.path.join(os.environ.get('ART_DIR', r'E:\24H\art'), 'lib.py')).read())
reset()
ONLY = [s for s in os.environ.get('ONLY', '').split(',') if s]


def want(n):
    return not ONLY or n in ONLY


# ------------------------------------------------------------------ materials
paint = M('tint_paint', '#e53935', 0.38, 0.12)
trim = M('tint_trim', '#f5f5f5', 0.5)
trailerM = M('tint_trailer', '#e8eaed', 0.6)
shirtM = M('tint_shirt', '#546e7a', 0.85)
skinM = M('tint_skin', '#d9a066', 0.8)
hatM = M('tint_hat', '#c62828', 0.8)
chrome = M('chrome', '#e4e8ec', 0.28, 0.55)
black = M('black', '#0e0e10', 0.75)
rubber = M('rubber', '#1a1a1c', 0.95)
rim = M('rim', '#c3c8cc', 0.35, 0.6)
seat = M('seat', '#4a3a32', 0.9)
dash = M('dash', '#26262a', 0.8)
head = M('head', '#fffbe6', 0.25)
tail = M('tail', '#8a0000', 0.3)
sigL = M('sigL', '#c98200', 0.3)
sigR = M('sigR', '#c98200', 0.3)
lbRed = M('lbRed', '#8a0a0a', 0.3)
lbBlue = M('lbBlue', '#0a1a8a', 0.3)
lampA = M('lampA', '#7a0000', 0.3)
lampB = M('lampB', '#7a0000', 0.3)
white = M('white', '#f2f2f2', 0.5)
rust = M('rust', '#8d4a24', 1.0)
bone = M('bone', '#efe6d2', 0.9)
amber = M('amber', '#ffb300', 0.4, 0, 0.3)
red = M('red', '#c62828', 0.5)
gold = M('gold', '#d4a017', 0.3, 0.8)
steel = M('steel', '#6b6f73', 0.5, 0.6)
yellowM = M('tint_loco', '#f9a825', 0.5, 0.15)
winM = M('window', '#26343c', 0.15, 0.2)
glass = M('glass', '#1d2b33', 0.1, 0.3)
try:
    b = next(n for n in glass.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Alpha'].default_value = 0.62
    glass.surface_render_method = 'BLENDED'
except Exception as e:
    print('glass alpha', e)


# ------------------------------------------------------------------ helpers
def ringpts(w, y0, y1, rb=0.1, rt=0.14, tw=None, crown=0.0, k=3):
    """Rounded-rectangle ring (x, y): half-width w at the bottom, tw at the top, optional crown on top centre."""
    tw = w if tw is None else tw
    pts = []

    def arc(cx, cy, r, a0, a1):
        for i in range(k):
            a = math.radians(a0 + (a1 - a0) * i / (k - 1))
            pts.append((cx + math.cos(a) * r, cy + math.sin(a) * r))
    arc(w - rb, y0 + rb, rb, -90, 0)
    arc(tw - rt, y1 - rt, rt, 0, 90)
    pts.append((0, y1 + crown))
    arc(-(tw - rt), y1 - rt, rt, 90, 180)
    arc(-(w - rb), y0 + rb, rb, 180, 270)
    return pts


def S(z, w, y0, y1, **kw):
    return (z, dict(w=w, y0=y0, y1=y1, **kw))


def loft(name, secs, mat, caps=True):
    bm = bmesh.new()
    rings = []
    for z, kw in secs:
        rings.append([bm.verts.new(G(x, y, z)) for x, y in ringpts(**kw)])
    n = len(rings[0])
    for a, b in zip(rings, rings[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    if caps:
        bm.faces.new(rings[0])
        bm.faces.new(list(reversed(rings[-1])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _new(name, bm, mat, True)


def finish(o, ang=38):
    """Smooth shading, with edges sharper than `ang` degrees left hard."""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    for f in bm.faces:
        f.smooth = True
    for e in bm.edges:
        if len(e.link_faces) == 2 and e.calc_face_angle(0) > math.radians(ang):
            e.smooth = False
    bm.to_mesh(o.data)
    bm.free()
    return o


class Parts:
    def __init__(s):
        s.l = []

    def add(s, *o):
        s.l.extend(x for x in o if x)
        return o[0] if o else None

    def build(s, name, ang=38):
        return finish(join(s.l, name), ang)


def strut(name, a, b, r, mat, n=4):
    return tube(name, [a, b], r, mat, n=n, smooth=False, caps=True)


def disc(name, c, r, th, mat, n=14, axis='x'):
    return cyl(name, c, r, r, th, mat, n=n, axis=axis)


def lerp(a, b, t):
    return a + (b - a) * t


def sym(fn):
    return [fn(-1), fn(1)]


def turn(o, ang_deg, axis='X', about=None):
    """Rotate an object's mesh about a game-space point (Blender axis letters: X = game X, Y = game -Z, Z = game Y)."""
    c = G(*about) if about else Vector((0, 0, 0))
    m = Matrix.Translation(c) @ Matrix.Rotation(math.radians(ang_deg), 4, axis) @ Matrix.Translation(-c)
    o.data.transform(m)
    return o


# ------------------------------------------------------------------ shared pieces
def make_wheel_x(name, r, wd, **kw):
    """make_wheel builds with the axis on game Y for the lathes; spokes are authored on X. Build lathes on Y, rotate, then add spokes."""
    h = wd / 2
    tire = revolve(name + '_t', [(r * 0.54, -h), (r * 0.9, -h), (r, -h * 0.45), (r, h * 0.45), (r * 0.9, h), (r * 0.54, h), (r * 0.54, -h)], rubber, n=kw.get('n', 14))
    tread = []
    hubr = kw.get('hub', 0.2)
    rimr = kw.get('rimr', 0.58)
    rm = revolve(name + '_r', [(0.001, h * 0.7), (r * hubr, h * 0.7), (r * rimr, h * 0.46), (r * rimr, -h * 0.5), (0.001, -h * 0.5)], rim, n=12, smooth=False)
    for o in (tire, rm):
        o.data.transform(Matrix.Rotation(math.pi / 2, 4, 'Y'))
    parts = [tire, rm]
    sp_n = kw.get('spokes', 5)
    for i in range(sp_n):
        sp = box(name + '_s', (h * 0.62, r * (hubr + rimr) / 2, 0), (h * 0.2, r * (rimr - hubr) * 1.02, r * 0.11), steel)
        sp.data.transform(Matrix.Rotation(2 * math.pi * i / sp_n, 4, 'X'))
        parts.append(sp)
    parts.append(cyl(name + '_cap', (h * 0.74, 0, 0), r * 0.16, r * 0.12, h * 0.12, chrome, n=8, axis='x'))
    return finish(join(parts, name), 50)


def revolve(name, pts, mat, n=16, smooth=True):
    """Like lathe() but never capped, so closed profiles make true tori (tires)."""
    bm = bmesh.new()
    rings = []
    for (r, y) in pts:
        rings.append([bm.verts.new(G(math.cos(2 * math.pi * i / n) * r, y, math.sin(2 * math.pi * i / n) * r)) for i in range(n)])
    for a, b in zip(rings, rings[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _new(name, bm, mat, smooth)


def cockpit(p, x, y, z, w=0.5, dashw=1.5, steer=True, tilt=25, bench=False):
    """Seat + steering wheel + dash around a driver at (x, y, z): seat base .32 below, wheel .55 ahead (-Z)."""
    p.add(box('seat_b', (x, y - 0.33, z + 0.02), (w, 0.14, 0.52), seat, bev=0.04))
    p.add(box('seat_k', (x, y - 0.02, z + 0.3), (w, 0.62, 0.12), seat, bev=0.04))
    p.add(box('seat_h', (x, y + 0.34, z + 0.31), (w * 0.5, 0.14, 0.1), seat, bev=0.03))
    if steer:
        wh = tube('wheel', [(x + math.cos(a) * 0.17, y + 0.16 + math.sin(a) * 0.17 * math.cos(math.radians(tilt)), z - 0.5 + math.sin(a) * 0.17 * math.sin(math.radians(tilt)) * -1) for a in [i * math.pi / 6 for i in range(13)]], 0.022, black, n=5, smooth=False, caps=False)
        p.add(wh)
        p.add(strut('col', (x, y - 0.05, z - 0.66), (x, y + 0.16, z - 0.5), 0.03, black))
    p.add(box('dash', (0, y - 0.08, z - 0.8), (dashw, 0.26, 0.34), dash, bev=0.04))


def lights(p, hw, f, b, yh, yt, inset=0.3, hs=(0.3, 0.13), ts=(0.32, 0.12), round_=True):
    """Head / tail / signal lamps like TrafficView's old lights() (same positions) with chrome bezels."""
    for s in (-1, 1):
        sg = sigL if s < 0 else sigR
        x = s * (hw - inset)
        p.add(box('hb', (x, yh, f - 0.012), (hs[0] + 0.07, hs[1] + 0.06, 0.07), chrome, bev=0.02))
        p.add(box('hl', (x, yh, f - 0.05), (hs[0], hs[1], 0.04), head, bev=0.015))
        p.add(box('tl', (s * (hw - inset + 0.03), yt, b + 0.012), (ts[0], ts[1], 0.06), tail, bev=0.015))
        p.add(box('sf', (s * (hw - 0.12), yh - 0.02 - hs[1] * 0.5 - 0.06, f - 0.03), (0.14, 0.08, 0.05), sg, bev=0.01))
        p.add(box('sb', (s * (hw - 0.1), yt - 0.15, b + 0.02), (0.14, 0.08, 0.05), sg, bev=0.01))


def wheel_arches(p, hw, zs, r, ytop, flare=True):
    for z in zs:
        for s in (-1, 1):
            p.add(disc('arch', (s * (hw + 0.002), r, z), r * 1.28, 0.02, black, n=14))
            if flare:
                path = [(s * (hw + 0.012), r + math.sin(math.radians(a)) * r * 1.34, z + math.cos(math.radians(a)) * r * 1.34) for a in range(15, 166, 25)]
                p.add(tube('flare', path, 0.03, paint, n=5, smooth=False, caps=True))


def mirror(p, s, x, y, z, big=False):
    k = 1.6 if big else 1.0
    p.add(strut('mirA', (s * x, y, z), (s * (x + 0.1 * k), y + 0.02, z - 0.04), 0.015 * k, black))
    p.add(box('mir', (s * (x + 0.15 * k), y + 0.03, z - 0.04), (0.1 * k, 0.15 * k, 0.04 * k), black, bev=0.012))
    p.add(box('mirg', (s * (x + 0.15 * k), y + 0.03, z - 0.065 * k), (0.085 * k, 0.12 * k, 0.012), chrome))


def handles(p, hw, y, zs):
    for s in (-1, 1):
        for z in zs:
            p.add(box('hdl', (s * (hw + 0.004), y, z), (0.03, 0.03, 0.14), chrome, bev=0.008))


def door_lines(p, hw, y0, y1, zs):
    for s in (-1, 1):
        for z in zs:
            p.add(box('dl', (s * (hw + 0.002), (y0 + y1) / 2, z), (0.014, y1 - y0, 0.016), black))


def exhaust(p, x, z, y=0.26, r=0.04):
    p.add(cyl('exh', (x, y, z), r, r * 0.9, 0.18, chrome, n=8, axis='z'))


def plate(p, z, y, w=0.42, front=False):
    p.add(box('plate', (0, y, z), (w, w * 0.45, 0.02), white, bev=0.004))


# ------------------------------------------------------------------ driver
def make_driver():
    """Bust at the wheel: origin at the torso centre, head centre +0.4, arms reaching toward -Z."""
    p = Parts()
    p.add(ball('d_torso', (0, 0, 0.02), 0.2, shirtM, sub=2, scale=(1.0, 1.25, 0.8)))
    p.add(ball('d_head', (0, 0.4, 0), 0.15, skinM, sub=2))
    p.add(ball('d_hair', (0, 0.43, 0.04), 0.155, M('hair', '#3a2a20', 0.9), sub=1, scale=(1, 0.9, 0.95)))
    p.add(box('d_nose', (0, 0.38, -0.15), (0.04, 0.05, 0.05), skinM, bev=0.01))
    for s in (-1, 1):
        p.add(tube('d_arm', [(s * 0.19, 0.12, 0.0), (s * 0.19, -0.04, -0.2), (s * 0.15, 0.06, -0.46)], [0.06, 0.05, 0.045], shirtM, n=6))
        p.add(ball('d_hand', (s * 0.15, 0.06, -0.49), 0.05, skinM, sub=1))
        p.add(ball('d_eye', (s * 0.055, 0.42, -0.137), 0.018, M('eye', '#111111', 0.5), sub=1))
    return p.build('driver', 60)


def make_hat(name, kind):
    p = Parts()
    if kind == 'cap':
        p.add(ball('c_d', (0, 0.0, 0), 0.165, hatM, sub=2, scale=(1, 0.75, 1.02)))
        p.add(box('c_b', (0, -0.05, -0.17), (0.2, 0.025, 0.14), hatM, bev=0.01))
    else:  # cowboy / campaign hat
        p.add(ball('c_d', (0, 0.04, 0), 0.15, hatM, sub=2, scale=(1, 0.8, 1.05)))
        p.add(lathe('c_br', [(0.15, -0.04), (0.3, -0.02), (0.34, 0.02), (0.3, 0.0), (0.15, -0.0)], hatM, n=14, c=(0, 0, 0)))
    o = p.build(name, 60)
    o.data.transform(Matrix.Translation(G(0, 0.52, 0)))
    return o


# ------------------------------------------------------------------ cars
def sedan(name, cop=False):
    p = Parts()
    f, b, hw = -2.2, 2.2, 0.9
    low = [S(-2.2, .80, .44, .70, rb=.10, rt=.12), S(-2.12, .88, .34, .78, rb=.12, rt=.14, crown=.02), S(-1.3, .91, .30, .88, crown=.03),
           S(-0.5, .91, .30, .91), S(0.9, .91, .30, .91), S(1.65, .91, .30, .90), S(2.12, .89, .32, .84, rb=.12), S(2.2, .82, .42, .78, rb=.10, rt=.12)]
    p.add(loft('low', low, paint))
    p.add(box('under', (0, 0.24, 0), (1.5, 0.16, 4.1), black))
    gh = [S(-0.62, .82, .86, .93, rb=.02, rt=.05, tw=.8), S(-0.05, .80, .86, 1.40, rb=.02, rt=.10, tw=.66), S(1.12, .80, .86, 1.40, rb=.02, rt=.10, tw=.66), S(1.72, .82, .86, .93, rb=.02, rt=.05, tw=.8)]
    p.add(loft('glass', gh, glass))
    p.add(loft('roof', [S(-0.12, .66, 1.37, 1.47, rb=.03, rt=.09), S(1.18, .66, 1.37, 1.47, rb=.03, rt=.09)], paint))
    for s in (-1, 1):
        p.add(strut('apil', (s * .8, .9, -.6), (s * .66, 1.4, -.08), 0.035, paint))
        p.add(strut('bpil', (s * .735, .9, .52), (s * .665, 1.4, .52), 0.03, paint))
        p.add(strut('cpil', (s * .66, 1.4, 1.1), (s * .81, .9, 1.7), 0.06, paint))
    cockpit(p, -0.45, 0.82, 0.3, dashw=1.5)
    cockpit(p, 0.45, 0.82, 0.3, steer=False)
    p.add(box('rbench', (0, 0.66, 1.3), (1.5, 0.14, 0.5), seat, bev=0.04))
    p.add(box('rbenk', (0, 0.95, 1.52), (1.5, 0.55, 0.12), seat, bev=0.04))
    # bumpers, grille, lights
    p.add(box('bf', (0, 0.46, f - 0.04), (1.9, 0.14, 0.12), chrome, bev=0.04))
    p.add(box('br', (0, 0.46, b + 0.04), (1.9, 0.14, 0.12), chrome, bev=0.04))
    for s in (-1, 1):
        p.add(box('bfe', (s * 0.93, 0.46, f + 0.1), (0.1, 0.14, 0.4), black, bev=0.03))
        p.add(box('bre', (s * 0.93, 0.46, b - 0.1), (0.1, 0.14, 0.4), black, bev=0.03))
    p.add(box('grille', (0, 0.62, f - 0.014), (0.82, 0.2, 0.05), black, bev=0.01))
    p.add(box('gr_c', (0, 0.62, f - 0.04), (0.82, 0.03, 0.02), chrome))
    p.add(box('gr_c2', (0, 0.67, f - 0.04), (0.82, 0.02, 0.02), chrome))
    lights(p, hw, f, b, 0.7, 0.7)
    plate(p, b + 0.04, 0.6)
    wheel_arches(p, hw, (f + 0.88, b - 0.88), 0.34, 0.8)
    door_lines(p, hw, 0.42, 0.88, (-0.45, 0.5, 1.35))
    handles(p, hw, 0.82, (0.2, 1.05))
    for s in (-1, 1):
        mirror(p, s, 0.77, 0.97, -0.5)
    exhaust(p, -0.5, b + 0.02)
    if cop:
        # two-tone: black door panels, gold stars, push bar, light bar, spotlight, antenna
        for s in (-1, 1):
            p.add(box('door', (s * (hw + 0.006), 0.6, 0.45), (0.02, 0.36, 1.9), black))
            p.add(disc('star', (s * (hw + 0.02), 0.62, 0.45), 0.15, 0.012, gold, n=5))
            p.add(strut('pb', (s * 0.5, 0.36, f - 0.1), (s * 0.5, 0.8, f - 0.12), 0.03, black))
            p.add(strut('pbs', (s * 0.78, 0.4, f - 0.1), (s * 0.78, 0.76, f - 0.1), 0.026, black))
        p.add(box('pbh', (0, 0.78, f - 0.14), (1.6, 0.06, 0.05), black, bev=0.012))
        p.add(box('pbh2', (0, 0.58, f - 0.14), (1.6, 0.05, 0.05), black, bev=0.012))
        p.add(box('lbbase', (0, 1.5, 0.45), (1.28, 0.07, 0.34), black, bev=0.02))
        p.add(box('lbr', (-0.33, 1.6, 0.45), (0.58, 0.13, 0.28), lbRed, bev=0.04, seg=2))
        p.add(box('lbb', (0.33, 1.6, 0.45), (0.58, 0.13, 0.28), lbBlue, bev=0.04, seg=2))
        p.add(box('lbw', (0, 1.58, 0.45), (0.14, 0.1, 0.26), white, bev=0.03))
        p.add(strut('ant', (0.55, 1.45, 1.55), (0.58, 2.1, 1.7), 0.01, black))
        p.add(ball('spot', (-0.84, 1.0, -0.62), 0.05, chrome, sub=1))
    return p.build(name)


def shark(name):
    p = Parts()
    f, b, hw = -2.3, 2.3, 0.95
    low = [S(-2.3, .78, .40, .62, rb=.12, rt=.12), S(-2.22, .92, .32, .72, rb=.12, rt=.14, crown=.02), S(-1.2, .96, .30, .84, crown=.05),
           S(0.2, .96, .30, .86, crown=.02), S(1.4, .96, .30, .88), S(2.1, .93, .32, .88, rb=.12), S(2.3, .84, .4, .86, rb=.1, rt=.1)]
    p.add(loft('low', low, paint))
    p.add(box('under', (0, 0.22, 0), (1.5, 0.16, 4.3), black))
    gh = [S(0.05, .82, .84, .9, rb=.02, rt=.04, tw=.8), S(0.75, .8, .82, 1.26, rb=.02, rt=.1, tw=.6), S(1.35, .8, .82, 1.25, rb=.02, rt=.1, tw=.58), S(2.0, .84, .82, .92, rb=.02, rt=.05, tw=.78)]
    p.add(loft('glass', gh, glass))
    p.add(loft('roof', [S(0.7, .62, 1.23, 1.31, rb=.03, rt=.08), S(1.4, .62, 1.22, 1.3, rb=.03, rt=.08)], black))
    # red racing stripe down the hood, roof and trunk
    for z0, z1, ya, yb in ((-2.1, -1.2, .74, .88), (-1.2, 0.0, .86, .88), (1.9, 2.25, .9, .88)):
        p.add(loft('stripe', [S(z0, .13, ya - 0.05, ya + 0.016, rb=.01, rt=.01), S(z1, .13, yb - 0.05, yb + 0.016, rb=.01, rt=.01)], red))
    p.add(loft('stripeR', [S(0.7, .13, 1.28, 1.325, rb=.01, rt=.01), S(1.4, .13, 1.27, 1.318, rb=.01, rt=.01)], red))
    # supercharger scoop through the hood
    p.add(box('scoop', (0, 0.93, -1.2), (0.52, 0.2, 0.74), black, bev=0.04, seg=2))
    p.add(ball('blower', (0, 1.05, -1.2), 0.2, chrome, sub=2, scale=(1, 0.55, 1.3)))
    for i in range(5):
        p.add(box('fin', (0, 1.0, -1.45 + i * 0.12), (0.4, 0.012, 0.05), black))
    # mean grille: chrome teeth in a black mouth, slit headlights, spikes
    p.add(box('mouth', (0, 0.55, f - 0.01), (1.2, 0.2, 0.05), black, bev=0.01))
    for i in range(-5, 6):
        p.add(box('tooth', (i * 0.1, 0.55, f - 0.045), (0.05, 0.17, 0.04), chrome, bev=0.008))
    for s in (-1, 1):
        sg = sigL if s < 0 else sigR
        sl = box('hl', (s * 0.68, 0.68, f - 0.03), (0.4, 0.09, 0.05), head, bev=0.012)
        sl.data.transform(Matrix.Rotation(s * math.radians(-12), 4, 'Y') if False else Matrix.Identity(4))
        p.add(sl)
        p.add(box('brow', (s * 0.68, 0.76, f - 0.02), (0.46, 0.06, 0.06), black, bev=0.015))
        p.add(box('sf', (s * 0.86, 0.5, f - 0.03), (0.12, 0.08, 0.05), sg))
        p.add(box('sb', (s * 0.85, 0.52, b + 0.03), (0.14, 0.08, 0.05), sg))
        p.add(box('tl', (s * 0.6, 0.76, b + 0.015), (0.5, 0.12, 0.06), tail, bev=0.015))
        p.add(box('tl2', (s * 0.62, 0.76, b + 0.0), (0.5, 0.02, 0.07), black))
        p.add(box('sk', (s * 0.97, 0.36, 0), (0.06, 0.1, 3.0), black, bev=0.02))
        # side pipes
        p.add(cyl('pipe', (s * 0.99, 0.4, 0.3), 0.05, 0.05, 1.6, chrome, n=8, axis='z'))
        p.add(cyl('pipeE', (s * 0.99, 0.4, 1.12), 0.06, 0.06, 0.04, black, n=8, axis='z'))
        exhaust(p, s * 0.55, b + 0.03, 0.3, 0.06)
        # tall rear tires hint fenders: wide arches
    for i in range(-3, 4):
        sp = cyl('spike', (i * 0.26, 0.42, f - 0.12), 0.05, 0.0, 0.3, chrome, n=6, axis='z')
        sp.data.transform(Matrix.Rotation(math.pi, 4, 'Y') if False else Matrix.Identity(4))
        p.add(sp)
    p.add(box('bf', (0, 0.34, f - 0.05), (1.92, 0.12, 0.1), black, bev=0.03))
    p.add(box('br', (0, 0.4, b + 0.05), (1.92, 0.12, 0.1), black, bev=0.03))
    # ducktail spoiler
    p.add(box('spoiler', (0, 0.98, b - 0.14), (1.7, 0.06, 0.34), black, bev=0.02))
    for s in (-1, 1):
        p.add(box('spl', (s * 0.8, 0.94, b - 0.14), (0.05, 0.1, 0.34), black, bev=0.01))
    # shark fin on the roof (code used a cone)
    fin = loft('sfin', [S(0.7, .01, 1.3, 1.44, rb=.0, rt=.0), S(1.25, .035, 1.3, 1.62, rb=.005, rt=.01), S(1.5, .01, 1.3, 1.34, rb=.0, rt=.0)], M('fin', '#455a64', 0.6))
    p.add(fin)
    cockpit(p, -0.45, 0.82, 0.95, dashw=1.5)
    cockpit(p, 0.45, 0.82, 0.95, steer=False)
    wheel_arches(p, hw, (f + 0.92, b - 0.92), 0.37, 0.8, flare=True)
    mirror(p, -1, 0.8, 0.93, 0.1)
    mirror(p, 1, 0.8, 0.93, 0.1)
    plate(p, b + 0.05, 0.62)
    return p.build(name)


def pickup(name, bandit=False):
    p = Parts()
    f, b, hw = -2.5, 2.5, 1.0
    low = [S(-2.5, .84, .52, .94, rb=.1, rt=.12), S(-2.42, .95, .38, 1.0, rb=.12, rt=.14, crown=.02), S(-1.7, .97, .34, 1.08, crown=.03), S(-0.5, .97, .34, 1.08, crown=.01), S(-0.45, .97, .34, 1.04), S(0.8, .97, .34, 1.04)]
    p.add(loft('low', low, paint))
    gh = [S(-0.52, .9, 1.02, 1.1, rb=.02, rt=.04, tw=.88), S(-0.3, .9, 1.02, 1.84, rb=.02, rt=.1, tw=.8), S(0.55, .9, 1.02, 1.84, rb=.02, rt=.1, tw=.8), S(0.8, .92, 1.02, 1.1, rb=.02, rt=.04, tw=.9)]
    p.add(loft('glass', gh, glass))
    p.add(loft('roof', [S(-0.34, .8, 1.78, 1.9, rb=.03, rt=.1), S(0.58, .8, 1.78, 1.9, rb=.03, rt=.1)], paint))
    for s in (-1, 1):
        p.add(strut('apil', (s * .9, 1.06, -.52), (s * .8, 1.82, -.3), 0.045, paint))
        p.add(strut('cpil', (s * .8, 1.82, .56), (s * .92, 1.06, .8), 0.07, paint))
        p.add(strut('bpil', (s * .86, 1.06, 0.1), (s * .8, 1.82, 0.1), 0.03, paint))
    # bed
    p.add(box('bedf', (0, 0.78, 1.65), (1.84, 0.06, 1.72), M('bedfloor', '#2a2a2e', 0.9)))
    for i in range(7):
        p.add(box('rib', (0, 0.815, 0.9 + i * 0.25), (1.8, 0.02, 0.05), black))
    for s in (-1, 1):
        p.add(box('bedw', (s * 0.93, 0.78, 1.65), (0.14, 0.78, 1.72), paint, bev=0.03))
        p.add(box('bedcap', (s * 0.93, 1.18, 1.65), (0.17, 0.04, 1.76), chrome, bev=0.012))
        p.add(box('bedwell', (s * 0.7, 0.9, 1.52), (0.28, 0.24, 0.76), black, bev=0.04))
    p.add(box('tgate', (0, 0.78, 2.46), (1.96, 0.78, 0.1), paint, bev=0.03))
    p.add(box('tgcap', (0, 1.18, 2.46), (1.98, 0.04, 0.13), chrome, bev=0.012))
    p.add(box('bhead', (0, 0.9, 0.82), (1.86, 0.5, 0.1), paint, bev=0.03))
    p.add(box('rwin', (0, 1.5, 0.81), (1.0, 0.4, 0.015), glass))
    cockpit(p, -0.45, 1.1, 0.4, w=0.56, dashw=1.7)
    cockpit(p, 0.45, 1.1, 0.4, w=0.56, steer=False)
    # nose
    p.add(box('bf', (0, 0.5, f - 0.04), (2.06, 0.16, 0.14), chrome, bev=0.04))
    p.add(box('br', (0, 0.5, b + 0.05), (2.06, 0.14, 0.12), chrome, bev=0.04))
    p.add(box('grille', (0, 0.84, f - 0.01), (0.9, 0.34, 0.05), black, bev=0.01))
    for i in range(4):
        p.add(box('gslat', (0, 0.72 + i * 0.09, f - 0.04), (0.9, 0.025, 0.03), chrome))
    p.add(box('hoodorn', (0, 1.1, f + 0.12), (0.5, 0.05, 0.14), chrome, bev=0.012))
    lights(p, hw, f, b, 0.88, 0.85, hs=(0.3, 0.2), ts=(0.3, 0.22))
    plate(p, b + 0.1, 0.62)
    wheel_arches(p, hw, (f + 1.0, b - 1.0), 0.4, 1.0)
    door_lines(p, hw, 0.4, 1.06, (-0.5, 0.15, 0.8))
    handles(p, hw, 1.0, (-0.05,))
    for s in (-1, 1):
        mirror(p, s, 0.88, 1.45, -0.42, big=True)
        p.add(box('step', (s * (hw + 0.02), 0.4, 0.15), (0.12, 0.05, 1.5), black, bev=0.01))
    p.add(box('hitch', (0, 0.42, b + 0.18), (0.2, 0.1, 0.22), black, bev=0.02))
    exhaust(p, 0.7, b + 0.06, 0.36, 0.05)
    if bandit:
        for (x, y, z, w_, h_, d_) in ((hw + 0.01, 0.7, f + 0.8, 0.02, 0.3, 0.6), (-hw - 0.01, 0.6, b - 0.6, 0.02, 0.3, 0.6), (hw + 0.01, 0.9, b - 1.3, 0.02, 0.3, 0.6), (-hw - 0.01, 0.85, -0.9, 0.02, 0.35, 0.5)):
            p.add(box('rust', (x, y, z), (w_, h_, d_), rust))
        p.add(box('rusthood', (0.3, 1.075, -1.6), (0.7, 0.02, 0.6), rust))
        # cow skull on the hood
        p.add(box('skull', (0, 1.1, f + 0.5), (0.34, 0.14, 0.42), bone, bev=0.04))
        p.add(box('skullm', (0, 1.08, f + 0.28), (0.2, 0.1, 0.2), bone, bev=0.03))
        for s in (-1, 1):
            horn = cyl('horn', (s * 0.4, 1.17, f + 0.55), 0.05, 0.008, 0.5, bone, n=6, axis='x')
            horn.data.transform(Matrix.Rotation(s * math.radians(-8), 4, 'Y') if False else Matrix.Identity(4))
            p.add(horn)
            p.add(ball('socket', (s * 0.09, 1.19, f + 0.32), 0.04, black, sub=1))
        # bull bar + roll bar with spotlights
        for s in (-1, 1):
            p.add(strut('bbar', (s * 0.7, 0.4, f - 0.08), (s * 0.7, 1.0, f - 0.1), 0.04, black))
            p.add(strut('rbar', (s * 0.85, 1.18, 1.0), (s * 0.85, 1.85, 1.0), 0.04, black))
            p.add(box('lamp', (s * 0.4, 1.92, 1.0), (0.2, 0.18, 0.12), chrome, bev=0.03))
            p.add(box('lampg', (s * 0.4, 1.92, 0.93), (0.15, 0.13, 0.02), head))
        p.add(box('bbarh', (0, 0.98, f - 0.12), (1.5, 0.06, 0.06), black, bev=0.015))
        p.add(box('rbarh', (0, 1.85, 1.0), (1.74, 0.06, 0.06), black, bev=0.015))
        # couch cushions in the bed? just a spare tire propped in the back
        p.add(disc('spare', (0.55, 1.15, 2.0), 0.4, 0.22, rubber, n=12, axis='x'))
    return p.build(name)


def camper(name):
    p = Parts()
    f, b, hw = -3.0, 3.0, 1.15
    cream = M('cream', '#efe6d2', 0.7)
    # cab: hood + windshield under the overcab
    p.add(loft('hood', [S(-3.0, .98, .55, 1.3, rb=.12, rt=.14), S(-2.9, 1.1, .45, 1.45, rb=.12, rt=.16), S(-2.5, 1.12, .45, 1.6, crown=.03), S(-1.3, 1.12, .45, 1.64)], paint))
    p.add(loft('glass', [S(-2.55, .95, 1.5, 1.58, rb=.02, rt=.04, tw=.9), S(-2.02, .93, 1.5, 1.97, rb=.02, rt=.06, tw=.86), S(-1.2, .93, 1.5, 1.97, rb=.02, rt=.05, tw=.9)], glass))
    # overcab + living box
    p.add(loft('overcab', [S(-2.02, .9, 2.0, 3.0, rb=.2, rt=.3), S(-1.8, 1.1, 1.95, 3.2, rb=.2, rt=.25), S(-1.2, 1.15, 1.9, 3.3, rb=.15, rt=.15)], cream))
    p.add(loft('box', [S(-1.2, 1.15, .55, 3.3, rb=.12, rt=.2), S(-1.1, 1.15, .55, 3.3, rb=.12, rt=.2), S(2.9, 1.14, .5, 3.28, rb=.1, rt=.16), S(3.0, 1.06, .55, 3.2, rb=.12, rt=.18)], cream))
    p.add(box('under', (0, 0.5, 0), (1.8, 0.2, 5.6), black))
    # side stripes + windows
    for s in (-1, 1):
        p.add(box('stripeA', (s * 1.158, 1.1, 0.9), (0.014, 0.3, 4.0), trim))
        p.add(box('stripeB', (s * 1.158, 1.62, 0.9), (0.014, 0.1, 4.0), paint))
        for z in (-0.2, 1.7):
            p.add(box('winf', (s * (hw + 0.012), 2.3, z - 0.3), (0.03, 0.78, 1.06), white, bev=0.012))
            p.add(box('win', (s * (hw + 0.026), 2.3, z - 0.3), (0.02, 0.62, 0.9), winM))
        p.add(box('door', (s * (hw + 0.012), 1.7, 0.3 + (0 if s > 0 else 1.6)), (0.02, 1.5, 0.7), white, bev=0.01))
        p.add(box('dwin', (s * (hw + 0.026), 2.05, 0.3 + (0 if s > 0 else 1.6)), (0.015, 0.45, 0.4), winM))
        p.add(box('ovw', (s * 0.55, 2.55, -2.0), (0.7, 0.4, 0.02), winM))
        p.add(box('ovf', (s * 0.55, 2.55, -1.99), (0.78, 0.48, 0.02), white))
    # roof gear
    p.add(box('ac', (0, 3.43, 0.6), (0.95, 0.22, 0.95), M('acM', '#cfd8dc', 0.6), bev=0.05))
    p.add(box('vent', (0.0, 3.36, 2.1), (0.4, 0.08, 0.4), white, bev=0.02))
    p.add(box('ladder', (hw * 0.7, 1.9, b + 0.05), (0.08, 1.8, 0.05), chrome))
    p.add(box('ladder2', (hw * 0.7 - 0.4, 1.9, b + 0.05), (0.08, 1.8, 0.05), chrome))
    for i in range(7):
        p.add(box('rung', (hw * 0.7 - 0.2, 1.1 + i * 0.25, b + 0.05), (0.5, 0.03, 0.04), chrome))
    p.add(disc('spare', (-0.3, 1.2, b + 0.18), 0.4, 0.2, rubber, n=12, axis='z'))
    p.add(disc('sparehub', (-0.3, 1.2, b + 0.29), 0.2, 0.02, rim, n=10, axis='z'))
    # cab details
    cockpit(p, -0.575, 1.25, -1.8, w=0.56, dashw=2.0)
    cockpit(p, 0.575, 1.25, -1.8, w=0.56, steer=False)
    p.add(box('bf', (0, 0.58, f - 0.05), (2.3, 0.16, 0.14), chrome, bev=0.04))
    p.add(box('br', (0, 0.58, b + 0.05), (2.3, 0.16, 0.14), chrome, bev=0.04))
    p.add(box('grille', (0, 0.95, f - 0.01), (1.2, 0.34, 0.05), black, bev=0.01))
    for i in range(3):
        p.add(box('gs', (0, 0.85 + i * 0.1, f - 0.04), (1.2, 0.025, 0.03), chrome))
    lights(p, hw, f, b, 0.95, 1.0, inset=0.3, hs=(0.3, 0.2), ts=(0.28, 0.4))
    plate(p, b + 0.05, 0.75)
    wheel_arches(p, hw, (f + 1.2, b - 1.2), 0.4, 1.0)
    for s in (-1, 1):
        mirror(p, s, 1.05, 2.0, -2.0, big=True)
    exhaust(p, 0.7, b + 0.06, 0.4, 0.05)
    p.add(cyl('awn', (hw + 0.08, 2.9, 1.0), 0.07, 0.07, 3.0, trim, n=8, axis='z'))
    return p.build(name)


def semi(name):
    """Conventional tractor + 53-foot-ish box trailer. f=-4.6, b=4.6; cab z -4.6..-1.7, trailer -1.6..4.6."""
    p = Parts()
    f, b, hw = -4.6, 4.6, 1.25
    # long hood + sleeper cab
    p.add(loft('hood', [S(-4.6, .8, .75, 1.55, rb=.15, rt=.2), S(-4.5, 1.1, .6, 1.62, rb=.15, rt=.22, crown=.03), S(-3.4, 1.15, .55, 1.7, crown=.04), S(-3.0, 1.18, .55, 1.74)], paint))
    p.add(loft('cab', [S(-3.0, 1.22, .55, 3.0, rb=.1, rt=.22), S(-2.95, 1.25, .55, 3.05, rb=.1, rt=.22), S(-1.7, 1.25, .55, 3.05, rb=.1, rt=.22)], paint))
    p.add(box('visor', (0, 3.1, -3.05), (2.5, 0.1, 0.32), black, bev=0.03))
    p.add(box('wind', (0, 2.35, -3.015), (2.3, 0.88, 0.03), glass))
    for s in (-1, 1):
        p.add(box('sidew', (s * 1.255, 2.35, -2.5), (0.03, 0.8, 0.95), winM))
        p.add(box('sleep', (s * 1.26, 2.3, -1.95), (0.03, 0.5, 0.35), winM))
        p.add(box('door', (s * 1.262, 1.8, -2.5), (0.02, 1.75, 1.0), paint))
        p.add(box('dstr', (s * 1.268, 1.05, -2.2), (0.02, 0.12, 2.3), trim))
        p.add(box('fairing', (s * 1.18, 3.25, -2.0), (0.14, 0.4, 0.5), paint, bev=0.04))
    # cab interior
    cockpit(p, -0.5625, 1.85, -2.3, w=0.55, dashw=2.2)
    cockpit(p, 0.5625, 1.85, -2.3, w=0.55, steer=False)
    p.add(box('bunk', (0, 2.2, -1.85), (2.0, 0.2, 0.3), seat))
    # roof air deflector
    p.add(box('defl', (0, 3.4, -2.2), (2.3, 0.7, 0.18), paint, bev=0.06))
    p.add(box('deflf', (0, 3.15, -2.0), (2.2, 0.3, 0.8), paint, bev=0.05))
    # grille, bumper, lights, stacks
    p.add(box('bumper', (0, 0.62, f - 0.1), (2.5, 0.28, 0.22), chrome, bev=0.06))
    p.add(box('grille', (0, 1.1, f - 0.012), (1.15, 0.78, 0.07), chrome, bev=0.03))
    for i in range(6):
        p.add(box('gslot', (0, 0.82 + i * 0.12, f - 0.06), (1.05, 0.04, 0.03), black))
    p.add(box('hood_o', (0, 1.78, -4.2), (0.2, 0.1, 0.5), chrome, bev=0.03))
    for s in (-1, 1):
        sg = sigL if s < 0 else sigR
        p.add(box('hb', (s * 0.88, 1.0, f - 0.04), (0.42, 0.34, 0.14), chrome, bev=0.04))
        p.add(box('hl', (s * 0.88, 1.0, f - 0.12), (0.34, 0.26, 0.04), head, bev=0.02))
        p.add(box('sf', (s * 1.05, 0.66, f - 0.1), (0.2, 0.1, 0.06), sg, bev=0.01))
        p.add(cyl('stack', (s * (hw + 0.14), 2.3, -2.9), 0.075, 0.075, 2.0, chrome, n=8))
        p.add(cyl('stackc', (s * (hw + 0.14), 3.32, -2.9), 0.09, 0.075, 0.06, black, n=8))
        p.add(strut('stbr', (s * (hw + 0.02), 1.3, -2.9), (s * (hw + 0.14), 1.4, -2.9), 0.02, chrome))
        p.add(cyl('tank', (s * (hw + 0.1), 0.72, -1.5), 0.3, 0.3, 1.3, steel, n=10, axis='z'))
        p.add(strut('tankstrap', (s * (hw + 0.1), 1.02, -1.9), (s * (hw + 0.1), 0.42, -1.9), 0.02, black))
        # mud flaps + mirrors
        p.add(box('flap', (s * 1.1, 0.4, 3.8), (0.5, 0.55, 0.03), black))
        mirror(p, s, 1.2, 2.5, -3.15, big=True)
        p.add(box('mirtall', (s * 1.38, 2.5, -3.2), (0.05, 0.5, 0.18), black, bev=0.015))
        # landing gear
        p.add(box('leg', (s * 0.85, 1.0, 0.6), (0.1, 0.4, 0.1), steel))
    # frame + fifth wheel
    p.add(box('frame', (0, 0.85, -0.2), (1.2, 0.2, 7.6), black))
    p.add(box('fifth', (0, 1.12, -2.35 + 0.8), (1.6, 0.08, 1.4), steel, bev=0.03))
    # trailer
    p.add(box('trailer', (0, 2.25, 1.5), (2.6, 2.9, 6.1), trailerM, bev=0.07))
    for i in range(11):
        p.add(box('rib', (0, 2.25, -1.4 + i * 0.58), (2.68, 2.86, 0.07), trailerM, bev=0.015))
    p.add(box('roofcap', (0, 3.72, 1.5), (2.5, 0.06, 6.0), M('trroof', '#bfc3c8', 0.7), bev=0.02))
    p.add(box('skirt', (0, 0.9, 1.6), (2.5, 0.24, 5.2), paint, bev=0.04))
    p.add(box('trstripe', (0, 1.35, 1.5), (2.64, 0.3, 6.12), paint, bev=0.02))
    p.add(box('trfront', (0, 2.25, -1.62), (2.5, 2.8, 0.05), trailerM))
    p.add(box('bumpbar', (0, 0.62, b + 0.12), (2.3, 0.14, 0.14), chrome, bev=0.04))
    for s in (-1, 1):
        p.add(box('rdoor', (s * 0.62, 2.25, b + 0.04), (1.2, 2.7, 0.02), M('door', '#cfd3d8', 0.6)))
        p.add(box('tail', (s * 1.02, 1.05, b + 0.1), (0.3, 0.5, 0.06), tail, bev=0.02))
        p.add(box('tsig', (s * 1.02, 1.45, b + 0.1), (0.28, 0.14, 0.06), sigL if s < 0 else sigR, bev=0.01))
        p.add(box('lock', (s * 0.05, 2.25, b + 0.07), (0.04, 1.3, 0.04), chrome))
    p.add(box('plate', (0, 0.9, b + 0.17), (0.5, 0.22, 0.02), white))
    # wheel wells on the cab and under the trailer
    for z in (-3.6, 2.8, 3.9):
        for s in (-1, 1):
            p.add(disc('arch', (s * (hw + 0.002), 0.5, z), 0.62, 0.02, black, n=14))
    return p.build(name)


# ------------------------------------------------------------------ rail
def loco(name):
    """Diesel locomotive, 20 m, nose toward +X. Origin: rail level at the centre."""
    p = Parts()
    L, W = 20.0, 3.2
    dark = M('locodark', '#263238', 0.5)
    # underframe + fuel tank
    p.add(box('frame', (0, 1.05, 0), (L, 0.3, W - 0.1), black, bev=0.04))
    p.add(box('tank', (-1, 0.82, 0), (6, 0.5, W - 0.8), steel, bev=0.05))
    # long hood
    p.add(box('hood', (-2.2, 2.6, 0), (L - 5.6, 2.8, W - 0.4), yellowM, bev=0.18, seg=2))
    p.add(box('hoodtop', (-2.2, 4.05, 0), (L - 6, 0.14, W - 1.2), M('locotop', '#8d6e1a', 0.7), bev=0.04))
    # cab (taller) and short nose
    p.add(box('cab', (L / 2 - 3.2, 2.95, 0), (3.8, 3.5, W), yellowM, bev=0.2, seg=2))
    p.add(box('roofc', (L / 2 - 3.2, 4.8, 0), (4.0, 0.2, W + 0.1), M('locoroof', '#37474f', 0.6), bev=0.06))
    p.add(box('nose', (L / 2 - 0.55, 1.95, 0), (1.3, 1.8, W - 0.5), yellowM, bev=0.12, seg=2))
    p.add(box('noseplate', (L / 2 + 0.07, 1.9, 0), (0.1, 1.2, W - 0.9), dark, bev=0.03))
    # cab windows: front, sides
    p.add(box('wind', (L / 2 - 1.28, 3.75, 0), (0.05, 1.0, W - 0.5), glass))
    for s in (-1, 1):
        p.add(box('winc', (L / 2 - 3.2, 3.75, s * (W / 2 + 0.01)), (2.2, 0.9, 0.03), glass))
        p.add(box('winf', (L / 2 - 3.2, 3.75, s * (W / 2 + 0.005)), (2.35, 1.05, 0.02), black))
        p.add(box('stripe', (-2, 1.55, s * (W / 2 - 0.19)), (L - 4.6, 0.26, 0.03), red))
        p.add(box('stripe2', (-2, 1.28, s * (W / 2 - 0.19)), (L - 4.6, 0.1, 0.03), white))
        # louvres / radiator grilles on the hood sides
        for i in range(5):
            p.add(box('louv', (-6 + i * 1.6, 2.6, s * (W / 2 - 0.19)), (1.1, 1.6, 0.02), dark))
        # walkway + handrail
        p.add(box('walk', (-1, 1.4, s * (W / 2 + 0.12)), (L - 4, 0.06, 0.34), steel))
        for z in (-7, -3, 1, 5):
            p.add(strut('hr', (z, 1.4, s * (W / 2 + 0.25)), (z, 2.1, s * (W / 2 + 0.25)), 0.03, steel))
        p.add(strut('hrt', (-8, 2.1, s * (W / 2 + 0.25)), (6, 2.1, s * (W / 2 + 0.25)), 0.03, steel))
        # cab door + ladder steps
        p.add(box('door', (L / 2 - 4.2, 2.8, s * (W / 2 + 0.012)), (0.9, 2.2, 0.02), M('locodoor', '#e09a10', 0.5)))
        for i in range(3):
            p.add(box('step', (L / 2 - 4.4, 0.6 + i * 0.3, s * (W / 2 + 0.2)), (0.5, 0.05, 0.3), steel))
    # radiator fan housing, exhaust stack, horn, bell
    p.add(cyl('fan', (-L / 2 + 2.5, 4.3, 0), 0.9, 0.9, 0.3, dark, n=12))
    p.add(box('stack', (-L / 2 + 5, 4.35, 0), (0.7, 0.5, 0.7), dark, bev=0.05))
    p.add(box('horn', (L / 2 - 5.2, 5.0, 0.4), (0.3, 0.3, 0.3), chrome, bev=0.04))
    p.add(box('bell', (L / 2 - 0.8, 2.95, 0), (0.3, 0.3, 0.3), gold, bev=0.05))
    # headlight (lamp material for the glow), ditch lights, number board
    p.add(box('hlh', (L / 2 + 0.08, 2.4, 0), (0.12, 0.5, 0.5), chrome, bev=0.04))
    p.add(box('hl', (L / 2 + 0.16, 2.4, 0), (0.05, 0.4, 0.4), head, bev=0.04))
    p.add(box('hl2', (L / 2 - 1.3, 4.5, 0), (0.12, 0.35, 0.5), head, bev=0.04))
    for s in (-1, 1):
        p.add(box('ditch', (L / 2 + 0.1, 1.2, s * 1.0), (0.06, 0.2, 0.3), head, bev=0.02))
        p.add(box('plow', (L / 2 + 0.55, 0.7, s * 0.7), (0.15, 0.6, 0.9), black, bev=0.03))
    # trucks (bogies) with six wheels
    for x in (-L / 2 + 3.2, L / 2 - 4):
        p.add(truck(x, W))
    return p.build(name)


def truck(x, W):
    """A two-axle bogie: side frames + wheels (static; the train glides)."""
    out = Parts()
    out.add(box('bog', (x, 0.62, 0), (2.8, 0.5, W - 0.5), black, bev=0.05))
    for s in (-1, 1):
        for dx in (-1.0, 1.0):
            out.add(disc('wh', (x + dx, 0.5, s * (W / 2 - 0.4)), 0.5, 0.16, steel, n=14, axis='z'))
            out.add(disc('whh', (x + dx, 0.5, s * (W / 2 - 0.3)), 0.2, 0.06, black, n=8, axis='z'))
    out.add(box('axle', (x, 0.5, 0), (2.0, 0.16, W - 0.9), black))
    return join(out.l, 'truck')


def railcar(name, kind):
    """Freight car, 15 m, origin at rail level / centre. kind: box | tank | hopper | flat."""
    p = Parts()
    L, W = 15.0, 3.2
    body = M('tint_body', '#8d3b2a', 0.85)
    p.add(box('frame', (0, 1.05, 0), (L, 0.3, W - 0.1), black, bev=0.04))
    for x in (-L / 2 + 2, L / 2 - 2):
        p.add(truck(x, W))
    if kind == 'box':
        p.add(box('box', (0, 2.75, 0), (L - 0.6, 3.1, W - 0.1), body, bev=0.12, seg=2))
        p.add(box('roof', (0, 4.38, 0), (L - 0.3, 0.14, W + 0.1), M('boxroof', '#3e2723', 0.8), bev=0.05))
        for s in (-1, 1):
            p.add(box('door', (1.5, 2.6, s * (W / 2 + 0.01)), (3.0, 2.7, 0.08), M('boxdoor', '#4e342e', 0.9), bev=0.02))
            p.add(box('rail', (1.5, 3.98, s * (W / 2 + 0.08)), (4.6, 0.08, 0.1), steel))
            for i in range(-4, 5):
                p.add(box('rib', (i * 1.55, 2.75, s * (W / 2 + 0.02)), (0.08, 2.9, 0.04), body))
            p.add(box('tag', (-4.2, 3.1, s * (W / 2 + 0.03)), (1.6, 0.5, 0.02), M('tag', '#e0e0e0', 0.7)))
        for s in (-1, 1):
            p.add(strut('lad', (L / 2 - 0.4, 1.2, s * (W / 2 - 0.2)), (L / 2 - 0.4, 4.2, s * (W / 2 - 0.2)), 0.04, steel))
        p.add(cyl('brk', (L / 2 - 0.3, 4.45, 0), 0.22, 0.22, 0.05, steel, n=10, axis='x'))
    elif kind == 'tank':
        tank = M('tint_tank', '#eceff1', 0.4, 0.2)
        p.add(lathe('tank', [(0.001, -L / 2 + 0.6), (0.9, -L / 2 + 0.6), (1.3, -L / 2 + 1.0), (1.4, -L / 2 + 1.8), (1.4, L / 2 - 1.8), (1.3, L / 2 - 1.0), (0.9, L / 2 - 0.6), (0.001, L / 2 - 0.6)], tank, n=18))
        t = p.l[-1]
        t.data.transform(Matrix.Rotation(math.pi / 2, 4, 'Y'))   # axis onto X
        t.data.transform(Matrix.Translation(G(0, 2.6, 0)))
        p.add(box('walk', (0, 4.05, 0), (L - 4, 0.05, 0.5), steel))
        p.add(cyl('dome', (0, 4.15, 0), 0.5, 0.5, 0.3, steel, n=12))
        p.add(cyl('domecap', (0, 4.33, 0), 0.3, 0.3, 0.06, black, n=10))
        for s in (-1, 1):
            p.add(strut('lad', (L / 2 - 1.6, 1.2, s * 1.5), (L / 2 - 1.6, 3.8, s * 1.1), 0.04, steel))
        for x in (-4, -1.5, 1.5, 4):
            p.add(box('band', (x, 2.6, 0), (0.12, 2.95, 2.9), steel))
        p.add(box('sadle', (-L / 2 + 2, 1.5, 0), (2.0, 0.5, 2.0), black))
        p.add(box('sadle2', (L / 2 - 2, 1.5, 0), (2.0, 0.5, 2.0), black))
    elif kind == 'hopper':
        p.add(box('hop', (0, 2.3, 0), (L - 0.6, 2.2, W - 0.1), body, bev=0.1, seg=2))
        p.add(box('load', (0, 3.4, 0), (L - 1.4, 0.6, W - 0.7), M('coal', '#1c1c1c', 1.0), bev=0.15, seg=2))
        for i in range(-3, 4):
            p.add(box('brace', (i * 2.0, 2.4, W / 2 + 0.02), (0.1, 2.0, 0.06), body))
            p.add(box('brace', (i * 2.0, 2.4, -W / 2 - 0.02), (0.1, 2.0, 0.06), body))
        for x in (-3.5, 3.5):
            p.add(box('chute', (x, 1.3, 0), (1.6, 0.5, 2.4), black, bev=0.04))
    else:
        p.add(box('deck', (0, 1.4, 0), (L - 0.4, 0.2, W), body))
    return p.build(name)


def signal(name):
    """Crossing signal: post, crossbuck blades, flasher pair, signal box, gate hinge. Gate arm hinge at (-0.15, 1.15, 0.25)."""
    p = Parts()
    p.add(cyl('post', (0, 2.1, 0), 0.1, 0.12, 4.2, steel, n=8))
    p.add(cyl('cap', (0, 4.28, 0), 0.06, 0.12, 0.16, steel, n=8))
    p.add(box('box', (0, 0.45, 0.05), (0.52, 0.9, 0.42), M('sigbox', '#7a7f84', 0.6), bev=0.03))
    p.add(box('boxdoor', (0, 0.45, 0.27), (0.4, 0.7, 0.02), M('sigdoor', '#5f6368', 0.6)))
    p.add(box('bell', (0.35, 2.6, 0.0), (0.26, 0.26, 0.26), black, bev=0.05))
    for i, rz in enumerate((0.6, -0.6)):
        blade = box('blade', (0, 3.9, 0.14), (1.5, 0.28, 0.06), white, bev=0.02)
        blade.data.transform(Matrix.Translation(G(0, 3.9, 0.14)) @ Matrix.Rotation(rz, 4, 'Y') @ Matrix.Translation(-G(0, 3.9, 0.14)))
        # (rotation about game Z = Blender -Y); rz is applied by the loop below instead
        p.add(blade)
    p.add(box('bar', (0, 3.1, 0.1), (1.5, 0.1, 0.08), black))
    for s in (-1, 1):
        p.add(disc('hood', (s * 0.55, 3.1, 0.12), 0.26, 0.06, black, n=14, axis='z'))
        p.add(cyl('visor', (s * 0.55, 3.1, 0.2), 0.27, 0.27, 0.1, black, n=14, axis='z'))
        p.add(disc('lens', (s * 0.55, 3.1, 0.17), 0.18, 0.06, lampA if s < 0 else lampB, n=14, axis='z'))
    p.add(box('hinge', (-0.15, 1.15, 0.15), (0.4, 0.4, 0.3), black, bev=0.05))
    return p.build(name)


def gate_cw(name):
    """Gate arm counterweight + the arm stub, origin at the hinge; the long arm itself is procedural (it stretches)."""
    p = Parts()
    p.add(box('cw', (0.3, 0, 0), (0.5, 0.3, 0.3), black, bev=0.05))
    p.add(box('brk', (-0.05, 0, 0), (0.24, 0.26, 0.14), steel, bev=0.03))
    return p.build(name)


# ------------------------------------------------------------------ build + export
roots = []


def add(o):
    roots.append(o)
    return o


if want('sedan'): add(sedan('car_sedan'))
if want('cop'): add(sedan('car_cop', cop=True))
if want('pickup'): add(pickup('car_pickup'))
if want('bandit'): add(pickup('car_bandit', bandit=True))
if want('camper'): add(camper('car_camper'))
if want('semi'): add(semi('car_semi'))
if want('shark'): add(shark('car_shark'))
WHEELS = {'car': (0.34, 0.26), 'truck': (0.40, 0.30), 'muscle': (0.37, 0.30), 'semi': (0.5, 0.36)}
if want('wheels'):
    for k, (r, wd) in WHEELS.items():
        add(make_wheel_x('wheel_' + k, r, wd))
if want('driver'):
    add(make_driver())
    add(make_hat('dhat_cap', 'cap'))
    add(make_hat('dhat_cowboy', 'cowboy'))
if want('rail'):
    add(loco('train_loco'))
    for k in ('box', 'tank', 'hopper'):
        add(railcar('train_' + k, k))
    add(signal('signal_post'))
    add(gate_cw('signal_gate'))

print('tris', {o.name: tris([o]) for o in roots})
layout(roots, 1.0)
if os.environ.get('DEMO_OUT'):
    pass
export('vehicles', roots)
