# UV와 옷 그림(아틀라스). 주름 그늘을 메시 실제 모양에서 구워 넣는다. 값은 sRGB 0..1 그대로 쓴다.
import bpy, math, os
import numpy as np

S = 2048
CY = -0.012
#        x0 y0 x1 y1 (픽셀)
RECT = {
    'Skirt': (0, 0, 2048, 620),
    'Veil': (0, 640, 2048, 1160),
    'Ruffle': (0, 1180, 2048, 1400),
    'Sleeve': (0, 1420, 2048, 1760),
    'Jeogori': (0, 1780, 1200, 2048),
}
PINK_T = np.array([.985, .745, .805])
PINK_B = np.array([1.0, .93, .945])
DEEP = np.array([.88, .30, .47])
WHITE = np.array([.995, .985, .985])
LILAC = np.array([.80, .77, .87])       # 흰 천의 그늘
INK = np.array([.46, .33, .47])         # 잉크선: 검정이 아니라 보랏빛 회색


def uv_grid(o, rows, cols, rect, closed=True):
    me = o.data
    uv = me.uv_layers.get('UVMap') or me.uv_layers.new(name='UVMap')
    x0, y0, x1, y1 = RECT[rect]
    for p in me.polygons:
        vs = [p.vertices[i] for i in range(len(p.vertices))]
        cs = [v % cols for v in vs]
        wrap = closed and max(cs) == cols - 1 and min(cs) == 0
        for li, v in zip(p.loop_indices, vs):
            r, c = v // cols, v % cols
            if wrap and c == 0:
                c = cols
            uv.data[li].uv = ((x0 + (x1 - x0) * c / cols) / S, (y0 + (y1 - y0) * r / (rows - 1)) / S)


def uv_cyl(o, rect, z0, z1):
    """저고리: 원기둥 펼침"""
    me = o.data
    uv = me.uv_layers.get('UVMap') or me.uv_layers.new(name='UVMap')
    x0, y0, x1, y1 = RECT[rect]
    for p in me.polygons:
        ang = []
        for v in p.vertices:
            c = me.vertices[v].co
            ang.append(math.atan2(c.y - CY, c.x) % (2 * math.pi))
        wrap = max(ang) - min(ang) > math.pi
        for li, v, a in zip(p.loop_indices, p.vertices, ang):
            c = me.vertices[v].co
            if wrap and a < math.pi:
                a += 2 * math.pi
            uv.data[li].uv = ((x0 + (x1 - x0) * a / (2 * math.pi)) / S, (y0 + (y1 - y0) * (c.z - z0) / (z1 - z0)) / S)


def cavity(rad, win):
    """줄마다 반지름에서 주름 골(+)과 마루(-)를 뽑는다. rad[row][col]"""
    k = np.ones(2 * win + 1) / (2 * win + 1)
    out = np.zeros_like(rad)
    for i, r in enumerate(rad):
        rr = np.concatenate([r[-win:], r, r[:win]])
        out[i] = np.convolve(rr, k, 'valid') - r
    return out


def sstep(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def blur_x(a, k):
    """가로 고리 평균(창 2k+1)"""
    c = np.cumsum(np.concatenate([np.zeros((len(a), 1)), a[:, -k:], a, a[:, :k]], 1), 1)
    return (c[:, 2 * k + 1:] - c[:, :-(2 * k + 1)]) / (2 * k + 1)


def fold_marks(cav, k):
    """주름 골 세기(0~1 근처)와 골 한가운데를 잇는 잉크선을 돌려준다"""
    c = blur_x(cav, k)
    t = c / max(np.percentile(c, 96), 1e-6)
    g = np.gradient(c, axis=1)
    bend = np.gradient(g, axis=1)
    line = np.exp(-(g / (.11 * np.percentile(np.abs(g), 92))) ** 2) * (bend < 0) * sstep(t, .3, .55)
    return t, line


def cel(img, t, tone1, a=.26, b=.62, soft=.035):
    """부드러운 번짐 대신 경계가 있는 두 단 그늘. 첫 단을 칠하고 둘째 단 마스크를 돌려준다"""
    s1, s2 = sstep(t, a, a + soft)[..., None], sstep(t, b, b + soft)[..., None]
    return img * (1 - s1) + tone1 * s1, s2


def stretch(a, h, w):
    """a[rows][cols] -> [h][w] 쌍선형, 열은 고리로 이어짐"""
    rows, cols = a.shape
    a2 = np.concatenate([a, a[:, :1]], 1)
    yi = np.linspace(0, rows - 1, h)
    xi = np.linspace(0, cols, w, endpoint=False)
    y0 = np.floor(yi).astype(int).clip(0, rows - 2)
    x0 = np.floor(xi).astype(int).clip(0, cols - 1)
    fy, fx = (yi - y0)[:, None], (xi - x0)[None, :]
    return (a2[y0][:, x0] * (1 - fx) + a2[y0][:, x0 + 1] * fx) * (1 - fy) + (a2[y0 + 1][:, x0] * (1 - fx) + a2[y0 + 1][:, x0 + 1] * fx) * fy


def grid_rad(o, rows, cols, axis=None):
    co = np.empty(len(o.data.vertices) * 3)
    o.data.vertices.foreach_get('co', co)
    co = co.reshape(rows, cols, 3)
    if axis is None:
        return np.hypot(co[..., 0], co[..., 1] - CY)
    a, d = axis
    p = co - a
    p = p - (p @ d)[..., None] * d
    return np.linalg.norm(p, axis=2)


def petal(img, cx, cy, size, col, alpha=1.0, ax=1.0, rot=0.0, core=(.95, .55, .45)):
    """벚꽃 한 송이. ax: 가로 픽셀 배율(천마다 축척이 달라서)"""
    h, w = img.shape[:2]
    rx, ry = int(size * ax * 1.15) + 2, int(size * 1.15) + 2
    y0, y1, x0, x1 = max(cy - ry, 0), min(cy + ry, h), max(cx - rx, 0), min(cx + rx, w)
    if y1 <= y0 or x1 <= x0:
        return
    yy, xx = np.mgrid[y0:y1, x0:x1]
    dx, dy = (xx - cx) / ax, yy - cy
    r = np.hypot(dx, dy) / size
    th = np.arctan2(dy, dx) + rot
    p = .62 + .38 * np.abs(np.cos(2.5 * th)) ** .5 - .10 * np.abs(np.cos(5 * th)) ** 8
    m = np.clip((p - r) * size * .5, 0, 1) * alpha
    c = np.clip((.2 - r) * size * .5, 0, 1)
    tint = col * (1 - c[..., None]) + np.array(core) * c[..., None]
    img[y0:y1, x0:x1, :3] = img[y0:y1, x0:x1, :3] * (1 - m[..., None]) + tint * m[..., None]


def build(objs):
    rng = np.random.default_rng(5)
    A = np.ones((S, S, 4), np.float32)
    A[..., :3] = PINK_T

    # 치마: 위 분홍 -> 아래 흰빛, 골은 두 단 그늘 + 잉크선
    sk = objs['Skirt']
    rad = grid_rad(sk, 26, 160)
    x0, y0, x1, y1 = RECT['Skirt']
    h, w = y1 - y0, x1 - x0
    t, line = fold_marks(stretch(cavity(rad, 12), h, w), 10)
    v = np.linspace(0, 1, h)[:, None]
    col = PINK_T * (1 - v[..., None] ** .85) + np.array([.98, .92, .95]) * v[..., None] ** .85
    img = np.broadcast_to(col, (h, w, 3)).copy()
    # 그늘은 허리에서 뾰족하게 시작해 밑으로 넓어진다
    t2 = t - .75 * (1 - v) ** 3
    img, s2 = cel(img, t2, img * np.array([.95, .80, .86]))
    img = img * (1 - s2) + img * np.array([.93, .79, .87]) * s2
    # 허리띠 밑 그림자
    top = sstep(.05 + .13 * np.clip(t, 0, 1) - v, 0, .012)[..., None]
    img = img * (1 - top) + img * np.array([.86, .68, .78]) * top
    m = (line * sstep(v, .03, .12) * .28)[..., None]
    img = img * (1 - m) + INK * m
    # 벚꽃: 앞쪽 오른편에 몰리게, 뒤는 드물게(저장은 위가 윗줄)
    img4 = np.dstack([img, np.ones((h, w))])
    for _ in range(60):
        u = rng.uniform(0, 1)
        vv = rng.uniform(.22, .62)
        front = max(0, -math.sin(2 * math.pi * u - .4))
        if rng.uniform() > front ** 1.4 * .95 + .05:
            continue
        sz = rng.uniform(11, 22)
        petal(img4, int(u * w), int(vv * h), sz, np.array([.93, .55, .66]), rng.uniform(.65, .9), ax=.6, rot=rng.uniform(0, 6))
    A[y0:y1, x0:x1, :3] = img4[..., :3]

    # 겉천: 위는 거의 투명, 아래로 뿌옇게, 밑단은 꽃 레이스 + 물결 끝선
    x0, y0, x1, y1 = RECT['Veil']
    h, w = y1 - y0, x1 - x0
    uu = np.linspace(0, 1, w)[None, :]
    vv = np.linspace(0, 1, h)[:, None]
    al = .07 + .30 * vv ** 1.7
    col = np.broadcast_to(WHITE, (h, w, 3)).copy()
    # 천이 겹친 자리: 큰 덩어리로 뿌옇고 살짝 라일락
    n = np.sin(2 * math.pi * (5 * uu + .35 * np.sin(5 * vv))) + .6 * np.sin(2 * math.pi * (11 * uu - 1.2 * vv + .3))
    pat = sstep(n, .35, 1.1) * sstep(vv, .22, .5) * (1 - sstep(vv, .6, .68))
    al = al + pat * .09
    col = col * (1 - pat[..., None] * .55) + LILAC * pat[..., None] * .55
    N = 34
    edge = .905 - .040 * np.abs(np.sin(math.pi * N * uu)) ** .55      # 물결 끝선(반원이 아래로)
    upper = .665 + .022 * np.abs(np.cos(math.pi * N * uu)) ** .6       # 레이스 윗선
    band = sstep(vv - upper, 0, .006)
    al = al * (1 - band) + .66 * band
    img4 = np.dstack([col, np.ones((h, w))])
    mask = np.zeros((h, w, 4))
    for k in range(N):      # 레이스 꽃: 라일락 테두리 + 흰 꽃
        for off, sz, vp in ((.5, 17, .775), (0, 10, .705)):
            cx, cy = int((k + off) / N * w) % w, int(vp * h)
            petal(img4, cx, cy, sz, LILAC, 1, ax=.55, rot=k, core=LILAC)
            petal(img4, cx, cy, sz * .74, WHITE, 1, ax=.55, rot=k, core=LILAC)
            petal(mask, cx, cy, sz, np.ones(3), 1, ax=.55, rot=k)
    al = np.maximum(al, mask[..., 0] * .95)
    col = img4[..., :3]
    # 끝선과 윗선은 잉크로
    for ln, wd, st in ((edge - .010, .0024, .55), (edge - .032, .0014, .3), (upper, .0016, .25)):
        m = np.exp(-((vv - ln) / wd) ** 2) * st
        col = col * (1 - m[..., None]) + INK * m[..., None]
        al = np.maximum(al, m)
    # 알파가 완전히 0이면 저장할 때 색이 검게 지워져 가장자리에 검은 점이 생김
    al = np.maximum(al * sstep(edge - vv, 0, .004), .012)
    A[y0:y1, x0:x1, :3] = col
    A[y0:y1, x0:x1, 3] = al

    # 프릴: 흰색 + 라일락 두 단 그늘 + 잉크선
    rf = objs['Ruffle']
    rows = len(rf.data.vertices) // 210
    rad = grid_rad(rf, rows, 210)
    x0, y0, x1, y1 = RECT['Ruffle']
    h, w = y1 - y0, x1 - x0
    t, line = fold_marks(stretch(cavity(rad, 11), h, w), 8)
    v = np.linspace(0, 1, h)[:, None]
    img = np.broadcast_to(WHITE, (h, w, 3)).copy()
    img, s2 = cel(img, t + .3 * (1 - v) ** 2, WHITE * .62 + LILAC * .38, .46, .88)
    img = img * (1 - s2) + LILAC * s2
    m = np.clip(line * .25 + np.exp(-((v - .985) / .012) ** 2) * .55, 0, 1)[..., None]
    A[y0:y1, x0:x1, :3] = img * (1 - m) + INK * m
    A[y0:y1, x0:x1, 3] = 1

    # 소매: 비침, 골은 천이 겹쳐 덜 비침
    sl = objs['SleeveL']
    ARM_A, ARM_B = np.array([.150, .002, 1.2615]), np.array([.505, -.014, 1.262])
    d = (ARM_B - ARM_A) / np.linalg.norm(ARM_B - ARM_A)
    rad = grid_rad(sl, 46, 84, (ARM_A, d))
    x0, y0, x1, y1 = RECT['Sleeve']
    h, w = y1 - y0, x1 - x0
    t, line = fold_marks(stretch(cavity(rad, 6), h, w), 24)
    v = np.linspace(0, 1, h)[:, None]
    img = np.broadcast_to(np.array([1, .975, .985]), (h, w, 3)).copy()
    img, s2 = cel(img, t, WHITE * .65 + LILAC * .35, .38, .8, .12)
    img = img * (1 - s2) + (WHITE * .35 + LILAC * .65) * s2
    al = .74 + .14 * sstep(t, .38, .5) + .06 * v ** 3
    img4 = np.dstack([img, np.ones((h, w))])
    for _ in range(40):        # 소매 자수: 위팔에 드물게
        petal(img4, int(rng.integers(0, w)), int(rng.uniform(.12, .55) * h), rng.uniform(7, 12), np.array([.96, .80, .87]), .8, ax=1.6, rot=rng.uniform(0, 6))
    A[y0:y1, x0:x1, :3] = img4[..., :3]
    A[y0:y1, x0:x1, 3] = np.clip(al, 0, .97)

    # 저고리
    x0, y0, x1, y1 = RECT['Jeogori']
    h, w = y1 - y0, x1 - x0
    yy, xx = np.mgrid[0:h, 0:w]
    a = xx / w * 2 * math.pi
    z = 1.10 + (yy / (h - 1)) * (1.345 - 1.10)
    front = np.clip(-np.sin(a), 0, 1)
    hem = 1.138 - .022 * front ** 3 + .006 * np.cos(6 * a) * front
    img = np.broadcast_to(np.array([.985, .745, .805]), (h, w, 3)).copy()
    # 가슴 밑 그늘과 옆 다트
    sh = np.zeros((h, w))
    for ac in (4.71 - .52, 4.71 + .52):      # 가슴 밑 초승달 그늘(경계 있게)
        d2 = ((a - ac) / .43) ** 2 + ((z - 1.262) / .062) ** 2
        sh = np.maximum(sh, sstep(d2, .92, 1.0) * (1 - sstep(d2, 1.16, 1.34)) * sstep(1.226 - z, 0, .01))
    sh = np.maximum(sh, sstep(np.abs(a - 4.71) - 1.28, 0, .02) * .8)      # 옆구리
    sh = np.maximum(sh, sstep(1.158 - z, 0, .004) * front)                 # 도련 위
    img = img * (1 - sh[..., None]) + img * np.array([.95, .82, .87]) * sh[..., None]
    # 도련 띠
    m = np.clip(1 - np.abs(z - (hem + .0065)) / .0028, 0, 1)
    m2 = np.clip(1 - np.abs(z - (hem + .0135)) / .0011, 0, 1) * .85
    img = img * (1 - m[..., None]) + DEEP * m[..., None]
    img = img * (1 - m2[..., None]) + WHITE * m2[..., None]
    img4 = np.dstack([img, np.ones((h, w))])
    for _ in range(26):        # 가슴 자수
        an = rng.uniform(4.75, 5.55)
        zz = rng.uniform(1.19, 1.30)
        if abs(zz - 1.245 - (an - 5.15) * .1) > .05:
            continue
        petal(img4, int(an / 6.283 * w), int((zz - 1.10) / .245 * h), rng.uniform(4, 7), WHITE, .9, ax=.9, rot=rng.uniform(0, 6))
    A[y0:y1, x0:x1, :3] = img4[..., :3]
    A[y0:y1, x0:x1, 3] = 1

    img = bpy.data.images.get('outfit_atlas') or bpy.data.images.new('outfit_atlas', S, S, alpha=True)
    img.pixels.foreach_set(A.ravel())
    img.update()
    path = os.path.expanduser('~/vtuber-wardrobe/out/outfit_atlas.png')
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    img.pack()
    print('atlas saved')
    return img


def textured(name, img, base_rgba=(1, 1, 1, 1)):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    t = next((n for n in nt.nodes if n.type == 'TEX_IMAGE'), None) or nt.nodes.new('ShaderNodeTexImage')
    t.image = img
    nt.links.new(t.outputs['Color'], p.inputs['Base Color'])
    nt.links.new(t.outputs['Alpha'], p.inputs['Alpha'])
    m.diffuse_color = base_rgba
    return m


def run():
    objs = bpy.data.objects
    uv_grid(objs['Skirt'], 26, 160, 'Skirt')
    uv_grid(objs['Veil'], 29, 160, 'Veil')
    uv_grid(objs['Ruffle'], len(objs['Ruffle'].data.vertices) // 210, 210, 'Ruffle')
    uv_grid(objs['SleeveL'], 46, 84, 'Sleeve')
    uv_grid(objs['SleeveR'], 46, 84, 'Sleeve')
    uv_cyl(objs['Jeogori'], 'Jeogori', 1.10, 1.345)
    img = build(objs)
    op = textured('ClothTex', img)
    sh = textured('SheerTex', img)
    for n in ('Skirt', 'Ruffle', 'Jeogori'):
        objs[n].data.materials.clear()
        objs[n].data.materials.append(op)
    for n in ('SleeveL', 'SleeveR', 'Veil'):
        objs[n].data.materials.clear()
        objs[n].data.materials.append(sh)
    return img
