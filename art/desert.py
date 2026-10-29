# Desert scenery set -> public/models/desert.glb
# Every variant is a root object named <kind>_<n>, origin on the ground. Units match World.ts:
# saguaro ~4.5 m, barrel ~0.7 m, rock/shrub ~1 m (scaled per instance), mesa/cliff are UNIT size
# (radius/half-width 1, height 1) because World scales them non-uniformly.
exec(open(r'E:\24H\art\lib.py').read())
reset()
random.seed(7)

cac = M('cactus', '#5f9440', 0.85)
cacD = M('cactusDark', '#3f6e2c', 0.9)
flower = M('flower', '#ff6f91', 0.6)
flowerY = M('flowerY', '#ffd54f', 0.6)
spine = M('spine', '#e8e0b0', 0.7)
rk = M('rock', '#b06a40', 1)
rkD = M('rockDark', '#8a4f30', 1)
rkL = M('rockLight', '#cf8f5f', 1)
sand = M('sand', '#d9b27c', 1)
shr = M('shrub', '#8f9a4c', 1)
shrD = M('shrubDark', '#6b7a3a', 1)
twig = M('twig', '#7a5a3a', 1)
wood = M('wood', '#6b4a2e', 1)
woodD = M('woodDark', '#4e3420', 1)
metal = M('metal', '#9e9e9e', 0.5, 0.6)
glassG = M('insulator', '#4fc3f7', 0.2)
bone = M('bone', '#f3ead2', 0.7)

roots = []


def saguaro(name, h, arms, seed):
    rnd = random.Random(seed)
    parts = []
    r0 = 0.3
    trunk = [(0, y, 0) for y in [0, h * 0.25, h * 0.5, h * 0.75, h - 0.15]]
    parts.append(tube(name + '_t', trunk, [r0 * 1.08, r0, r0, r0 * 0.97, r0 * 0.85], cac, n=14, rib=0.14, smooth=False))
    for (side, y0, out, up) in arms:
        p = [(side * 0.2, y0, 0), (side * out * 0.6, y0 + 0.05, 0), (side * out, y0 + 0.35, 0), (side * out, y0 + up * 0.6, 0), (side * out, y0 + up, 0)]
        parts.append(tube(name + '_a', p, [0.18, 0.18, 0.18, 0.17, 0.14], cac, n=12, rib=0.14, smooth=False))
        if rnd.random() < 0.5:
            parts.append(ball(name + '_f', (side * out, y0 + up + 0.08, 0), 0.07, flower, sub=1))
    if rnd.random() < 0.7:
        for k in range(3):
            a = k * 2.1
            parts.append(ball(name + '_fl', (math.cos(a) * 0.12, h + 0.02, math.sin(a) * 0.12), 0.07, flowerY if seed % 2 else flower, sub=1))
    # a few spines catching the light
    for k in range(10):
        a = rnd.random() * 6.28; y = rnd.random() * h * 0.9
        parts.append(cyl(name + '_s', (math.cos(a) * 0.31, y, math.sin(a) * 0.31), 0.008, 0.002, 0.12, spine, n=3, axis='x'))
    return join(parts, name)


roots.append(saguaro('saguaro_0', 4.4, [(1, 1.6, 0.85, 1.5), (-1, 2.4, 0.65, 1.0)], 1))
roots.append(saguaro('saguaro_1', 5.0, [(1, 2.2, 0.7, 1.6)], 2))
roots.append(saguaro('saguaro_2', 3.8, [(1, 1.3, 0.75, 1.3), (-1, 1.7, 0.8, 1.5), (1, 2.6, 0.5, 0.7)], 3))


def barrel(name, seed, twin=False):
    rnd = random.Random(seed)
    parts = []
    spots = [(0, 0, 1.0)] + ([(0.42, 0.1, 0.6)] if twin else [])
    for (x, z, s) in spots:
        prof = [(0, 0), (0.33 * s, 0.02), (0.4 * s, 0.25 * s), (0.38 * s, 0.5 * s), (0.28 * s, 0.68 * s), (0.08 * s, 0.74 * s), (0, 0.73 * s)]
        b = lathe(name + '_b', prof, cac, n=16, c=(x, 0, z), smooth=False)
        # ribs: push every other ring vertex in
        for v in b.data.vertices:
            p = v.co; ang = math.atan2(p.y + z, p.x - x)
            v.co.x += 0 if True else 0
        parts.append(b)
        for k in range(5):
            a = k * 1.25 + rnd.random()
            parts.append(ball(name + '_f', (x + math.cos(a) * 0.1 * s, 0.73 * s, z + math.sin(a) * 0.1 * s), 0.06 * s, flowerY if k % 2 else flower, sub=1))
    return join(parts, name)


roots.append(barrel('barrel_0', 4))
roots.append(barrel('barrel_1', 5, twin=True))


def prickly(name, seed):
    rnd = random.Random(seed)
    parts = []

    def pad(c, rx, ry, tilt, yaw):
        o = ball(name + '_p', (0, 0, 0), 1, cac if rnd.random() < 0.6 else cacD, sub=2, scale=(rx, ry, 0.07), smooth=False)
        o.rotation_euler = Euler((0, tilt, yaw))
        o.location = G(*c)
        bpy.context.view_layer.update()
        o.data.transform(o.matrix_world); o.matrix_world = Matrix.Identity(4)
        parts.append(o)
        if rnd.random() < 0.5:
            parts.append(ball(name + '_f', (c[0], c[1] + ry * 0.95, c[2]), 0.06, flower, sub=1))

    pad((0, 0.28, 0), 0.22, 0.3, 0, 0.3)
    pad((0.2, 0.62, 0.02), 0.18, 0.24, -0.5, 0.1)
    pad((-0.18, 0.6, -0.03), 0.17, 0.22, 0.45, 0.6)
    pad((0.3, 0.3, 0.15), 0.18, 0.24, -0.3, 1.2)
    pad((0.05, 0.92, 0.0), 0.14, 0.18, 0.15, 0.0)
    return join(parts, name)


roots.append(prickly('prickly_0', 6))


def joshua(name, seed):
    rnd = random.Random(seed)
    parts = []
    parts.append(tube(name + '_t', [(0, 0, 0), (0.05, 1.2, 0), (0.1, 2.2, 0.05)], [0.22, 0.18, 0.15], twig, n=7, smooth=False))
    tips = []
    for k in range(4 + seed % 2):
        a = k * 1.7 + rnd.random()
        out = 0.7 + rnd.random() * 0.5
        p = [(0.1, 2.1, 0.05), (math.cos(a) * out * 0.5, 2.5 + rnd.random() * 0.3, math.sin(a) * out * 0.5), (math.cos(a) * out, 3.0 + rnd.random() * 0.6, math.sin(a) * out)]
        parts.append(tube(name + '_b', p, [0.13, 0.1, 0.08], twig, n=6, smooth=False))
        tips.append(p[-1])
    for t in tips:
        # spiky leaf clusters
        o = ball(name + '_l', t, 0.42, shr if rnd.random() < 0.5 else shrD, sub=1, scale=(1, 0.8, 1), smooth=False)
        parts.append(o)
    return join(parts, name)


roots.append(joshua('joshua_0', 8))
roots.append(joshua('joshua_1', 9))


def rockv(name, seed, n):
    rnd = random.Random(seed)
    parts = [rock(name + '_a', (0, 0.3, 0), (1, 0.75, 0.9), rk if seed % 2 else rkL, seed=seed, jag=0.25, flat=0.65)]
    for k in range(n):
        a = rnd.random() * 6.28; d = 0.8 + rnd.random() * 0.4; s = 0.25 + rnd.random() * 0.3
        parts.append(rock(name + '_b', (math.cos(a) * d, s * 0.4, math.sin(a) * d), (s, s * 0.8, s), rkD, seed=seed * 10 + k, jag=0.3))
    return join(parts, name)


for k in range(4):
    roots.append(rockv('rock_%d' % k, 20 + k, k % 3))


def shrub(name, seed, dry=False):
    rnd = random.Random(seed)
    parts = []
    for k in range(5):
        a = rnd.random() * 6.28; d = rnd.random() * 0.35
        s = 0.3 + rnd.random() * 0.25
        parts.append(ball(name + '_c', (math.cos(a) * d, 0.25 + s * 0.5, math.sin(a) * d), s, (twig if dry else (shr if k % 2 else shrD)), sub=1, smooth=False))
    for k in range(5):
        a = rnd.random() * 6.28
        parts.append(cyl(name + '_st', (math.cos(a) * 0.15, 0.2, math.sin(a) * 0.15), 0.03, 0.02, 0.4, twig, n=4))
    return join(parts, name)


roots.append(shrub('shrub_0', 30))
roots.append(shrub('shrub_1', 31))
roots.append(shrub('shrub_2', 32, dry=True))


def mesa(name, seed, steps):
    """Unit mesa: radius ~1, height 1, stepped strata bands."""
    rnd = random.Random(seed)
    n = 9
    parts = []
    y = 0
    r = 1.0
    for i, (h, dr) in enumerate(steps):
        prof = [(r, 0), (r * 0.97, h * 0.6), (r - dr, h)]
        o = lathe(name + '_%d' % i, prof, [rk, rkL, rkD][i % 3], n=n, c=(0, y, 0), smooth=False)
        for v in o.data.vertices:
            k = 1 + (rnd.random() - 0.5) * 0.12
            v.co.x *= k; v.co.y *= k
        parts.append(o)
        y += h; r -= dr
    cap = lathe(name + '_cap', [(r, 0), (0, 0.001)], sand, n=n, c=(0, y, 0), smooth=False)
    parts.append(cap)
    return join(parts, name)


roots.append(mesa('mesa_0', 40, [(0.35, 0.08), (0.3, 0.05), (0.35, 0.1)]))
roots.append(mesa('mesa_1', 41, [(0.55, 0.12), (0.45, 0.25)]))
roots.append(mesa('mesa_2', 42, [(0.2, 0.05), (0.2, 0.05), (0.2, 0.05), (0.2, 0.06), (0.2, 0.1)]))


def cliff(name, seed):
    """Unit cliff block: x -0.5..0.5, y 0..1, z -0.5..0.5, with strata ledges and a jagged top."""
    rnd = random.Random(seed)
    parts = []
    bands = [(0, 0.3, rk), (0.3, 0.55, rkL), (0.55, 0.8, rk), (0.8, 1.0, rkD)]
    for i, (y0, y1, m) in enumerate(bands):
        ins = 0.03 * i
        b = box(name + '_%d' % i, (rnd.uniform(-0.03, 0.03), (y0 + y1) / 2, 0), (1 - ins, y1 - y0, 1 - ins * 0.5), m)
        parts.append(b)
    for k in range(6):
        parts.append(rock(name + '_r', (rnd.uniform(-0.4, 0.4), 1.0, rnd.uniform(-0.4, 0.4)), (0.18, 0.1, 0.18), rkD, seed=seed * 7 + k, jag=0.3))
    o = join(parts, name)
    # roughen the faces a bit
    me = o.data
    for v in me.vertices:
        v.co.x += rnd.uniform(-0.02, 0.02); v.co.y += rnd.uniform(-0.02, 0.02)
    return o


roots.append(cliff('cliff_0', 50))
roots.append(cliff('cliff_1', 51))


def pole(name):
    parts = [
        cyl(name + '_p', (0, 4, 0), 0.15, 0.11, 8, wood, n=7),
        box(name + '_x', (0, 7.4, 0), (2.2, 0.14, 0.14), woodD),
        box(name + '_x2', (0, 6.8, 0), (1.5, 0.12, 0.12), woodD),
    ]
    for x in (-0.95, -0.4, 0.4, 0.95):
        parts.append(cyl(name + '_i', (x, 7.55, 0), 0.05, 0.04, 0.16, glassG, n=6))
    for x in (-0.6, 0.6):
        parts.append(cyl(name + '_i', (x, 6.93, 0), 0.04, 0.035, 0.14, glassG, n=6))
    parts.append(cyl(name + '_t', (0.3, 6.3, 0), 0.22, 0.22, 0.6, metal, n=8))  # transformer can
    return join(parts, name)


roots.append(pole('pole_0'))


def skull(name):
    parts = [ball(name + '_h', (0, 0.12, 0), 0.16, bone, sub=2, scale=(1, 0.8, 1.4), smooth=False)]
    for s in (-1, 1):
        parts.append(tube(name + '_horn', [(s * 0.12, 0.18, 0.05), (s * 0.35, 0.22, 0.05), (s * 0.5, 0.35, 0.0)], [0.05, 0.035, 0.01], bone, n=6, smooth=False))
    return join(parts, name)


roots.append(skull('skull_0'))

layout(roots, 6)
export('desert', roots)
