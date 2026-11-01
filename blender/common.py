# Blender 안에서 exec로 불러 쓰는 공통 도구. 앞이 -Y, 위가 +Z, 단위 m.
import bpy, bmesh, math, os
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = os.path.expanduser('~/vtuber-wardrobe')


def collection(name):
    c = bpy.data.collections.get(name)
    if not c:
        c = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(c)
    return c


def remove(name):
    o = bpy.data.objects.get(name)
    if o:
        bpy.data.objects.remove(o, do_unlink=True)


def grid_mesh(name, rows, closed=True, coll='Outfit'):
    """rows: 줄마다 같은 수의 점 목록. closed면 줄 끝과 처음을 잇는다."""
    remove(name)
    n, m = len(rows), len(rows[0])
    verts = [tuple(p) for r in rows for p in r]
    faces = []
    for i in range(n - 1):
        for j in range(m if closed else m - 1):
            k = (j + 1) % m
            # 줄이 위→아래, 점이 반시계 방향일 때 법선이 바깥을 보게(충돌체가 안을 보면 천을 빨아들임)
            faces.append((i * m + j, (i + 1) * m + j, (i + 1) * m + k, i * m + k))
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    o = bpy.data.objects.new(name, me)
    collection(coll).objects.link(o)
    return o


def lathe(name, profile, n=48, coll='Outfit'):
    """profile: (반지름, 높이) 목록. 타원 비율은 호출한 쪽에서 scale로."""
    rows = [[(r * math.cos(2 * math.pi * j / n), r * math.sin(2 * math.pi * j / n), z)
             for j in range(n)] for r, z in profile]
    return grid_mesh(name, rows, True, coll)


def group(o, name, weights):
    """weights: 정점 번호 -> 0..1 (0은 안 넣음)"""
    g = o.vertex_groups.get(name) or o.vertex_groups.new(name=name)
    for i, w in weights.items():
        if w > 0:
            g.add([i], w, 'REPLACE')
    return g


def simulate(o, frames, step_print=20):
    """프레임을 차례로 넘겨 천을 돌린 뒤 결과를 메시에 적용한다."""
    sc = bpy.context.scene
    sc.frame_start, sc.frame_end = 1, frames
    cl = next(m for m in o.modifiers if m.type == 'CLOTH')
    cl.point_cache.frame_start, cl.point_cache.frame_end = 1, frames
    sc.frame_set(1)
    for f in range(2, frames + 1):
        sc.frame_set(f)
        if f % step_print == 0:
            print('frame', f)
    dg = bpy.context.evaluated_depsgraph_get()
    ev = o.evaluated_get(dg)
    res = ev.to_mesh()
    co = [v.co.copy() for v in res.vertices]
    ev.to_mesh_clear()
    print('moved', max((co[i] - o.data.vertices[i].co).length for i in range(len(co))))
    o.modifiers.remove(cl)
    if o.data.shape_keys:
        o.shape_key_clear()
    for i, c in enumerate(co):
        o.data.vertices[i].co = c
    o.data.polygons.foreach_set('use_smooth', [True] * len(o.data.polygons))
    o.data.update()
    sc.frame_set(1)
    return o
