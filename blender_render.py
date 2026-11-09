# -*- coding: utf-8 -*-
"""Blender headless: GLB odam modelidan kadrlar render qilish.
Ishlatish:
  blender -b -P blender_render.py -- <model.glb> <out_prefix> <frames> <fps>
"""
import bpy
import math
import sys
import os

argv = sys.argv[sys.argv.index('--') + 1:]
GLB, OUT, NFRAMES, FPS = argv[0], argv[1], int(argv[2]), float(argv[3])
W, H = 1280, 720

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.resolution_x, scene.render.resolution_y = W, H
scene.render.fps = int(round(FPS))
scene.render.fps_base = 1.0
scene.frame_start, scene.frame_end = 1, NFRAMES
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGB'
scene.render.filepath = OUT
scene.render.use_overwrite = True
scene.render.film_transparent = False
try:
    scene.view_settings.view_transform = 'Standard'
except Exception:
    pass

for eng in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE', 'CYCLES', 'BLENDER_WORKBENCH'):
    try:
        scene.render.engine = eng
        break
    except Exception:
        continue
print('engine:', scene.render.engine)
if scene.render.engine == 'CYCLES':
    scene.cycles.samples = 32
    scene.cycles.use_denoising = True

if hasattr(bpy.ops, 'import_scene') and hasattr(bpy.ops.import_scene, 'gltf'):
    bpy.ops.import_scene.gltf(filepath=GLB)
else:
    bpy.ops.wm.gltf_import(filepath=GLB)

for coll in (bpy.data.cameras, bpy.data.lights):
    for x in list(coll):
        coll.remove(x)

meshes = [o for o in bpy.data.objects if o.type == 'MESH' and len(o.data.vertices) >= 100]
if not meshes:
    raise SystemExit('modelda mesh topilmadi')


from mathutils import Vector


def world_bbox(objs, frame=None):
    if frame is not None:
        scene.frame_set(frame)
    deps = bpy.context.evaluated_depsgraph_get()
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        oe = o.evaluated_get(deps)
        me = oe.to_mesh()
        if len(me.vertices):
            for v in me.vertices:
                p = oe.matrix_world @ v.co
                lo.x = min(lo.x, p.x); hi.x = max(hi.x, p.x)
                lo.y = min(lo.y, p.y); hi.y = max(hi.y, p.y)
                lo.z = min(lo.z, p.z); hi.z = max(hi.z, p.z)
        oe.to_mesh_clear()
    return lo, hi


lo, hi = world_bbox(meshes, scene.frame_start)
h = hi[2] - lo[2]
k = 1.85 / h if h > 1e-6 else 1.0
if abs(k - 1.0) > 0.02:
    roots = [o for o in bpy.data.objects if o.parent is None]
    for o in roots:
        o.scale = [s * k for s in o.scale]
    lo, hi = world_bbox(meshes)
cx = (lo[0] + hi[0]) / 2
cy = (lo[1] + hi[1]) / 2
dz = -lo[2]
for o in [o for o in bpy.data.objects if o.parent is None]:
    o.location.x -= cx
    o.location.y -= cy
    o.location.z += dz
lo, hi = world_bbox(meshes)
print('bbox:', [round(v, 3) for v in lo], [round(v, 3) for v in hi])

acts = list(bpy.data.actions)
CYCLE = None
if acts:
    try:
        import struct as _st
        import json as _js
        with open(GLB, 'rb') as fh:
            fh.read(12)
            CYCLE = None
            while True:
                clen, ctype = _st.unpack('<II', fh.read(8))
                chunk = fh.read(clen)
                if ctype == 0x4E4F534A:
                    js = _js.loads(chunk.decode('utf-8'))
                    tmax = 0.0
                    for anim in js.get('animations', []):
                        for sm in anim.get('samplers', []):
                            idx = sm.get('input')
                            if idx is None:
                                continue
                            acc = js['accessors'][idx]
                            if 'max' in acc:
                                tmax = max(tmax, float(acc['max'][0]))
                    if tmax > 0:
                        CYCLE = max(2, int(round(tmax * FPS)) + 1)
                    break
    except Exception as e:
        print('glb anim parse xato:', e)
    if CYCLE is None:
        f0 = min(a.frame_range[0] for a in acts)
        f1 = max(a.frame_range[1] for a in acts)
        CYCLE = max(2, int(round(f1 - f0 + 1)))
    scene.frame_start, scene.frame_end = 1, CYCLE
    print('animatsiya:', len(acts), 'ta action, sikl =', CYCLE, 'kadr')
else:
    roots = [o for o in bpy.data.objects if o.parent is None and o.type in ('MESH', 'ARMATURE')]
    if not roots:
        roots = [o for o in bpy.data.objects if o.parent is None]
    for o in roots:
        o.rotation_euler = (0, 0, 0)
        o.keyframe_insert('rotation_euler', frame=1)
        o.rotation_euler = (0, 0, math.radians(360))
        o.keyframe_insert('rotation_euler', frame=NFRAMES)
    print('animatsiya yoq — turntable 360 gradus')

gnd = bpy.data.meshes.new('gnd')
import bmesh
bm = bmesh.new()
bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=15)
bm.to_mesh(gnd)
bm.free()
g = bpy.data.objects.new('gnd', gnd)
scene.collection.objects.link(g)
g.location.z = 0.0
mat = bpy.data.materials.new('gndmat')
mat.use_nodes = True
bsdf = mat.node_tree.nodes.get('Principled BSDF')
if bsdf:
    bsdf.inputs['Base Color'].default_value = (0.035, 0.045, 0.06, 1)
    bsdf.inputs['Roughness'].default_value = 0.85
gnd.materials.append(mat)

lo, hi = world_bbox(meshes)
print('bbox:', [round(v, 3) for v in lo], [round(v, 3) for v in hi])
tgt = (0, 0, (lo.z + hi.z) / 2)
R = 0.0
for o in meshes:
    oe = o.evaluated_get(bpy.context.evaluated_depsgraph_get())
    me = oe.to_mesh()
    for v in me.vertices:
        p = oe.matrix_world @ v.co
        R = max(R, (p - Vector(tgt)).length)
    oe.to_mesh_clear()
half_v = math.atan((36.0 * H / W / 2) / 50.0)
D = R / math.tan(half_v) * 1.12

cam_data = bpy.data.cameras.new('cam')
cam_data.lens = 50
cam = bpy.data.objects.new('cam', cam_data)
scene.collection.objects.link(cam)
cam.location = (0, -D, tgt[2] + 0.25)
direction = Vector(tgt) - cam.location
cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
scene.camera = cam


def light(name, loc, energy, size, rot):
    ld = bpy.data.lights.new(name, 'AREA')
    ld.energy = energy
    ld.size = size
    lo = bpy.data.objects.new(name, ld)
    scene.collection.objects.link(lo)
    lo.location = loc
    d = Vector((0, 0, 0.9)) - lo.location
    lo.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    return lo


light('key', (3.2, -3.0, 4.0), 350, 3.0, None)
light('fill', (-3.5, -2.0, 2.6), 140, 4.0, None)
light('rim', (0.5, 3.5, 3.2), 220, 2.5, None)

world = bpy.data.worlds.new('w')
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes.get('Background')
if bg:
    bg.inputs['Color'].default_value = (0.012, 0.018, 0.03, 1)
    bg.inputs['Strength'].default_value = 1.0

scene.frame_set(scene.frame_start)
print('render:', scene.frame_end - scene.frame_start + 1, 'kadr @', FPS, 'fps')
bpy.ops.render.render(animation=True)
print('FRAMES_DONE', scene.frame_end - scene.frame_start + 1)
