# 몸 비율 바꾸기: 메시·셰이프 키·뼈·콜라이더를 같은 공간 변형으로 옮긴다. 머리 묶음(뼈 무게)만 따로 키운다.
import bpy
import numpy as np
from mathutils import Matrix, Vector

HEAD, WX, WY = 1.3, .86, .9
XS = .17       # 어깨 바깥 팔은 길이를 안 줄이고 안쪽으로 옮기기만 한다
WCY = -.012


def _body(p):
    p = np.array(p, float)
    a = np.abs(p[..., 0])
    p[..., 0] = np.sign(p[..., 0]) * np.where(a < XS, a * WX, XS * WX + a - XS)
    p[..., 1] = WCY + (p[..., 1] - WCY) * WY
    return p


def warp_all():
    arm = bpy.data.objects['Armature']
    top = arm.data.bones['J_Bip_C_Head']
    head = {top.name} | {b.name for b in top.children_recursive}
    pivot = np.array(arm.matrix_world @ top.head_local)
    base = _body(pivot)

    def warp(p, w):
        return _body(p) * (1 - w) + (base + (p - pivot) * HEAD) * w

    for o in bpy.data.objects:
        if o.type != 'MESH' or not any(m.type == 'ARMATURE' for m in o.modifiers):
            continue
        me = o.data
        n = len(me.vertices)
        ids = {g.index for g in o.vertex_groups if g.name in head}
        w = np.array([min(sum(g.weight for g in v.groups if g.group in ids), 1) for v in me.vertices])[:, None]
        mw = np.array(o.matrix_world)
        inv = np.linalg.inv(mw)
        keys = list(me.shape_keys.key_blocks) if me.shape_keys else []

        def move(src):
            c = np.empty(n * 3)
            src.foreach_get('co', c)
            c = c.reshape(n, 3)
            world = c @ mw[:3, :3].T + mw[:3, 3]
            out = warp(world, w) @ inv[:3, :3].T + inv[:3, 3]
            src.foreach_set('co', out.ravel())
        for k in keys:
            move(k.data)
        move(me.vertices)
        me.update()

    # 뼈에 달린 콜라이더: 뼈를 옮기기 전에 자리를 기억
    empties = [o for o in bpy.data.objects if o.type == 'EMPTY' and o.parent == arm and o.parent_type == 'BONE']
    spots = [(o, np.array(o.matrix_world.translation), float(o.parent_bone in head)) for o in empties]

    bpy.context.view_layer.objects.active = arm
    arm.hide_set(False)
    bpy.ops.object.mode_set(mode='EDIT')
    for b in arm.data.edit_bones:
        w = float(b.name in head)
        b.head, b.tail = Vector(warp(np.array(b.head), w)), Vector(warp(np.array(b.tail), w))
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.context.view_layer.update()
    for o, p, w in spots:
        o.matrix_world = Matrix.Translation(Vector(warp(p, w)))
        if w:
            o.empty_display_size *= HEAD
    print('warped', len(spots), 'colliders')
