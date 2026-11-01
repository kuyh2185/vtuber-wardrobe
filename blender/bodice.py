# 저고리·허리 받침·허리띠: 몸 단면의 볼록 껍질을 따라 재단해 가슴 사이를 건너가고 허리는 붙는다.
import os
exec(open(os.path.expanduser('~/vtuber-wardrobe/blender/common.py'), encoding='utf-8').read())

CY = -0.012
COLS = 96
ZS = [1.02 + .006 * i for i in range(58)]   # 1.02 ~ 1.362


def torso():
    src = bpy.data.objects['Body']
    names = [g.name for g in src.vertex_groups]
    arm = {i for i, n in enumerate(names) if any(k in n for k in ('UpperArm', 'LowerArm', 'Hand', 'Thumb', 'Index', 'Middle', 'Ring', 'Little'))}
    me = src.data
    mw = src.matrix_world
    vs = [mw @ v.co for v in me.vertices]
    # 어깨 끝(x 18.5cm)까지는 팔도 몸판에 포함: 소매 솔기가 어깨 끝에 놓임
    bad = {v.index for v in me.vertices if abs(vs[v.index].x) > .185 and sum(g.weight for g in v.groups if g.group in arm) > .5}
    ps = [tuple(p.vertices) for p in me.polygons if p.material_index == 0 and not bad & set(p.vertices)]
    return BVHTree.FromPolygons(vs, ps)


def hull2(pts):
    pts = sorted(set(pts))
    def half(ps):
        h = []
        for p in ps:
            while len(h) > 1 and (h[-1][0] - h[-2][0]) * (p[1] - h[-2][1]) - (h[-1][1] - h[-2][1]) * (p[0] - h[-2][0]) <= 0:
                h.pop()
            h.append(p)
        return h[:-1]
    return half(pts) + half(pts[::-1])


def ray_hull(h, a):
    """점 (0,CY)에서 각 a 방향으로 볼록 다각형까지 거리"""
    dx, dy = math.cos(a), math.sin(a)
    best = 0
    for i in range(len(h)):
        x1, y1 = h[i][0], h[i][1] - CY
        x2, y2 = h[(i + 1) % len(h)][0], h[(i + 1) % len(h)][1] - CY
        ex, ey = x2 - x1, y2 - y1
        d = dx * ey - dy * ex
        if abs(d) < 1e-9:
            continue
        t = (x1 * ey - y1 * ex) / d
        u = (x1 * dy - y1 * dx) / d
        if t > 0 and -1e-6 <= u <= 1 + 1e-6:
            best = max(best, t)
    return best


def radial():
    """r[z번호][각도번호]"""
    tree = torso()
    R = []
    for z in ZS:
        pts = []
        for k in range(180):
            a = 2 * math.pi * k / 180
            o = Vector((.6 * math.cos(a), CY + .6 * math.sin(a), z))
            hit = tree.ray_cast(o, -Vector((math.cos(a), math.sin(a), 0)), 1.2)
            if hit[0]:
                pts.append((round(hit[0].x, 5), round(hit[0].y, 5)))
        h = hull2(pts) if len(pts) > 2 else [(.05, CY), (-.05, CY), (0, CY + .05)]
        R.append([ray_hull(h, 2 * math.pi * j / COLS) for j in range(COLS)])
    # 앞쪽은 가슴에서 아래로 천이 곧게 떨어짐(가슴 밑 오목한 곳을 건너감)
    lo = min(range(len(ZS)), key=lambda i: abs(ZS[i] - 1.135))
    for j in range(COLS):
        a = 2 * math.pi * j / COLS
        w = max(0, -math.sin(a)) ** 1.5
        if w == 0:
            continue
        hi = max(range(lo, len(ZS) - 8), key=lambda i: R[i][j] if ZS[i] < 1.26 else 0)
        for i in range(lo + 1, hi):
            q = (i - lo) / (hi - lo)
            env = R[lo][j] + (R[hi][j] - R[lo][j]) * math.sin(q * math.pi / 2)
            if env > R[i][j]:
                R[i][j] += (env - R[i][j]) * w
    # 부드럽게
    for _ in range(3):
        R = [[(R[max(i - 1, 0)][j] + 2 * R[i][j] + R[min(i + 1, len(R) - 1)][j]) / 4 for j in range(COLS)] for i in range(len(R))]
        R = [[(r[j - 1] + 2 * r[j] + r[(j + 1) % COLS]) / 4 for j in range(COLS)] for r in R]
    return R


def rmesh(name, R, zlo, zhi, off, rows=44):
    """zlo(각도)~zhi 사이를 호 길이로 고르게 잘라 격자로. zlo는 함수 또는 숫자."""
    grid = [[] for _ in range(rows)]
    for j in range(COLS):
        a = 2 * math.pi * j / COLS
        z0 = zlo(a) if callable(zlo) else zlo
        pl = []
        for i, z in enumerate(ZS):
            if z0 < z < zhi:
                pl.append((R[i][j], z))
        i0 = min(range(len(ZS)), key=lambda i: abs(ZS[i] - z0))
        pl.insert(0, (R[i0][j], z0))
        L = [0]
        for p, q in zip(pl, pl[1:]):
            L.append(L[-1] + math.hypot(q[0] - p[0], q[1] - p[1]))
        for i in range(rows):
            s = L[-1] * (rows - 1 - i) / (rows - 1)   # 위에서 아래로
            k = next((n for n in range(1, len(L)) if L[n] >= s), len(L) - 1)
            t = (s - L[k - 1]) / max(L[k] - L[k - 1], 1e-6)
            r = pl[k - 1][0] + (pl[k][0] - pl[k - 1][0]) * t + off
            z = pl[k - 1][1] + (pl[k][1] - pl[k - 1][1]) * t
            grid[i].append((r * math.cos(a), CY + r * math.sin(a), z))
    return grid_mesh(name, grid, True)


def cut(o, co, no, keep=None):
    """평면(co, no) 바깥(+no)을 지운다. keep(면 중심)이 참이면 남김."""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=co, plane_no=no, dist=1e-5)
    co, no = Vector(co), Vector(no)
    dead = []
    for f in bm.faces:
        c = f.calc_center_median()
        if (c - co).dot(no) > 0 and not (keep and keep(c)):
            dead.append(f)
    bmesh.ops.delete(bm, geom=dead, context='FACES')
    bm.to_mesh(o.data)
    bm.free()
    o.data.update()


def jeogori(R):
    # 밑단: 앞 가운데로 내려오는 둥근 물결(저고리 도련 곡선)
    def hem(a):
        front = max(0, -math.sin(a))
        return 1.172 - .022 * front ** 3 + .006 * math.cos(6 * a) * front
    o = rmesh('Jeogori', R, hem, 1.355, .006, 46)
    Zn, Zv = 1.338, 1.222          # 목 옆, V 바닥
    Xn = .066
    for s in (1, -1):
        n = Vector((-s * (Zn - Zv), 0, Xn)).normalized()
        cut(o, (0, 0, Zv), tuple(n), lambda c: c.y > .012 or c.x * s < 0)
        # 진동둘레: 약간 기울어진 평면
        cut(o, (s * .165, 0, 1.26), (s * 1, 0, -.10))
    cut(o, (0, 0, 1.334), (0, .30, 1))
    return o


if __name__ == '__main__':
    R = radial()
    print('r허리 x', round(R[min(range(len(ZS)), key=lambda i: abs(ZS[i] - 1.1))][0], 3))
    o = jeogori(R)
    base = rmesh('Base', R, 1.09, 1.20, .0025, 16)
    sash = rmesh('Sash', R, 1.098, 1.142, .0075, 8)
    print('Jeogori', len(o.data.vertices))
    for m in (o, base, sash):
        m.data.polygons.foreach_set('use_smooth', [True] * len(m.data.polygons))
        m.data.update()


def ring(R, z, off):
    """높이 z의 몸 둘레를 둘레 길이로 재는 함수 u(0..1) -> (x, y, 바깥 x, 바깥 y)"""
    i = min(range(len(ZS)), key=lambda n: abs(ZS[n] - z))
    pts = [((R[i][j] + off) * math.cos(2 * math.pi * j / COLS), CY + (R[i][j] + off) * math.sin(2 * math.pi * j / COLS)) for j in range(COLS)]
    L = [0]
    for j in range(COLS):
        p, q = pts[j], pts[(j + 1) % COLS]
        L.append(L[-1] + math.hypot(q[0] - p[0], q[1] - p[1]))

    def at(u):
        s = (u % 1) * L[-1]
        k = next(n for n in range(1, len(L)) if L[n] >= s)
        t = (s - L[k - 1]) / (L[k] - L[k - 1])
        p, q = pts[k - 1], pts[k % COLS]
        x, y = p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t
        n = math.hypot(x, y - CY)
        return x, y, x / n, (y - CY) / n
    return at
