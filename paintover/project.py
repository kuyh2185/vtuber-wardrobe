# AI가 칠한 앞·옆·뒤 그림을 그 자세의 메시에 되돌려 씌워 아틀라스로 굽는다.
# python paintover/project.py out/v4  (views/ mesh.json·렌더, ai/ front·side·back.jpg -> baked/ cloth·small.png)
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ni

ROOT = sys.argv[1] if len(sys.argv) > 1 else 'out/v4'
S = 2048
CLOTH = ('Veil', 'Ruffle', 'Jeogori', 'SleeveL')    # 치마는 주름 진 Skirt가 아니라 그걸 덮는 매끈한 Veil에 칠한다
SMALL = ('Base', 'Sash', 'Cord', 'Collar', 'CapL', 'CapR', 'CuffL', 'CuffR', 'CuffFrillL', 'CuffFrillR', 'BowNeck', 'BowWaist', 'Norigae')
# paint.py RECT의 칸. Blender는 아래가 0행이라 PNG 행으로 뒤집어 칸마다 따로 메운다
RECTS = [(S - y1, S - y0) for y0, y1 in ((640, 1160), (1180, 1400), (1420, 1760), (1780, 2048))]
VIEWS = {'front': 0, 'side': 90, 'back': 180}
BG = np.array([0x25, 0x22, 0x2e], float)


def load():
    d = json.load(open(f'{ROOT}/views/mesh.json'))
    out = {}
    for m in d['meshes']:
        if not m.get('index'):
            continue
        out[m['name']] = (np.array(m['pos'], np.float32).reshape(-1, 3), np.array(m['uv'], np.float32).reshape(-1, 2),
                          np.array(m['index'], np.int32).reshape(-1, 3))
    return d['frame'], out


def normals(p, t):
    n = np.zeros_like(p)
    f = np.cross(p[t[:, 1]] - p[t[:, 0]], p[t[:, 2]] - p[t[:, 0]])
    for i in range(3):
        np.add.at(n, t[:, i], f)
    return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)


def raster(xy, tri, w, h, attr, write, grow=0.):
    """삼각형마다 픽셀 중심의 무게중심 좌표를 구해 write(y, x, 보간값)을 부른다"""
    a, b, c = xy[tri[:, 0]], xy[tri[:, 1]], xy[tri[:, 2]]
    x0 = np.floor(np.minimum(np.minimum(a[:, 0], b[:, 0]), c[:, 0]) - grow).astype(int).clip(0, w - 1)
    x1 = np.ceil(np.maximum(np.maximum(a[:, 0], b[:, 0]), c[:, 0]) + grow).astype(int).clip(0, w - 1)
    y0 = np.floor(np.minimum(np.minimum(a[:, 1], b[:, 1]), c[:, 1]) - grow).astype(int).clip(0, h - 1)
    y1 = np.ceil(np.maximum(np.maximum(a[:, 1], b[:, 1]), c[:, 1]) + grow).astype(int).clip(0, h - 1)
    den = (b[:, 1] - c[:, 1]) * (a[:, 0] - c[:, 0]) + (c[:, 0] - b[:, 0]) * (a[:, 1] - c[:, 1])
    for i in np.nonzero(np.abs(den) > 1e-9)[0]:
        yy, xx = np.mgrid[y0[i]:y1[i] + 1, x0[i]:x1[i] + 1]
        px, py = xx + .5 - c[i, 0], yy + .5 - c[i, 1]
        l0 = ((b[i, 1] - c[i, 1]) * px + (c[i, 0] - b[i, 0]) * py) / den[i]
        l1 = ((c[i, 1] - a[i, 1]) * px + (a[i, 0] - c[i, 0]) * py) / den[i]
        l2 = 1 - l0 - l1
        m = (l0 >= -grow) & (l1 >= -grow) & (l2 >= -grow)
        if m.any():
            t = tri[i]
            v = attr[t[0]] * l0[m, None] + attr[t[1]] * l1[m, None] + attr[t[2]] * l2[m, None]
            write(yy[m], xx[m], v)


class View:
    def __init__(self, name, yaw, frame):
        s, c = np.sin(np.radians(yaw)), np.cos(np.radians(yaw))
        self.name, self.d, self.r = name, np.array([s, 0, c]), np.array([c, 0, -s])
        self.w, self.h, self.k, self.cz = frame['w'], frame['h'], frame['h'] / frame['ortho'], frame['cz']

    def screen(self, p):
        return np.stack([self.w / 2 + p @ self.r * self.k, self.h / 2 - (p[..., 1] - self.cz) * self.k], -1)

    def zbuffer(self, meshes):
        z = np.full((self.h, self.w), -9.)

        def wr(y, x, v):
            z[y, x] = np.maximum(z[y, x], v[:, 0])
        for n, (p, uv, t) in meshes.items():
            if n != 'Skirt':
                raster(self.screen(p), t, self.w, self.h, (p @ self.d)[:, None], wr)
        self.z = z
        b = np.zeros_like(z, bool)

        def wb(y, x, v):
            b[y, x] |= (v[:, 0] < 1.02) & (v[:, 1] >= z[y, x] - .002)         # 허리 아래 보이는 맨살(손·다리)
        p, uv, t = meshes['Bodybaked']
        raster(self.screen(p), t, self.w, self.h, np.stack([p[:, 1], p @ self.d], 1), wb)
        self.skin = ni.binary_dilation(b, iterations=9)


def fit(ai, ren, z):
    """AI 그림을 렌더 틀에 맞출 배율·이동을 윤곽 겹침으로 찾는다"""
    h, w = z.shape
    want = z > -9
    best = (0,)
    ai0 = np.asarray(ai, float)
    fg0 = np.abs(ai0 - BG).sum(2) > 36
    fg0[int(fg0.shape[0] * .85):, int(fg0.shape[1] * .75):] = False      # 구석 반짝이 표시
    im = Image.fromarray(fg0.astype(np.uint8) * 255)
    for sx in np.arange(.97, 1.031, .006):
        for sy in np.arange(.97, 1.031, .006):
            ww, hh = int(w * sx), int(h * sy)
            a = np.asarray(im.resize((ww, hh), Image.BILINEAR)) > 127
            for dx in range(-12, 13, 3):
                for dy in range(-12, 13, 3):
                    ox, oy = (w - ww) // 2 + dx, (h - hh) // 2 + dy
                    can = np.zeros((h, w), bool)
                    y0, x0, y1, x1 = max(oy, 0), max(ox, 0), min(oy + hh, h), min(ox + ww, w)
                    can[y0:y1, x0:x1] = a[y0 - oy:y1 - oy, x0 - ox:x1 - ox]
                    iou = (can & want).sum() / max((can | want).sum(), 1)
                    if iou > best[0]:
                        best = (iou, sx, sy, ox, oy)
    print('fit', [round(float(v), 4) for v in best])
    iou, sx, sy, ox, oy = best
    out = np.tile(BG, (h, w, 1))
    ww, hh = int(w * sx), int(h * sy)
    a = np.asarray(ai.resize((ww, hh), Image.LANCZOS), float)
    y0, x0, y1, x1 = max(oy, 0), max(ox, 0), min(oy + hh, h), min(ox + ww, w)
    out[y0:y1, x0:x1] = a[y0 - oy:y1 - oy, x0 - ox:x1 - ox]
    return out


def blur_in(a, m, sig):
    """m 안에서만 흐린다: 다른 조각 값이 섞이지 않게"""
    w = ni.gaussian_filter(m.astype(np.float32), sig)
    return np.stack([ni.gaussian_filter(a[..., i] * m, sig) for i in range(a.shape[2])], 2) / np.maximum(w, 1e-4)[..., None]


def sample(img, xy):
    return np.stack([ni.map_coordinates(img[..., c], [xy[:, 1] - .5, xy[:, 0] - .5], order=1, mode='nearest') for c in range(3)], 1)


def fill(c, m):
    """푸시-풀로 빈칸을 주변 색으로 메운다"""
    levels = [(c * m[..., None], m.astype(np.float32))]
    while min(levels[-1][1].shape) > 2:
        a, b = levels[-1]
        hh, ww = b.shape[0] // 2 * 2, b.shape[1] // 2 * 2
        a, b = a[:hh, :ww], b[:hh, :ww]
        a2 = (a[::2, ::2] + a[1::2, ::2] + a[::2, 1::2] + a[1::2, 1::2]) / 4
        b2 = (b[::2, ::2] + b[1::2, ::2] + b[::2, 1::2] + b[1::2, 1::2]) / 4
        levels.append((a2, b2))
    a, b = levels[-1]
    f = a.sum((0, 1)) / max(b.sum(), 1e-6) * np.ones_like(a)
    for a, b in reversed(levels[:-1]):
        f = np.repeat(np.repeat(f, 2, 0), 2, 1)
        f = np.pad(f, ((0, b.shape[0] - f.shape[0]), (0, b.shape[1] - f.shape[1]), (0, 0)), mode='edge')
        f = a + f * (1 - b[..., None])
    return np.where(m[..., None], c, ni.gaussian_filter(f, (5, 5, 0)))      # 빈칸은 뭉개서 칸무늬가 안 보이게


def bake(names, meshes, views, imgs):
    col = np.zeros((S, S, 3), np.float32)
    wt = np.zeros((S, S), np.float32)
    used = np.zeros((S, S), bool)
    for n in names:
        p, uv, t = meshes[n]
        nr = normals(p, t)
        pos = np.zeros((S, S, 3), np.float32)
        nor = np.zeros((S, S, 3), np.float32)
        mask = np.zeros((S, S), bool)
        attr = np.concatenate([p, nr], 1)

        def wr(y, x, v):
            pos[y, x], nor[y, x], mask[y, x] = v[:, :3], v[:, 3:], True
        raster(uv * S, t, S, S, attr, wr, .02)
        # 사진 고르기는 주름 하나하나가 아니라 큰 덩어리 방향으로: 주름 면마다 다른 사진이 끼면 줄무늬가 진다
        soft = blur_in(nor, mask, 24) if n in CLOTH else nor
        ys, xs = np.nonzero(mask)
        P, N = pos[ys, xs], soft[ys, xs]
        N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-9)
        best = np.zeros(len(ys), np.float32)
        c = np.zeros((len(ys), 3), np.float32)
        tot = np.zeros(len(ys), np.float32)
        for v, mir in views:
            if v.name == 'side' and n.startswith('Cuff'):
                continue     # 옆 그림만 커프스 색이 달라서 앞·뒤 색으로 통일
            Q, M = P.copy(), N.copy()
            if mir:      # 반대쪽 옆은 같은 그림을 좌우로 뒤집어 쓴다. 앞·뒤는 서로 빈칸 메우기용(mir=2)
                Q[:, 0 if mir == 1 else 2] *= -1
                M[:, 0 if mir == 1 else 2] *= -1
            half = (Q[:, 0] > 0) if v.name == 'side' else True
            s = v.screen(Q)
            ix, iy = s[:, 0].astype(int).clip(0, v.w - 1), s[:, 1].astype(int).clip(0, v.h - 1)
            vis = (Q @ v.d >= v.top[iy, ix] - .03) & v.fg[iy, ix] & ~v.skin[iy, ix] & half      # 주름 깊이만큼은 봐준다
            w = (np.abs(M @ v.d) ** 4) * vis * (.004 if mir == 2 else 1.25 if v.name == 'front' else 1)
            c += sample(imgs[v.name], s) * w[:, None]
            tot += w
        got = tot > 1e-3
        col[ys[got], xs[got]] = c[got] / tot[got, None]
        wt[ys[got], xs[got]] = 1
        used |= mask
        print(n, len(ys), 'covered', round(float(got.mean()), 3))
    return col, wt


def main():
    frame, meshes = load()
    views = [View(k, y, frame) for k, y in VIEWS.items()]
    imgs = {}
    for v in views:
        cache = f'{ROOT}/views/z-{v.name}.npy'
        if os.path.exists(cache):
            v.z = np.load(cache)
            v.skin = np.load(cache + '.skin.npy')
        else:
            v.zbuffer(meshes)
            np.save(cache, v.z)
            np.save(cache + '.skin.npy', v.skin)
        v.top = ni.maximum_filter(v.z, 5)            # 가림 경계 2칸은 안 믿는다
        ai = Image.open(f'{ROOT}/ai/{v.name}.jpg').convert('RGB')
        imgs[v.name] = fit(ai, None, v.z)
        # 렌더와 AI 그림 양쪽 다 옷인 곳만: 윤곽이 몇 칸 어긋나도 배경이 묻지 않게
        v.fg = ni.binary_erosion((v.z > -9) & (np.abs(imgs[v.name] - BG).sum(2) > 60), iterations=3)
        Image.fromarray(imgs[v.name].astype(np.uint8)).save(f'{ROOT}/views/fit-{v.name}.png')
    side = next(v for v in views if v.name == 'side')
    vs = [(v, 0) for v in views] + [(side, 1)] + [(v, 2) for v in views if v is not side]
    os.makedirs(f'{ROOT}/baked', exist_ok=True)
    col, wt = bake(CLOTH, meshes, vs, imgs)
    for y0, y1 in RECTS:
        col[y0:y1] = fill(col[y0:y1], wt[y0:y1] > 0)
    Image.fromarray(np.dstack([col.clip(0, 255), np.full((S, S), 255.)]).astype(np.uint8)).save(f'{ROOT}/baked/cloth.png')
    col, wt = bake(SMALL, meshes, vs, imgs)
    # 작은 부품은 조각이 많아 조각 밖으로 번지지 않게 빈칸만 메운다
    col = fill(col, wt > 0)
    Image.fromarray(np.dstack([col.clip(0, 255), np.full((S, S), 255.)]).astype(np.uint8)).save(f'{ROOT}/baked/small.png')


main()
