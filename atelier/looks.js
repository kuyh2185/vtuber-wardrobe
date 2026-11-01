// 옷 목록. 값은 전부 사용자가 고칠 수 있는 손잡이(params)다.
import * as THREE from 'three';
import { cinch, envelope, surf, bodice, sleeve, ruffle, softSkirt, skirtRing, skirtBand, limbRing, legBand, strap, patch, lump, tube, skirt, collar, shell, lerp, sstep, clamp, TAU, axisT, normalAt, above } from './parts.js';
import { limbPoint } from './body.js';
import * as P from './tex.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

function common(O, pal) {
  O.lining = O.rect(16, 16, (c, r) => P.fill(c, r, pal.lining));
  O.metal = O.rect(64, 64, (c, r) => P.metal(c, r, pal.metalHi, pal.metalMid, pal.metalLo));
  O.flat = col => O.rect(24, 24, (c, r) => P.fill(c, r, typeof col === 'function' ? col() : col));
}
const onBody = (S, av, t, a, off) => { const p = S(t, a, off); return [p, p.clone().sub(axisT(av, t))]; };
const snug = (O, E, ease, amt = .013) => { const c = cinch(E, amt); O.tol = amt; return (t, a) => ease(t, a) + c(t, a); }; // 허리 재단을 옷 여유에 얹는다
const around = (t, n = 56) => { const l = []; for (let i = 0; i <= n; i++) l.push([t, i / n * TAU - Math.PI]); return l; };

// 납작한 금속판: 버클·핀. 모서리만 둥글린 슈퍼타원이라 공처럼 안 보인다.
function plate(O, p, nrm, w, h, rect) {
  const N = nrm.clone().setY(nrm.y * .2).normalize(), X = V(0, 1, 0).cross(N).normalize(), Y = N.clone().cross(X);
  const pow = (s, e) => Math.sign(s) * Math.abs(s) ** e;
  return shell(O, { nu: 20, nv: 3, closed: true, rect, inner: false, keep: 'torso',
    f(u, v) {
      const a = u * TAU, k = v < .1 ? 0 : v < .5 ? .92 : 1, d = v < .5 ? .0028 : v < .8 ? .0016 : -.001;
      const q = X.clone().multiplyScalar(pow(Math.cos(a), .45) * w * k).addScaledVector(Y, pow(Math.sin(a), .45) * h * k);
      return [p.clone().add(q).addScaledVector(N, d), N.clone().multiplyScalar(3)];
    } });
}

// 리본: 나비 두 날개 + 매듭 + 꼬리. 넥타이·스카프 공용.
function bow(O, S, p, n, { w, h, rect, tail = 0, keep = 'torso', free = 0, float = 0 }) {
  const N = n.clone().normalize(), X = V(0, 1, 0).cross(N).normalize(), Y = N.clone().cross(X);
  const up = q => (free ? q : above(O.av, S, q, .002)); // free: 몸통 위가 아닌 곳(다리)에 달 때
  const lobe = s => shell(O, { nu: 16, nv: 10, closed: true, rect, inner: false, keep,
    f(u, v) {
      const a = u * TAU, x = v, pinch = .22 + .78 * Math.sin(Math.PI * clamp(x * .92 + .08)) ** .55;
      const c = p.clone().addScaledVector(X, s * x * w).addScaledVector(Y, x * h * .12);
      const d = Y.clone().multiplyScalar(Math.cos(a) * h * pinch).addScaledVector(N, Math.sin(a) * h * .34 * pinch);
      return [(float ? c.clone().add(d) : up(c.clone().add(d))), d.clone().addScaledVector(X, s * (x - .5))];
    } });
  lobe(-1); lobe(1);
  if (tail) for (const s of [-1, 1]) {
    shell(O, { nu: 8, nv: 8, closed: false, th: .0016, rect, keep,
      f(u, v) {
        const y = v * tail, spread = s * (.006 + v * .03), wide = h * (.42 + v * .4);
        const c = p.clone().addScaledVector(Y, -y).addScaledVector(X, spread).addScaledVector(N, .004);
        const fork = v > .93 ? -(Math.abs(u - .5) < .1 ? .012 : 0) : 0;
        return [up(c.addScaledVector(X, (u - .5) * wide).addScaledVector(Y, fork)), N];
      } });
  }
  lump(O, p.clone().addScaledVector(N, h * .1), N, { rx: h * .34, ry: h * .42, rz: h * .3, rect, n: 12, keep });
}

const setTrim = (c, r, y, h, col) => { c.fillStyle = col; c.fillRect(r.x, y, r.w, h); };

// ---- 2. 고딕 세일러 (4월 1위 Crimson Rumor 계열, 교복 콘텐츠) ----
function sailor(O, p) {
  const av = O.av, E = envelope(av), pal = p.pal;
  common(O, pal);
  const hem = E.tw - .14;
  const ease = snug(O, E, (t, a) => .0045 + .006 * sstep(E.tb + .1, E.tb - .2, t));
  const S = surf(av, ease);
  O.cover = [E.tw - .75, E.ts - .1];
  const deep = lerp(4.86, 4.62, p.neck);
  const top = a => {
    const f = clamp(Math.abs(a) / .62);
    return lerp(deep, 5.02, f ** .8);
  };

  // V넥 안쪽 가슴받이
  const dicR = O.rect(220, 200, (c, r) => { P.fill(c, r, pal.shirt); P.shade(c, r, .25, .3); P.stitch(c, r.x + r.w / 2, r.y, r.x + r.w / 2, r.y + r.h, 'rgba(0,0,0,.25)', 2, [10, 8]); });
  patch(O, surf(av, () => .001), { t0: 5.05, t1: deep - .06, a0: () => -.7, a1: () => .7, rect: dicR, off: 0 });

  const bodyR = O.rect(1000, 460, (c, r) => {
    P.fill(c, r, pal.a); P.folds(c, r, 31, 16, .28, .09); P.shade(c, r, .15, .25);
    const cx = r.x + r.w / 2;
    c.fillStyle = 'rgba(255,255,255,.05)'; c.fillRect(cx - 60, r.y, 120, r.h);
    P.stitch(c, cx - 60, r.y, cx - 60, r.y + r.h, pal.st); P.stitch(c, cx + 60, r.y, cx + 60, r.y + r.h, pal.st);
    P.stitch(c, r.x, r.y + r.h - 8, r.x + r.w, r.y + r.h - 8, pal.st);
    for (const x of [r.x + r.w * .32, r.x + r.w * .68]) P.stitch(c, x, r.y + r.h * .4, x, r.y + r.h, pal.st);
  });
  bodice(O, { ease, top, hem: () => hem, rect: bodyR });

  for (const side of ['AL', 'AR']) {
    const rect = O.rect(420, 400, (c, r) => {
      P.fill(c, r, pal.a); P.folds(c, r, side === 'AL' ? 7 : 9, 12, .3, .09);
      const y = r.y + r.h * .82;
      c.fillStyle = pal.c; c.fillRect(r.x, y, r.w, r.h - (y - r.y));
      P.band(c, r, y + 12, 6, pal.d); P.band(c, r, y + 26, 3, pal.d); P.band(c, r, y - 2, 3, 'rgba(0,0,0,.6)');
    });
    const b = sstep(.8, .84, 1);
    sleeve(O, side, { len: lerp(.5, 1.98, p.sleeve), rect, ease: v => {
      const puff = .03 * p.puff * Math.sin(Math.PI * clamp(v / .34)) * (v < .34 ? 1 : 0);
      const cuff = sstep(.78, .83, v);
      return .0045 + puff + .007 * sstep(.4, .8, v) + cuff * .006 + 0 * b;
    } });
  }

  // 세일러 깃: 등은 네모, 앞은 V를 따라 뾰족하게
  const wrap = a => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  const edge = a0 => {
    const a = Math.abs(wrap(a0)), front = top(a) - lerp(.02, .34, clamp(a / .85) ** .8);
    return lerp(front, E.tb - .1, sstep(1.62, 2.02, a)); // 앞 깃 → 등의 네모로 꺾임
  };
  const colR = O.rect(1200, 170, (c, r) => {
    P.fill(c, r, pal.a2); P.shade(c, r, .1, 0);
    setTrim(c, r, r.y + r.h * .7, 12, pal.d); setTrim(c, r, r.y + r.h * .84, 6, pal.d);
  });
  collar(O, S, { a: u => lerp(.02, TAU - .02, u), top: a => top(wrap(a)), edge, rect: colR, off: .0052, nu: 160, nv: 10, lift: .0028 });

  // 스카프
  const scarfR = O.rect(120, 120, (c, r) => { P.fill(c, r, pal.e); P.folds(c, r, 41, 5, .34, .12); });
  const [q, n] = onBody(S, av, deep - .03, 0, .012);
  bow(O, S, q, n, { w: .058, h: .026, rect: scarfR, tail: .1 });

  // 앞 금단추
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    const [b0, b1] = onBody(S, av, deep - .32 - i * .19, s * .17, .004);
    plate(O, b0, b1, .0062, .0062, O.metal);
  }

  const skR = O.rect(1240, 300, (c, r) => {
    P.fill(c, r, pal.a); P.gather(c, r, 26, 5, .34, .1);
    setTrim(c, r, r.y + r.h * .89, 9, pal.d); setTrim(c, r, r.y + r.h * .93, 4, pal.d);
  });
  const sk = softSkirt(O, { t0: hem + .08, t1: lerp(2, 1.3, p.skirt), flare: .04 + .07 * p.flare, tiers: [{ v0: 0, v1: 1, n: 26, amp: .013, seed: 5, rect: skR, hem: .01 }] });
  if (p.lace) tierLace(O, sk, .992, O.rect(1200, 50, (c, r) => P.lace(c, r, pal.d)), 42, 4, .024);

  // 허리 벨트
  const beltR = O.rect(200, 40, (c, r) => { P.fill(c, r, pal.e); P.band(c, r, r.y + 6, 3, 'rgba(0,0,0,.3)'); P.band(c, r, r.y + 31, 3, 'rgba(0,0,0,.3)'); });
  strap(O, S, around(hem + .01), { w: .026, rect: beltR, closed: true, off: .006 });
  const [bq, bn] = onBody(S, av, hem + .01, 0, .0085);
  plate(O, bq, bn, .018, .016, O.metal);
}

// ---- 3. 다크 치파오 (Setsurei·Kirameki·KAIHUA 계열) ----
function qipao(O, p) {
  const av = O.av, E = envelope(av), pal = p.pal;
  common(O, pal);
  const hem = lerp(1.68, 1.98, p.slit); // 트임이 골반까지 올라가면 속이 보이므로 몸판을 허벅지까지 내린다
  const ease = (t, a) => .0048 + .012 * sstep(E.tw, 2.5, t);
  const S = surf(av, ease);
  O.cover = [2.4, E.ts - .1];
  const top = () => 5.12;

  const bodyR = O.rect(1000, 760, (c, r) => {
    P.fill(c, r, pal.a); P.lattice(c, r, pal.a3); P.folds(c, r, 51, 16, .26, .08);
    const cx = r.x + r.w / 2;
    // 오른쪽으로 비껴 여미는 앞섶
    c.strokeStyle = pal.e; c.lineWidth = 15; c.lineCap = 'round';
    c.beginPath(); c.moveTo(cx - 8, r.y); c.bezierCurveTo(cx + 40, r.y + r.h * .1, cx + 110, r.y + r.h * .15, cx + 160, r.y + r.h * .24); c.stroke();
    c.strokeStyle = pal.d; c.lineWidth = 3;
    c.beginPath(); c.moveTo(cx - 8, r.y); c.bezierCurveTo(cx + 40, r.y + r.h * .1, cx + 110, r.y + r.h * .15, cx + 160, r.y + r.h * .24); c.stroke();
    P.shade(c, r, .1, .1);
  });
  bodice(O, { ease, top, hem: () => hem, rect: bodyR });

  // 차이나 칼라
  const colR = O.rect(420, 70, (c, r) => {
    P.fill(c, r, pal.a); P.lattice(c, r, pal.a3, 22); setTrim(c, r, r.y, 10, pal.e); setTrim(c, r, r.y + 10, 3, pal.d); setTrim(c, r, r.y + r.h - 6, 6, pal.d);
  });
  const neckS = (t, a, off) => S(5.1, a, off + .002).setY(S(t, a, 0).y);
  shell(O, { nu: 44, nv: 4, closed: false, th: .002, rect: colR, keep: 'torso',
    f(u, v) {
      const a = lerp(.16, TAU - .16, u), t = lerp(5.3, 5.08, v), an = ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
      const q = neckS(t, an, .001);
      return [q, q.clone().sub(axisT(av, t))];
    } });

  for (const side of ['AL', 'AR']) {
    const long = p.sleeve > .5;
    const rect = O.rect(420, 340, (c, r) => {
      P.fill(c, r, pal.a); P.lattice(c, r, pal.a3); P.folds(c, r, 53, 10, .28, .08);
      setTrim(c, r, r.y + r.h - 28, 22, pal.e); setTrim(c, r, r.y + r.h - 30, 5, pal.d); setTrim(c, r, r.y + r.h - 8, 5, pal.d);
    });
    sleeve(O, side, { len: lerp(.26, 1.95, p.sleeve), rect, ease: v => .0045 + (long ? .06 * sstep(.3, 1, v) ** 1.6 : .009 * sstep(.2, 1, v)) });
  }

  // 매듭 단추
  const knotR = O.flat(() => pal.dd);
  [[4.86, .16], [4.7, .36], [4.55, .56]].forEach(([t, a]) => {
    const [q, n] = onBody(S, av, t, a, .004);
    const X = V(0, 1, 0).cross(n).normalize();
    tube(O, [q.clone().addScaledVector(X, -.02), q.clone().addScaledVector(X, -.008).add(V(0, .004, 0)), q.clone(), q.clone().addScaledVector(X, .008).add(V(0, -.004, 0)), q.clone().addScaledVector(X, .02)].map(c => above(av, S, c, .003)), { r: .0026, rect: knotR, n: 6 });
    lump(O, q, n, { rx: .0052, ry: .0052, rz: .0048, rect: O.metal, n: 8 });
  });

  // 치마 앞뒤: 옆이 트인다
  const t1 = lerp(1.74, .96, p.skirt);
  const panelPaint = seed => (c, r) => {
    P.fill(c, r, pal.a); P.lattice(c, r, pal.a3); P.folds(c, r, seed, 9, .24, .07);
    P.waves(c, r, r.y + r.h * .36, r.y + r.h - 18, pal.d, 42);
    c.fillStyle = pal.e; c.fillRect(r.x, r.y, 16, r.h); c.fillRect(r.x + r.w - 16, r.y, 16, r.h); c.fillRect(r.x, r.y + r.h - 18, r.w, 18);
    c.fillStyle = pal.d; c.fillRect(r.x + 16, r.y, 3, r.h); c.fillRect(r.x + r.w - 19, r.y, 3, r.h); c.fillRect(r.x, r.y + r.h - 21, r.w, 3);
  };
  const open = 1.5 - .2 * p.slit;
  const sk = { t0: hem + .12, t1, flare: .03 + .05 * p.flare, ease: .011, nc: 6, nj: 3, keepTop: .1, nv: 24, stiff: .7 }; // 몸판 밑단 안쪽에서 시작
  skirt(O, { ...sk, panel: [-open, open], rect: O.rect(620, 420, panelPaint(61)), name: 'skirtF' });
  skirt(O, { ...sk, panel: [Math.PI - open, Math.PI + open], rect: O.rect(620, 420, panelPaint(63)), name: 'skirtB' });

  // 허리 띠
  const sashR = O.rect(200, 50, (c, r) => { P.fill(c, r, pal.e); P.folds(c, r, 71, 4, .3, .1); P.band(c, r, r.y + 5, 3, pal.d); P.band(c, r, r.y + r.h - 8, 3, pal.d); });
  strap(O, S, around(E.tw - .02), { w: .034, rect: sashR, closed: true, off: .005 });
  if (p.tassel) {
    const [q, n] = onBody(S, av, E.tw - .02, -.95, .012);
    bow(O, S, q, n, { w: .03, h: .016, rect: sashR, tail: 0 });
    const tip = above(av, S, q.clone().add(V(-.004, -.11, .004)), .012);
    tube(O, [q.clone(), q.clone().lerp(tip, .5).add(V(.002, 0, 0)), tip], { r: .002, rect: O.flat(() => pal.dd), n: 6 });
    lump(O, tip, n, { rx: .0075, ry: .0075, rz: .0075, rect: O.metal, n: 8 });
    const tassel = O.rect(40, 80, (c, r) => { P.fill(c, r, pal.e); for (let x = r.x; x < r.x + r.w; x += 5) { c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(x, r.y, 1.5, r.h); } });
    shell(O, { nu: 10, nv: 5, closed: true, rect: tassel, keep: 'torso', inner: false,
      f(u, v) {
        const a = u * TAU, r = .0058 + v * .0085, d = V(Math.cos(a) * r, 0, Math.sin(a) * r);
        return [tip.clone().add(V(0, -.006 - v * .07, 0)).add(d), d];
      } });
  }
}

// ---- 어깨를 드러내고 허리를 조이고 끝에 부피를 두는 옷의 공용 부품 ----
const sweetheart = (E, deep = .0) => a => { // 어깨를 드러내는 몸판 윗선: 앞은 가슴 위, 옆은 겨드랑이 아래
  const f = Math.abs(a), front = lerp(E.tb + .17, E.tb + .28, sstep(.05, .55, f)) - deep * (1 - sstep(0, .3, f));
  return lerp(front, E.ts - .17, sstep(.75, 1.5, f));
};
const ringOn = (S, av, tOf, off = 0) => u => { // 몸 위 줄 → ruffle 형식
  const a = (u - .5) * TAU, t = tOf(a), p = S(t, a, off), low = S(t - .06, a, off);
  return [p, normalAt(av, S, t, a), low.sub(p).normalize()];
};
const puff = (seed, big, tight = 0) => (v, a) => { // 팔 위아래 모아 묶은 풍성한 소매. tight: 소매통 최소 여유
  const out = .5 + .5 * Math.cos(a), body = Math.sin(Math.PI * clamp(v)) ** .6 * big * (.55 + .45 * out);
  const u = (a / TAU + 1.5) % 1, gather = (P.fold(u, 11, seed) - .5) * .012 * (.35 + body / big);
  return .004 + tight + body + gather;
};
const slouch = (seed, big, cuff = .8) => (v, a) => { // 팔에 걸쳐 흘러내린 오버 소매: 끝에서 천이 쌓인다
  const out = .5 + .5 * Math.cos(a), u = (a / TAU + 1.5) % 1;
  const wide = big * (.42 + .58 * v ** .9) * (.5 + .5 * out) * (1 - sstep(cuff + .1, cuff + .17, v) * .55);
  const stack = Math.sin(TAU * (v * 6.5 + .13 * Math.sin(a * 2 + seed))) * .0065 * sstep(.25, .75, v) * (.6 + .4 * out);
  const lengthwise = (P.fold(u, 7, seed) - .5) * .012 * (.5 + v);
  return .006 + wide + stack + lengthwise;
};

const armOf = side => 'arm:' + (side === 'AL' ? 'AR' : 'AL');
const limbAt = (av, side, t, ease = .007, dir = 1) => u => { // 소매 둘레 줄 → ruffle 형식
  const l = av.fr[side], R = limbRing(av, side, t), a = u * TAU - Math.PI, r = R(a) + (typeof ease === 'function' ? ease(a) : ease);
  const q = limbPoint(l, t, a, r), b = limbPoint(l, t, a, 0);
  return [q, q.clone().sub(b).normalize(), limbPoint(l, t + dir * .2, a, r).sub(q).normalize()];
};
const choker = (O, av, rect, t = 5.33, w = .016) => strap(O, surf(av, () => .002), around(t, 44), { w, rect, closed: true, off: .001 });
const beads = (O, pts, r, rect, keep = 'torso') => pts.forEach((q, i) => {
  const d = pts[Math.min(pts.length - 1, i + 1)].clone().sub(pts[Math.max(0, i - 1)]);
  lump(O, q, d, { rx: r, ry: r * .7, rz: r * 1.3, rect, keep, n: 6, roll: i % 2 ? 1.5 : 0 });
});
const tierLace = (O, sk, v, rect, n, seed, w = .018, off = .002) => ruffle(O, { at: skirtRing(sk, () => v, off), n, w, amp: .005, nu: n * 8, keep: 'hip', scallop: .3, seed, rect, skin: u => sk.skinAt(u, v) });

// ---- 어깨를 드러낸 오버핏 + 겹치마 (참고: 흰 오프숄더 + 검정 미니) ----
function street(O, p) {
  const av = O.av, E = envelope(av), pal = p.pal;
  common(O, pal);
  const hem = E.tw - .22, front = E.tb + .34;
  const top = a => { const f = Math.abs(a); return lerp(lerp(front, E.ts - .16, sstep(.7, 1.5, f)), E.tb + .28, sstep(1.9, 2.6, f)); };
  const ease = snug(O, E, (t, a) => {
    const f = Math.abs(a), side = Math.exp(-(((f - Math.PI / 2) / .55) ** 2));
    const drape = .002 + .018 * p.loose * sstep(E.tb + .1, E.tb - .35, t) * (1 - sstep(hem + .35, hem + .06, t) * .85);
    const ruche = (Math.sin(TAU * (t * 3.4 + a * .55)) + 1) * .0026 * side * sstep(E.tb, E.tw, t);
    return .0032 + drape + ruche;
  }, lerp(.013, .005, p.loose));
  const S = surf(av, ease);
  O.cover = [E.tw - .75, E.tb + .1];
  const bodyR = O.rect(1000, 460, (c, r) => {
    P.fill(c, r, pal.a); P.folds(c, r, 13, 10, .05, .03); P.shade(c, r, 0, .16);
    const cx = r.x + r.w / 2;
    P.logo(c, cx, r.y + r.h * .45, p.mark || 'Midnight', pal.c, 30, 'italic 900 %px Georgia, serif');
    c.fillStyle = pal.c; c.fillRect(cx - 3.5, r.y + r.h * .52, 7, 46); c.fillRect(cx - 14, r.y + r.h * .55, 28, 7);
  });
  bodice(O, { ease, top, hem: () => hem, rect: bodyR, nu: 160, nv: 72 });
  // 윗선은 끈으로 조여 잔주름이 잡힌다
  const edgeR = O.rect(1000, 56, (c, r) => { P.fill(c, r, pal.a); P.gather(c, r, 52, 7, .22, .08); P.band(c, r, r.y + r.h - 5, 2, 'rgba(0,0,0,.18)'); });
  ruffle(O, { at: ringOn(S, av, a => top(a) + .03, .0015), n: 52, w: .02, amp: .004, rect: edgeR, seed: 7, flare: .1 });
  const thin = O.flat(() => pal.b);
  for (const s of [-1, 1]) strap(O, surf(av, () => .001), [[top(s * .62), s * .62], [4.98, s * .66], [5.04, s * .78], [5.04, s * 2.45], [4.96, s * 2.6], [top(s * 2.7), s * 2.7]], { w: .0055, rect: thin, nv: 40, off: .001 });
  const [tq, tn] = onBody(S, av, top(0), 0, .006);
  bow(O, S, tq, tn, { w: .018, h: .0075, rect: thin, tail: .04 });

  // 팔에 걸쳐 흘러내린 오버 소매
  for (const side of ['AL', 'AR']) {
    const seed = side === 'AL' ? 3 : 8, st = .3, end = lerp(1.2, 2.12, p.sleeve);
    const E2 = slouch(seed, lerp(.022, .05, p.loose));
    const rect = O.rect(420, 400, (c, r) => {
      P.fill(c, r, pal.a); P.gather(c, r, 7, seed, .12, .06); P.shade(c, r, .06, .16);
    });
    sleeve(O, side, { start: st, len: end, rect, ease: E2 });
    const edge = O.rect(420, 40, (c, r) => { P.fill(c, r, pal.a); P.gather(c, r, 16, seed, .3, .05); });
    ruffle(O, { at: limbAt(av, side, st, a => E2(0, a) + .001, -1), n: 16, w: .012, amp: .004, rect: edge, keep: armOf(side), seed, flare: .15 });
    const tie = O.flat(() => pal.c);
    legBand(O, side, st + .22, { w: .007, ease: a => E2(.12, a) + .0015, rect: tie, nu: 64 });
    const [q0, n0] = limbAt(av, side, st + .22, E2(.12, 0) + .006)(.5);
    lump(O, q0, n0, { rx: .012, ry: .005, rz: .004, rect: tie, keep: armOf(side), n: 8 });
  }

  // 치마: 검정 위에 흰 속치마
  const t0 = hem + .05, t1 = lerp(2.02, 1.5, p.skirt), under = .88;
  const black = (c, r) => { P.fill(c, r, pal.b); P.gather(c, r, 22, 6, .3, .09); P.band(c, r, r.y + r.h - 16, 3, pal.a2); };
  const white = (c, r) => { P.fill(c, r, pal.a); P.gather(c, r, 34, 2, .16, .06); };
  const sk = softSkirt(O, { t0, t1, flare: .04 + .065 * p.flare, tiers: [
    { v0: under - .2, v1: 1, n: 34, amp: .007, off: -.003, seed: 2, rect: O.rect(1100, 120, white), scallop: .012, hem: .006 },
    { v0: 0, v1: under, n: 22, amp: .012, kick: .012, off: .004, seed: 6, rect: O.rect(1100, 240, black), hem: .01 },
  ] });
  tierLace(O, sk, .992, O.rect(1100, 44, (c, r) => P.lace(c, r, pal.a)), 42, 3, .018);

  if (p.belts) {
    const beltR = O.rect(220, 36, (c, r) => { P.fill(c, r, pal.belt); P.stitch(c, r.x, r.y + 6, r.x + r.w, r.y + 6, 'rgba(255,255,255,.2)', 2, [6, 5]); P.stitch(c, r.x, r.y + 30, r.x + r.w, r.y + 30, 'rgba(255,255,255,.2)', 2, [6, 5]); });
    const b1 = u => .05 + .07 * (1 + Math.cos((u - .5) * TAU + .9)) / 2, b2 = u => .14 + .09 * (1 + Math.cos((u - .5) * TAU - 1.1)) / 2;
    skirtBand(O, sk, b1, { w: .016, off: .012, rect: beltR });
    skirtBand(O, sk, b2, { w: .012, off: .012, rect: beltR });
    for (const [vOf, off] of [[b1, .015], [b2, .015]]) for (let i = 0; i < 18; i++) {
      const u = (i + .5) / 18, [q, out] = skirtRing(sk, vOf, off)(u);
      lump(O, q, out, { rx: .0034, ry: .0034, rz: .0024, rect: O.metal, keep: 'hip', n: 6 });
    }
    const [q, out] = skirtRing(sk, b1, .015)(.38), pts = [];
    for (let i = 0; i <= 14; i++) { const f = i / 14; pts.push(q.clone().add(V(-.03 * f, -.09 * Math.sin(Math.PI * f) - .02 * f, .004 * Math.sin(Math.PI * f)))); }
    beads(O, pts, .0028, O.metal, 'hip');
  }

  // 초커와 목걸이
  const neckR = O.rect(300, 40, (c, r) => { P.fill(c, r, pal.b); P.band(c, r, r.y + r.h - 8, 3, pal.c); });
  choker(O, av, neckR);
  const fall = S0 => { const l = []; for (let i = 0; i <= 26; i++) { const f = i / 26, a = lerp(-.62, .62, f); l.push(above(av, S, S0(lerp(5.02, E.tb + .36, Math.sin(Math.PI * f) ** .7), a), .003)); } return l; };
  beads(O, fall((t, a) => S(t, a, .003)), .0024, O.metal);
  const [cq, cn] = onBody(S, av, E.tb + .3, 0, .016);
  plate(O, cq.clone().add(V(0, -.014, 0)), cn, .0035, .014, O.metal);
  plate(O, cq.clone().add(V(0, -.008, .0012)), cn, .0095, .0032, O.metal);

  // 허벅지 벨트
  if (p.garter) {
    const legR = O.rect(220, 30, (c, r) => { P.fill(c, r, pal.belt); P.stitch(c, r.x, r.y + 15, r.x + r.w, r.y + 15, 'rgba(255,255,255,.22)', 2, [6, 5]); });
    const l = av.fr.LL;
    legBand(O, 'LL', .36, { w: .014, rect: legR }); legBand(O, 'LL', .5, { w: .012, rect: legR });
    for (const t of [.36, .5]) lump(O, limbPoint(l, t, -.8, limbRing(av, 'LL', t)(-.8) + .006), limbPoint(l, t, -.8, 1).sub(limbPoint(l, t, -.8, 0)), { rx: .009, ry: .009, rz: .003, rect: O.metal, keep: 'leg:LL', n: 10 });
  }
}

// ---- 슬립 드레스 + 어깨에서 흘러내린 재킷 (참고: 하늘색 프릴 재킷) ----
function slipJacket(O, p) {
  const av = O.av, E = envelope(av), pal = p.pal;
  common(O, pal);
  const hem = E.tw - .36, top = sweetheart(E);
  const ease = snug(O, E, (t, a) => .0038 + .0012 * (Math.sin(TAU * (t * 4.2 + Math.sin(a * 2) * .22)) + 1) * sstep(E.tb - .2, E.tw - .2, t), .008);
  const S = surf(av, ease);
  O.cover = [E.tw - .75, E.tb + .1];
  const bodyR = O.rect(1000, 420, (c, r) => {
    P.fill(c, r, pal.a);
    P.folds(c, r, 23, 14, .1, .05); P.shade(c, r, .05, .08);
  });
  bodice(O, { ease, top, hem: () => hem, rect: bodyR, nu: 128, nv: 96 });
  ruffle(O, { at: ringOn(S, av, top, .0012), n: 40, w: .016, amp: .005, rect: O.rect(1000, 50, (c, r) => P.lace(c, r, pal.a)), scallop: .3, seed: 5 });
  const thin = O.flat(() => pal.a);
  for (const s of [-1, 1]) strap(O, surf(av, () => .001), [[top(s * .5), s * .5], [4.98, s * .54], [5.04, s * .7], [5.04, s * 2.5], [4.96, s * 2.7], [top(s * 2.8), s * 2.8]], { w: .0065, rect: thin, nv: 40, off: .001 });

  // 치마 쪽: 엉덩이를 타고 내려오는 좁은 자락
  const t1 = lerp(2.05, 1.5, p.skirt), skirtPaint = (c, r) => { P.fill(c, r, pal.a); P.gather(c, r, 15, 4, .1, .05); };
  const sk = softSkirt(O, { t0: hem + .06, t1, flare: .006 + .026 * p.flare, stiff: .7, tiers: [{ v0: 0, v1: 1, n: 15, amp: .006, off: .001, seed: 4, rect: O.rect(1100, 260, skirtPaint), hem: .006 }] });
  tierLace(O, sk, .985, O.rect(1100, 40, (c, r) => P.lace(c, r, pal.a)), 34, 6, .016);

  // 재킷 소매: 위팔까지 내려앉음
  for (const side of ['AL', 'AR']) {
    const seed = side === 'AL' ? 4 : 9, st = .36, end = lerp(1.5, 2.2, p.sleeve), E2 = slouch(seed, lerp(.026, .056, p.volume));
    const rect = O.rect(420, 400, (c, r) => {
      P.fill(c, r, pal.b); P.gather(c, r, 7, seed, .2, .1); P.shade(c, r, .12, .18);
    });
    sleeve(O, side, { start: st, len: end, rect, ease: E2 });
    const frR = O.rect(420, 60, (c, r) => P.lace(c, r, pal.c));
    ruffle(O, { at: limbAt(av, side, end, a => E2(1, a) + .002), n: 18, w: .03, amp: .007, rect: frR, keep: armOf(side), seed, scallop: .3 });
    ruffle(O, { at: limbAt(av, side, st, a => E2(0, a) + .002, -1), n: 18, w: .024, amp: .006, rect: frR, keep: armOf(side), seed: seed + 2, scallop: .3 });
    // 소매를 따라 내려가는 프릴
    const l = av.fr[side], stripeR = O.rect(420, 56, (c, r) => P.lace(c, r, pal.c));
    if (p.frills) ruffle(O, { closed: false, n: 16, nu: 96, w: .022, amp: .006, rect: stripeR, keep: armOf(side), seed: seed + 3, scallop: .25, flare: .2,
      at: u => {
        const t = lerp(st + .1, end - .12, u), v = (t - st) / (end - st), R = limbRing(av, side, t), a = side === 'AL' ? .8 : -.8;
        const r = R(a) + E2(v, a) + .011, q = limbPoint(l, t, a, r), o = q.clone().sub(limbPoint(l, t, a, 0)).normalize();
        return [q, o, limbPoint(l, t, a * .5, r).sub(q).normalize()];
      } });
    for (const t of [st + .5, st + .95]) {
      const [q, n] = limbAt(av, side, t, E2((t - st) / (end - st), .4) + .006)(.56);
      lump(O, q, n, { rx: .012, ry: .006, rz: .004, rect: O.flat(() => pal.c), keep: armOf(side), n: 8 });
    }
  }
  // 재킷 등판: 등 뒤로 흘러내린 천
  const backEase = (t, a) => .018 + .012 * P.fold((a - Math.PI + 1.5) / 3, 5, 3);
  const backS = surf(av, backEase);
  const backR = O.rect(620, 340, (c, r) => { P.fill(c, r, pal.b); P.gather(c, r, 5, 3, .22, .1); P.shade(c, r, .2, .2); });
  patch(O, backS, { t0: E.tb + .12, t1: E.tw - .42, a0: () => Math.PI - 1.5, a1: () => Math.PI + 1.5, rect: backR, nu: 90, nv: 28, off: 0 });
  const backTrim = O.rect(620, 50, (c, r) => P.lace(c, r, pal.c));
  ruffle(O, { closed: false, at: u => { const a = lerp(Math.PI - 1.5, Math.PI + 1.5, u), t = E.tw - .42, q = backS(t, a); return [q, normalAt(av, backS, t, a), V(0, -1, 0)]; }, n: 18, w: .022, amp: .006, nu: 120, rect: backTrim, seed: 3, scallop: .3 });

  // 초커와 허벅지 가터
  choker(O, av, O.rect(300, 40, (c, r) => { P.fill(c, r, pal.a); P.band(c, r, r.y + 14, 10, pal.c); }));
  if (p.garter) {
    const R = O.rect(220, 30, (c, r) => { P.fill(c, r, pal.a); P.band(c, r, r.y + 12, 5, pal.c); });
    legBand(O, 'LL', .42, { w: .02, rect: R });
    const l = av.fr.LL, T = .42, A = -.5;
    bow(O, S, limbPoint(l, T, A, limbRing(av, 'LL', T)(A) + .012), limbPoint(l, T, A, 1).sub(limbPoint(l, T, A, 0)), { w: .022, h: .009, rect: O.flat(() => pal.c), tail: 0, keep: 'leg:LL', free: 1 });
  }
}

// ---- 고딕 코르셋 드레스 (참고: 검정 코르셋 + 흰 셔츠 + 체크) ----
function gothic(O, p) {
  const av = O.av, E = envelope(av), pal = p.pal;
  common(O, pal);
  const hem = E.tw - .25, shirtTop = () => 5.08;
  const shirtEase = (t, a) => .004 + .003 * sstep(E.tb + .2, E.tb - .2, t);
  const shirt = surf(av, shirtEase);
  O.cover = [E.tw - .75, 4.9];
  const shR = O.rect(1000, 380, (c, r) => { P.fill(c, r, pal.c); const cx = r.x + r.w / 2; P.stitch(c, cx, r.y, cx, r.y + r.h, 'rgba(0,0,0,.2)'); });
  bodice(O, { ease: shirtEase, top: shirtTop, hem: () => E.tb - .1, rect: shR, nu: 96, nv: 36 });
  // 셔츠 깃: 앞에서 벌어진 뾰족한 두 장
  const colR = O.rect(360, 90, (c, r) => { P.fill(c, r, pal.c); P.band(c, r, r.y + r.h - 7, 4, pal.a); P.shade(c, r, 0, .1); });
  for (const s of [-1, 1]) shell(O, { nu: 20, nv: 8, closed: false, th: .0014, rect: colR, keep: 'torso',
    f(u, v) {
      const a = s * lerp(.05, 1.2, u), tip = 1 - u, t = lerp(5.1, 5.1 - lerp(.1, .3, tip ** 1.6), v), q = shirt(t, a, .0035 + .004 * (1 - v));
      return [q, q.clone().sub(axisT(av, t))];
    } });
  const [nq, nn] = onBody(shirt, av, 5.0, 0, .012);
  bow(O, shirt, nq, nn, { w: .05, h: .019, rect: O.rect(160, 90, (c, r) => { P.fill(c, r, pal.a); P.gather(c, r, 4, 2, .3, .12); }), tail: .1 });
  plate(O, nq.clone().add(V(0, 0, .009)), nn, .0085, .0085, O.metal);

  // 코르셋: 가슴 아래부터 허리까지 몸에 붙는 검정
  const ease = snug(O, E, () => .0058, .016);
  const S = surf(av, ease), top = a => { const f = Math.abs(a); return lerp(lerp(E.tb + .12, E.tb + .2, sstep(.05, .5, f)), E.tb + .05, sstep(1, 1.7, f)); };
  const bodyR = O.rect(1000, 420, (c, r) => {
    P.fill(c, r, pal.a); c.fillStyle = 'rgba(255,255,255,.055)';
    for (let x = r.x; x < r.x + r.w; x += 17) c.fillRect(x, r.y, 2, r.h);
    for (const f of [.3, .7, .13, .87]) P.stitch(c, r.x + r.w * f, r.y, r.x + r.w * f, r.y + r.h, 'rgba(255,255,255,.25)', 2.5, [9, 7]);
    P.shade(c, r, .1, .15);
  });
  bodice(O, { ease, top, hem: () => hem, rect: bodyR, nu: 128 });
  ruffle(O, { at: ringOn(S, av, top, .001), n: 34, w: .016, amp: .004, rect: O.rect(1000, 44, (c, r) => P.lace(c, r, pal.c)), scallop: .3, seed: 6 });
  // 어깨 끈
  const wide0 = O.flat(() => pal.a);
  for (const s of [-1, 1]) strap(O, surf(av, shirtEase), [[top(s * .55), s * .55], [4.92, s * .6], [5.03, s * .8], [5.03, s * 2.35], [4.9, s * 2.5], [top(s * 2.6), s * 2.6]], { w: .016, rect: wide0, nv: 40, off: .0034 });
  // 앞 끈
  if (p.lace) {
    const cord = O.flat(() => pal.c), t1 = E.tb + .02, t0 = hem + .06, n = 7;
    for (let i = 0; i < n; i++) for (const s of [-1, 1]) {
      const y0 = lerp(t1, t0, i / n), y1 = lerp(t1, t0, (i + 1) / n), l = [];
      for (let k = 0; k <= 5; k++) l.push(S(lerp(y0, y1, k / 5), s * .1 * (1 - 2 * k / 5), .0022));
      tube(O, l, { r: .0017, rect: cord, n: 5 });
    }
    for (let i = 0; i <= n; i++) for (const s of [-1, 1]) { const [q, m] = onBody(S, av, lerp(t1, t0, i / n), s * .1, .002); lump(O, q, m, { rx: .0034, ry: .0034, rz: .0016, rect: O.metal, n: 6 }); }
  }

  // 소매
  for (const side of ['AL', 'AR']) {
    const seed = side === 'AL' ? 6 : 2, end = lerp(1.04, 2.02, p.sleeve);
    const E2 = (v, a) => (v < .45 ? puff(seed, .017)(v / .9, a) : .006 + (puff(seed, .017)(.5, a) - .006) * (1 - sstep(.45, .8, v)) + .005 * sstep(.45, 1, v));
    const rect = O.rect(420, 380, (c, r) => {
      P.fill(c, r, pal.c); P.gather(c, { ...r, h: r.h * .5 }, 11, seed, .12, .06);
      const y = r.y + r.h * .84; c.fillStyle = pal.a; c.fillRect(r.x, y, r.w, r.h - (y - r.y)); P.band(c, r, y + 6, 3, pal.c);
    });
    sleeve(O, side, { start: -.1, len: end, rect, ease: E2 });
    ruffle(O, { at: limbAt(av, side, end, .012), n: 16, w: .024, amp: .005, rect: O.rect(420, 50, (c, r) => P.lace(c, r, pal.c)), keep: armOf(side), seed, scallop: .3 });
  }

  // 치마: 검정 겉치마 + 체크 속치마 + 레이스
  const t0 = hem + .05, t1 = lerp(2.0, 1.42, p.skirt);
  const blk = (c, r) => { P.fill(c, r, pal.a); P.gather(c, r, 26, 8, .36, .1); P.band(c, r, r.y + r.h - 12, 3, pal.c); };
  const chk = (c, r) => { P.plaid(c, r, pal.a, pal.b, pal.c, 56); P.gather(c, r, 32, 3, .3, .08); };
  const sk = softSkirt(O, { t0, t1, flare: .05 + .07 * p.flare, tiers: [
    { v0: .5, v1: 1, n: 32, amp: .01, off: -.004, seed: 3, rect: O.rect(1100, 180, chk), scallop: .012, hem: .008 },
    { v0: 0, v1: .74, n: 26, amp: .012, kick: .012, off: .004, seed: 8, rect: O.rect(1100, 240, blk), hem: .01 },
  ] });
  tierLace(O, sk, .992, O.rect(1100, 44, (c, r) => P.lace(c, r, pal.c)), 42, 5, .022);
  tierLace(O, sk, .74, O.rect(1100, 44, (c, r) => P.lace(c, r, pal.c)), 36, 9, .016, .019);
  skirtBand(O, sk, () => .02, { w: .02, off: .006, rect: O.rect(200, 36, (c, r) => { P.fill(c, r, pal.a); P.band(c, r, r.y + 6, 2, pal.c); P.band(c, r, r.y + 28, 2, pal.c); }) });
  const [hq, ho] = skirtRing(sk, () => .02, .012)(.5);
  plate(O, hq, ho, .014, .012, O.metal);

  choker(O, av, O.rect(300, 40, (c, r) => { P.fill(c, r, pal.a); P.band(c, r, r.y + 16, 6, pal.c); }), 5.34, .012);
}

// ---- 4. 레이스 프릴 드레스 (어깨 드러낸 퍼프 소매 + 코르셋 허리 + 겹치마) ----
function frillDress(O, p) {
  const av = O.av, E = envelope(av), pal = p.pal;
  common(O, pal);
  const hem = E.tw - .3, top = sweetheart(E);
  const ease = snug(O, E, (t, a) => .0032 + .004 * sstep(E.tw, E.tw - .3, t), .015);
  const S = surf(av, ease);
  O.cover = [E.tw - .75, E.tb + .1];

  // 몸판: 가슴은 천을 모아 잡고 허리는 코르셋
  const bodyR = O.rect(1000, 420, (c, r) => {
    P.fill(c, r, pal.a); P.shade(c, r, .08, .1);
    const y = r.y + r.h * .42;
    P.gather(c, { ...r, h: r.h * .42 }, 38, 3, .07, .04);
    P.band(c, r, y, 4, 'rgba(120,110,150,.4)');
    for (const f of [.32, .68, .12, .88]) P.stitch(c, r.x + r.w * f, y, r.x + r.w * f, r.y + r.h, 'rgba(120,110,150,.5)', 2.5, [11, 7]);
  });
  bodice(O, { ease, top, hem: () => hem, rect: bodyR, nu: 128 });

  // 윗선 레이스
  const edgeR = O.rect(1000, 80, (c, r) => P.lace(c, r, pal.a));
  ruffle(O, { at: ringOn(S, av, top, .0015), n: 44, w: .03, amp: .007, rect: edgeR, scallop: .3, seed: 2 });

  // 어깨에서 내려앉은 퍼프 소매
  for (const side of ['AL', 'AR']) {
    const seed = side === 'AL' ? 2 : 5, st = .26, end = lerp(.62, 1.18, p.sleeve);
    const rect = O.rect(420, 300, (c, r) => { P.fill(c, r, pal.a); P.gather(c, r, 11, seed, .3, .12); P.shade(c, r, .25, .25); });
    sleeve(O, side, { start: st, len: end, rect, ease: puff(seed, lerp(.016, .036, p.puff)) });
    const lim = av.fr[side], at = t => u => {
      const a = u * TAU - Math.PI, R = limbRing(av, side, t);
      const q = limbPoint(lim, t, a, R(a) + .007), b = limbPoint(lim, t, a, 0);
      return [q, q.clone().sub(b).normalize(), limbPoint(lim, t + (t > .5 ? .2 : -.2), a, R(a)).sub(q).normalize()];
    };
    const laceR = O.rect(420, 60, (c, r) => P.lace(c, r, pal.a));
    ruffle(O, { at: at(end), n: 18, w: .026, amp: .006, rect: laceR, keep: 'arm:' + (side === 'AL' ? 'AR' : 'AL'), scallop: .3, seed });
    ruffle(O, { at: at(st), n: 18, w: .02, amp: .005, rect: laceR, keep: 'arm:' + (side === 'AL' ? 'AR' : 'AL'), scallop: .3, seed: seed + 1 });
    const ribR = O.flat(() => pal.b), n = limbPoint(lim, end, 0, .05).sub(limbPoint(lim, end, 0, 0));
    lump(O, limbPoint(lim, end, 0, limbRing(av, side, end)(0) + .011), n, { rx: .006, ry: .012, rz: .004, rect: ribR, keep: 'arm:' + (side === 'AL' ? 'AR' : 'AL'), n: 10 });
  }

  // 코르셋 앞 끈
  if (p.lace) {
    const cord = O.flat(() => pal.b), w = .22, n = 6, t1 = E.tw + .22, t0 = hem + .1;
    for (let i = 0; i < n; i++) {
      const y0 = lerp(t1, t0, i / n), y1 = lerp(t1, t0, (i + 1) / n);
      for (const s of [-1, 1]) {
        const line = []; for (let k = 0; k <= 6; k++) line.push(S(lerp(y0, y1, k / 6), s * w * (1 - 2 * k / 6), .004));
        tube(O, line, { r: .0018, rect: cord, n: 5 });
      }
    }
    const [q, nn] = onBody(S, av, t1 + .03, 0, .007);
    bow(O, S, q, nn, { w: .04, h: .0085, rect: O.flat(() => pal.b), tail: .06 });
  }

  // 겹치마
  const top0 = hem + .05, t1 = lerp(1.95, 1.4, p.skirt);
  const paint = (seed, n) => (c, r) => { P.fill(c, r, pal.a); P.gather(c, r, n, seed, .13, .08); P.band(c, r, r.y + r.h - 9, 3, 'rgba(120,110,150,.3)'); };
  const tiers = [
    { v0: .6, v1: 1, n: 26, amp: .009, kick: .006, off: -.005, seed: 4, rect: O.rect(1200, 180, paint(4, 26)), scallop: .01 },
    { v0: .28, v1: .69, n: 24, amp: .009, kick: .012, off: 0, seed: 7, rect: O.rect(1200, 180, paint(7, 24)), scallop: .01 },
    { v0: 0, v1: .37, n: 22, amp: .007, kick: .016, off: .005, seed: 9, rect: O.rect(1200, 170, paint(9, 22)), scallop: .01 },
  ];
  const sk = softSkirt(O, { t0: top0, t1, flare: .03 + .05 * p.flare, tiers });
  const hemLace = O.rect(1200, 60, (c, r) => P.lace(c, r, pal.a));
  tierLace(O, sk, .995, hemLace, 42, 3, .026, .004);
  tierLace(O, sk, .69, hemLace, 38, 5, .018, .017);
  tierLace(O, sk, .37, hemLace, 34, 8, .016, .026);

  // 초커
  const chokerT = 5.33;
  const chokerR = O.rect(300, 40, (c, r) => { P.fill(c, r, pal.a); P.band(c, r, r.y + r.h * .45, 8, pal.b); });
  strap(O, surf(av, () => .002), around(chokerT, 44), { w: .016, rect: chokerR, closed: true, off: .001 });
}

// ---- 벚꽃 저고리 드레스 (참고: 분홍 저고리 + 허리띠 + 노리개 + 비치는 소매와 레이스) ----
function hanbok(O, p) {
  const av = O.av, E = envelope(av), pal = p.pal;
  common(O, pal);
  const squeeze = cinch(E, lerp(.004, .017, p.fit)), ease = (t, a) => .0034 + squeeze(t, a);
  const S = surf(av, ease), jEase = (t, a) => ease(t, a) + .0034 + .004 * sstep(E.tb - .1, E.tb - .3, t); // 저고리는 띠 위에 얹힌다
  const Sj = surf(av, jEase);
  const deep = lerp(4.76, 4.6, p.neck), top = a => lerp(deep, 5.03, clamp(Math.abs(a) / .72) ** .85);
  const wHem = E.tw - .3, jHem = E.tb - .4;
  O.tol = lerp(.004, .017, p.fit); O.cover = [E.tw - .75, E.ts - .1]; // 큰 삼각형이 걸치면 안 지워지니 치마 속까지 넉넉히 숨긴다

  // 속 몸판: 저고리 아래로 드러나는 흰 허리띠와 진분홍 안단
  const midR = O.rect(1000, 180, (c, r) => {
    P.fill(c, r, pal.c);
    const y = r.y + r.h * .62, g = c.createLinearGradient(0, y, 0, r.y + r.h);
    g.addColorStop(0, 'rgba(118,104,150,0)'); g.addColorStop(1, 'rgba(118,104,150,.3)');
    c.fillStyle = g; c.fillRect(r.x, y, r.w, r.y + r.h - y);
    P.fill(c, { ...r, h: r.h * .62 }, pal.b);
  });
  bodice(O, { ease, top: () => jHem + .3, hem: () => wHem, rect: midR });

  // 저고리: 앞은 꽃잎 두 장으로 끝난다
  const petal = a => {
    const f = Math.abs(a), s = Math.sin(f / 1.15 * Math.PI);
    return f > 1.15 ? jHem - .03 : jHem + .12 * (1 - Math.abs(s)) - .03 * s;
  };
  const jR = O.rect(1000, 460, (c, r) => {
    const g = c.createLinearGradient(0, r.y, 0, r.y + r.h);
    g.addColorStop(0, pal.a2); g.addColorStop(1, pal.a);
    c.fillStyle = g; c.fillRect(r.x, r.y, r.w, r.h);
    P.form(c, r, pal.d, .55);
    P.band(c, r, r.y + r.h - 9, 7, pal.d); // 밑단 박음선
    for (const f of [.41, .59]) P.stitch(c, r.x + r.w * f, r.y + r.h * .5, r.x + r.w * f, r.y + r.h, pal.d, 2.2, [10, 7]);
    for (const [x, y, s2] of [[.57, .42, 21], [.6, .54, 15], [.55, .6, 12], [.585, .3, 11]]) P.blossom(c, r.x + r.w * x, r.y + r.h * y, s2, 'rgba(255,240,244,.8)', pal.d);
  });
  bodice(O, { ease: jEase, top, hem: petal, rect: jR, nu: 128 });

  // 깃: 하얀 동정이 목에서 V로 내려와 겹친다
  const wrap = a => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  const colR = O.rect(1200, 90, (c, r) => { P.fill(c, r, pal.c); P.band(c, r, r.y + r.h - 16, 12, pal.a); });
  collar(O, Sj, { a: u => lerp(0, TAU, u), top: a => top(wrap(a)) + .004, edge: a => top(wrap(a)) - .13, rect: colR, off: .0026, nu: 170, nv: 6, lift: .0018 });

  // 고름
  const ribbon = O.rect(120, 120, (c, r) => { P.fill(c, r, pal.c); P.shade(c, r, .1, .22); });
  const [q0, n0] = onBody(Sj, av, deep - .08, .08, .014);
  bow(O, Sj, q0, n0, { w: .05, h: .015, rect: ribbon, tail: .15, float: 1 });

  // 소매: 비치는 흰 천, 끝은 분홍 소맷부리
  for (const side of ['AL', 'AR']) {
    const seed = side === 'AL' ? 3 : 6, len = lerp(.8, 1.92, p.sleeve), keep = armOf(side);
    const rect = O.rect(300, 240, (c, r) => {
      c.clearRect(r.x, r.y, r.w, r.h);
      c.fillStyle = `rgba(255,255,255,${lerp(.42, .86, p.sheer)})`; c.fillRect(r.x, r.y, r.w, r.h);
      c.globalCompositeOperation = 'source-atop'; P.gather(c, r, 8, seed, .18, .2); c.globalCompositeOperation = 'source-over';
    });
    O.sheerOn = true;
    sleeve(O, side, { len, rect, start: .03, ease: (v, a) => .0045 + (.04 * v ** 1.6 * (.55 + .45 * Math.cos(a)) + (P.fold((a / TAU + 1.5) % 1, 8, seed) - .5) * .01 * v) * (1 - .6 * sstep(.9, 1, v)) });
    O.sheerOn = false;
    const cuffR = O.rect(300, 60, (c, r) => { P.fill(c, r, pal.a); P.gather(c, r, 12, seed, .18, .1); P.band(c, r, r.y + r.h - 8, 6, pal.d); });
    ruffle(O, { at: limbAt(av, side, len, .019, -1), n: 10, w: .03, amp: .004, flare: .22, rect: cuffR, keep, seed });
    const capR = O.rect(300, 44, (c, r) => { P.fill(c, r, pal.a); P.gather(c, r, 16, seed, .2, .1); P.band(c, r, r.y + r.h - 7, 5, pal.d); });
    ruffle(O, { at: limbAt(av, side, .1, .007, 1), n: 15, w: .022, amp: .004, flare: .3, rect: capR, keep, seed: seed + 1 });
  }

  // 치마: 분홍이 아래로 옅어지고 벚꽃이 흩어진다. 앞치마처럼 비치는 레이스가 겹친다.
  const t0 = E.tw - .17, t1 = lerp(1.98, 1.35, p.skirt), nf = 13;
  const skirtR = O.rect(1400, 330, (c, r) => {
    const g = c.createLinearGradient(0, r.y, 0, r.y + r.h);
    g.addColorStop(0, pal.a); g.addColorStop(.5, pal.a2); g.addColorStop(1, pal.e);
    c.fillStyle = g; c.fillRect(r.x, r.y, r.w, r.h);
    P.form(c, r, pal.d, .5);
    P.gather(c, r, nf, 5, .2, .12);
    const R = P.rng(11);
    c.fillStyle = 'rgba(255,255,255,.5)';
    for (let i = 0; i < 26; i++) { c.beginPath(); c.arc(r.x + R() * r.w, r.y + R() * r.h * .6, 3 + R() * 3, 0, 7); c.fill(); }
    for (const [x, y, s2] of [[.63, .2, 16], [.655, .32, 22], [.62, .42, 13], [.68, .48, 18], [.35, .3, 15], [.32, .44, 19]]) P.blossom(c, r.x + r.w * x, r.y + r.h * y, s2, pal.d, 'rgba(255,255,255,.5)');
  });
  const laceR = O.rect(1400, 210, (c, r) => P.sheerLace(c, r, undefined, 2, 34));
  const tiers = [
    { v0: 0, v1: 1, n: nf, amp: .022, grow: 1.1, seed: 5, rect: skirtR, hem: .004 },
    { v0: .42, v1: 1.015, n: nf, amp: .022, grow: 1.1, off: .0045, seed: 5, rect: laceR, hem: .004, sheer: true },
  ];
  const sk = softSkirt(O, { t0, t1, flare: lerp(.03, .1, p.flare), tiers, nc: 12, ease: .0045 });
  const frR = O.rect(1400, 90, (c, r) => { P.fill(c, r, pal.c); P.gather(c, r, 22, 8, .26, .12); P.band(c, r, r.y + r.h - 8, 3, 'rgba(120,100,140,.5)'); });
  ruffle(O, { at: skirtRing(sk, () => .985, -.002), n: 22, w: .05, amp: .018, flare: .42, nu: 22 * 8, nv: 7, rect: frR, keep: 'hip', seed: 8, skin: u => sk.skinAt(u, .985) });

  // 띠: 허리에 두른 진분홍 띠와 치마 윗단
  const beltR = O.rect(1000, 24, (c, r) => { P.fill(c, r, pal.d); P.band(c, r, r.y + 3, 3, 'rgba(255,255,255,.45)'); });
  strap(O, surf(av, (t, a) => ease(t, a) + .001), around(E.tw + .1, 64), { w: .013, rect: beltR, closed: true, off: .0016 });
  skirtBand(O, sk, () => .012, { w: .009, off: .003, rect: beltR });

  // 노리개: 나비 → 금 장식 → 매듭 → 술. 오른쪽 허리에서 늘어진다.
  const A = .5, hang = t => S(t, A, .012 + .012 * sstep(t0, t0 - .5, t));
  const knotR = O.flat(() => pal.d), goldR = O.metal;
  const [b0, b1] = onBody(S, av, E.tw + .14, A, .009);
  bow(O, S, b0, b1, { w: .027, h: .017, rect: O.rect(100, 100, (c, r) => { P.fill(c, r, pal.a2); P.shade(c, r, .1, .2); }) });
  const tTop = E.tw - .08;
  tube(O, [S(E.tw + .1, A, .011), S(E.tw + .02, A, .012), S(tTop, A, .013)], { r: .0017, rect: knotR, keep: 'hip' });
  lump(O, hang(tTop - .02), b1, { rx: .0085, ry: .0065, rz: .005, rect: goldR, keep: 'hip' });
  lump(O, hang(tTop - .1), b1, { rx: .0055, ry: .0055, rz: .004, rect: goldR, keep: 'hip' });
  const kc = hang(tTop - .3), kn = kc.clone().sub(axisT(av, tTop - .3)).setY(0).normalize(), kx = V(0, 1, 0).cross(kn).normalize();
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { // 네 잎 매듭
    const loop = [];
    for (let i = 0; i <= 18; i++) { const th = i / 18 * TAU; loop.push(kc.clone().addScaledVector(kx, dx * .0135 + Math.cos(th) * .0098).add(V(0, dy * .0135 + Math.sin(th) * .0098, 0)).addScaledVector(kn, .002)); }
    tube(O, loop, { r: .0016, rect: knotR, keep: 'hip', n: 6 });
  }
  lump(O, kc.clone().addScaledVector(kn, .003), kn, { rx: .0062, ry: .0062, rz: .005, rect: knotR, keep: 'hip', n: 10 });
  const tasselR = O.rect(80, 120, (c, r) => { P.fill(c, r, pal.d); c.fillStyle = 'rgba(40,0,20,.35)'; for (let x = r.x; x < r.x + r.w; x += 7) c.fillRect(x, r.y + r.h * .2, 2, r.h); });
  shell(O, { nu: 12, nv: 8, closed: true, rect: tasselR, keep: 'hip', inner: false,
    f(u, v) {
      const a = u * TAU, rr = lerp(.0045, .0098, sstep(.05, .3, v)), c = kc.clone().add(V(0, -.018 - v * .07, 0));
      const d = kx.clone().multiplyScalar(Math.cos(a) * rr).addScaledVector(kn, Math.sin(a) * rr * .7);
      return [c.clone().add(d), d];
    } });

  // 왼쪽 리본
  const [r0, r1] = onBody(S, av, E.tw - .1, -.56, .015);
  bow(O, S, r0, r1, { w: .036, h: .019, rect: O.rect(100, 100, (c, r) => { P.fill(c, r, pal.d); P.shade(c, r, .1, .3); }), tail: .17, keep: 'hip' });
  lump(O, r0.clone().addScaledVector(r1.clone().normalize(), .008), r1, { rx: .0095, ry: .0095, rz: .003, rect: goldR, keep: 'hip', n: 12 });
}

export const LOOKS = {
  hanbok: { label: '벚꽃 저고리 드레스', why: '짧은 저고리, 조인 허리띠, 노리개, 비치는 소매와 레이스', build: hanbok,
    controls: [
      { key: 'fit', label: '허리 조임' }, { key: 'skirt', label: '치마 길이' }, { key: 'flare', label: '치마 퍼짐' },
      { key: 'sheer', label: '소매 비침' }, { key: 'sleeve', label: '소매 길이' }, { key: 'neck', label: '목선 깊이' },
    ],
    colors: [{ key: 'a', label: '옷 색', values: ['#f7a9bf', '#a9c9f7', '#c9b3f2', '#2b2733'] }, { key: 'd', label: '끈 색', values: ['#c8416d', '#3b5fb0', '#6a44b8', '#111118'] }],
    vote: [
      { q: '치마 길이', opts: [['아주 짧게', { skirt: .1 }], ['짧게', { skirt: .35 }], ['무릎 위', { skirt: .9 }]] },
      { q: '옷 색', opts: [['벚꽃', { pal: { a: '#f7a9bf', a2: '#fbcdd9', d: '#c8416d', e: '#fff0f3' } }], ['하늘', { pal: { a: '#a9c9f7', a2: '#cfe2fb', d: '#3b5fb0', e: '#f0f6ff' } }], ['라일락', { pal: { a: '#c9b3f2', a2: '#e0d3f8', d: '#6a44b8', e: '#f6f1ff' } }]] },
      { q: '소매', opts: [['많이 비치게', { sheer: .1 }], ['조금만', { sheer: .8 }]] },
    ],
    params: { fit: .75, skirt: .3, flare: .5, sheer: .55, sleeve: 1, neck: .5,
      pal: { a: '#f7a9bf', a2: '#fbcdd9', b: '#d9558a', c: '#f6f3f8', d: '#c8416d', e: '#fff0f3', lining: '#f0c0cf', metalHi: '#fff8dc', metalMid: '#e2c37f', metalLo: '#94743a' } } },
  frill: { label: '레이스 프릴 드레스', why: '어깨를 드러낸 퍼프 소매, 조인 허리, 층층이 퍼지는 치마', build: frillDress,
    controls: [
      { key: 'sleeve', label: '소매 길이' }, { key: 'puff', label: '소매 풍성함' },
      { key: 'skirt', label: '치마 길이' }, { key: 'flare', label: '치마 퍼짐' }, { key: 'lace', label: '코르셋 끈', toggle: true },
    ],
    colors: [{ key: 'b', label: '리본 색', values: ['#c9d6ff', '#ff8fb6', '#111118', '#b89cff'] }, { key: 'a', label: '옷 색', values: ['#fbfafc', '#17161d', '#f3dfe6', '#d9e2f4'] }],
    vote: [
      { q: '치마 길이', opts: [['아주 짧게', { skirt: .1 }], ['짧게', { skirt: .4 }], ['무릎 위', { skirt: .9 }]] },
      { q: '소매', opts: [['짧은 퍼프', { sleeve: .1 }], ['긴 퍼프', { sleeve: .85 }]] },
      { q: '옷 색', opts: [['화이트', { pal: { a: '#fbfafc' } }], ['블랙', { pal: { a: '#17161d' } }], ['라일락', { pal: { a: '#d9e2f4' } }]] },
    ],
    params: { sleeve: .2, puff: .6, skirt: .3, flare: .6, lace: 1,
      pal: { a: '#fbfafc', b: '#c9d6ff', lining: '#e7e4ee', metalHi: '#ffffff', metalMid: '#c9c9d6', metalLo: '#83839a' } } },
  street: { label: '오프숄더 스트릿', why: '흘러내린 오버 소매와 드러난 어깨, 검정 미니 아래 흰 속치마', build: street,
    controls: [
      { key: 'loose', label: '오버핏' }, { key: 'sleeve', label: '소매 길이' },
      { key: 'skirt', label: '치마 길이' }, { key: 'flare', label: '치마 퍼짐' },
      { key: 'belts', label: '벨트·체인', toggle: true }, { key: 'garter', label: '허벅지 벨트', toggle: true },
    ],
    colors: [{ key: 'c', label: '글자 색', values: ['#17161d', '#c81e4a', '#3b55d9', '#7b3fd0'] }, { key: 'a', label: '상의 색', values: ['#f5f3f0', '#d9dce8', '#f3d9e2', '#23222a'] }],
    text: { key: 'mark', label: '가슴 글자', value: 'Midnight', max: 12 },
    vote: [
      { q: '치마 길이', opts: [['아주 짧게', { skirt: .1 }], ['짧게', { skirt: .4 }], ['무릎 위', { skirt: .9 }]] },
      { q: '허벅지 벨트', opts: [['넣자', { garter: 1 }], ['빼자', { garter: 0 }]] },
      { q: '상의 색', opts: [['화이트', { pal: { a: '#f5f3f0' } }], ['핑크', { pal: { a: '#f3d9e2' } }], ['블랙', { pal: { a: '#23222a' } }]] },
    ],
    params: { loose: .5, sleeve: 1, skirt: .3, flare: .5, belts: 1, garter: 1, mark: 'Midnight',
      pal: { a: '#f5f3f0', a2: '#6d6c78', b: '#17161d', c: '#17161d', lining: '#0f0e13', belt: '#3b3a45', metalHi: '#ffffff', metalMid: '#b5b5c0', metalLo: '#5c5c68' } } },
  jacket: { label: '슬립과 흘러내린 재킷', why: '몸에 붙는 슬립 드레스, 어깨에서 내려앉은 프릴 재킷', build: slipJacket,
    controls: [
      { key: 'volume', label: '재킷 품' }, { key: 'sleeve', label: '소매 길이' },
      { key: 'skirt', label: '드레스 길이' }, { key: 'flare', label: '자락 퍼짐' },
      { key: 'frills', label: '소매 프릴', toggle: true }, { key: 'garter', label: '다리 가터', toggle: true },
    ],
    colors: [{ key: 'b', label: '재킷 색', values: ['#bcd0f7', '#f6c6d8', '#d8c8f5', '#2b2a33'] }, { key: 'a', label: '드레스 색', values: ['#dcdde4', '#f7f5f2', '#22212a', '#f2d7e0'] }],
    vote: [
      { q: '재킷 색', opts: [['하늘', { pal: { b: '#bcd0f7' } }], ['핑크', { pal: { b: '#f6c6d8' } }], ['블랙', { pal: { b: '#2b2a33' } }]] },
      { q: '드레스 길이', opts: [['짧게', { skirt: .3 }], ['무릎 위', { skirt: .9 }]] },
      { q: '다리 가터', opts: [['넣자', { garter: 1 }], ['빼자', { garter: 0 }]] },
    ],
    params: { volume: .7, sleeve: .8, skirt: .35, flare: .4, frills: 1, garter: 1,
      pal: { a: '#dcdde4', b: '#bcd0f7', c: '#f8f8fb', lining: '#c9c6d6', metalHi: '#ffffff', metalMid: '#c9c9d6', metalLo: '#83839a' } } },
  gothic: { label: '고딕 코르셋', why: '흰 셔츠 위 조인 코르셋, 레이스 끝단과 체크 속치마', build: gothic,
    controls: [
      { key: 'sleeve', label: '소매 길이' }, { key: 'skirt', label: '치마 길이' }, { key: 'flare', label: '치마 퍼짐' }, { key: 'lace', label: '코르셋 끈', toggle: true },
    ],
    colors: [{ key: 'b', label: '체크 색', values: ['#4a4757', '#6b1c33', '#27407f', '#2f5a4b'] }, { key: 'a', label: '코르셋 색', values: ['#17161d', '#3a1420', '#1a2438'] }],
    vote: [
      { q: '소매', opts: [['짧게', { sleeve: 0 }], ['길게', { sleeve: 1 }]] },
      { q: '체크 색', opts: [['회색', { pal: { b: '#4a4757' } }], ['와인', { pal: { b: '#6b1c33' } }], ['남색', { pal: { b: '#27407f' } }]] },
      { q: '치마 길이', opts: [['짧게', { skirt: .3 }], ['무릎 위', { skirt: .9 }]] },
    ],
    params: { sleeve: 1, skirt: .4, flare: .6, lace: 1,
      pal: { a: '#17161d', b: '#4a4757', c: '#f7f5f2', lining: '#0e0d12', metalHi: '#ffffff', metalMid: '#bfc0cc', metalLo: '#5c5c68' } } },
  sailor: { label: '고딕 세일러', why: '4월 1위 Crimson Rumor가 검은 세일러 깃 + 붉은 스카프', build: sailor,
    controls: [
      { key: 'neck', label: 'V넥 깊이' }, { key: 'sleeve', label: '소매 길이' }, { key: 'puff', label: '어깨 볼륨' },
      { key: 'skirt', label: '치마 길이' }, { key: 'flare', label: '치마 퍼짐' }, { key: 'lace', label: '밑단 레이스', toggle: true },
    ],
    colors: [{ key: 'e', label: '스카프·벨트', values: ['#b3142e', '#1f6f5c', '#c9a24f', '#5b3fb0', '#101019'] }, { key: 'a', label: '옷 색', values: ['#232742', '#17171f', '#3a2030', '#e9e5e0'] }],
    vote: [
      { q: '치마 길이', opts: [['짧게', { skirt: .1 }], ['무릎 위', { skirt: .45 }], ['길게', { skirt: .85 }]] },
      { q: '스카프 색', opts: [['진홍', { pal: { e: '#b3142e' } }], ['청록', { pal: { e: '#1f6f5c' } }], ['보라', { pal: { e: '#5b3fb0' } }]] },
      { q: '레이스', opts: [['넣자', { lace: 1 }], ['빼자', { lace: 0 }]] },
    ],
    params: { neck: .8, sleeve: 1, puff: .7, skirt: .32, flare: .6, lace: 1,
      pal: { a: '#232742', a2: '#101019', c: '#eee9e4', d: '#f2eee8', e: '#b3142e', shirt: '#e9e5e0', st: 'rgba(255,255,255,.16)', lining: '#0d0d15', metalHi: '#fff4cf', metalMid: '#c79a45', metalLo: '#6f4f1e' } } },
  qipao: { label: '다크 치파오', why: '4월 4위 Setsurei, 최근 1위 Kirameki가 검정·붉은색 동양풍 자수', build: qipao,
    controls: [
      { key: 'sleeve', label: '소매 길이' }, { key: 'skirt', label: '치마 길이' }, { key: 'slit', label: '옆트임', hint: '낮게 ↔ 높게' },
      { key: 'flare', label: '치마 퍼짐' }, { key: 'tassel', label: '술 장식', toggle: true },
    ],
    colors: [{ key: 'e', label: '테두리·띠', values: ['#a81229', '#1f6f5c', '#27407f', '#c9a24f'] }, { key: 'a', label: '옷 색', values: ['#17151c', '#2a1420', '#16243a', '#efe9df'] }],
    vote: [
      { q: '소매', opts: [['반팔', { sleeve: .1 }], ['긴 나팔 소매', { sleeve: .92 }]] },
      { q: '테두리 색', opts: [['진홍', { pal: { e: '#a81229' } }], ['청록', { pal: { e: '#1f6f5c' } }], ['남색', { pal: { e: '#27407f' } }]] },
      { q: '치마 길이', opts: [['무릎 위', { skirt: .3 }], ['무릎', { skirt: .6 }], ['길게', { skirt: 1 }]] },
    ],
    params: { sleeve: .1, skirt: .55, flare: .3, slit: .6, tassel: 1,
      pal: { a: '#17151c', a3: 'rgba(170,150,200,.09)', d: '#c9a24f', dd: '#e1bd6c', e: '#a81229', lining: '#7b0d1f', metalHi: '#fff4cf', metalMid: '#c79a45', metalLo: '#6f4f1e' } } },
};
