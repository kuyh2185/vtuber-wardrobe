# 샘플 VRM에서 옷 입은 VRM까지 처음부터. Blender에서 exec.
import bpy, os, time
_t = time.time()
_d = os.path.expanduser('~/vtuber-wardrobe/blender/')
SAMPLE = os.path.expanduser('~/vtuber-wardrobe/samples/AvatarSample_D.vrm')
for _o in list(bpy.data.objects):
    bpy.data.objects.remove(_o, do_unlink=True)
for _c in list(bpy.data.collections):
    bpy.data.collections.remove(_c)
for _b in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials, bpy.data.images):
    for _x in list(_b):
        _b.remove(_x)
bpy.ops.import_scene.vrm(filepath=SAMPLE)
exec(open(_d + 'body.py', encoding='utf-8').read())
exec(open(_d + 'skin.py', encoding='utf-8').read())
prepare()
exec(open(_d + 'build.py', encoding='utf-8').read())
build_skirt(); build_ruffle(); build_top(); build_sleeve(); build_small()
print('built', round(time.time() - _t, 1))
hide_under()
exec(open(_d + 'rig.py', encoding='utf-8').read())
add_bones(); springs(); bind()
exec(open(_d + 'paint.py', encoding='utf-8').read())
run()
exec(open(_d + 'warp.py', encoding='utf-8').read())
warp_all()
exec(open(_d + 'export.py', encoding='utf-8').read())
bpy.ops.wm.save_as_mainfile(filepath=os.path.expanduser('~/vtuber-wardrobe/out/hanbok.blend'))
print('done', round(time.time() - _t, 1))
