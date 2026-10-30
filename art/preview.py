# Contact sheet for a .glb: every top-level object laid out in a grid, rendered from the front and 3/4.
# Headless: <bpy python> art/preview.py public/models/people.glb out.png [filter-substring] [cols]
import bpy, math, sys
from mathutils import Vector

src, out = sys.argv[1], sys.argv[2]
flt = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] != '-' else ''
cols = int(sys.argv[4]) if len(sys.argv) > 4 else 0

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
roots = [o for o in bpy.context.scene.objects if o.parent is None and (not flt or flt in o.name)]
for o in list(bpy.context.scene.objects):
    top = o
    while top.parent: top = top.parent
    if top not in roots: bpy.data.objects.remove(o, do_unlink=True)

def bounds(o):
    pts = []
    for d in [o] + list(o.children_recursive):
        if d.type == 'MESH':
            pts += [d.matrix_world @ Vector(c) for c in d.bound_box]
    if not pts: return Vector((0, 0, 0)), Vector((0.2, 0.2, 0.2))
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi

# grid layout: each item centred in a cell sized to the biggest item
sizes = [bounds(o) for o in roots]
cols = cols or min(len(roots), 8)
cell = max(max((hi - lo).x, (hi - lo).y) for lo, hi in sizes) * 1.25 + 0.2
for i, (o, (lo, hi)) in enumerate(zip(roots, sizes)):
    cx, cy = (i % cols) * cell, -(i // cols) * cell * 1.1
    o.location += Vector((cx - (lo.x + hi.x) / 2, cy - (lo.y + hi.y) / 2, -lo.z))

lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
for o in roots:
    a, b = bounds(o)
    lo = Vector(map(min, lo, a)); hi = Vector(map(max, hi, b))
ctr = (lo + hi) / 2
span = max((hi - lo).x, (hi - lo).z * 1.6, 1)

sc = bpy.context.scene
sc.render.engine = 'BLENDER_WORKBENCH' if '--fast' in sys.argv else 'CYCLES'
if sc.render.engine == 'CYCLES':
    sc.cycles.device = 'CPU'; sc.cycles.samples = 24; sc.cycles.use_denoising = True
else:
    sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'MATERIAL'
    sc.display.shading.show_shadows = True; sc.display.shading.show_cavity = True
sc.render.film_transparent = False
world = bpy.data.worlds.new('w'); sc.world = world; world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (0.62, 0.66, 0.72, 1); world.node_tree.nodes['Background'].inputs[1].default_value = 0.9

# ground + sun
bpy.ops.mesh.primitive_plane_add(size=400, location=(ctr.x, ctr.y, 0))
g = bpy.context.object; gm = bpy.data.materials.new('ground'); gm.use_nodes = True
gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.5, 0.42, 0.33, 1); g.data.materials.append(gm)
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sc.collection.objects.link(sun)
sun.data.energy = 3.5; sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(-35))

cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'
three_q = '--side' not in sys.argv
cam.location = ctr + (Vector((-0.45, -1, 0.35)) if three_q else Vector((0, -1, 0.08))).normalized() * 80
cam.rotation_euler = (ctr - cam.location).to_track_quat('-Z', 'Y').to_euler()
bpy.context.view_layer.update()
# fit: project every bound corner into camera space
inv = cam.matrix_world.inverted()
xs, ys = [], []
for o in roots:
    for d in [o] + list(o.children_recursive):
        if d.type == 'MESH':
            for c in d.bound_box:
                q = inv @ (d.matrix_world @ Vector(c)); xs.append(q.x); ys.append(q.y)
w, h = max(xs) - min(xs), max(ys) - min(ys)
cx, cy = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2
cam.location = cam.matrix_world @ Vector((cx, cy, 0))
sc.render.resolution_x = 1600; sc.render.resolution_y = max(300, min(1400, int(1600 * h / w)))
cam.data.ortho_scale = max(w, h * sc.render.resolution_x / sc.render.resolution_y) * 1.06
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
print('wrote', out, len(roots), 'objects')
