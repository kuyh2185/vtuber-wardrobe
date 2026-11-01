# UV와 옷 그림(아틀라스). 주름 그늘을 메시 실제 모양에서 구워 넣는다. 값은 sRGB 0..1 그대로 쓴다.
import bpy, math, os
import numpy as np

S = 2048
CY = -0.012
#        x0 y0 x1 y1 (픽셀)
RECT = {
    'Skirt': (0, 0, 2048, 620),
    'Ruffle': (0, 1180, 2048, 1400),
    'Sleeve': (0, 1420, 2048, 1760),
    'Jeogori': (0, 1780, 1200, 2048),
}
PINK_T = np.array([.985, .745, .805])
PINK_B = np.array([1.0, .93, .945])
DEEP = np.array([.88, .30, .47])
WHITE = np.array([.995, .985, .985])


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


def petal(img, cx, cy, size, col, alpha=1.0, ax=1.0, rot=0.0):
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
    tint = col * (1 - c[..., None]) + np.array([.95, .55, .45]) * c[..., None]
    img[y0:y1, x0:x1, :3] = img[y0:y1, x0:x1, :3] * (1 - m[..., None]) + tint * m[..., None]


def build(objs):
    rng = np.random.default_rng(5)
    A = np.ones((S, S, 4), np.float32)
    A[..., :3] = PINK_T

    # 치마: 위 분홍 -> 아래 연분홍, 골은 진하게
    sk = objs['Skirt']
    rad = grid_rad(sk, 26, 160)
    x0, y0, x1, y1 = RECT['Skirt']
    h, w = y1 - y0, x1 - x0
    cav = stretch(cavity(rad, 7), h, w)
    v = np.linspace(0, 1, h)[:, None, None]
    col = PINK_T * (1 - v ** .85) + np.array([1, .95, .96]) * v ** .85
    img = np.broadcast_to(col, (h, w, 3)).copy()
    shade = np.clip(cav / .018, -1, 1)[..., None]
    tone = np.array([.88, .62, .72])    # 그늘 색(곱)
    img = img * (1 - np.clip(shade, 0, 1) * (1 - tone) * 1.0) + np.clip(-shade, 0, 1) * .05
    # 밑단 물결 띠 두 줄
    for vv, a, c in ((.905, .55, np.array([.97, .62, .72])), (.95, .55, np.array([.97, .62, .72]))):
        yy = (vv + .010 * np.sin(np.linspace(0, 2 * math.pi * 60, w)))[None, :]
        m = np.exp(-((np.linspace(0, 1, h)[:, None] - yy) / .0045) ** 2) * a
        img = img * (1 - m[..., None]) + c * m[..., None]
    # 밑단 레이스: 흰 물결 끝선
    uu = np.linspace(0, 1, w)[None, :]
    vvv = np.linspace(0, 1, h)[:, None]
    N = 70
    wave = .83 - .022 * np.abs(np.sin(math.pi * N * uu)) ** .7
    lace = np.clip((vvv - wave) / .004, 0, 1)
    img = img * (1 - lace[..., None] * .93) + WHITE * lace[..., None] * .93
    # 벚꽃: 앞쪽 오른편에 몰리게, 뒤는 드물게(저장은 위가 윗줄)
    img4 = np.dstack([img, np.ones((h, w))])
    for _ in range(90):
        u = rng.uniform(0, 1)
        vv = rng.uniform(.36, .76)
        front = max(0, -math.sin(2 * math.pi * u - .4))
        if rng.uniform() > front ** 1.4 * .95 + .08:
            continue
        sz = rng.uniform(13, 27)
        petal(img4, int(u * w), int(vv * h), sz, np.array([.90, .36, .52]), rng.uniform(.75, 1), ax=.6, rot=rng.uniform(0, 6))
    for k in range(N):       # 레이스 안 작은 꽃
        petal(img4, int((k + .5) / N * w), int(.885 * h), 7, np.array([.95, .70, .78]), .9, ax=.6, rot=k)
    A[y0:y1, x0:x1, :3] = img4[..., :3]

    # 프릴: 흰색 + 골 그늘
    rf = objs['Ruffle']
    rows = len(rf.data.vertices) // 210
    rad = grid_rad(rf, rows, 210)
    x0, y0, x1, y1 = RECT['Ruffle']
    h, w = y1 - y0, x1 - x0
    cav = stretch(cavity(rad, 5), h, w)
    shade = np.clip(cav / .012, 0, 1)[..., None]
    A[y0:y1, x0:x1, :3] = WHITE * (1 - shade) + np.array([.90, .78, .84]) * shade
    A[y0:y1, x0:x1, 3] = 1

    # 소매: 비침, 골은 천이 겹쳐 덜 비침
    sl = objs['SleeveL']
    ARM_A, ARM_B = np.array([.165, .002, 1.2615]), np.array([.505, -.014, 1.262])
    d = (ARM_B - ARM_A) / np.linalg.norm(ARM_B - ARM_A)
    rad = grid_rad(sl, 46, 84, (ARM_A, d))
    x0, y0, x1, y1 = RECT['Sleeve']
    h, w = y1 - y0, x1 - x0
    cav = stretch(cavity(rad, 6), h, w)
    v = np.linspace(0, 1, h)[:, None]
    c = np.clip(cav / .016, -1, 1)
    al = .70 + .20 * np.abs(c) + .06 * v ** 3   # 어두운 배경에서 회색이 되지 않을 만큼
    A[y0:y1, x0:x1, :3] = np.array([1, .95, .96]) * (1 - .14 * np.clip(c, 0, 1)[..., None])
    A[y0:y1, x0:x1, 3] = np.clip(al, 0, .96)

    # 저고리
    x0, y0, x1, y1 = RECT['Jeogori']
    h, w = y1 - y0, x1 - x0
    yy, xx = np.mgrid[0:h, 0:w]
    a = xx / w * 2 * math.pi
    z = 1.14 + (yy / (h - 1)) * (1.345 - 1.14)
    front = np.clip(-np.sin(a), 0, 1)
    hem = 1.172 - .022 * front ** 3 + .006 * np.cos(6 * a) * front
    img = np.broadcast_to(np.array([.985, .745, .805]), (h, w, 3)).copy()
    # 가슴 밑 그늘과 옆 다트
    sh = np.exp(-((z - 1.205) / .022) ** 2) * front ** 2 * .13
    sh += np.exp(-((np.abs(np.cos(a)) - .62) / .05) ** 2) * np.clip((1.24 - z) / .08, 0, 1) * .10 * front
    img = img * (1 - sh[..., None]) * np.array([1, .98, .99])
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
        petal(img4, int(an / 6.283 * w), int((zz - 1.14) / .205 * h), rng.uniform(4, 7), WHITE, .9, ax=.9, rot=rng.uniform(0, 6))
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
    uv_grid(objs['Ruffle'], len(objs['Ruffle'].data.vertices) // 210, 210, 'Ruffle')
    uv_grid(objs['SleeveL'], 46, 84, 'Sleeve')
    uv_grid(objs['SleeveR'], 46, 84, 'Sleeve')
    uv_cyl(objs['Jeogori'], 'Jeogori', 1.14, 1.345)
    img = build(objs)
    op = textured('ClothTex', img)
    sh = textured('SheerTex', img)
    for n in ('Skirt', 'Ruffle', 'Jeogori'):
        objs[n].data.materials.clear()
        objs[n].data.materials.append(op)
    for n in ('SleeveL', 'SleeveR'):
        objs[n].data.materials.clear()
        objs[n].data.materials.append(sh)
    return img
