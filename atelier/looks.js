// 조사 결과로 고른 옷 세 벌. 값은 전부 사용자가 고칠 수 있는 손잡이(params)다.
import * as THREE from 'three';
import { envelope, surf, bodice, sleeve, strap, patch, lump, tube, skirt, frill, collar, shell, lerp, sstep, clamp, TAU, axisT, normalAt, above } from './parts.js';
import * as P from './tex.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

function common(O, pal) {
  O.lining = O.rect(16, 16, (c, r) => P.fill(c, r, pal.lining));
  O.metal = O.rect(64, 64, (c, r) => P.metal(c, r, pal.metalHi, pal.metalMid, pal.metalLo));
  O.flat = col => O.rect(24, 24, (c, r) => P.fill(c, r, typeof col === 'function' ? col() : col));
}
const onBody = (S, av, t, a, off) => { const p = S(t, a, off); return [p, p.clone().sub(axisT(av, t))]; };
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
function bow(O, S, p, n, { w, h, rect, tail = 0 }) {
  const N = n.clone().normalize(), X = V(0, 1, 0).cross(N).normalize(), Y = N.clone().cross(X);
  const up = q => above(O.av, S, q, .002);
  const lobe = s => shell(O, { nu: 16, nv: 10, closed: true, rect, inner: false, keep: 'torso',
    f(u, v) {
      const a = u * TAU, x = v, pinch = .22 + .78 * Math.sin(Math.PI * clamp(x * .92 + .08)) ** .55;
      const c = p.clone().addScaledVector(X, s * x * w).addScaledVector(Y, x * h * .12);
      const d = Y.clone().multiplyScalar(Math.cos(a) * h * pinch).addScaledVector(N, Math.sin(a) * h * .34 * pinch);
      return [up(c.clone().add(d)), d.clone().addScaledVector(X, s * (x - .5))];
    } });
  lobe(-1); lobe(1);
  if (tail) for (const s of [-1, 1]) {
    shell(O, { nu: 8, nv: 8, closed: false, th: .0016, rect, keep: 'torso',
      f(u, v) {
        const y = v * tail, spread = s * (.006 + v * .03), wide = h * (.42 + v * .4);
        const c = p.clone().addScaledVector(Y, -y).addScaledVector(X, spread).addScaledVector(N, .004);
        const fork = v > .93 ? -(Math.abs(u - .5) < .1 ? .012 : 0) : 0;
        return [up(c.addScaledVector(X, (u - .5) * wide).addScaledVector(Y, fork)), N];
      } });
  }
  lump(O, p.clone().addScaledVector(N, h * .1), N, { rx: h * .34, ry: h * .42, rz: h * .3, rect, n: 12 });
}

const setTrim = (c, r, y, h, col) => { c.fillStyle = col; c.fillRect(r.x, y, r.w, h); };

// ---- 1. 다크 스트리트 후드 (7월 1위 검정 후드+하네스, 4월 2위 고양이 후드 계열) ----
function hood(O, p) {
  const av = O.av, E = envelope(av), pal = p.pal;
  common(O, pal);
  const hem = lerp(E.tw + .3, E.th - .1, p.len);
  const ribH = .2, loose = p.loose;
  const ease = (t, a) => {
    const body = .007 + .03 * loose * sstep(E.ts + .1, E.tb - .25, t) * (1 - sstep(hem + ribH + .28, hem + ribH, t) * .55);
    return lerp(body, .007, sstep(hem + ribH + .02, hem + ribH - .02, t));
  };
  const S = surf(av, ease);
  O.cover = [hem + .12, E.ts - .1];

  const top = a => lerp(5.05, 4.95, ((Math.cos(a) + 1) / 2) ** 1.5);
  const ringT = E.tb - .22;
  // 기장을 줄이면 몸판 그림도 줄어 글자가 벨트에 가려진다. 벨트 아래로 내린다.
  const span = S(top(0), 0).y - S(hem, 0).y, belt = (S(top(0), 0).y - S(ringT, 0).y + .04) / span;
  const logoV = clamp(p.harness ? Math.max(.55, belt) : .55, 0, .84);
  const rectBody = O.rect(1000, 620, (c, r) => {
    P.fill(c, r, pal.a); P.folds(c, r, 3, 24, .3, .1); P.shade(c, r, .2, .12);
    const ribY = r.y + r.h * .9;
    c.save(); c.beginPath(); c.rect(r.x, ribY, r.w, r.h - (ribY - r.y)); c.clip(); P.rib(c, { ...r, y: ribY, h: r.h * .1 }); c.restore();
    P.band(c, r, ribY - 2, 3, 'rgba(0,0,0,.5)');
    P.logo(c, r.x + r.w / 2, r.y + r.h * logoV, p.mark || 'NO SIGNAL', pal.c, 26);
    P.stitch(c, r.x, ribY - 8, r.x + r.w, ribY - 8, pal.st);
    for (const x of [r.x + r.w * .25, r.x + r.w * .75]) P.stitch(c, x, r.y, x, r.y + r.h * .45, pal.st);
  });
  bodice(O, { ease, top, hem: () => hem, rect: rectBody });

  for (const side of ['AL', 'AR']) {
    const rect = O.rect(420, 400, (c, r) => {
      P.fill(c, r, pal.a); P.folds(c, r, side === 'AL' ? 5 : 8, 14, .32, .1); P.shade(c, r, .1, .1);
      const y = r.y + r.h * .86;
      c.save(); c.beginPath(); c.rect(r.x, y, r.w, r.h); c.clip(); P.rib(c, { ...r, y, h: r.h * .14 }, 8); c.restore();
      P.band(c, r, y - 2, 3, 'rgba(0,0,0,.5)');
      P.band(c, r, r.y + r.h * .55, 16, pal.c); P.band(c, r, r.y + r.h * .55 + 22, 5, pal.c);
    });
    sleeve(O, side, { len: lerp(.3, 2.02, p.sleeve), rect, ease: v => {
      const cuff = sstep(.84, .88, v);
      return lerp(.006 + .02 * loose * Math.sin(Math.PI * clamp(v * 1.05)) + .008 * loose, .006, cuff);
    } });
  }

  // 후드는 등에 넘긴 모양
  const hoodRect = O.rect(420, 300, (c, r) => {
    P.fill(c, r, pal.b); P.folds(c, r, 12, 9, .36, .12);
    c.strokeStyle = pal.c; c.lineWidth = 7; c.beginPath(); c.moveTo(r.x + 16, r.y); c.quadraticCurveTo(r.x + r.w / 2, r.y + r.h * 1.84, r.x + r.w - 16, r.y); c.stroke();
    P.stitch(c, r.x + r.w / 2, r.y, r.x + r.w / 2, r.y + r.h * .9, pal.st);
    P.shade(c, r, .45, .1);
  });
  patch(O, S, { t0: 5.03, t1: 4.38, a0: () => Math.PI - 1.2, a1: () => Math.PI + 1.2, rect: hoodRect, nu: 24, nv: 16, off: .003,
    bulge: (u, v) => .05 * Math.sin(Math.PI * u) ** .6 * Math.sin(Math.PI * clamp(v * .95 + .05)) ** .7 });
  const trimR = O.rect(120, 40, (c, r) => { P.fill(c, r, pal.a); P.band(c, r, r.y + 16, 8, 'rgba(255,255,255,.08)'); });
  // 목 옆은 면이 거의 누워 있어서 법선 방향으로 띄워야 띠가 어깨 속에 안 묻힌다
  const ring = []; for (let i = 0; i <= 44; i++) { const a = i / 44 * TAU - Math.PI, t = top(a); ring.push(S(t, a).addScaledVector(normalAt(av, S, t, a), .012)); }
  tube(O, ring, { r: .011, rect: trimR, n: 8 });
  const cordR = O.flat(() => pal.c);
  for (const s of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 8; i++) pts.push(S(lerp(4.93, 4.5 - .03 * s, i / 8), s * .24 * (1 + i * .03), .006));
    tube(O, pts, { r: .0024, rect: cordR, n: 6 });
    lump(O, pts[8], pts[8].clone().sub(pts[7]), { rx: .0042, ry: .0042, rz: .011, rect: O.metal, n: 8 });
  }

  const pockR = O.rect(300, 150, (c, r) => { P.fill(c, r, pal.a); P.folds(c, r, 21, 5, .3, .08); P.stitch(c, r.x + 6, r.y + 8, r.x + r.w - 6, r.y + 8, pal.st); });
  if (p.len > .35) {
    const t1 = hem + ribH + .02;
    patch(O, S, { t0: t1 + .36, t1, a0: v => -.46 - .28 * v, a1: v => .46 + .28 * v, rect: pockR, off: .005 });
  }

  const pleats = 20;
  const skR = O.rect(1100, 300, (c, r) => {
    P.plaid(c, r, pal.skirtA, pal.skirtB, pal.c, 74);
    P.pleatShade(c, r, pleats);
    P.shade(c, r, .3, 0);
    setTrim(c, r, r.y + r.h - 14, 7, pal.c);
  });
  // 후드 밑단 안쪽에서 시작해야 치마가 옷 위로 올라오지 않는다
  skirt(O, { t0: Math.min(E.tw - .03, hem + .16), t1: lerp(1.86, 1.25, p.skirt), flare: .05 + .07 * p.flare, pleats, depth: .018, rect: skR, nc: 12 });

  if (p.harness) {
    const belt = O.rect(200, 40, (c, r) => { P.fill(c, r, pal.belt); P.stitch(c, r.x, r.y + 8, r.x + r.w, r.y + 8, 'rgba(255,255,255,.3)', 2, [6, 5]); P.stitch(c, r.x, r.y + 32, r.x + r.w, r.y + 32, 'rgba(255,255,255,.3)', 2, [6, 5]); });
    strap(O, S, around(ringT), { w: .022, rect: belt, closed: true, off: .005 });
    for (const s of [-1, 1]) {
      strap(O, S, [[ringT, s * .42], [E.ts - .02, s * .46], [E.ts + .05, s * .62], [E.ts + .05, s * 2.4], [E.ts - .02, s * 2.66], [ringT, s * 2.72]], { w: .017, rect: belt, nv: 34, off: .0055 });
      const [q, n] = onBody(S, av, ringT, s * .42, .0075);
      plate(O, q, n, .0105, .0135, O.metal);
    }
    const [q, n] = onBody(S, av, ringT, 0, .0075);
    plate(O, q, n, .0175, .0145, O.metal);
    const [q2, n2] = onBody(S, av, ringT, 0, .0105);
    plate(O, q2, n2, .0115, .009, belt);
    const t0 = hem + .03;
    for (let i = 0; i <= 22; i++) {
      const f = i / 22, a = lerp(1.1, 2.15, f), t = t0 - .1 * Math.sin(Math.PI * f) - .06;
      const c = S(t, a, 0), rad = c.clone().sub(axisT(av, t)).normalize();
      lump(O, c.addScaledVector(rad, .022), rad, { rx: .0045, ry: .0065, rz: .0025, rect: O.metal, n: 6, roll: i % 2 ? .9 : -.9, keep: 'hip' });
    }
  }
  if (p.pins) [pal.c, '#ffffff', pal.b].forEach((cc, i) => {
    const r = O.flat(cc), [q, n] = onBody(S, av, E.tb + .22 - i * .06, .62 + i * .1, .004);
    lump(O, q, n, { rx: .0085, ry: .0085, rz: .0028, rect: r, n: 10 });
  });
}

// ---- 2. 고딕 세일러 (4월 1위 Crimson Rumor 계열, 교복 콘텐츠) ----
function sailor(O, p) {
  const av = O.av, E = envelope(av), pal = p.pal;
  common(O, pal);
  const hem = E.tw - .14;
  const ease = (t, a) => .0045 + .006 * sstep(E.tb + .1, E.tb - .2, t);
  const S = surf(av, ease);
  O.cover = [hem + .08, E.ts - .1];
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

  const pleats = 24;
  const skR = O.rect(1240, 300, (c, r) => {
    P.fill(c, r, pal.a); P.pleatShade(c, r, pleats); P.shade(c, r, .3, 0);
    setTrim(c, r, r.y + r.h * .89, 9, pal.d); setTrim(c, r, r.y + r.h * .93, 4, pal.d);
    setTrim(c, r, r.y + r.h - 6, 6, pal.e);
  });
  const sk = skirt(O, { t0: hem + .08, t1: lerp(1.88, 1.2, p.skirt), flare: .07 + .08 * p.flare, pleats, depth: .018, rect: skR, nc: 12 });

  if (p.lace) {
    const laceR = O.rect(1200, 60, (c, r) => {
      P.fill(c, r, pal.d);
      P.band(c, r, r.y + r.h * .42, 3, 'rgba(60,50,80,.28)'); P.band(c, r, r.y + r.h * .72, 2, 'rgba(60,50,80,.2)');
      P.band(c, r, r.y, 10, 'rgba(0,0,0,.35)');
    });
    frill(O, { rect: laceR, nu: pleats * 16, waves: pleats * 2, w: .03, amp: .0035,
      ring: u => {
        const q0 = sk.point(u, .985), out = q0.clone().sub(sk.axis(.985)).setY(0).normalize();
        return [q0.addScaledVector(out, -.003), out, V(0, -1, 0)];
      },
      skin: u => sk.skinAt(u, 1) });
  }

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
  const ease = (t, a) => .0042 + .012 * sstep(E.tw, 2.5, t);
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

export const LOOKS = {
  hood: { label: '다크 스트리트 후드', why: '인기 의상 집계 7월 1위 PINK♡PUDDING이 검정 후드 + 벨트 하네스', build: hood,
    controls: [
      { key: 'len', label: '후드 기장', hint: '크롭 ↔ 길게' }, { key: 'loose', label: '품', hint: '딱 맞게 ↔ 오버핏' }, { key: 'sleeve', label: '소매 길이' },
      { key: 'skirt', label: '치마 길이' }, { key: 'flare', label: '치마 퍼짐' },
      { key: 'harness', label: '하네스·체인', toggle: true }, { key: 'pins', label: '핀 배지', toggle: true },
    ],
    colors: [{ key: 'c', label: '포인트 색', values: ['#ff5c9a', '#37d6c6', '#ffd23f', '#b78bff', '#ff5a3c'] }, { key: 'a', label: '옷 색', values: ['#26252e', '#3b3f58', '#e8e4dc', '#5a2438'] }],
    text: { key: 'mark', label: '가슴 글자', value: 'NO SIGNAL', max: 14 },
    vote: [
      { q: '치마 길이', opts: [['짧게', { skirt: .1 }], ['무릎 위', { skirt: .45 }], ['길게', { skirt: .85 }]] },
      { q: '포인트 색', opts: [['핫핑크', { pal: { c: '#ff5c9a' } }], ['민트', { pal: { c: '#37d6c6' } }], ['노랑', { pal: { c: '#ffd23f' } }]] },
      { q: '하네스', opts: [['넣자', { harness: 1 }], ['빼자', { harness: 0 }]] },
    ],
    params: { len: .55, loose: .7, sleeve: 1, skirt: .25, flare: .55, harness: 1, pins: 1,
      pal: { a: '#26252e', b: '#3a3945', c: '#ff5c9a', st: 'rgba(255,255,255,.2)', lining: '#141318', belt: '#111016', skirtA: '#1f1e27', skirtB: '#34333f', metalHi: '#f4f4f8', metalMid: '#9a9aa6', metalLo: '#55555f' } } },
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
