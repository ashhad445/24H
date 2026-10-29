# Shared helpers for the Roadtrip Roulette asset scripts (run inside Blender via the MCP).
# Author in GAME coordinates: x right, y up, z back (−Z is forward). G(x, y, z) converts to Blender (Z up).
# glTF export converts Blender back to +Y up, so a model built here lands in Three.js exactly as written.
import bpy, bmesh, math, random
from mathutils import Vector, Matrix, Euler

OUT = r'E:\24H\public\models'


def G(x, y, z):
    return Vector((x, -z, y))


def reset():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.curves):
        for d in list(coll):
            if d.users == 0:
                coll.remove(d)


def hexrgb(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c] + [1]


def M(name, color='#ffffff', rough=0.85, metal=0.0, emit=0.0):
    """Material by name. Names starting with 'tint_' get recolored in game code."""
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = hexrgb(color)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit:
        b.inputs['Emission Color'].default_value = hexrgb(color)
        b.inputs['Emission Strength'].default_value = emit
    m.diffuse_color = hexrgb(color)
    return m


def _new(name, bm, mat=None, smooth=False):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    if mat:
        me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = smooth
    return o


def box(name, c, s, mat=None, bev=0.0, seg=1):
    """Box centered at game point c with game-size s=(w,h,d)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, vec=Vector((s[0], s[2], s[1])), verts=bm.verts)
    bmesh.ops.translate(bm, vec=G(*c), verts=bm.verts)
    if bev:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bev, segments=seg, affect='EDGES', profile=0.5)
    return _new(name, bm, mat)


def cyl(name, c, r1, r2, h, mat=None, n=8, axis='y', smooth=False, bev=0.0):
    """Cylinder/cone centered at game point c, length h along a game axis."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=n, radius1=r1, radius2=r2, depth=h)
    rot = {'y': Matrix.Identity(3), 'x': Matrix.Rotation(math.pi / 2, 3, 'Y'), 'z': Matrix.Rotation(math.pi / 2, 3, 'X')}[axis]
    bmesh.ops.rotate(bm, verts=bm.verts, matrix=rot)
    bmesh.ops.translate(bm, vec=G(*c), verts=bm.verts)
    if bev:
        bmesh.ops.bevel(bm, geom=[e for e in bm.edges if len(e.link_faces) == 2 and e.calc_face_angle() > 0.8], offset=bev, segments=1, affect='EDGES')
    return _new(name, bm, mat, smooth)


def ball(name, c, r, mat=None, sub=2, scale=(1, 1, 1), smooth=True, seg=None):
    bm = bmesh.new()
    if seg:
        bmesh.ops.create_uvsphere(bm, u_segments=seg[0], v_segments=seg[1], radius=r)
    else:
        bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    bmesh.ops.scale(bm, vec=Vector((scale[0], scale[2], scale[1])), verts=bm.verts)
    bmesh.ops.translate(bm, vec=G(*c), verts=bm.verts)
    return _new(name, bm, mat, smooth)


def lathe(name, pts, mat=None, n=16, c=(0, 0, 0), smooth=True, sx=1.0, sz=1.0):
    """Revolve a game-space profile [(radius, y), ...] around the game Y axis."""
    bm = bmesh.new()
    rings = []
    for (r, y) in pts:
        ring = []
        for i in range(n):
            a = 2 * math.pi * i / n
            ring.append(bm.verts.new(G(c[0] + math.cos(a) * r * sx, c[1] + y, c[2] + math.sin(a) * r * sz)))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    if pts[0][0] > 0:
        bm.faces.new(list(reversed(rings[0])))
    if pts[-1][0] > 0:
        bm.faces.new(rings[-1])
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _new(name, bm, mat, smooth)


def tube(name, path, r, mat=None, n=8, smooth=True, caps=True, rib=0.0):
    """Sweep a circle (optionally ribbed: alternating radius) along game-space points."""
    bm = bmesh.new()
    P = [G(*p) for p in path]
    rings = []
    radii = r if isinstance(r, (list, tuple)) else [r] * len(P)
    u = None
    for k, p in enumerate(P):
        t = (P[min(k + 1, len(P) - 1)] - P[max(k - 1, 0)]).normalized()
        if u is None:  # first frame, then parallel-transport it so the tube never twists
            up = Vector((0, 1, 0)) if abs(t.y) < 0.9 else Vector((1, 0, 0))
            u = t.cross(up).normalized()
        else:
            u = (u - t * u.dot(t)).normalized()
        v = t.cross(u).normalized()
        ring = []
        for i in range(n):
            a = 2 * math.pi * i / n
            rr = radii[k] * (1 - rib if (rib and i % 2) else 1)
            ring.append(bm.verts.new(p + (u * math.cos(a) + v * math.sin(a)) * rr))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    if caps:
        bm.faces.new(list(reversed(rings[0])))
        f = bm.faces.new(rings[-1])
        bmesh.ops.poke(bm, faces=[f], offset=radii[-1] * 0.5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _new(name, bm, mat, smooth)


def rock(name, c, s, mat=None, seed=0, sub=1, jag=0.22, flat=0.6):
    """Faceted rock: jittered icosphere, flattened bottom."""
    rnd = random.Random(seed)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1)
    for v in bm.verts:
        v.co *= 1 + (rnd.random() - 0.5) * 2 * jag
        v.co.z = max(v.co.z * flat, -0.25)
    bmesh.ops.scale(bm, vec=Vector((s[0], s[2], s[1])), verts=bm.verts)
    bmesh.ops.translate(bm, vec=G(*c), verts=bm.verts)
    return _new(name, bm, mat, False)


def join(objs, name):
    objs = [o for o in objs if o]
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = name; o.data.name = name
    return o


def origin(o, game_pt):
    """Move the object's origin to a game-space point without moving its geometry."""
    p = G(*game_pt)
    o.data.transform(Matrix.Translation(-p + o.location))
    o.location = p
    return o


def parent(child, par):
    m = child.matrix_world.copy()
    child.parent = par
    child.matrix_world = m
    return child


def empty(name, game_pt=(0, 0, 0)):
    e = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(e)
    e.location = G(*game_pt)
    return e


def tris(objs):
    n = 0
    for o in objs:
        if o.type == 'MESH':
            n += sum(len(p.vertices) - 2 for p in o.data.polygons)
    return n


def export(name, roots):
    """Export roots (and their children) to public/models/<name>.glb."""
    import os
    os.makedirs(OUT, exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    sel = []
    for r in roots:
        sel.append(r); sel.extend(r.children_recursive)
    for o in sel:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, name + '.glb'), export_format='GLB', use_selection=True,
                              export_apply=True, export_yup=True, export_materials='EXPORT', export_cameras=False, export_lights=False)
    print(name, 'exported', len(sel), 'objects', tris(sel), 'tris')


def layout(objs, gap=3.0):
    """Spread root objects along game X so `look` can see them all (positions only; export resets nothing)."""
    x = 0
    for o in objs:
        o.location.x = x
        x += gap
