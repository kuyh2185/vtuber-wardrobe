from mathutils import Vector
# 전체 다시 만들기. Blender에서 exec 뒤 build_*() 호출.
import os, time
_d = os.path.expanduser('~/vtuber-wardrobe/blender/')
__name__ = 'build'
for _f in ('bodice', 'skirt', 'sleeve', 'materials', 'details'):
    exec(open(_d + _f + '.py', encoding='utf-8').read())
R = radial()
SHEER = (.97, .95, .95)


def smooth(*os_):
    for m in os_:
        m.data.polygons.foreach_set('use_smooth', [True] * len(m.data.polygons))
        m.data.update()


def build_skirt():
    petti()
    o = skirt('Skirt', width=1.2, hem=2.2, length=.315, pleats=14, top_r=ring(R, WAIST_Z, .004), top_z=WAIST_Z, amp=.004, bend=2.2, mass=.12)
    paint(o, mat('Pink', PINK))
    bpy.data.objects['Petti'].hide_set(True)
    build_veil(o)


def build_veil(sk, rows=26, cols=160, drop=.006):
    """비치는 겉천: 구운 치마를 띄워 잔주름을 덮는다(따로 시뮬레이션하면 한쪽으로 처짐)"""
    import numpy as np
    co = np.array([v.co[:] for v in sk.data.vertices]).reshape(rows, cols, 3)
    x, y = co[..., 0], (co[..., 1] - CY) / RY
    r, a = np.hypot(x, y), np.arctan2(y, x)
    from numpy.lib.stride_tricks import sliding_window_view as win
    out = []
    for i in range(rows):
        # 주름 마루를 다 덮는 껍질을 부드럽게 편다: 겉천 끝선이 주름을 따라 들쭉날쭉하지 않게
        hull = win(np.r_[r[i][-7:], r[i], r[i][:6]], 14).max(1)
        wide = win(np.r_[hull[-13:], hull, hull[:13]], 27).mean(1)
        r2 = wide + .002 + .006 * i / (rows - 1)
        out.append(np.stack([r2 * np.cos(a[i]), r2 * RY * np.sin(a[i]) + CY, co[i, :, 2]], 1))
    d = out[-1] - out[-3]
    d /= np.linalg.norm(d, axis=1, keepdims=True)
    for j in (1, 2, 3):     # 치마 밑단보다 조금 길게
        out.append(out[-1] + d * drop / 3)
    o = grid_mesh('Veil', [[tuple(p) for p in row] for row in out], True)
    smooth(o)
    paint(o, mat('Sheer', SHEER, .6))


def lift(o, gap=.005, n=4):
    """몸 안으로 들어간 점을 밖으로 밀고 고르게 편다(어깨 끝은 단면 재단이 몸보다 작음)"""
    from mathutils.bvhtree import BVHTree
    c = bpy.data.objects['BodyCol']
    t = BVHTree.FromPolygons([tuple(v.co) for v in c.data.vertices], [tuple(p.vertices) for p in c.data.polygons])
    d = [Vector()] * len(o.data.vertices)
    for v in o.data.vertices:
        loc, nor, i, dist = t.find_nearest(v.co)
        side = (v.co - loc).dot(nor)
        if side < gap and dist < .05:
            d[v.index] = nor * (gap - side)
    link = [[] for _ in d]
    for e in o.data.edges:
        a, b = e.vertices
        link[a].append(b); link[b].append(a)
    for _ in range(n):   # 민 양이 계단이 되지 않게
        d = [max([d[i]] + [(d[i] + d[j]) / 2 for j in link[i]], key=lambda x: x.length) * .95 for i in range(len(d))]
    for v, x in zip(o.data.vertices, d):
        v.co += x


def build_top():
    o = jeogori(R)
    lift(o)
    base = rmesh('Base', R, 1.06, 1.16, .0025, 16)
    sash = rmesh('Sash', R, 1.078, 1.134, .008, 10)
    cord = rmesh('Cord', R, 1.082, 1.090, .0105, 3)
    smooth(o, base, sash, cord)
    paint(o, mat('Pink', PINK)); paint(base, mat('Deep', DEEP)); paint(sash, mat('White', WHITE)); paint(cord, mat('Deep', DEEP))


def build_sleeve():
    b = bpy.data.objects['BodyCol']
    if not b.modifiers:
        b.modifiers.new('col', 'COLLISION')
        b.collision.thickness_outer = .004
    sl = sleeve()
    sr = mirror(sl, 'SleeveR')
    m = mat('Sheer', SHEER, .6)
    paint(sl, m); paint(sr, m)


def ellipse(rx, ry, cy):
    def at(u):
        a = 2 * math.pi * u
        x, y = rx * math.cos(a), ry * math.sin(a)
        n = math.hypot(x / rx ** 2, y / ry ** 2)
        return x, cy + y, x / rx ** 2 / n, y / ry ** 2 / n
    return at


def collide(name, on):
    bpy.data.objects[name].collision.use = on


def roll(o, rows, cols, lobes):
    """구운 프릴을 둥글게 말고 끝선을 물결지게: 곧은 세로 주름이 판자처럼 보이는 걸 막는다"""
    for v in o.data.vertices:
        q = (v.index // cols) / (rows - 1)
        x, y = v.co.x, (v.co.y - CY) / RY
        r, a = math.hypot(x, y), math.atan2(y, x)
        w = lobes * a + 1.4 * q                 # 아래로 갈수록 주름 줄기가 비스듬히 휜다
        r += .012 * math.sin(math.pi * q) + .013 * q * math.sin(w)
        v.co.x, v.co.y = r * math.cos(a), r * RY * math.sin(a) + CY
        v.co.z += .005 * q * q * math.cos(w)
    o.data.update()


def build_ruffle():
    """밑단 밖으로 나오는 흰 프릴: 안쪽 좁은 틀 위에 달아 겉치마 밑으로 내려옴"""
    collide('Petti', False)
    p2 = lathe('Petti2', [(.186, .90), (.204, .84), (.224, .76), (.234, .70), (.234, .64)], 64, 'Sim')
    for v in p2.data.vertices:
        v.co.y = v.co.y * RY + CY
    p2.data.update()
    p2.modifiers.new('col', 'COLLISION')
    p2.collision.thickness_outer = .004
    o = skirt('Ruffle', width=2.2, hem=2.9, length=.10, rows=11, cols=210, pleats=24, top_z=.855,
              top_r=ellipse(.203, .203 * RY, CY), amp=.012, frames=60, bend=.8, mass=.08, seed=7)
    roll(o, rows=11, cols=210, lobes=24)
    paint(o, mat('White', WHITE))
    bpy.data.objects.remove(p2, do_unlink=True)
    collide('Petti', True)


def build_small():
    surf = surface(R)
    at, tree = surf
    Xn, Zn, Zv = .052, 1.338, 1.245
    a = lapel('LapelA', surf, (Xn, Zn), (-.024, Zv - .04), .016, 1)
    b = lapel('LapelB', surf, (-Xn, Zn), (.004, Zv - .012), .016, -1, .0085)
    # 목 뒤 깃
    rows = []
    for i in range(25):
        t = i / 24
        x = -Xn + 2 * Xn * t
        zc = 1.334 + .012 * math.cos(t * math.pi * 2)
        row = []
        for q in (0, .5, 1):
            p, n = at(x * (1 + .35 * q), zc - .022 * q, False)
            if p is None:
                p, n = at(x, zc - .03, False)
            row.append(tuple(p + n * .006))
        rows.append(row)
    c = strip('LapelC', rows, False, .0015)
    paint(join('Collar', [a, b, c]), mat('White', WHITE))
    # 어깨 프릴
    rg = []
    Y = Vector((0, 1, 0))
    for j in range(180):
        s = 2 * math.pi * j / 180
        p = ARM_A + TILT * .047 * math.cos(s) + Y * .049 * math.sin(s) + Vector((.002, 0, 0))
        d = (Vector((1, 0, 0)) + TILT * .30 * math.cos(s) + Y * .30 * math.sin(s)).normalized()
        n = (TILT * math.cos(s) + Y * math.sin(s)).normalized()
        rg.append((p, d, n))
    fl = frill('CapL', rg, .012, .004, 13, seed=3)
    paint(fl, mat('Pink', PINK))
    paint(mirror(fl, 'CapR'), mat('Pink', PINK))
    # 커프스
    ax = (ARM_B - ARM_A).normalized()
    rows = []
    for t, r in ((-.004, .036), (.0, .039), (.024, .039), (.03, .036)):
        rows.append([tuple(q[0]) for q in arm_ring(ARM_B + ax * t, ax, r)])
    cu = grid_mesh('CuffL', rows, True)
    smooth(cu)
    paint(cu, mat('Pink', PINK))
    cf = frill('CuffFrillL', arm_ring(ARM_B + ax * .028, ax, .038, 160), .020, .004, 13, seed=5)
    paint(cf, mat('White', WHITE))
    paint(mirror(cu, 'CuffR'), mat('Pink', PINK))
    paint(mirror(cf, 'CuffFrillR'), mat('White', WHITE))
    # 저고리 고름 리본
    p, n = at(.0, Zv - .03)
    paint(bow('BowNeck', p + n * .012, Vector((0, -1, .08)).normalized(), w=.032, h=.016, tail=.12, tail_w=.007), mat('White', WHITE))
    # 허리 리본
    p, n = at(-.058, 1.098)
    paint(bow('BowWaist', p + n * .014, Vector((0, -1, 0)), w=.026, h=.014, tail=.15, tail_w=.008, lean=.05), mat('Deep', DEEP))
    # 노리개: 치마 앞면을 따라 늘어뜨림
    sk = bpy.data.objects['Veil']
    tree = BVHTree.FromPolygons([tuple(v.co) for v in sk.data.vertices], [tuple(q.vertices) for q in sk.data.polygons])

    def ytop(z):
        hit = tree.ray_cast(Vector((.044, -.6, z)), Vector((0, 1, 0)), 1.2)
        return hit[0].y if hit[0] else at(.044, 1.1)[0].y
    paint(norigae('Norigae', .044, ytop), mat('Deep', DEEP))
