// 옷을 파일에서 가져오지 않고 그 캐릭터의 몸 지도 위에서 바로 만든다.
// 치수는 모두 몸 기준 좌표(t: 무릎 1, 골반 2, 척추 3, 가슴 4, 목 5)라서 체형이 달라도 같은 옷이 나온다.
import * as THREE from 'three';
import { torsoPoint, limbPoint, torsoParam } from './body.js';
import { SIZE } from './tex.js';

export const TAU = Math.PI * 2;
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// ---- 몸을 감싸는 매끈한 면 ----
function hull(pts) { // 천은 가슴 사이 같은 오목한 곳으로 안 들어간다
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = list => { const h = []; for (const q of list) { while (h.length > 1 && cross(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop(); h.push(q); } h.pop(); return h; };
  return [...half(p), ...half(p.reverse())];
}
function rayHull(h, a) {
  const dx = Math.sin(a), dy = Math.cos(a); let best = 0;
  for (let i = 0; i < h.length; i++) {
    const [x0, y0] = h[i], [x1, y1] = h[(i + 1) % h.length], ex = x1 - x0, ey = y1 - y0;
    const d = dx * ey - dy * ex;
    if (Math.abs(d) < 1e-9) continue;
    const s = (x0 * ey - y0 * ex) / d, w = (x0 * dy - y0 * dx) / d;
    if (s > 0 && w >= -1e-6 && w <= 1 + 1e-6 && s > best) best = s;
  }
  return best;
}
const ring = (get, t, na) => {
  const pts = [];
  for (let j = 0; j < na; j++) { const a = j / na * TAU - Math.PI, r = get(t, a); pts.push([Math.sin(a) * r, Math.cos(a) * r]); }
  return hull(pts);
};

export function envelope(av) {
  if (av.env) return av.env;
  const M = av.maps.T, T0 = .4, T1 = 5.6, dt = .0125, rows = Math.ceil((T1 - T0) / dt) + 1, na = 96;
  const g = new Float32Array(rows * na);
  for (let i = 0; i < rows; i++) {
    const h = ring((t, a) => M.get(t, a), T0 + i * dt, 64);
    for (let j = 0; j < na; j++) g[i * na + j] = rayHull(h, j / na * TAU - Math.PI);
  }
  const raw = g.slice();
  for (let pass = 0; pass < 4; pass++) {
    const c = g.slice();
    for (let i = 1; i < rows - 1; i++) for (let j = 0; j < na; j++)
      g[i * na + j] = (c[(i - 1) * na + j] + 2 * c[i * na + j] + c[(i + 1) * na + j]) / 4;
  }
  for (let i = 0; i < g.length; i++) g[i] = Math.max(g[i], raw[i]); // 다듬으면 어깨 모서리가 깎여 몸 속으로 들어간다
  const r = (t, a) => {
    const x = clamp((t - T0) / dt, 0, rows - 1.001), y = (((a + Math.PI) / TAU * na) % na + na) % na;
    const i = Math.floor(x), j = Math.floor(y) % na, u = x - i, v = y - Math.floor(y), j2 = (j + 1) % na;
    return (g[i * na + j] * (1 - v) + g[i * na + j2] * v) * (1 - u) + (g[(i + 1) * na + j] * (1 - v) + g[(i + 1) * na + j2] * v) * u;
  };
  const girth = t => { let s = 0; for (let j = 0; j < 24; j++) s += r(t, j / 24 * TAU - Math.PI); return s; };
  const scan = (a, b, sign) => { let bt = a, bv = -Infinity; for (let t = a; t <= b; t += .02) { const v = sign * girth(t); if (v > bv) { bv = v; bt = t; } } return bt; };
  const tOfY = y => torsoParam(av.fr, V(0, y, 0)).t;
  av.env = { r, tw: scan(2.8, 4, -1), th: scan(2, 2.9, 1), tb: scan(3.8, 4.7, 1), ts: tOfY(av.bone('leftUpperArm').y) };
  return av.env;
}

// ---- 옷 조각 모으기 ----
export class Outfit {
  constructor(av) {
    this.av = av; this.pos = []; this.nor = []; this.uv = []; this.idx = [];
    this.keep = []; // 정점마다 어떤 몸 정점을 볼지
    this.link = []; // 안쪽 면은 바깥 정점과 같은 가중치
    this.custom = new Map();
    this.painters = []; this.chains = [];
    this.cur = { x: 8, y: 8, h: 0 };
    this.lining = null;
  }
  rect(w, h, paint) { // 그림판 칸 잡기
    const c = this.cur;
    if (c.x + w + 8 > SIZE) { c.x = 8; c.y += c.h + 8; c.h = 0; }
    const r = { x: c.x, y: c.y, w, h };
    c.x += w + 8; c.h = Math.max(c.h, h);
    if (r.y + h > SIZE) throw new Error('그림판 칸 부족');
    if (paint) this.painters.push(g => paint(g, r));
    return r;
  }
  push(p, n, u, v, keep) {
    const i = this.pos.length / 3;
    this.pos.push(p.x, p.y, p.z); this.nor.push(n.x, n.y, n.z); this.uv.push(u / SIZE, 1 - v / SIZE);
    this.keep[i] = keep;
    return i;
  }
}

// 바깥 면 + 옷단 두께 + 안감. 이게 있어야 소매·치마 끝이 종이처럼 안 보인다.
export function shell(O, { nu, nv, closed, th = .002, rect, f, keep, skin, inner = true }) {
  const W = nu + 1, H = nv + 1, P = new Array(W * H), hint = new Array(W * H), N = new Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const [p, h] = f(i / nu, j / nv);
    P[j * W + i] = p; hint[j * W + i] = h;
  }
  const at = (i, j) => P[clamp(j, 0, H - 1) * W + (closed ? (i + nu) % nu : clamp(i, 0, nu))];
  let sum = 0;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const du = at(i + 1, j).clone().sub(at(i - 1, j)), dv = at(i, j + 1).clone().sub(at(i, j - 1));
    const n = du.cross(dv).normalize();
    if (!Number.isFinite(n.x) || n.lengthSq() < .5) n.copy(hint[j * W + i]).normalize();
    N[j * W + i] = n; sum += n.dot(hint[j * W + i]);
  }
  const flip = sum < 0;
  if (flip) N.forEach(n => n.negate());
  const base = [];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i, v = O.push(P[k], N[k], rect.x + rect.w * i / nu, rect.y + rect.h * j / nv, keep);
    base[k] = v;
    if (skin) O.custom.set(v, skin(i / nu, j / nv));
  }
  const quad = (a, b, c, d, rev) => { if (rev) O.idx.push(a, c, b, b, c, d); else O.idx.push(a, b, c, b, d, c); };
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) quad(base[j * W + i], base[j * W + i + 1], base[(j + 1) * W + i], base[(j + 1) * W + i + 1], flip);
  if (!inner) return base;
  const lin = O.lining, uvx = lin.x + lin.w / 2, uvy = lin.y + lin.h / 2, ins = [];
  for (let k = 0; k < W * H; k++) {
    const v = O.push(P[k].clone().addScaledVector(N[k], -th), N[k].clone().negate(), uvx, uvy, keep);
    ins[k] = v; O.link[v] = base[k];
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) quad(ins[j * W + i], ins[j * W + i + 1], ins[(j + 1) * W + i], ins[(j + 1) * W + i + 1], !flip);
  const lip = (a, b) => { // 옷단: 끝선 색을 그대로 쓰는 좁은 띠
    const o = O.push(P[a], N[a], rect.x + rect.w * (a % W) / nu, rect.y + rect.h * Math.floor(a / W) / nv, keep);
    const q = O.push(P[b], N[b], rect.x + rect.w * (b % W) / nu, rect.y + rect.h * Math.floor(b / W) / nv, keep);
    const o2 = O.push(P[a].clone().addScaledVector(N[a], -th), N[a], rect.x + rect.w * (a % W) / nu, rect.y + rect.h * Math.floor(a / W) / nv, keep);
    const q2 = O.push(P[b].clone().addScaledVector(N[b], -th), N[b], rect.x + rect.w * (b % W) / nu, rect.y + rect.h * Math.floor(b / W) / nv, keep);
    O.link[o] = base[a]; O.link[q] = base[b]; O.link[o2] = base[a]; O.link[q2] = base[b];
    return [o, q, o2, q2];
  };
  for (let i = 0; i < nu; i++) {
    let [a, b, c, d] = lip((H - 1) * W + i, (H - 1) * W + i + 1); quad(a, b, c, d, flip);
    [a, b, c, d] = lip(i, i + 1); quad(a, b, c, d, !flip);
  }
  if (!closed) for (let j = 0; j < nv; j++) {
    let [a, b, c, d] = lip(j * W, (j + 1) * W); quad(a, b, c, d, !flip);
    [a, b, c, d] = lip(j * W + nu, (j + 1) * W + nu); quad(a, b, c, d, flip);
  }
  return base;
}

// ---- 몸을 따라가는 면: 몸판, 치마, 덧댄 조각의 기준 ----
export function surf(av, ease) {
  const E = envelope(av);
  return (t, a, off = 0) => torsoPoint(av.fr, t, a, E.r(t, a) + ease(t, a) + off);
}
function arcMap(S, t0, t1, n = 48) { // 어깨처럼 면이 눕는 곳에 줄을 더 많이 준다
  const len = [0];
  for (let i = 1; i <= n; i++) {
    let d = 0;
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * TAU - Math.PI;
      d += S(lerp(t0, t1, (i - 1) / n), a).distanceTo(S(lerp(t0, t1, i / n), a));
    }
    len.push(len[i - 1] + d);
  }
  const tot = len[n];
  return v => {
    const L = v * tot; let i = 1;
    while (i < n && len[i] < L) i++;
    return lerp((i - 1) / n, i / n, (L - len[i - 1]) / (len[i] - len[i - 1] || 1));
  };
}
export const axisT = (av, t) => torsoPoint(av.fr, t, 0, 0);
// 면의 실제 법선. 어깨처럼 면이 누운 곳은 몸 중심에서 바깥 방향이 법선이 아니다.
export function normalAt(av, S, t, a, e = .03) {
  const n = S(t, a + e).sub(S(t, a - e)).cross(S(t + e, a).sub(S(t - e, a))).normalize();
  return n.dot(S(t, a).sub(axisT(av, t))) < 0 ? n.negate() : n;
}
// 평평하게 놓은 장식이 몸 굴곡 속으로 들어가면 그 자리의 옷 면 위로 올린다.
export function above(av, S, q, off = 0) {
  const c = torsoParam(av.fr, q), s = S(c.t, c.a, off);
  return torsoParam(av.fr, s).r > c.r ? s : q;
}

export function bodice(O, { ease, top, hem, rect, nu = 96, nv = 48, th = .0025, keep = 'torso' }) {
  const av = O.av, S = surf(av, ease), T0 = 5.4, T1 = 1.2, map = arcMap(S, T0, T1, 84);
  return shell(O, { nu, nv, closed: true, th, rect, keep,
    f(u, v) {
      const a = (u - .5) * TAU, t0 = top(a), t1 = hem(a);
      const v0 = invert(map, (T0 - t0) / (T0 - T1)), v1 = invert(map, (T0 - t1) / (T0 - T1));
      const t = T0 - (T0 - T1) * map(lerp(v0, v1, v));
      const p = S(t, a);
      return [p, p.clone().sub(axisT(av, t))];
    } });
}
function invert(g, y) { let lo = 0, hi = 1; for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; if (g(m) < y) lo = m; else hi = m; } return lo; }

export function sleeve(O, side, { len, ease, rect, nu = 32, nv = 26, th = .002, start = -.1 }) {
  const av = O.av, l = av.fr[side], M = av.maps[side], other = side === 'AL' ? 'AR' : 'AL';
  const rows = [];
  for (let j = 0; j <= nv; j++) {
    const v = j / nv, t = lerp(start, len, v), h = ring((tt, a) => M.get(clamp(tt, .02, 2.6), a), t, 32);
    rows.push({ t, h, v });
  }
  return shell(O, { nu, nv, closed: true, th, rect, keep: 'arm:' + other,
    f(u, v) {
      const R = rows[Math.round(v * nv)], a = u * TAU - Math.PI;
      const p = limbPoint(l, R.t, a, rayHull(R.h, a) + ease(v, a));
      return [p, p.clone().sub(limbPoint(l, R.t, a, 0))];
    } });
}

// 띠: 몸 위를 지나가는 끈·벨트. path는 (t, a) 줄.
export function strap(O, S, path, { w, rect, off = .004, th = .002, closed = false, keep = 'torso', nv }) {
  const n = nv || path.length - 1, pts = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n * (path.length - 1), k = Math.min(path.length - 2, Math.floor(f)), s = f - k;
    const t = lerp(path[k][0], path[k + 1][0], s), a = lerp(path[k][1], path[k + 1][1], s);
    pts.push([t, a]);
  }
  // 어깨처럼 면이 꺾이는 곳에서 끈이 톱니가 되지 않게 중심선과 법선을 먼저 고른다
  const raw = pts.map(([t, a]) => S(t, a, off)), rawN = pts.map(([t, a]) => normalAt(O.av, S, t, a));
  const smooth = (l, pass) => {
    let cur = l;
    for (let k = 0; k < pass; k++) cur = cur.map((q, i) => {
      if (!closed && (i === 0 || i === n)) return q;
      const a = cur[closed ? (i + n - 1) % n : i - 1], b = cur[closed ? (i + 1) % n : i + 1];
      return q.clone().multiplyScalar(.5).addScaledVector(a, .25).addScaledVector(b, .25);
    });
    return cur;
  };
  const C = closed ? raw : smooth(raw, 6).map(q => above(O.av, S, q, off)), Nn = smooth(rawN, 10);
  // 몸을 두르는 벨트는 납작한 띠로 놓으면 몸이 휘는 곳에서 윗선이 옷 속에 묻힌다. 면을 따라 위아래로 편다.
  const tPerM = closed ? .2 / S(pts[0][0] + .1, 0).distanceTo(S(pts[0][0] - .1, 0)) : 0;
  return shell(O, { nu: n, nv: closed ? 2 : 1, closed, th, rect, keep,
    f(u, v) {
      const i = Math.round(u * n), k = closed ? i % n : i;
      if (closed) {
        const [t, a] = pts[k], p = S(t + (.5 - v) * w * tPerM, a, off);
        return [p, p.clone().sub(axisT(O.av, t))];
      }
      const q = C[closed ? (k + 1) % n : Math.min(n, k + 1)], r = C[closed ? (k - 1 + n) % n : Math.max(0, k - 1)];
      const side = q.clone().sub(r).normalize().cross(Nn[k]).normalize();
      return [C[k].clone().addScaledVector(side, (v - .5) * w), Nn[k]];
    } });
}

// 덧댄 조각: 주머니·앞판 같은 (t, a) 사각형
export function patch(O, S, { t0, t1, a0, a1, off = .004, rect, nu = 14, nv = 10, th = .002, bulge, keep = 'torso' }) {
  return shell(O, { nu, nv, closed: false, th, rect, keep,
    f(u, v) {
      const t = lerp(t0, t1, v), a = lerp(a0(v), a1(v), u);
      const p = S(t, a, off + (bulge ? bulge(u, v) : 0));
      return [p, p.clone().sub(axisT(O.av, t))];
    } });
}

// 둥근 덩어리: 단추·배지·리본 매듭. 몸 위 p에 납작한 구를 놓는다.
export function lump(O, p, nrm, { rx, ry, rz, rect, keep = 'torso', roll = 0, n = 12 }) {
  const N = nrm.clone().normalize(), up = Math.abs(N.y) > .9 ? V(1, 0, 0) : V(0, 1, 0);
  const X = up.clone().cross(N).normalize(), Y = N.clone().cross(X);
  if (roll) { X.applyAxisAngle(N, roll); Y.applyAxisAngle(N, roll); }
  return shell(O, { nu: n, nv: n >> 1, closed: true, rect, keep, inner: false,
    f(u, v) {
      const th = u * TAU, ph = v * Math.PI, s = Math.sin(ph);
      const d = X.clone().multiplyScalar(Math.cos(th) * s * rx).addScaledVector(Y, Math.sin(th) * s * ry).addScaledVector(N, Math.cos(ph) * rz);
      return [p.clone().add(d), d];
    } });
}

// 관: 끈·체인 고리. pts는 몸 좌표 점들.
export function tube(O, pts, { r, rect, keep = 'torso', closed = false, n = 8 }) {
  const m = pts.length - 1;
  return shell(O, { nu: n, nv: m, closed: true, rect, keep, inner: false,
    f(u, v) {
      const i = Math.round(v * m), p = pts[i];
      const T = pts[Math.min(m, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize();
      const X = (Math.abs(T.y) > .9 ? V(1, 0, 0) : V(0, 1, 0)).cross(T).normalize(), Y = T.clone().cross(X);
      const a = u * TAU, d = X.multiplyScalar(Math.cos(a) * r).addScaledVector(Y, Math.sin(a) * r);
      return [p.clone().add(d), d];
    } });
}

// 치마. 줄기마다 흔들림 뼈가 달린다.
export function skirt(O, { t0, t1, flare, pleats = 0, depth = 0, rect, nc = 12, nj = 3, ease = .006, panel, keepTop = .12, name = 'skirt', stiff = .55, nv = 26 }) {
  const av = O.av, E = envelope(av), top = t0, wide = (t, a, v) => {
    let m = 0;
    for (let s = 0; s <= 1.0001; s += .125) m = Math.max(m, E.r(lerp(top, t, s), a)); // 위쪽 어디보다 안 좁아짐
    return m + ease + flare * v;
  };
  const point = (u, v) => {
    // 트임 자락은 위에서 옆선까지 붙어 있다가 아래로 벌어진다. 갑자기 좁아지면 옆구리에 턱이 생긴다.
    const mid = panel && (panel[0] + panel[1]) / 2, half = panel && lerp(Math.PI / 2, (panel[1] - panel[0]) / 2, sstep(0, .7, v));
    const a0 = panel ? mid + (u * 2 - 1) * half : (u - .5) * TAU;
    const t = lerp(t0, t1, v);
    let a = a0, r = wide(t, a0, v);
    if (pleats) { // 접힌 주름: 지름만이 아니라 각도도 밀어 칼주름처럼 겹치게 한다
      const k = (u * pleats) % 1, grow = sstep(.02, .3, v);
      const saw = k < .78 ? k / .78 : 1 - (k - .78) / .22;
      r += depth * saw * grow;
      a += (k < .78 ? 0 : -(k - .78) * TAU / pleats * .9) * grow;
    }
    return torsoPoint(av.fr, t, a, r);
  };
  const cols = panel ? Math.max(2, nc) : nc, chain = [], base = O.av.vrm.humanoid.getRawBoneNode('hips');
  for (let c = 0; c < cols; c++) {
    const u = panel ? c / (cols - 1) : c / cols, ids = [];
    for (let j = 1; j <= nj; j++) ids.push(point(u, keepTop + (1 - keepTop) * (j - .5) / nj));
    chain.push({ pts: ids, tip: point(u, 1.08) });
  }
  const chainSet = { name, cols, nj, chain, parent: base, stiff, closed: !panel };
  const id = O.chains.push(chainSet) - 1;
  const hips = base;
  const skinAt = (u, v) => { // 줄기 사이·마디 사이를 고르게 나눠 가진다
    if (v < keepTop) return [[hips, 1]];
    const y = (v - keepTop) / (1 - keepTop) * nj - .5, j = Math.floor(clamp(y, 0, nj - 1.001)), s = clamp(y - j);
    const x = panel ? u * (cols - 1) : (u % 1) * cols, c = Math.floor(x) % cols, d = panel ? Math.min(c + 1, cols - 1) : (c + 1) % cols, q = x - Math.floor(x);
    const out = [];
    const add = (cc, jj, w) => { if (w > .001) out.push([{ chain: id, c: cc, j: jj }, w]); };
    const low = y < 0 ? clamp(1 + y * 2) : 0; // 맨 윗마디 위쪽은 골반과 섞어 허리가 안 찢어지게
    if (low) out.push([hips, low]);
    const k = 1 - low;
    add(c, j, (1 - q) * (1 - s) * k); add(d, j, q * (1 - s) * k);
    if (j + 1 < nj) { add(c, j + 1, (1 - q) * s * k); add(d, j + 1, q * s * k); }
    else { add(c, j, (1 - q) * s * k); add(d, j, q * s * k); }
    return out;
  };
  shell(O, { nu: pleats ? pleats * 6 : 64, nv, closed: !panel, th: .0022, rect, keep: 'hip',
    f(u, v) {
      const p = point(u, v), t = lerp(t0, t1, v);
      return [p, p.clone().sub(axisT(av, t))];
    },
    skin: skinAt });
  return { point, skinAt, axis: v => axisT(av, lerp(t0, t1, v)) };
}

// 옷 윗부분을 덮는 깃 한 벌: a(u)를 따라 돌면서 위선 top에서 아랫선 edge까지 몸 위에 놓인다.
export function collar(O, S, { a, top, edge, rect, off = .006, nu = 80, nv = 10, lift = 0 }) {
  return shell(O, { nu, nv, closed: false, th: .002, rect, keep: 'torso',
    f(u, v) {
      const an = a(u), t = lerp(top(an), edge(an), v);
      const p = S(t, an, off + lift * Math.sin(Math.PI * v));
      return [p, p.clone().sub(axisT(O.av, t))];
    } });
}

// 프릴·레이스: 옷단을 따라 물결치는 띠
export function frill(O, { ring: at, rect, nu = 180, waves = 40, w = .022, amp = .006, keep = 'hip', skin }) {
  return shell(O, { nu, nv: 3, closed: true, th: .0012, rect, keep, skin,
    f(u, v) {
      const [p, out, dn] = at(u);
      const wob = Math.sin(u * TAU * waves) * amp * (.3 + v);
      return [p.clone().addScaledVector(dn, v * w).addScaledVector(out, wob + v * .006), out];
    } });
}

// ---- 뼈 가중치 ----
export function bindWeights(O) {
  const av = O.av, skel = av.body.skeleton.bones, idx = new Map(skel.map((b, i) => [b, i]));
  const nodeIdx = n => { for (let x = n; x; x = x.parent) if (idx.has(x)) return idx.get(x); return idx.get(av.vrm.humanoid.getRawBoneNode('hips')); };
  const filters = {
    torso: q => (q.seg.AL || 0) + (q.seg.AR || 0) < .35 && (q.seg.LL || 0) + (q.seg.LR || 0) < .5,
    hip: q => (q.seg.AL || 0) + (q.seg.AR || 0) < .1,
    any: null,
  };
  const count = O.pos.length / 3, ji = new Uint16Array(count * 4), wt = new Float32Array(count * 4);
  const newBase = skel.length;
  const chainIndex = {};
  let n = newBase;
  O.chains.forEach((c, id) => { chainIndex[id] = n; n += c.cols * (c.nj + 1); });
  const p = V(), put = (v, list) => {
    const m = new Map();
    for (const [b, w] of list) {
      const i = b.chain != null ? chainIndex[b.chain] + b.c * (O.chains[b.chain].nj + 1) + b.j : nodeIdx(b);
      m.set(i, (m.get(i) || 0) + w);
    }
    const top = [...m].sort((a, b) => b[1] - a[1]).slice(0, 4), sum = top.reduce((s, e) => s + e[1], 0) || 1;
    top.forEach(([i, w], k) => { ji[v * 4 + k] = i; wt[v * 4 + k] = w / sum; });
  };
  for (let v = 0; v < count; v++) {
    if (O.link[v] != null) continue;
    const cus = O.custom.get(v);
    if (cus) { put(v, cus); continue; }
    p.set(O.pos[v * 3], O.pos[v * 3 + 1], O.pos[v * 3 + 2]);
    const k = O.keep[v] || 'torso';
    const ok = k.startsWith('arm:') ? (other => q => (q.seg[other] || 0) < .3)(k.slice(4)) : filters[k];
    const near = av.hash.near(p, 6, ok), list = [];
    for (const [d, q] of near) { const w = 1 / (d + 1e-5); for (const [b, bw] of q.bones) list.push([b, bw * w]); }
    put(v, list);
  }
  for (let v = 0; v < count; v++) {
    const l = O.link[v];
    if (l == null) continue;
    for (let k = 0; k < 4; k++) { ji[v * 4 + k] = ji[l * 4 + k]; wt[v * 4 + k] = wt[l * 4 + k]; }
  }
  return { ji, wt, newBase, total: n };
}
