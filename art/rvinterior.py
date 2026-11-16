# RV interior furniture -> public/models/rvinterior.glb. 1980s Class-C: maroon vinyl, tan plaid, wood laminate, chrome.
# Every piece is modelled around its own origin at the real size (metres); the occupant / front faces -Z.
#   seat      captain's chair, origin on the floor under the seat point. x +-0.33, z -0.30..+0.38, cushion top y 0.43
#   bench     dinette bench, origin floor centre. x +-0.36, z +-0.25, seat top y 0.43, backrest at -Z, drawer on the +X face
#   table     dinette table, origin floor under the centre. top x +-0.35, z +-0.55, surface y 0.73
#   stove     two-burner stove top, origin bottom centre, height 0.05 (burners at z -0.18 / +0.18)
#   sink      drop-in sink, origin on the counter surface; faucet on the +X (wall) side
#   overhead  dome lamp, origin at the ceiling attach point, hangs down 0.05
#   cupholder two-cup tray, origin bottom centre, with a paper cup in the +X well
import os; exec(open(os.path.join(os.environ.get('ART_DIR', r'E:\24H\art'), 'lib.py')).read())
reset()

vinyl = M('vinyl', '#8d4a2f', 0.55)
vinylL = M('vinylLight', '#a55a38', 0.5)
pipe = M('piping', '#e8dcc0', 0.6)
steel = M('steel', '#8d949b', 0.4, 0.8)
chrome = M('chrome', '#e3e8ec', 0.15, 1.0)
black = M('black', '#17181a', 0.6)
rubber = M('rubber', '#0f0f10', 0.9)
wood = M('wood', '#8a5a36', 0.7)
woodL = M('woodLight', '#c49a6c', 0.5)
alu = M('aluminium', '#c4c9cd', 0.3, 0.9)
tan = M('fabricTan', '#c9a66b', 0.9)
tanD = M('fabricDark', '#a67c3d', 0.9)
enamel = M('enamel', '#1a1b1d', 0.35)
iron = M('castIron', '#26272a', 0.7, 0.4)
sinkIn = M('sinkInset', '#6c7378', 0.45, 0.8)
sinkDeep = M('sinkDeep', '#3d4247', 0.6, 0.6)
red = M('redDot', '#d32f2f', 0.4)
blue = M('blueDot', '#1e66c8', 0.4)
cream = M('cream', '#efe6cf', 0.6)
lens = M('lens', '#fff1c8', 0.3, 0.0, emit=0.7)
plastic = M('plasticBrown', '#3b2416', 0.45)
cup = M('paperCup', '#f1ead8', 0.7)
cupBand = M('cupBand', '#b3472f', 0.7)
lid = M('cupLid', '#d8cdb2', 0.5)

roots = []


def fin(o):
    roots.append(o); return o


def rr(hx, hz, r, n=4, c=(0, 0)):
    """Rounded-rect outline (game x,z) with corner radius r, n segments per corner."""
    r = min(r, hx - 1e-4, hz - 1e-4)
    pts = []
    for (cx, cz, a0) in ((hx - r, hz - r, 0), (-(hx - r), hz - r, 90), (-(hx - r), -(hz - r), 180), (hx - r, -(hz - r), 270)):
        for k in range(n + 1):
            a = math.radians(a0 + 90 * k / n)
            pts.append((c[0] + cx + math.cos(a) * r, c[1] + cz + math.sin(a) * r))
    return pts


def loft(name, rings, mat, n=2, c=(0, 0), cap=True, inward=False):
    """rings = [(y, hx, hz, r), ...] bottom to top. Closed solid (capped) or an open wall shell."""
    bm = bmesh.new()
    vr = []
    for (y, hx, hz, r) in rings:
        vr.append([bm.verts.new(G(px, y, pz)) for (px, pz) in rr(hx, hz, r, n, c)])
    m = len(vr[0])
    for a, b in zip(vr, vr[1:]):
        for i in range(m):
            j = (i + 1) % m
            bm.faces.new((a[i], a[j], b[j], b[i]))
    if cap:
        bm.faces.new(list(reversed(vr[0])))
        bm.faces.new(vr[-1])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    else:  # open shell: point every normal toward (inward) or away from the loft axis
        cc = G(c[0], 0, c[1])
        for f in bm.faces:
            d = f.calc_center_median() - cc
            d.z = 0
            if (f.normal.dot(d) > 0) == inward:
                f.normal_flip()
    return _new(name, bm, mat, False)


def slab(name, hx, hz, r, y0, y1, mat, c=(0, 0), n=2, bev=0.0):
    o = loft(name, [(y0, hx, hz, r), (y1, hx, hz, r)], mat, n, c)
    if bev:
        bm = bmesh.new(); bm.from_mesh(o.data)
        bmesh.ops.bevel(bm, geom=[e for e in bm.edges if len(e.link_faces) == 2 and e.calc_face_angle() > 0.7],
                        offset=bev, segments=1, affect='EDGES')
        bm.to_mesh(o.data); bm.free()
    return o


def frame(name, outer, inner, y0, y1, mat, c=(0, 0), n=2):
    """Flat rounded-rect ring: outer / inner = (hx, hz, r)."""
    bm = bmesh.new()
    O = rr(*outer, n, c); I = rr(*inner, n, c)
    ot = [bm.verts.new(G(x, y1, z)) for x, z in O]; ob = [bm.verts.new(G(x, y0, z)) for x, z in O]
    it = [bm.verts.new(G(x, y1, z)) for x, z in I]; ib = [bm.verts.new(G(x, y0, z)) for x, z in I]
    m = len(O)
    for i in range(m):
        j = (i + 1) % m
        bm.faces.new((ob[i], ob[j], ot[j], ot[i]))
        bm.faces.new((it[i], it[j], ib[j], ib[i]))
        bm.faces.new((ot[i], ot[j], it[j], it[i]))
        bm.faces.new((ib[i], ib[j], ob[j], ob[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _new(name, bm, mat, False)


def loop(name, pts, r, mat, n=5):
    """Closed piping loop through game points."""
    return tube(name, list(pts) + [pts[0], pts[1]], r, mat, n=n, caps=False)


def rect_pts(x0, x1, y, z0, z1):
    return [(x0, y, z0), (x1, y, z0), (x1, y, z1), (x0, y, z1)]


def rect_pts_z(x0, x1, y0, y1, z):  # rectangle in the XY plane at depth z
    return [(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)]


# ---------- captain's chair ----------
p = []
p.append(lathe('s_plate', [(0.0, 0.0), (0.27, 0.0), (0.28, 0.008), (0.27, 0.02), (0.1, 0.03), (0.0, 0.03)], steel, n=10))
p.append(lathe('s_ped', [(0.0, 0.03), (0.06, 0.03), (0.04, 0.06), (0.036, 0.16), (0.04, 0.26), (0.0, 0.26)], chrome, n=10))
p.append(slab('s_sw', 0.15, 0.17, 0.04, 0.28, 0.31, steel, c=(0, -0.01), bev=0.005))
# seat: vinyl bolsters, lighter dished centre panel, piping
p.append(loft('s_cush', [(0.30, 0.275, 0.265, 0.06), (0.325, 0.292, 0.28, 0.06), (0.405, 0.292, 0.28, 0.06), (0.425, 0.272, 0.265, 0.07)], vinyl, c=(0, -0.02)))
p.append(loft('s_panel', [(0.41, 0.17, 0.22, 0.05), (0.426, 0.165, 0.215, 0.05), (0.43, 0.14, 0.19, 0.05)], vinylL, c=(0, -0.04)))
p.append(loop('s_pipe1', rect_pts(-0.185, 0.185, 0.424, -0.285, 0.18), 0.006, pipe))
p.append(tube('s_pipe2', [(-0.29, 0.34, -0.29), (-0.2, 0.37, -0.29), (0.2, 0.37, -0.29), (0.29, 0.34, -0.28)], 0.006, pipe))
# backrest: shell, lighter front panel, buttons, rear plate, headrest
p.append(loft('s_back', [(0.44, 0.30, 0.065, 0.04), (0.5, 0.315, 0.07, 0.045), (1.15, 0.31, 0.07, 0.045), (1.28, 0.27, 0.06, 0.05)], vinyl, c=(0, 0.30)))
p.append(slab('s_bpanel', 0.19, 0.022, 0.012, 0.52, 1.2, vinylL, c=(0, 0.232), n=2))
for yy in (0.62, 0.86, 1.1):
    for xx in (-0.09, 0.09):
        p.append(ball('s_btn', (xx, yy, 0.216), 0.014, black, seg=(6, 3)))
p.append(loop('s_pipe3', rect_pts_z(-0.2, 0.2, 0.51, 1.21, 0.209), 0.005, pipe))
p.append(slab('s_rear', 0.25, 0.02, 0.01, 0.62, 1.22, vinyl, c=(0, 0.36), n=2))
p.append(loft('s_head', [(1.3, 0.14, 0.05, 0.03), (1.34, 0.17, 0.062, 0.035), (1.44, 0.17, 0.062, 0.035), (1.48, 0.13, 0.05, 0.03)], vinyl, c=(0, 0.31)))
p.append(slab('s_hpan', 0.1, 0.012, 0.008, 1.34, 1.44, vinylL, c=(0, 0.262), n=3))
for xx in (-0.08, 0.08):
    p.append(cyl('s_post', (xx, 1.285, 0.31), 0.01, 0.01, 0.06, chrome, n=8))
# armrests (outside |x| > 0.27, below y 0.66), recline lever
for sgn in (-1, 1):
    p.append(box('s_arm', (sgn * 0.30, 0.615, 0.06), (0.06, 0.045, 0.32), vinyl, bev=0.016, seg=1))
    p.append(box('s_armpost', (sgn * 0.30, 0.5, 0.17), (0.04, 0.22, 0.05), steel, bev=0.008))
p.append(tube('s_lever', [(-0.3, 0.36, 0.0), (-0.312, 0.34, 0.0), (-0.314, 0.3, 0.02)], 0.008, chrome, n=6))
fin(join(p, 'seat'))

# ---------- dinette bench ----------
p = []
p.append(slab('b_toe', 0.31, 0.2, 0.02, 0.0, 0.07, black, bev=0.004))
p.append(slab('b_plinth', 0.345, 0.235, 0.025, 0.07, 0.31, wood, bev=0.006))
p.append(slab('b_drawer', 0.005, 0.15, 0.004, 0.14, 0.27, woodL, c=(0, 0), n=2))
p[-1].data.transform(Matrix.Translation(G(0.35, 0, 0)))
p.append(cyl('b_hdl', (0.353, 0.205, 0.0), 0.007, 0.007, 0.16, chrome, n=8, axis='z'))
p.append(box('b_dslot', (0.347, 0.095, 0.0), (0.006, 0.01, 0.32), black))
p.append(box('b_dline', (0.347, 0.285, 0.0), (0.006, 0.006, 0.34), black))
p.append(loft('b_cush', [(0.31, 0.35, 0.235, 0.04), (0.335, 0.36, 0.25, 0.045), (0.415, 0.36, 0.25, 0.045), (0.426, 0.345, 0.238, 0.05)], tan))
for zz in (-0.16, -0.05, 0.06, 0.17):  # dark seat stripes (top exactly y 0.43)
    p.append(box('b_str', (0, 0.4265, zz), (0.69, 0.007, 0.022), tanD))
for xx in (-0.2, 0.0, 0.2):
    p.append(box('b_strx', (xx, 0.4265, 0.0), (0.016, 0.007, 0.4), tanD))
p.append(loop('b_pipe', rect_pts(-0.35, 0.35, 0.414, -0.24, 0.24), 0.009, tanD))
# backrest cushion at -Z, face toward +Z
p.append(loft('b_back', [(0.43, 0.345, 0.06, 0.03), (0.5, 0.358, 0.06, 0.03), (1.0, 0.358, 0.06, 0.03), (1.1, 0.33, 0.055, 0.03)], tan, c=(0, -0.19)))
for xx in (-0.24, -0.08, 0.08, 0.24):
    p.append(box('b_bstr', (xx, 0.77, -0.136), (0.02, 0.56, 0.012), tanD))
for yy in (0.6, 0.78, 0.96):
    p.append(box('b_bstrx', (0, yy, -0.136), (0.66, 0.018, 0.012), tanD))
for yy in (0.69, 0.87):
    for xx in (-0.16, 0.0, 0.16):
        p.append(ball('b_btn', (xx, yy, -0.14), 0.014, wood, seg=(6, 3)))
p.append(tube('b_bpipe', [(-0.34, 1.07, -0.14), (-0.3, 1.09, -0.14), (0.3, 1.09, -0.14), (0.34, 1.07, -0.14)], 0.007, tanD, n=5))
fin(join(p, 'bench'))

# ---------- dinette table ----------
p = []
p.append(slab('t_top', 0.34, 0.54, 0.055, 0.69, 0.73, woodL, n=3))
p.append(frame('t_edge', (0.35, 0.55, 0.065), (0.34, 0.54, 0.055), 0.69, 0.73, alu, n=3))
p.append(frame('t_under', (0.34, 0.54, 0.055), (0.3, 0.5, 0.05), 0.682, 0.69, alu, n=3))
p.append(lathe('t_leg', [(0.0, 0.0), (0.13, 0.0), (0.13, 0.008), (0.1, 0.02), (0.045, 0.034), (0.034, 0.06), (0.034, 0.62), (0.042, 0.64), (0.042, 0.66), (0.0, 0.66)], chrome, n=14))
p.append(lathe('t_plate', [(0.0, 0.67), (0.11, 0.67), (0.11, 0.69), (0.0, 0.69)], steel, n=14))
p.append(lathe('t_flange', [(0.122, 0.008), (0.132, 0.008), (0.132, 0.0), (0.122, 0.0)], black, n=14))
fin(join(p, 'table'))

# ---------- stove top ----------
p = []
p.append(slab('v_body', 0.2, 0.35, 0.03, 0.0, 0.034, enamel, n=3, bev=0.006))
p.append(frame('v_trim', (0.2, 0.35, 0.03), (0.192, 0.342, 0.026), 0.028, 0.038, steel, n=3))
for zz in (-0.18, 0.18):
    p.append(lathe('v_well', [(0.0, 0.034), (0.095, 0.034), (0.1, 0.037), (0.0, 0.037)], enamel, n=14, c=(0, 0, zz)))
    p.append(lathe('v_ring', [(0.032, 0.036), (0.05, 0.036), (0.056, 0.041), (0.052, 0.045), (0.034, 0.045), (0.03, 0.041)], steel, n=14, c=(0, 0, zz)))
    p.append(lathe('v_cap', [(0.0, 0.043), (0.026, 0.043), (0.028, 0.046), (0.02, 0.048), (0.0, 0.048)], black, n=12, c=(0, 0, zz)))
    p.append(lathe('v_grate', [(0.082, 0.041), (0.088, 0.041), (0.088, 0.05), (0.082, 0.05)], iron, n=14, c=(0, 0, zz)))
    for ang in (0, 90):
        b = box('v_bar', (0, 0.0455, 0), (0.172, 0.009, 0.012), iron, bev=0.002)
        b.data.transform(Matrix.Rotation(math.radians(ang), 4, 'Z'))
        b.data.transform(Matrix.Translation(G(0, 0, zz)))
        p.append(b)
for xx in (-0.12, 0.12):
    p.append(cyl('v_knob', (xx, 0.04, 0.0), 0.016, 0.014, 0.012, black, n=10))
    p.append(box('v_mark', (xx, 0.0462, 0.0), (0.004, 0.002, 0.016), pipe))
fin(join(p, 'stove'))

# ---------- sink ----------
p = []
p.append(frame('k_rim', (0.2, 0.3, 0.03), (0.16, 0.26, 0.02), 0.0, 0.012, steel, n=2))
p.append(frame('k_lip', (0.162, 0.262, 0.02), (0.158, 0.258, 0.018), 0.011, 0.014, chrome, n=2))
p.append(loft('k_wall', [(0.013, 0.16, 0.26, 0.02), (0.004, 0.115, 0.215, 0.02)], sinkIn, cap=False, inward=True))
p.append(slab('k_floor', 0.116, 0.216, 0.02, 0.002, 0.004, sinkDeep))
p.append(lathe('k_drain', [(0.0, 0.004), (0.026, 0.004), (0.026, 0.008), (0.018, 0.008), (0.018, 0.006), (0.0, 0.006)], chrome, n=12))
for k in range(4):
    p.append(box('k_slot', (0, 0.0065, 0), (0.034, 0.003, 0.004), black))
    p[-1].data.transform(Matrix.Rotation(math.radians(45 * k), 4, 'Z'))
p.append(lathe('k_fbase', [(0.0, 0.0), (0.02, 0.0), (0.02, 0.01), (0.016, 0.03), (0.0, 0.03)], chrome, n=12, c=(0.18, 0.012, 0.0)))
p.append(tube('k_neck', [(0.18, 0.04, 0.0), (0.18, 0.12, 0.0), (0.176, 0.18, 0.0), (0.158, 0.224, 0.0), (0.12, 0.234, 0.0), (0.085, 0.224, 0.0), (0.066, 0.19, 0.0)],
              [0.014, 0.013, 0.012, 0.011, 0.011, 0.012, 0.013], chrome, n=10))
p.append(cyl('k_spout', (0.066, 0.176, 0.0), 0.014, 0.011, 0.03, chrome, n=10))
for zz, mat in ((-0.115, blue), (0.115, red)):
    p.append(lathe('k_tbase', [(0.0, 0.0), (0.018, 0.0), (0.016, 0.012), (0.009, 0.026), (0.0, 0.026)], chrome, n=10, c=(0.18, 0.012, zz)))
    p.append(box('k_bar', (0.18, 0.04, zz), (0.014, 0.012, 0.07), chrome, bev=0.004))
    p.append(ball('k_dot', (0.18, 0.05, zz), 0.011, mat, seg=(8, 5)))
fin(join(p, 'sink'))

# ---------- overhead dome lamp ----------
p = []
p.append(frame('o_bezel', (0.11, 0.06, 0.04), (0.092, 0.042, 0.03), -0.05, -0.012, cream, n=2))
p.append(frame('o_flange', (0.106, 0.056, 0.037), (0.09, 0.04, 0.028), -0.012, 0.0, cream, n=2))
p.append(slab('o_back', 0.09, 0.04, 0.028, -0.008, 0.0, cream, n=2))
p.append(loft('o_lens', [(-0.03, 0.092, 0.042, 0.03), (-0.044, 0.088, 0.039, 0.028), (-0.048, 0.06, 0.024, 0.02), (-0.05, 0.04, 0.012, 0.01)], lens, n=2))
for xx in (-0.098, 0.098):
    p.append(ball('o_screw', (xx, -0.044, 0.0), 0.006, steel, seg=(6, 4)))
p.append(box('o_sw', (0.0, -0.044, 0.05), (0.03, 0.008, 0.012), black, bev=0.002))
fin(join(p, 'overhead'))

# ---------- cup holder ----------
p = []
p.append(slab('c_tray', 0.12, 0.055, 0.025, 0.0, 0.022, plastic, n=2, bev=0.005))
p.append(frame('c_lip', (0.12, 0.055, 0.025), (0.112, 0.047, 0.02), 0.022, 0.034, plastic, n=2))
for xx in (-0.06, 0.06):
    p.append(lathe('c_well', [(0.047, 0.045), (0.047, 0.012), (0.042, 0.012), (0.04, 0.05), (0.047, 0.05)], plastic, n=14, c=(xx, 0, 0)))
    p.append(lathe('c_floor', [(0.0, 0.01), (0.042, 0.01), (0.042, 0.022), (0.0, 0.022)], black, n=14, c=(xx, 0, 0)))
p.append(box('c_rib', (0, 0.035, 0), (0.016, 0.03, 0.05), plastic, bev=0.004))
p.append(lathe('c_cup', [(0.0, 0.022), (0.029, 0.022), (0.034, 0.05), (0.038, 0.085), (0.0, 0.085)], cup, n=14, c=(0.06, 0, 0)))
p.append(lathe('c_band', [(0.0322, 0.04), (0.0366, 0.07), (0.0368, 0.075), (0.0338, 0.047)], cupBand, n=14, c=(0.06, 0, 0)))
p.append(lathe('c_lid', [(0.0, 0.092), (0.0395, 0.0845), (0.0425, 0.0845), (0.0425, 0.094), (0.036, 0.097), (0.03, 0.1), (0.0, 0.1)], lid, n=14, c=(0.06, 0, 0)))
p.append(box('c_sip', (0.06, 0.1, -0.018), (0.016, 0.003, 0.008), black, bev=0.001))
fin(join(p, 'cupholder'))

layout(roots, 1.2)
export('rvinterior', roots)
