# 깃·커프스·프릴·리본 같은 작은 부품. 긴 천은 skirt.py, 작은 건 여기서 곡선을 따라 직접 만든다.
import random


def strip(name, rows, closed=False, thick=0.0):
    """rows: [ [왼쪽 점, ..., 오른쪽 점], ... ] 길이 방향 줄 목록"""
    o = grid_mesh(name, rows, False)
    if closed:   # 첫 줄과 끝 줄 잇기
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bm.verts.ensure_lookup_table()
        n, m = len(rows), len(rows[0])
        for j in range(m - 1):
            a, b = (n - 1) * m + j, (n - 1) * m + j + 1
            bm.faces.new((bm.verts[a], bm.verts[j], bm.verts[j + 1], bm.verts[b]))
        bm.to_mesh(o.data)
        bm.free()
    if thick:
        m = o.modifiers.new('solid', 'SOLIDIFY')
        m.thickness = thick
        m.offset = 1
    o.data.polygons.foreach_set('use_smooth', [True] * len(o.data.polygons))
    o.data.update()
    return o


def frill(name, ring, width, amp, folds, rows=7, closed=True, seed=1):
    """ring: [(점, 폭 방향, 법선)] 곡선을 따라 폭 방향으로 넓어지며 물결치는 프릴"""
    random.seed(seed)
    n = len(ring)
    ph = [random.uniform(0, 6.28) for _ in range(4)]
    out = []
    for i, (p, d, nrm) in enumerate(ring):
        u = i / n
        wave = math.sin(2 * math.pi * folds * u + .8 * math.sin(2 * math.pi * 3 * u + ph[0]))
        wave += .15 * math.sin(2 * math.pi * folds * 2 * u + ph[1])
        row = []
        for k in range(rows):
            v = k / (rows - 1)
            row.append(tuple(p + d * width * v * (1 + .10 * wave * v) + nrm * amp * v ** .8 * wave))
        out.append(row)
    return strip(name, out, closed)


def surface(R):
    """앞뒤로 쏘아 몸 볼록 껍질 위 점을 찾는 도구"""
    o = rmesh('_hull', R, 1.06, 1.355, .0, 46)
    me = o.data
    tree = BVHTree.FromPolygons([tuple(v.co) for v in me.vertices], [tuple(p.vertices) for p in me.polygons])
    remove('_hull')

    def at(x, z, front=True):
        y0 = -.6 if front else .6
        for _ in range(30):      # 어깨 위로 벗어나면 안쪽으로 당겨서 찾음
            hit = tree.ray_cast(Vector((x, y0, z)), Vector((0, 1 if front else -1, 0)), 1.2)
            if hit[0]:
                return hit[0], hit[1]
            x *= .96
            z -= .001
        raise ValueError((x, z))
    return at, tree


def lapel(name, surf, a, b, w, side, lift=.0065):
    """깃: (x,z) a에서 b까지 안쪽 선. 폭 w만큼 바깥(side) 쪽으로."""
    at, tree = surf
    rows = []
    N = 30
    dx, dz = b[0] - a[0], b[1] - a[1]
    L = math.hypot(dx, dz)
    nx, nz = -dz / L * side, dx / L * side
    for i in range(N):
        t = i / (N - 1)
        x = a[0] + dx * t
        z = a[1] + dz * t
        row = []
        for k in range(3):
            q = k / 2
            p, n = at(x + nx * w * q, z + nz * w * q)
            if p is None:
                p, n = at(x, z)
            row.append(tuple(p + n * (lift + .0015 * math.sin(q * math.pi))))
        rows.append(row)
    return strip(name, rows, False, .0015)


def bow(name, c, n, w=.042, h=.020, tail=.09, tail_w=.012, lean=0):
    """가운데 c, 앞 방향 n의 납작한 리본. 고리 둘 + 매듭 + 꼬리 둘을 한 메시로."""
    up = Vector((0, 0, 1))
    side = up.cross(n).normalized()
    up = n.cross(side).normalized()

    def lobe(s):
        """속이 찬 고리: 매듭에서 끝으로 부푸는 납작한 베개 모양"""
        N, M = 16, 14
        rows = []
        for i in range(N):
            t = i / (N - 1)
            hh = h * math.sin(math.pi * t ** .62) ** .8 + .003
            dd = (.0035 + .0065 * math.sin(math.pi * t ** .7)) * w / .042
            cc = c + side * s * w * t + n * (.005 + .006 * t) - up * .004 * t
            ring = []
            for j in range(M):
                a = 2 * math.pi * j / M
                pinch = 1 - .25 * abs(math.cos(a)) ** 4 * (1 - t)     # 매듭 쪽 잡힌 주름
                ring.append(tuple(cc + up * hh * math.cos(a) * pinch + n * dd * math.sin(a)))
            rows.append(ring)
        o = grid_mesh(f'{name}_L{s}', rows, True)
        o.data.polygons.foreach_set('use_smooth', [True] * len(o.data.polygons))
        return o
    objs = [lobe(s) for s in (1, -1)]
    for i, s in enumerate((1, -1)):     # 꼬리
        rows = []
        for k in range(12):
            t = k / 11
            p = c + side * s * (.006 + .018 * t) - up * tail * t + n * (.004 + .004 * math.sin(t * 5) + lean * t)
            wd = tail_w * (.7 + .5 * t)
            rows.append([tuple(p + side * wd * q) for q in (-1, 0, 1)])
        objs.append(strip(f'{name}_{i + 2}', rows, False, .001))
    # 매듭
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=.0085, location=c + n * .006)
    k = bpy.context.active_object
    k.name = f'{name}_k'
    k.scale = (1, .7, 1.15)
    for p in list(k.users_collection):
        p.objects.unlink(k)
    collection('Outfit').objects.link(k)
    objs.append(k)
    return join(name, objs)


def norigae(name, x, ytop, top=1.062, knot=1.03):
    """매듭(네 잎) + 짧은 끈 + 술. ytop(z)은 그 높이의 천 앞면 y."""
    objs = []

    def ball(p, r, sc=(1, .55, 1)):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=r, location=p)
        k = bpy.context.active_object
        k.name = f'{name}_b{len(objs)}'
        k.scale = sc
        for c in list(k.users_collection):
            c.objects.unlink(k)
        collection('Outfit').objects.link(k)
        objs.append(k)

    def rings(key, prof):
        rows = []
        for z, r in prof:
            y = ytop(z) - .007 - r
            rows.append([(x + r * (1 + .10 * math.sin(10 * a)) * math.cos(a), y + r * (1 + .10 * math.sin(10 * a)) * math.sin(a), z)
                         for a in (2 * math.pi * j / 40 for j in range(40))])
        o = grid_mesh(f'{name}_{key}', rows, True)
        o.data.polygons.foreach_set('use_smooth', [True] * len(o.data.polygons))
        objs.append(o)

    y = ytop(knot) - .011
    for dx, dz in ((.012, 0), (-.012, 0), (0, .012), (0, -.012)):
        ball((x + dx, y, knot + dz), .0095)
    ball((x, y - .004, knot), .0055)
    rings('cord', [(top, .0014), (knot + .02, .0014)])
    rings('cord2', [(knot - .018, .0014), (knot - .03, .0014)])
    ball((x, ytop(knot - .036) - .012, knot - .036), .0058, (1, 1, 1.1))
    z0 = knot - .04
    rings('tassel', [(z0 - .1 * t, .0035 + .0075 * min(t * 5, 1) - .002 * t) for t in [i / 16 for i in range(17)]])
    return join(name, objs)


def join(name, objs):
    """여러 메시를 Solidify까지 적용해 하나로"""
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    bm = bmesh.new()
    for o in objs:
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        me = me.copy()
        me.transform(o.matrix_world)
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
        ev.to_mesh_clear()
    remove(name)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for o in objs:
        if o.name != name:
            bpy.data.objects.remove(o, do_unlink=True)
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    me.update()
    o = bpy.data.objects.new(name, me)
    collection('Outfit').objects.link(o)
    return o


def arm_ring(c, ax, r, n=72):
    """팔 둘레 고리: (점, 팔 방향, 바깥)"""
    u = Vector((0, 0, 1)) - ax * ax.z
    u.normalize()
    v = ax.cross(u)
    out = []
    for j in range(n):
        a = 2 * math.pi * j / n
        d = u * math.cos(a) + v * math.sin(a)
        out.append((c + d * r, ax, d))
    return out
