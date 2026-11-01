// 아바타를 읽어 몸 표면 지도를 만든다. 옷은 이 지도 위에서 만들어지므로 체형이 달라도 저절로 맞는다.
// 좌표는 정면이 +Z가 되도록 뒤집어 쓴다(VRM 0.x는 원본이 -Z 정면이라 f = -1).
import * as THREE from 'three';

const LIMB = /(UpperArm|LowerArm|Hand|Thumb|Index|Middle|Ring|Little)/;
export function segOf(name) {
  if (name.startsWith('left') && LIMB.test(name)) return 'AL';
  if (name.startsWith('right') && LIMB.test(name)) return 'AR';
  if (/^left(UpperLeg|LowerLeg|Foot|Toes)/.test(name)) return 'LL';
  if (/^right(UpperLeg|LowerLeg|Foot|Toes)/.test(name)) return 'LR';
  return 'T';
}

export class Radial { // 높이 × 각도별 몸 표면 반지름. 옷 밑이 잘린 샘플도 있어 빈칸은 메운다.
  constructor(nt, tMax) { this.nt = nt; this.na = 48; this.tMax = tMax; this.g = new Float32Array(nt * this.na).fill(-1); }
  put(t, a, r) {
    const i = Math.min(this.nt - 1, Math.max(0, Math.round(t / this.tMax * (this.nt - 1))));
    const j = ((Math.round((a + Math.PI) / (2 * Math.PI) * this.na) % this.na) + this.na) % this.na;
    const k = i * this.na + j;
    if (r > this.g[k]) this.g[k] = r;
  }
  coverage(i) { let n = 0; for (let j = 0; j < this.na; j++) if (this.g[i * this.na + j] >= 0) n++; return n / this.na; }
  finish() {
    const { nt, na, g } = this;
    this.cov = Array.from({ length: nt }, (_, i) => this.coverage(i));
    for (let j = 0; j < na; j++) { // 가까운 위아래로 먼저 메운다. 옆에서 메우면 오목한 등 가운데가 양옆 값으로 튀어 천에 물결이 생긴다.
      const c = Array.from({ length: nt }, (_, i) => g[i * na + j]);
      for (let i = 0; i < nt; i++) {
        if (c[i] >= 0) continue;
        let a = i - 1, b = i + 1;
        while (a >= 0 && c[a] < 0) a--;
        while (b < nt && c[b] < 0) b++;
        if (a >= 0 && b < nt && b - a <= 5) g[i * na + j] = c[a] + (c[b] - c[a]) * (i - a) / (b - a);
      }
    }
    for (let i = 0; i < nt; i++) { // 각도 방향 메우기
      const row = [...Array(na).keys()].filter(j => g[i * na + j] >= 0);
      if (!row.length) continue;
      for (let j = 0; j < na; j++) {
        if (g[i * na + j] >= 0) continue;
        let best = 0, sum = 0;
        for (const b of row) { const d = Math.min((b - j + na) % na, (j - b + na) % na); const w = 1 / (d * d); best += w; sum += w * g[i * na + b]; }
        g[i * na + j] = sum / best;
      }
    }
    for (let j = 0; j < na; j++) { // 높이 방향 메우기
      const has = [...Array(nt).keys()].filter(i => g[i * na + j] >= 0);
      for (let i = 0; i < nt; i++) {
        if (g[i * na + j] >= 0) continue;
        const a = has.filter(h => h < i).at(-1), b = has.find(h => h > i);
        g[i * na + j] = a == null ? g[b * na + j] : b == null ? g[a * na + j]
          : g[a * na + j] + (g[b * na + j] - g[a * na + j]) * (i - a) / (b - a);
      }
    }
    const c = g.slice();
    for (let i = 0; i < nt; i++) for (let j = 0; j < na; j++)
      g[i * na + j] = (2 * c[i * na + j] + c[i * na + (j + 1) % na] + c[i * na + (j + na - 1) % na]) / 4;
    return this;
  }
  get(t, a) {
    const { nt, na, g } = this;
    const x = Math.min(nt - 1.001, Math.max(0, t / this.tMax * (nt - 1)));
    const y = ((a + Math.PI) / (2 * Math.PI) * na % na + na) % na;
    const i = Math.floor(x), j = Math.floor(y) % na, u = x - i, v = y - Math.floor(y), j2 = (j + 1) % na;
    const p = g[i * na + j] * (1 - v) + g[i * na + j2] * v;
    const r = g[(i + 1) * na + j] * (1 - v) + g[(i + 1) * na + j2] * v;
    return p * (1 - u) + r * u;
  }
}

const lerp = (a, b, t) => a + (b - a) * t;

export function torsoParam(fr, p) {
  const { ys, zs } = fr.T;
  let i = 0;
  while (i < ys.length - 2 && p.y > ys[i + 1]) i++;
  const s = (p.y - ys[i]) / (ys[i + 1] - ys[i]), cz = lerp(zs[i], zs[i + 1], s);
  return { t: i + s, a: Math.atan2(p.x, p.z - cz), r: Math.hypot(p.x, p.z - cz) };
}
export function torsoPoint(fr, t, a, r) {
  const { ys, zs } = fr.T;
  const i = Math.min(ys.length - 2, Math.floor(Math.max(0, t))), s = t - i;
  return new THREE.Vector3(Math.sin(a) * r, lerp(ys[i], ys[i + 1], s), lerp(zs[i], zs[i + 1], s) + Math.cos(a) * r);
}
const basis = (l, i) => {
  const d = l.pts[i + 1].clone().sub(l.pts[i]).normalize();
  const u = l.u.clone().addScaledVector(d, -l.u.dot(d)).normalize();
  return { d, u, v: d.clone().cross(u) };
};
export function limbParam(l, p) {
  let best = null;
  for (let i = 0; i < l.pts.length - 1; i++) {
    const a = l.pts[i], ab = l.pts[i + 1].clone().sub(a), len = ab.length();
    const raw = p.clone().sub(a).dot(ab) / (len * len);
    const s = Math.max(i ? 0 : -.3, Math.min(i === l.pts.length - 2 ? 1.3 : 1, raw));
    const c = a.clone().addScaledVector(ab, s), e = p.distanceTo(c);
    if (!best || e < best.e) best = { e, i, s, c };
  }
  const { u, v } = basis(l, best.i), w = p.clone().sub(best.c);
  return { t: best.i + best.s, a: Math.atan2(w.dot(v), w.dot(u)), r: w.length() };
}
export function limbPoint(l, t, a, r) {
  const i = Math.max(0, Math.min(l.pts.length - 2, Math.floor(Math.max(0, t)))), s = t - i;
  const { u, v } = basis(l, i);
  const c = l.pts[i].clone().add(l.pts[i + 1].clone().sub(l.pts[i]).multiplyScalar(s));
  return c.addScaledVector(u, Math.cos(a) * r).addScaledVector(v, Math.sin(a) * r);
}

function frames(m) {
  const b = n => m.bone(n);
  const avg = (a, c) => a.clone().add(c).multiplyScalar(.5);
  const hip = avg(b('leftUpperLeg'), b('rightUpperLeg'));
  const knee = avg(b('leftLowerLeg'), b('rightLowerLeg'));
  const land = [new THREE.Vector3(0, 0, hip.z), knee, hip, b('spine'), b('chest'), b('neck'), b('head')];
  const T = { ys: land.map(v => v.y), zs: land.map(v => v.z) };
  const limb = (a, c, d, u, tip) => {
    const pts = [b(a), b(c), b(d)];
    pts.push(tip || pts[2].clone().add(pts[2].clone().sub(pts[1]).multiplyScalar(.45)));
    return { pts, u };
  };
  const up = new THREE.Vector3(0, 1, 0), fwd = new THREE.Vector3(0, 0, 1);
  const ground = n => { const p = b(n).clone(); p.y = 0; return p; };
  return { T, H: b('head').y,
    AL: limb('leftUpperArm', 'leftLowerArm', 'leftHand', up), AR: limb('rightUpperArm', 'rightLowerArm', 'rightHand', up),
    LL: limb('leftUpperLeg', 'leftLowerLeg', 'leftFoot', fwd, ground('leftFoot')), LR: limb('rightUpperLeg', 'rightLowerLeg', 'rightFoot', fwd, ground('rightFoot')) };
}

export const matOf = o => (Array.isArray(o.material) ? o.material[0] : o.material);
const humanOf = (m, node) => { for (let n = node; n; n = n.parent) if (m.human.has(n)) return m.human.get(n); return null; };

// 몸 정점 표: 옷 정점마다 가까운 몸 정점의 뼈 가중치를 빌려 온다.
function collectBody(m, byIndex) {
  const pts = [];
  const p = new THREE.Vector3();
  for (const o of m.meshes) {
    if (!/Body.*SKIN/i.test(matOf(o).name)) continue;
    const g = o.geometry, pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    const seen = new Set(g.index ? g.index.array : Array.from({ length: pos.count }, (_, i) => i));
    const segs = byIndex.get(o) || byIndex.set(o, []).get(o);
    for (const i of seen) {
      p.fromBufferAttribute(pos, i);
      const seg = {}, bones = [];
      for (let k = 0; k < 4; k++) {
        const w = sw.getComponent(i, k);
        if (!(w > 0)) continue;
        const node = o.skeleton.bones[si.getComponent(i, k)];
        const h = humanOf(m, node);
        const s = h ? segOf(h) : 'T';
        seg[s] = (seg[s] || 0) + w;
        bones.push([node, w]);
      }
      segs[i] = seg;
      pts.push({ x: m.f * p.x, y: p.y, z: m.f * p.z, seg, bones });
    }
  }
  return pts;
}

// 옷 밑 살을 투명하게 뚫어 둔 VRM이 있다(샘플 D). 어깨를 드러내는 옷을 입히려면 그 자리를 메운다.
// 주변 살색을 해상도를 낮춰 가며 번지게 해서 채우므로 경계가 안 보인다.
function healSkin(m) {
  m.heal = new Map(); // 원본 텍스처 → 메운 캔버스 (내보내기가 쓴다)
  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const fix = tex => {
    const img = tex?.image;
    if (!img || m.heal.has(tex)) return;
    const W = img.width, H = img.height, c = canvas(W, H), g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, W, H), mask = canvas(W, H), mg = mask.getContext('2d'), md = mg.createImageData(W, H);
    let holes = 0;
    for (let i = 0; i < W * H; i++) if (d.data[i * 4 + 3] < 250) { md.data[i * 4 + 3] = 255; holes++; }
    if (!holes) return;
    mg.putImageData(md, 0, 0);
    g.globalCompositeOperation = 'destination-out'; // 구멍 둘레의 옛 옷선까지 같이 지운다
    for (const [x, y] of [[-6, 0], [6, 0], [0, -6], [0, 6], [-4, -4], [4, -4], [-4, 4], [4, 4], [-2, 0], [2, 0], [0, -2], [0, 2]]) g.drawImage(mask, x, y);
    g.globalCompositeOperation = 'source-over';
    const levels = [c];
    for (let w = W >> 1, h = H >> 1; w >= 8; w >>= 1, h >>= 1) { const l = canvas(w, h); l.getContext('2d').drawImage(levels.at(-1), 0, 0, w, h); levels.push(l); }
    const out = canvas(W, H), og = out.getContext('2d');
    og.imageSmoothingQuality = 'high';
    for (let i = levels.length - 1; i >= 0; i--) for (let k = 0; k < (i ? 3 : 1); k++) og.drawImage(levels[i], 0, 0, W, H); // 번 겹쳐야 불투명해진다
    og.globalCompositeOperation = 'destination-over'; og.drawImage(levels.at(-1), 0, 0, W, H);
    tex.image = out; tex.needsUpdate = true;
    m.heal.set(tex, out);
  };
  for (const o of m.meshes) {
    const mat = matOf(o);
    if (/Body.*SKIN/i.test(mat.name)) { fix(mat.map); fix(mat.shadeMultiplyTexture); }
  }
}

const rawPos = (vrm, n) => vrm.humanoid.getRawBoneNode(n).getWorldPosition(new THREE.Vector3());

class Hash { // 가까운 몸 정점 찾기
  constructor(pts, cell = .05) {
    this.c = cell; this.m = new Map(); this.pts = pts;
    for (const q of pts) {
      const k = this.key(Math.floor(q.x / cell), Math.floor(q.y / cell), Math.floor(q.z / cell));
      (this.m.get(k) || this.m.set(k, []).get(k)).push(q);
    }
  }
  key(x, y, z) { return (x + 512) * 1048576 + (y + 512) * 1024 + (z + 512); }
  near(p, n, ok) {
    for (let R = 1; R < 16; R += 2) {
      const cx = Math.floor(p.x / this.c), cy = Math.floor(p.y / this.c), cz = Math.floor(p.z / this.c), got = [];
      for (let x = cx - R; x <= cx + R; x++) for (let y = cy - R; y <= cy + R; y++) for (let z = cz - R; z <= cz + R; z++) {
        const l = this.m.get(this.key(x, y, z));
        if (!l) continue;
        for (const q of l) if (!ok || ok(q)) got.push(q);
      }
      if (got.length >= n) {
        const d = q => (q.x - p.x) ** 2 + (q.y - p.y) ** 2 + (q.z - p.z) ** 2;
        return got.map(q => [d(q), q]).sort((a, b) => a[0] - b[0]).slice(0, n);
      }
    }
    return [];
  }
}

export async function loadAvatar(loader, url) {
  const bytes = await (await fetch(url)).arrayBuffer();
  const gltf = await loader.parseAsync(bytes.slice(0), '');
  const vrm = gltf.userData.vrm;
  vrm.scene.updateMatrixWorld(true);
  const m = { url, bytes, vrm, v0: vrm.meta.metaVersion === '0' };
  m.f = m.v0 ? -1 : 1;
  m.human = new Map();
  for (const n of Object.keys(vrm.humanoid.rawHumanBones)) m.human.set(vrm.humanoid.getRawBoneNode(n), n);
  m.bone = n => {
    const o = vrm.humanoid.getRawBoneNode(n);
    if (!o) return null;
    const p = o.getWorldPosition(new THREE.Vector3());
    return new THREE.Vector3(m.f * p.x, p.y, m.f * p.z);
  };
  m.meshes = [];
  vrm.scene.traverse(o => { if (o.isSkinnedMesh) m.meshes.push(o); });
  healSkin(m);
  m.fr = frames(m);
  const byIndex = new Map();
  m.pts = collectBody(m, byIndex);
  m.hash = new Hash(m.pts);
  const maps = { T: new Radial(120, 6), AL: new Radial(48, 3), AR: new Radial(48, 3), LL: new Radial(48, 3), LR: new Radial(48, 3) };
  const p = new THREE.Vector3();
  const mark = (x, y, z, seg) => {
    p.set(x, y, z);
    if ((seg.AL || 0) + (seg.AR || 0) < .5) { const c = torsoParam(m.fr, p); maps.T.put(c.t, c.a, c.r); }
    for (const s of ['AL', 'AR', 'LL', 'LR']) if ((seg[s] || 0) > .5) { const c = limbParam(m.fr[s], p); maps[s].put(c.t, c.a, c.r); }
  };
  // 꼭짓점만 재면 허리처럼 삼각형이 큰 곳에 구멍이 나서, 삼각형 면을 1.5cm 간격으로 찍는다.
  for (const o of m.meshes) {
    if (!/Body.*SKIN/i.test(matOf(o).name)) continue;
    const g = o.geometry, pos = g.attributes.position, gr = g.groups[0], ix = g.index.array;
    const end = gr ? gr.start + gr.count : ix.length;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let i = gr ? gr.start : 0; i < end; i += 3) {
      a.fromBufferAttribute(pos, ix[i]); b.fromBufferAttribute(pos, ix[i + 1]); c.fromBufferAttribute(pos, ix[i + 2]);
      const n = Math.min(12, Math.ceil(Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)) / .015));
      const seg = byIndex.get(o)?.[ix[i]];
      if (!seg) continue;
      for (let u = 0; u <= n; u++) for (let v = 0; v <= n - u; v++) {
        const s = u / n, t = v / n, r = 1 - s - t;
        mark(m.f * (a.x * s + b.x * t + c.x * r), a.y * s + b.y * t + c.y * r, m.f * (a.z * s + b.z * t + c.z * r), seg);
      }
    }
  }
  for (const k in maps) maps[k].finish();
  m.bind = { hips: rawPos(vrm, 'hips') };
  m.segs = byIndex;
  m.maps = maps;
  m.body = m.meshes.find(o => /Body.*SKIN/i.test(matOf(o).name));
  return m;
}
