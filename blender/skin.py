# 원래 옷을 지우고, 옷 밑이라 투명한 피부 그림을 주변 살색으로 메운다(푸시-풀).
import os, bpy, bmesh
import numpy as np


def heal(img):
    w, h = img.size
    px = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)
    a = (px[..., 3] > .9).astype(np.float32)
    levels = [(px[..., :3] * a[..., None], a)]
    while min(levels[-1][1].shape) > 1:
        c, m = levels[-1]
        hh, ww = m.shape[0] // 2 * 2, m.shape[1] // 2 * 2
        c, m = c[:hh, :ww], m[:hh, :ww]
        c2 = (c[::2, ::2] + c[1::2, ::2] + c[::2, 1::2] + c[1::2, 1::2])
        m2 = (m[::2, ::2] + m[1::2, ::2] + m[::2, 1::2] + m[1::2, 1::2])
        levels.append((c2 / 4, m2 / 4))
    fill = levels[-1][0] / np.maximum(levels[-1][1][..., None], 1e-5)
    for c, m in reversed(levels[:-1]):
        fill = np.repeat(np.repeat(fill, 2, 0), 2, 1)
        fill = np.pad(fill, ((0, m.shape[0] - fill.shape[0]), (0, m.shape[1] - fill.shape[1]), (0, 0)), mode='edge')
        fill = c + fill * (1 - m[..., None])
    px[..., :3] = np.where(a[..., None] > 0, px[..., :3], fill)
    px[..., 3] = 1
    img.pixels.foreach_set(px.ravel())
    img.update()
    print('healed', w, h, 'hole', round(1 - a.mean(), 3))


body = bpy.data.objects['Body']
skin = body.data.materials[0]


def prepare():
    tex = [n for n in skin.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image]
    done = set()
    for n in tex:
        if n.image.name not in done and 'Body' in n.image.name or 'body' in n.image.name.lower():
            done.add(n.image.name)
            heal(n.image)
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index in (1, 2, 3)], context='FACES')
    bm.to_mesh(body.data)
    bm.free()
    body.hide_set(False)
    bpy.data.objects['BodyCol'].hide_set(True)


def hide_under(names=('Jeogori',), reach=.05, margin=.03):
    """옷에 완전히 덮인 피부 면을 지운다. 팔을 내릴 때 피부가 옷을 뚫지 않게."""
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    from mathutils.kdtree import KDTree
    bs = bmesh.new()
    for n in names:
        o = bpy.data.objects[n]
        me = o.data.copy()
        me.transform(o.matrix_world)
        bs.from_mesh(me)
        bpy.data.meshes.remove(me)
    bs.edges.ensure_lookup_table()
    tree = BVHTree.FromBMesh(bs)
    bm = bmesh.new()
    bm.from_mesh(body.data)
    mw = body.matrix_world

    # 옷 가장자리에서 margin 안쪽 피부는 남긴다(지우면 틈으로 구멍이 보임)
    edge = [(e.verts[0].co + e.verts[1].co) / 2 for e in bs.edges if len(e.link_faces) == 1]
    kd = KDTree(len(edge))
    for i, c in enumerate(edge):
        kd.insert(c, i)
    kd.balance()

    def covered(v):
        p = mw @ v.co
        loc, n, i, d = tree.find_nearest(p)
        if loc is None or d > reach or kd.find(p)[2] < margin:
            return False
        return (loc - p).normalized().dot(n.normalized()) ** 2 > .72 and abs(p.x) < .172
    cov = {v.index: covered(v) for v in bm.verts}
    dead = [f for f in bm.faces if f.material_index == 0 and all(cov[v.index] for v in f.verts)]
    print('skin faces removed', len(dead), 'of', len(bm.faces))
    bmesh.ops.delete(bm, geom=dead, context='FACES')
    bm.to_mesh(body.data)
    bm.free()
    bs.free()
