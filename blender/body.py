# 맨몸 충돌체: Body에서 피부 면만 떼어 낸 BodyCol. 팔은 시뮬레이션에 방해되지 않게 그대로 둠.
import os
exec(open(os.path.expanduser('~/vtuber-wardrobe/blender/common.py'), encoding='utf-8').read())

remove('BodyCol')
src = bpy.data.objects['Body']
me = bpy.data.meshes.new('BodyCol')
bm = bmesh.new()
bm.from_mesh(src.data)
bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index != 0], context='FACES')
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
bmesh.ops.transform(bm, matrix=src.matrix_world, verts=bm.verts)  # Body는 180도 돌아가 있음
bm.to_mesh(me)
bm.free()
col = bpy.data.objects.new('BodyCol', me)
collection('Sim').objects.link(col)
col.hide_render = True
print('BodyCol', len(me.vertices))
sec = {}
for v in me.vertices:
    z = round(v.co.z, 2)
    if abs(v.co.x) < .2:
        s = sec.setdefault(z, [9, -9, 0])
        s[0] = min(s[0], v.co.y)
        s[1] = max(s[1], v.co.y)
        s[2] = max(s[2], abs(v.co.x))
for z in sorted(sec):
    if .7 < z < 1.36 and round(z * 100) % 3 == 0:
        print(z, 'x', round(sec[z][2], 3), 'y', round(sec[z][0], 3), round(sec[z][1], 3))
