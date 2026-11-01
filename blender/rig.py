# 옷을 뼈에 묶는다: 상체는 몸에서 무게 옮기기, 소매는 팔 길이로, 치마는 새 뼈 8줄.
import bpy, bmesh, math
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform

CHAINS = 8
CY = -0.012
JOINTS = [(1.045, .130), (.955, .185), (.865, .235), (.775, .285)]   # (높이, 반지름) 뼈 마디, 마지막은 끝
UP = ('Jeogori', 'Base', 'Sash', 'Collar', 'BowNeck')
SKIRT = ('Skirt', 'Ruffle', 'BowWaist', 'Norigae')
ARML = ('SleeveL', 'CapL', 'CuffL', 'CuffFrillL')
ARMR = ('SleeveR', 'CapR', 'CuffR', 'CuffFrillR')
ELBOW = .327
arm = bpy.data.objects['Armature']


def cname(i, k):
    return f'J_Sec_Skirt{i}_{k}'


def add_bones():
    bpy.context.view_layer.objects.active = arm
    arm.hide_set(False)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.data.edit_bones
    for i in range(CHAINS):
        a = 2 * math.pi * (i + .5) / CHAINS
        d = Vector((math.cos(a), .82 * math.sin(a), 0))
        parent = eb['J_Bip_C_Hips']
        for k in range(len(JOINTS) - 1):
            n = cname(i, k)
            b = eb.get(n) or eb.new(n)
            z0, r0 = JOINTS[k]
            z1, r1 = JOINTS[k + 1]
            b.head = (d * r0 + Vector((0, CY, z0)))
            b.tail = (d * r1 + Vector((0, CY, z1)))
            b.parent = parent
            b.use_connect = k > 0
            parent = b
    bpy.ops.object.mode_set(mode='OBJECT')


def springs():
    sa = arm.data.vrm_addon_extension.vrm0.secondary_animation
    old = next((i for i, g in enumerate(sa.bone_groups) if g.comment == 'Skirt'), None)
    cols = []
    if old is not None:
        cols = [c.collider_group_uuid for c in sa.bone_groups[old].collider_groups]
        sa.bone_groups.remove(old)
    g = sa.bone_groups.add()
    g.comment = 'Skirt'
    g.stiffiness = 1.1
    g.gravity_power = .08
    g.gravity_dir = (0, 0, -1)
    g.drag_force = .45
    g.hit_radius = .02
    for i in range(CHAINS):
        b = g.bones.add()
        b.bone_name = cname(i, 0)
    for c in cols:
        g.collider_groups.add().collider_group_uuid = c
    print('spring', len(g.bones), len(g.collider_groups))


def body_table():
    body = bpy.data.objects['Body']
    me = body.data
    mw = body.matrix_world
    vs = [mw @ v.co for v in me.vertices]
    polys = [tuple(p.vertices) for p in me.polygons if p.material_index == 0]
    tree = BVHTree.FromPolygons(vs, polys)
    names = [g.name for g in body.vertex_groups]
    w = [{names[g.group]: g.weight for g in v.groups if g.weight > .001} for v in me.vertices]
    return tree, vs, polys, w


def near(table, p, skip=None):
    tree, vs, polys, w = table
    loc, n, idx, d = tree.find_nearest(p)
    f = polys[idx]
    a, b, c = vs[f[0]], vs[f[1]], vs[f[2]]
    q = barycentric_transform(loc, a, b, c, Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1)))
    out = {}
    for s, i in zip(q, f[:3]):
        s = max(s, 0)
        for k, v in w[i].items():
            out[k] = out.get(k, 0) + s * v
    return out


def norm(w, cap=4):
    top = sorted(w.items(), key=lambda kv: -kv[1])[:cap]
    t = sum(v for k, v in top) or 1
    return {k: v / t for k, v in top if v / t > .01}


def skirt_weight(p):
    a = math.atan2((p.y - CY) / .82, p.x) % (2 * math.pi)
    t = a / (2 * math.pi) * CHAINS - .5
    i0 = math.floor(t)
    f = t - i0
    f = f * f * (3 - 2 * f)
    zs = [z for z, r in JOINTS]
    out = {}
    for i, w in ((i0 % CHAINS, 1 - f), ((i0 + 1) % CHAINS, f)):
        z = p.z
        if z >= zs[0]:
            s = min((z - zs[0]) / (1.10 - zs[0]), 1)
            out['J_Bip_C_Hips'] = out.get('J_Bip_C_Hips', 0) + w * s
            out[cname(i, 0)] = out.get(cname(i, 0), 0) + w * (1 - s)
        else:
            for k in range(len(JOINTS) - 1):
                if z >= zs[k + 1] or k == len(JOINTS) - 2:
                    q = min((zs[k] - z) / (zs[k] - zs[k + 1]), 1)
                    if k < len(JOINTS) - 2:
                        out[cname(i, k)] = out.get(cname(i, k), 0) + w * (1 - q)
                        out[cname(i, k + 1)] = out.get(cname(i, k + 1), 0) + w * q
                    else:
                        out[cname(i, k)] = out.get(cname(i, k), 0) + w
                    break
    return out


def arm_weight(p, side):
    x = abs(p.x)
    s = 'L' if side > 0 else 'R'
    t = min(max((x - (ELBOW - .05)) / .10, 0), 1)
    t = t * t * (3 - 2 * t)
    return {f'J_Bip_{s}_LowerArm': t, f'J_Bip_{s}_UpperArm': 1 - t}


def relax(o, ws, n):
    """무게를 메시를 따라 고르게: 가까운 면이 달라져 생기는 접힘을 없앤다"""
    link = [[] for _ in ws]
    for e in o.data.edges:
        a, b = e.vertices
        link[a].append(b)
        link[b].append(a)
    for _ in range(n):
        out = []
        for i, w in enumerate(ws):
            if not link[i]:
                out.append(w)
                continue
            m = {k: v * .4 for k, v in w.items()}
            f = .6 / len(link[i])
            for j in link[i]:
                for k, v in ws[j].items():
                    m[k] = m.get(k, 0) + v * f
            out.append(m)
        ws = out
    return ws


def apply(o, fn, smooth_n=0):
    arm_bones = arm.data.bones
    o.vertex_groups.clear()
    groups = {}
    ws = [fn(o.matrix_world @ v.co) for v in o.data.vertices]
    if smooth_n:
        ws = relax(o, ws, smooth_n)
    for v, w0 in zip(o.data.vertices, ws):
        for k, w in norm(w0).items():
            if k not in arm_bones:
                continue
            g = groups.get(k) or o.vertex_groups.new(name=k)
            groups[k] = g
            g.add([v.index], w, 'REPLACE')
    if not any(m.type == 'ARMATURE' for m in o.modifiers):
        m = o.modifiers.new('arm', 'ARMATURE')
        m.object = arm
    o.parent = arm
    print(o.name, len(o.data.vertices), len(groups))


def bind():
    t = body_table()
    objs = bpy.data.objects
    for n in UP:
        apply(objs[n], lambda p: near(t, p), 8 if n == 'Jeogori' else 0)

    def sk(p):
        w = skirt_weight(p)
        q = min(max((p.z - 1.04) / .06, 0), 1)
        if q > 0:   # 허리 위쪽은 몸을 그대로 따라감
            b = near(t, p)
            m = {k: v * (1 - q) for k, v in w.items()}
            for k, v in b.items():
                m[k] = m.get(k, 0) + v * q
            return m
        return w
    for n in SKIRT:
        apply(objs[n], sk)
    def sleeve_w(side):
        def f(p):       # 솔기 근처는 피부와 똑같이, 멀어지면 팔을 따라감
            q = min(max((abs(p.x) - .172) / .07, 0), 1)
            q = q * q * (3 - 2 * q)
            a = arm_weight(p, side)
            if q >= 1:
                return a
            b = near(t, p)
            m = {k: v * q for k, v in a.items()}
            for k, v in b.items():
                m[k] = m.get(k, 0) + v * (1 - q)
            return m
        return f
    for n in ARML:
        apply(objs[n], sleeve_w(1), 6 if n in ('SleeveL', 'CapL') else 0)
    for n in ARMR:
        apply(objs[n], sleeve_w(-1), 6 if n in ('SleeveR', 'CapR') else 0)
