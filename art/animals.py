# Roadside animals -> public/models/animals.glb  (cattle crossing cows, the racing / tamed ostrich)
# Build:  BPY_PY=<bpy python> scripts/art-build.sh animals
# Animation pivots match road/meshes.ts (Legged): the game places each node at its pivot and swings it about X.
#   cow_body_0..2   torso + tail + udder (three patch layouts); origin at the ground centre, faces -Z
#   cow_head        pivot (0, 1.25, -0.95): the neck joint, the head nods about it
#   cow_legF/legB   pivot at the hip (0, 0.72, 0): front legs at z -0.6, hind legs at +0.6, x +-0.28
#   ostrich_body    ground centre, faces -Z
#   ostrich_neck    pivot (0, 1.45, -0.32): neck + head + beak, leans about X
#   ostrich_leg     pivot at the hip (0, 1.0, 0.05): two of them at x +-0.14
# tint slots: hide / patch (cow coat), tint_feather / tint_belly for the ostrich.
import os; exec(open(os.path.join(os.environ.get('ART_DIR', r'E:\24H\art'), 'lib.py')).read())
reset()

hide = M('tint_hide', '#f2efe9', 0.85)
patch = M('tint_patch', '#262321', 0.9)
pink = M('pink', '#e8a3a0', 0.8)
horn = M('horn', '#e6dcc3', 0.7)
hoof = M('hoof', '#2b2018', 0.7)
eyeM = M('eye', '#111111', 0.4)
dark = M('dark', '#151515', 0.8)
feather = M('tint_feather', '#1b1b1b', 0.95)
fwhite = M('tint_plume', '#f5f5f0', 0.95)
skin = M('tint_skin', '#d9a3a0', 0.85)
beak = M('beak', '#c9a26b', 0.6)
eyeW = M('eyewhite', '#f4f4f0', 0.4)


def ringpts(w, y0, y1, rb=0.1, rt=0.14, tw=None, crown=0.0, k=3):
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


def finish(o, ang=45):
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


def strut(name, a, b, r, mat, n=6):
    return tube(name, [a, b], r, mat, n=n, smooth=True, caps=True)


def subdivide_loft(o, cuts=1):
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.subdivide_edges(bm, edges=list(bm.edges), cuts=cuts, use_grid_fill=True)
    bm.to_mesh(o.data)
    bm.free()


def paint_patches(o, blobs, slot):
    """Give faces whose centre falls in a blob (cx, cy, cz, r) in game coords material slot `slot`."""
    me = o.data
    for p in me.polygons:
        c = p.center  # blender coords: x, -z, y
        gx, gy, gz = c.x, c.z, -c.y
        for (bx, by, bz, r) in blobs:
            if (gx - bx) ** 2 + (gy - by) ** 2 * 0.8 + (gz - bz) ** 2 < r * r:
                p.material_index = slot
                break


def patch_layout(seed):
    rnd = random.Random(seed * 31 + 7)
    blobs = []
    for i in range(4 + seed):
        side = rnd.choice((-1, 1))
        blobs.append((side * 0.4 * (1 if rnd.random() < 0.5 else 0.0), rnd.uniform(0.85, 1.5), rnd.uniform(-0.8, 0.8), rnd.uniform(0.2, 0.42)))
    # make sure both flanks get a patch
    blobs.append((0.45, 1.1, rnd.uniform(-0.3, 0.3), 0.3))
    blobs.append((-0.45, 1.05, rnd.uniform(-0.3, 0.3), 0.32))
    return blobs


roots = []


def fin(o, pivot=None, ang=45):
    finish(o, ang)
    if pivot:
        origin(o, pivot)
    roots.append(o)
    return o


# ---------------------------------------------------------------- cow
def ering(w, cy, h, p=2.5, n=20):
    """Superellipse cross-section (p 2 = ellipse, higher = squarer), centred on (0, cy)."""
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n
        c, s_ = math.cos(a), math.sin(a)
        pts.append((w * math.copysign(abs(c) ** (2 / p), c), cy + h * math.copysign(abs(s_) ** (2 / p), s_)))
    return pts


def eloft(name, secs, mat, n=20):
    """Loft superellipse sections [(z, w, cy, h, p), ...] along game Z; ends closed with a fan."""
    bm = bmesh.new()
    rings = [[bm.verts.new(G(x, y, z)) for x, y in ering(w, cy, h, p, n)] for (z, w, cy, h, p) in secs]
    for a, b in zip(rings, rings[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    for ring, (z, w, cy, h, p), rev in ((rings[0], secs[0], True), (rings[-1], secs[-1], False)):
        c = bm.verts.new(G(0, cy, z))
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((ring[j], ring[i], c) if rev else (ring[i], ring[j], c))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _new(name, bm, mat, True)


def paint_blobs(o, blobs, slot, seed, refine=3):
    """Irregular cow patches: faces whose centre falls inside a wobbly blob get material `slot`.
    Edges that cross a patch border are split a few times first, so the border is finely stepped, not blocky."""
    ph = seed * 1.7

    def inside(c):
        gx, gy, gz = c.x, c.z, -c.y
        for (bx, by, bz, r) in blobs:
            wob = 1 + 0.28 * math.sin(gz * 9 + gy * 5 + ph) * math.sin(gy * 11 - gz * 3 + ph * 2) + 0.12 * math.sin(gx * 13 + gz * 17)
            if (gx - bx) ** 2 * 0.6 + (gy - by) ** 2 * 0.9 + (gz - bz) ** 2 < (r * wob) ** 2:
                return True
        return False

    bm = bmesh.new()
    bm.from_mesh(o.data)
    for _ in range(refine):
        cross = [e for e in bm.edges if inside(e.verts[0].co) != inside(e.verts[1].co)]
        if not cross:
            break
        bmesh.ops.subdivide_edges(bm, edges=cross, cuts=1, use_grid_fill=False, quad_corner_type='INNER_VERT')
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    for f in bm.faces:
        if inside(f.calc_center_median()):
            f.material_index = slot
    bm.to_mesh(o.data)
    bm.free()


def cow_body(seed):
    parts = []
    # barrel torso: rounded superellipse sections, deep chest, slight sag behind the shoulders, square-ish rump
    torso = eloft('cb', [(-0.97, .12, 1.14, .14, 2.2), (-0.9, .27, 1.12, .27, 2.3), (-0.72, .38, 1.1, .36, 2.4),
                         (-0.4, .43, 1.06, .39, 2.5), (0.05, .45, 1.03, .39, 2.5), (0.45, .44, 1.07, .37, 2.6),
                         (0.75, .4, 1.12, .32, 2.8), (0.9, .3, 1.15, .25, 2.6), (0.97, .14, 1.17, .13, 2.2)], hide, n=22)
    subdivide_loft(torso, 1)
    torso.data.materials.append(patch)
    paint_blobs(torso, patch_layout(seed), 1, seed)
    parts.append(torso)
    # shoulder hump, hip bones, upper legs blended into the barrel
    parts.append(ball('hump', (0, 1.4, -0.5), 0.22, hide, sub=2, scale=(1.4, 0.6, 1.5)))
    for sx in (-1, 1):
        parts.append(ball('hip', (sx * 0.24, 1.36, 0.6), 0.1, hide, sub=2, scale=(1, 0.6, 1.2)))
        parts.append(ball('thigh', (sx * 0.29, 0.9, 0.6), 0.2, hide, sub=2, scale=(0.75, 1.3, 1.05)))
        parts.append(ball('shoulder', (sx * 0.29, 0.92, -0.6), 0.18, hide, sub=2, scale=(0.75, 1.3, 0.95)))
    parts.append(ball('udder', (0, 0.66, 0.42), 0.16, pink, sub=2, scale=(1.1, 0.75, 1.0)))
    for dx in (-0.06, 0.06):
        for dz in (0.37, 0.48):
            parts.append(cyl('teat', (dx, 0.53, dz), 0.022, 0.016, 0.1, pink, n=6))
    parts.append(tube('tail', [(0, 1.4, 0.95), (0, 1.25, 1.02), (0, 1.0, 1.04), (0, 0.78, 1.03)], [0.045, 0.035, 0.03, 0.028], hide, n=6))
    parts.append(ball('tuft', (0, 0.7, 1.03), 0.07, patch, sub=2, scale=(0.8, 1.5, 0.8)))
    return join(parts, 'cow_body_%d' % seed)


for sd in range(3):
    fin(cow_body(sd), None, ang=70)


def cow_head():
    parts = []
    # neck + skull + muzzle around the pivot (0, 1.25, -0.95); dewlap hangs under the neck
    parts.append(eloft('neck', [(-0.62, .26, 1.18, .3, 2.2), (-0.85, .21, 1.24, .26, 2.2), (-1.08, .18, 1.3, .21, 2.2)], hide, n=16))
    parts.append(ball('dewlap', (0, 1.0, -0.92), 0.13, hide, sub=2, scale=(0.6, 1.2, 1.4)))
    parts.append(eloft('skull', [(-1.0, .17, 1.33, .18, 2.3), (-1.12, .2, 1.32, .19, 2.4), (-1.3, .17, 1.27, .16, 2.4),
                                 (-1.45, .14, 1.2, .13, 2.3), (-1.52, .1, 1.18, .08, 2.2)], hide, n=16))
    parts.append(ball('muzzle', (0, 1.16, -1.5), 0.15, pink, sub=2, scale=(1.15, 0.85, 0.75)))
    parts.append(ball('poll', (0, 1.47, -1.12), 0.1, patch, sub=2, scale=(1.4, 0.5, 1.0)))  # dark tuft between the horns
    for s in (-1, 1):
        parts.append(ball('nostril', (s * 0.065, 1.17, -1.61), 0.025, dark, sub=1))
        parts.append(ball('eye', (s * 0.175, 1.36, -1.25), 0.034, eyeM, sub=2))
        parts.append(ball('ear', (s * 0.3, 1.39, -1.1), 0.1, patch, sub=2, scale=(1.4, 0.35, 0.75)))
        parts.append(ball('earpink', (s * 0.31, 1.38, -1.11), 0.07, pink, sub=1, scale=(1.3, 0.3, 0.6)))
        parts.append(tube('horn', [(s * 0.13, 1.47, -1.12), (s * 0.24, 1.53, -1.12), (s * 0.29, 1.62, -1.15)], [0.035, 0.026, 0.01], horn, n=6))
    return join(parts, 'cow_head')


fin(cow_head(), (0, 1.25, -0.95), ang=70)


def cow_leg(name, hind):
    parts = []
    if hind:  # hock bends backward
        path = [(0, 0.0, 0.0), (0, -0.22, 0.08), (0, -0.4, 0.1), (0, -0.55, 0.02), (0, -0.64, 0.02)]
        radii = [0.12, 0.09, 0.065, 0.055, 0.055]
    else:  # knee bends forward slightly
        path = [(0, 0.0, 0.0), (0, -0.25, -0.01), (0, -0.4, -0.02), (0, -0.55, 0.0), (0, -0.64, 0.0)]
        radii = [0.11, 0.08, 0.07, 0.055, 0.055]
    parts.append(tube('leg', [(x, 0.72 + y, z) for x, y, z in path], radii, hide, n=8))
    parts.append(cyl('hoof', (0, 0.05, path[-1][2] - 0.01), 0.075, 0.062, 0.1, hoof, n=8))
    return join(parts, name)


fin(cow_leg('cow_legF', False), (0, 0.72, 0))
fin(cow_leg('cow_legB', True), (0, 0.72, 0))


# ---------------------------------------------------------------- ostrich
def ostrich_body():
    parts = []
    parts.append(ball('body', (0, 1.25, 0.02), 0.45, feather, sub=2, scale=(0.85, 1.15, 0.75)))
    # fluffy plume tail: a fan of white blobs
    for i, (x, z) in enumerate(((-0.12, 0.5), (0, 0.55), (0.12, 0.5), (-0.07, 0.6), (0.07, 0.6))):
        parts.append(ball('plume', (x, 1.4 + (i % 2) * 0.03, z), 0.17, fwhite, sub=1, scale=(0.8, 1.5, 0.7)))
    for s in (-1, 1):
        w = ball('wing', (s * 0.38, 1.22, 0.1), 0.3, feather, sub=2, scale=(0.3, 1.0, 0.65))
        parts.append(w)
        parts.append(ball('wtip', (s * 0.4, 1.12, 0.32), 0.14, fwhite, sub=1, scale=(0.3, 1.0, 1.0)))
    parts.append(ball('belly', (0, 1.0, -0.05), 0.3, fwhite, sub=1, scale=(0.9, 1.2, 0.7)))
    o = join(parts, 'ostrich_body')
    return o


fin(ostrich_body(), None)


def ostrich_neck():
    parts = []
    # neck from the pivot (0, 1.45, -0.32) up and forward with a gentle S
    pts = [(0, 1.45, -0.28), (0, 1.75, -0.33), (0, 2.05, -0.42), (0, 2.3, -0.43), (0, 2.43, -0.44)]
    parts.append(tube('neck', pts, [0.13, 0.09, 0.07, 0.065, 0.07], skin, n=7))
    parts.append(ball('collar', (0, 1.52, -0.25), 0.15, fwhite, sub=1, scale=(1, 0.8, 1)))
    parts.append(ball('head', (0, 2.45, -0.46), 0.1, skin, sub=2, scale=(0.9, 0.9, 1.1)))
    bk = cyl('beak', (0, 2.42, -0.64), 0.05, 0.015, 0.2, beak, n=6, axis='z')
    parts.append(bk)
    for s in (-1, 1):
        parts.append(ball('eye', (s * 0.075, 2.47, -0.5), 0.032, eyeW, sub=1))
        parts.append(ball('pupil', (s * 0.095, 2.47, -0.52), 0.018, eyeM, sub=1))
    for i in range(3):
        parts.append(cyl('tuft', (-0.04 + i * 0.04, 2.56, -0.42), 0.012, 0.004, 0.08, feather, n=4))
    return join(parts, 'ostrich_neck')


fin(ostrich_neck(), (0, 1.45, -0.32))


def ostrich_leg():
    parts = []
    parts.append(ball('thigh', (0, 0.95, 0.02), 0.2, feather, sub=2, scale=(0.7, 1.2, 1.0)))
    parts.append(tube('shin', [(0, 0.9, 0.0), (0, 0.55, 0.06), (0, 0.15, 0.0), (0, 0.06, -0.03)], [0.06, 0.045, 0.04, 0.04], skin, n=6))
    parts.append(ball('knee', (0, 0.58, 0.07), 0.055, skin, sub=1))
    for dz, ang in ((-0.2, 0), (-0.14, -22), (-0.14, 22)):
        t = box('toe', (math.sin(math.radians(ang)) * 0.08, 0.03, -0.1 + (dz + 0.1) * 0.5), (0.05, 0.05, 0.22), skin, bev=0.012)
        parts.append(t)
    parts.append(box('claw', (0, 0.03, -0.24), (0.04, 0.04, 0.05), dark, bev=0.01))
    return join(parts, 'ostrich_leg')


fin(ostrich_leg(), (0, 1.0, 0.05))


# ---------------------------------------------------------------- cone (roadwork)
def traffic_cone():
    parts = []
    orange = M('tint_cone', '#ff6d00', 0.6)
    parts.append(box('base', (0, 0.025, 0), (0.44, 0.05, 0.44), M('conebase', '#212121', 0.9), bev=0.02))
    parts.append(lathe('body', [(0.03, 0.72), (0.06, 0.7), (0.17, 0.06), (0.19, 0.05)], orange, n=12, smooth=True))
    parts.append(lathe('band', [(0.113, 0.47), (0.14, 0.34)], M('conewhite', '#f5f5f5', 0.5, 0, 0.2), n=12))
    return join(parts, 'prop_cone')


fin(traffic_cone(), None)

print('tris', {o.name: tris([o]) for o in roots})
layout(roots, 1.4)
export('animals', roots)
