// 스파이크: src VRM의 옷을 dst VRM 체형에 옮겨 입히고 VRM으로 내보낸다.
// shortcut: 치마 흔들림 뼈(스프링)는 옮기지 않고 가까운 몸 뼈로 합침, 0단계 통과 뒤 옮길 것.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

const q = new URLSearchParams(location.search);
const srcName = q.get('src') || 'AvatarSample_E.vrm';
const dstName = q.get('dst') || 'AvatarSample_D.vrm';
const take = new RegExp(q.get('take') || 'Onepice|Tops|Bottoms', 'i'); // 가져올 옷 재질
const drop = new RegExp(q.get('drop') || 'Onepice|Tops|Bottoms|Accessory', 'i'); // dst에서 끌 옷 재질
const yaw = (+q.get('yaw') || 0) * Math.PI / 180;
const bodyRe = q.get('body') ? new RegExp(q.get('body'), 'i') : null; // dst 몸 재질(기본은 Body...SKIN)
const isBody = (m, name) => (m === 'dst' && bodyRe ? bodyRe : /Body.*SKIN/i).test(name);
const pose = q.get('pose');

const loader = new GLTFLoader();
loader.register(p => new VRMLoaderPlugin(p));

async function load(name) {
  const bytes = await (await fetch('../samples/' + encodeURIComponent(name))).arrayBuffer();
  const gltf = await loader.parseAsync(bytes.slice(0), '');
  const vrm = gltf.userData.vrm;
  vrm.scene.updateMatrixWorld(true);
  const m = { name, bytes, vrm, v0: vrm.meta.metaVersion === '0' };
  m.f = m.v0 ? -1 : 1; // 정면을 +Z로 맞추는 부호
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
  return m;
}

const matOf = o => (Array.isArray(o.material) ? o.material[0] : o.material);
const humanOf = (m, node) => { for (let n = node; n; n = n.parent) if (m.human.has(n)) return { name: m.human.get(n), node: n }; return null; };

function segOf(name) {
  if (/left(UpperArm|LowerArm|Hand|Thumb|Index|Middle|Ring|Little)/.test(name)) return 'AL';
  if (/right(UpperArm|LowerArm|Hand|Thumb|Index|Middle|Ring|Little)/.test(name)) return 'AR';
  if (/left(UpperLeg|LowerLeg|Foot|Toes)/.test(name)) return 'LL';
  if (/right(UpperLeg|LowerLeg|Foot|Toes)/.test(name)) return 'LR';
  return 'T';
}

class Radial { // 높이 × 각도별 몸 표면 반지름. 빈칸은 메움(샘플에 따라 옷 밑 몸이 잘려 있음).
  constructor(nt, tMax) { this.nt = nt; this.na = 32; this.tMax = tMax; this.g = new Float32Array(nt * this.na).fill(-1); }
  put(t, a, r) {
    const i = Math.min(this.nt - 1, Math.max(0, Math.round(t / this.tMax * (this.nt - 1))));
    const j = ((Math.round((a + Math.PI) / (2 * Math.PI) * this.na) % this.na) + this.na) % this.na;
    const k = i * this.na + j;
    if (r > this.g[k]) this.g[k] = r;
  }
  finish() {
    const { nt, na, g } = this;
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
    const c = g.slice(); // 살짝 부드럽게
    for (let i = 0; i < nt; i++) for (let j = 0; j < na; j++)
      g[i * na + j] = (2 * c[i * na + j] + c[i * na + (j + 1) % na] + c[i * na + (j + na - 1) % na]) / 4;
    return this;
  }
  get(t, a) {
    const { nt, na, g } = this;
    const x = Math.min(nt - 1.001, Math.max(0, t / this.tMax * (nt - 1)));
    const y = ((a + Math.PI) / (2 * Math.PI) * na % na + na) % na;
    const i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j, j2 = (j + 1) % na;
    const p = g[i * na + j] * (1 - v) + g[i * na + j2] * v;
    const r = g[(i + 1) * na + j] * (1 - v) + g[(i + 1) * na + j2] * v;
    return p * (1 - u) + r * u;
  }
}

// 몸통: 키 방향 기준점 사이를 비율로 잇는다. 팔다리: 관절을 잇는 선을 따라간다.
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

const lerp = (a, b, t) => a + (b - a) * t;
function torsoParam(fr, p) {
  const { ys, zs } = fr.T;
  let i = 0;
  while (i < ys.length - 2 && p.y > ys[i + 1]) i++;
  const s = (p.y - ys[i]) / (ys[i + 1] - ys[i]), cz = lerp(zs[i], zs[i + 1], s);
  return { t: i + s, a: Math.atan2(p.x, p.z - cz), r: Math.hypot(p.x, p.z - cz) };
}
function torsoPoint(fr, t, a, r) {
  const { ys, zs } = fr.T;
  const i = Math.min(ys.length - 2, Math.floor(Math.max(0, t))), s = t - i;
  return new THREE.Vector3(Math.sin(a) * r, lerp(ys[i], ys[i + 1], s), lerp(zs[i], zs[i + 1], s) + Math.cos(a) * r);
}
const basis = (l, i) => {
  const d = l.pts[i + 1].clone().sub(l.pts[i]).normalize();
  const u = l.u.clone().addScaledVector(d, -l.u.dot(d)).normalize();
  return { d, u, v: d.clone().cross(u) };
};
function limbParam(l, p) {
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
function limbPoint(l, t, a, r) {
  const i = Math.max(0, Math.min(l.pts.length - 2, Math.floor(Math.max(0, t)))), s = t - i;
  const { u, v } = basis(l, i);
  const c = l.pts[i].clone().add(l.pts[i + 1].clone().sub(l.pts[i]).multiplyScalar(s));
  return c.addScaledVector(u, Math.cos(a) * r).addScaledVector(v, Math.sin(a) * r);
}

function bodyMaps(m, fr, who) {
  const maps = { T: new Radial(84, 6), AL: new Radial(36, 3), AR: new Radial(36, 3), LL: new Radial(36, 3), LR: new Radial(36, 3) };
  const p = new THREE.Vector3();
  for (const o of m.meshes) {
    if (!isBody(who, matOf(o).name)) continue;
    const g = o.geometry, pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    const seen = new Set(g.index ? g.index.array : Array.from({ length: pos.count }, (_, i) => i));
    for (const i of seen) {
      p.fromBufferAttribute(pos, i); p.x *= m.f; p.z *= m.f;
      const w = {};
      for (let k = 0; k < 4; k++) if (sw.getComponent(i, k) > 0) {
        const h = humanOf(m, o.skeleton.bones[si.getComponent(i, k)]);
        if (h) { const s = segOf(h.name); w[s] = (w[s] || 0) + sw.getComponent(i, k); }
      }
      if ((w.AL || 0) + (w.AR || 0) < .5) { const c = torsoParam(fr, p); maps.T.put(c.t, c.a, c.r); } // 몸통 지도에는 팔을 넣지 않는다
      for (const s of ['AL', 'AR', 'LL', 'LR']) if ((w[s] || 0) > .5) { const c = limbParam(fr[s], p); maps[s].put(c.t, c.a, c.r); }
    }
  }
  for (const k in maps) maps[k].finish();
  return maps;
}

function move(p, w, S, D, sm, dm, k) {
  const out = new THREE.Vector3(); let tot = 0;
  const seg = { ...w };
  for (const s of ['LL', 'LR']) if (seg[s]) { // 다리에서 멀리 떨어진 천(치마)은 몸통 기준으로 옮긴다
    const c = limbParam(S[s], p);
    if (c.r > sm[s].get(c.t, c.a) * 1.7 + .01) { seg.T = (seg.T || 0) + seg[s]; delete seg[s]; }
  }
  for (const s in seg) {
    let q;
    if (s === 'T') { const c = torsoParam(S, p); q = torsoPoint(D, c.t, c.a, dm.T.get(c.t, c.a) + Math.max(.004, (c.r - sm.T.get(c.t, c.a)) * k)); }
    else { const c = limbParam(S[s], p); q = limbPoint(D[s], c.t, c.a, dm[s].get(c.t, c.a) + Math.max(.003, (c.r - sm[s].get(c.t, c.a)) * k)); }
    out.addScaledVector(q, seg[s]); tot += seg[s];
  }
  return out.multiplyScalar(1 / tot);
}

function transfer(src, dst) {
  const S = frames(src), D = frames(dst), sm = bodyMaps(src, S, 'src'), dm = bodyMaps(dst, D, 'dst'), k = D.H / S.H;
  const bodyD = dst.meshes.find(o => isBody('dst', matOf(o).name));
  const idx = new Map(bodyD.skeleton.bones.map((b, i) => [b, i]));
  const dstBone = srcNode => {
    for (let n = srcNode; n; n = n.parent) {
      if (!src.human.has(n)) continue;
      const b = dst.vrm.humanoid.getRawBoneNode(src.human.get(n));
      if (b && idx.has(b)) return idx.get(b);
    }
    return idx.get(dst.vrm.humanoid.getRawBoneNode('hips'));
  };
  const parts = [], p = new THREE.Vector3();
  for (const o of src.meshes) {
    const mat = matOf(o);
    if (!take.test(mat.name)) continue;
    // three-vrm은 외곽선 패스용으로 인덱스를 두 배로 늘려 둔다. 앞 그룹만 쓴다.
    const g = o.geometry, a = g.attributes, gr0 = g.groups[0], ids = g.index.array.subarray(gr0.start, gr0.start + gr0.count), map = new Map();
    const nv = new Set(ids).size, pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
    const ji = new Uint16Array(nv * 4), wt = new Float32Array(nv * 4), ind = new Uint32Array(ids.length);
    ids.forEach((i, n) => {
      if (map.has(i)) { ind[n] = map.get(i); return; }
      const v = map.size; map.set(i, v); ind[n] = v;
      p.fromBufferAttribute(a.position, i); p.x *= src.f; p.z *= src.f;
      const seg = {}, bones = new Map();
      for (let c = 0; c < 4; c++) {
        const w = a.skinWeight.getComponent(i, c); if (!w) continue;
        const node = o.skeleton.bones[a.skinIndex.getComponent(i, c)], h = humanOf(src, node);
        const s = h ? segOf(h.name) : 'T'; seg[s] = (seg[s] || 0) + w;
        const b = dstBone(node); bones.set(b, (bones.get(b) || 0) + w);
      }
      const q = move(p, seg, S, D, sm, dm, k);
      pos.set([dst.f * q.x, q.y, dst.f * q.z], v * 3);
      const sf = src.f * dst.f;
      nor.set([sf * a.normal.getX(i), a.normal.getY(i), sf * a.normal.getZ(i)], v * 3);
      uv.set([a.uv.getX(i), a.uv.getY(i)], v * 2);
      [...bones].sort((x, y) => y[1] - x[1]).slice(0, 4).forEach(([b, w], c) => { ji[v * 4 + c] = b; wt[v * 4 + c] = w; });
      const sum = wt[v * 4] + wt[v * 4 + 1] + wt[v * 4 + 2] + wt[v * 4 + 3];
      for (let c = 0; c < 4; c++) wt[v * 4 + c] /= sum;
    });
    parts.push({ material: mat, pos, nor, uv, ji, wt, ind });
  }
  return { parts, bodyD };
}

// ---- VRM 파일 고치기: GLB를 직접 열어 메시를 더하고 끈 옷을 뺀다 ----
function parseGlb(ab) {
  const dv = new DataView(ab), n = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 20, n)));
  const off = 20 + n, m = dv.getUint32(off, true);
  return { json, bin: new Uint8Array(ab, off + 8, m) };
}
function writeGlb(json, bin) {
  const pad = (b, v) => { const r = new Uint8Array((b.length + 3) & ~3).fill(v); r.set(b); return r; };
  const J = pad(new TextEncoder().encode(JSON.stringify(json)), 32), B = pad(bin, 0);
  const out = new Uint8Array(12 + 8 + J.length + 8 + B.length), dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546C67, true); dv.setUint32(4, 2, true); dv.setUint32(8, out.length, true);
  dv.setUint32(12, J.length, true); dv.setUint32(16, 0x4E4F534A, true); out.set(J, 20);
  dv.setUint32(20 + J.length, B.length, true); dv.setUint32(24 + J.length, 0x004E4942, true); out.set(B, 28 + J.length);
  return out;
}
function exportVrm(src, dst, parts) {
  const S = parseGlb(src.bytes), D = parseGlb(dst.bytes), j = D.json;
  if (src.v0 !== dst.v0) throw new Error('shortcut: 같은 VRM 버전끼리만 내보냄');
  const chunks = [D.bin]; let len = (D.bin.length + 3) & ~3;
  const add = (arr, target) => {
    const u = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    chunks.push({ at: len, u });
    const view = { buffer: 0, byteOffset: len, byteLength: u.length };
    if (target) view.target = target;
    j.bufferViews.push(view); len = (len + u.length + 3) & ~3;
    return j.bufferViews.length - 1;
  };
  const acc = (arr, type, comp, count, extra = {}, target = 34962) => {
    j.accessors.push({ bufferView: add(arr, target), componentType: comp, type, count, ...extra });
    return j.accessors.length - 1;
  };
  // 재질: src의 재질·텍스처를 그대로 복사
  const texMap = new Map();
  const copyTex = t => {
    if (texMap.has(t)) return texMap.get(t);
    const st = S.json.textures[t], si = S.json.images[st.source], sv = S.json.bufferViews[si.bufferView];
    const u = S.bin.slice(sv.byteOffset || 0, (sv.byteOffset || 0) + sv.byteLength);
    j.images.push({ name: si.name, mimeType: si.mimeType, bufferView: add(u) });
    j.textures.push({ sampler: 0, source: j.images.length - 1 });
    texMap.set(t, j.textures.length - 1);
    return texMap.get(t);
  };
  const reTex = o => { // {index: n} 꼴을 재귀로 옮김
    if (!o || typeof o !== 'object') return o;
    const c = Array.isArray(o) ? [] : {};
    for (const k in o) c[k] = (k === 'index' && typeof o[k] === 'number') ? copyTex(o[k]) : reTex(o[k]);
    return c;
  };
  const newMat = name => {
    const at = S.json.materials.findIndex(m => m.name === name), m = reTex(S.json.materials[at]);
    j.materials.push(m);
    if (src.v0) {
      const p = JSON.parse(JSON.stringify(S.json.extensions.VRM.materialProperties[at]));
      for (const k in p.textureProperties) p.textureProperties[k] = copyTex(p.textureProperties[k]);
      j.extensions.VRM.materialProperties.push(p);
    }
    return j.materials.length - 1;
  };
  const bodyNode = j.nodes.find(n => n.mesh != null && j.meshes[n.mesh].primitives.some(p => /Body.*SKIN/i.test(j.materials[p.material].name)));
  // 끈 옷을 뺀다: 재질 번호는 그대로 두고 프리미티브만 지움(표정 연결은 메시 번호라 안전)
  const bodyMesh = j.meshes[bodyNode.mesh];
  bodyMesh.primitives = bodyMesh.primitives.filter(p => !drop.test(j.materials[p.material].name));
  const prims = parts.map(pt => {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity], n = pt.pos.length / 3;
    for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) { min[c] = Math.min(min[c], pt.pos[i * 3 + c]); max[c] = Math.max(max[c], pt.pos[i * 3 + c]); }
    return {
      material: newMat(pt.material.userData?.name || pt.material.name), mode: 4,
      indices: acc(pt.ind, 'SCALAR', 5125, pt.ind.length, {}, 34963),
      attributes: {
        POSITION: acc(pt.pos, 'VEC3', 5126, n, { min, max }), NORMAL: acc(pt.nor, 'VEC3', 5126, n), TEXCOORD_0: acc(pt.uv, 'VEC2', 5126, n),
        JOINTS_0: acc(pt.ji, 'VEC4', 5123, n), WEIGHTS_0: acc(pt.wt, 'VEC4', 5126, n),
      },
    };
  });
  j.meshes.push({ name: 'Outfit', primitives: prims });
  j.nodes.push({ name: 'Outfit', mesh: j.meshes.length - 1, skin: bodyNode.skin });
  j.scenes[j.scene || 0].nodes.push(j.nodes.length - 1);
  const bin = new Uint8Array(len); bin.set(D.bin);
  for (const c of chunks.slice(1)) bin.set(c.u, c.at);
  j.buffers[0].byteLength = len;
  return writeGlb(j, bin);
}

// ---- 화면 ----
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#2a2738');
const cam = new THREE.PerspectiveCamera(24, innerWidth / innerHeight, .1, 50);
scene.add(new THREE.AmbientLight(0xffffff, 1.6));
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(-1, 2, 2);
scene.add(key);

const [src, dst] = await Promise.all([load(srcName), load(dstName)]);
const { parts, bodyD } = transfer(src, dst);

dst.meshes.forEach(o => { if (drop.test(matOf(o).name)) o.visible = false; });
const added = [];
for (const pt of parts) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pt.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(pt.nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(pt.uv, 2));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(pt.ji, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(pt.wt, 4));
  g.setIndex(new THREE.BufferAttribute(pt.ind, 1));
  const o = new THREE.SkinnedMesh(g, pt.material);
  o.frustumCulled = false;
  o.bind(bodyD.skeleton, bodyD.bindMatrix);
  bodyD.parent.add(o);
  added.push(o);
}

src.vrm.update(0); // MToon은 update에서 alphaTest 같은 값을 셰이더로 올린다. 안 하면 투명 처리가 안 먹음.
const vrm = dst.vrm;
if (dst.v0) VRMUtils.rotateVRM0(vrm);
scene.add(vrm.scene);
const s = dst.v0 ? 1 : -1, h = vrm.humanoid;
h.getNormalizedBoneNode('leftUpperArm').rotation.z = s * 1.15;
h.getNormalizedBoneNode('rightUpperArm').rotation.z = -s * 1.15;
if (pose) { // 움직임 시험: 팔 앞으로, 한쪽 다리 들기, 허리 비틀기
  const n = b => h.getNormalizedBoneNode(b).rotation;
  n('leftUpperArm').set(0, s * -.9, s * .5); n('leftLowerArm').set(0, s * -1.1, 0);
  n('rightUpperArm').z = -s * .4; n('spine').y = .25; n('chest').y = .2;
  n('leftUpperLeg').x = -1.0; n('leftLowerLeg').x = 1.2; n('rightUpperLeg').x = .25;
}
vrm.update(0);
vrm.scene.updateMatrixWorld(true);

const H = dst.bone('head').y * 1.14;
const Dist = H / 2 / Math.tan(cam.fov * Math.PI / 360) * 1.08;
cam.position.set(Math.sin(yaw) * Dist, H * .5, Math.cos(yaw) * Dist);
cam.lookAt(0, H * .5, 0);
for (let i = 0; i < 30; i++) vrm.update(1 / 60);
renderer.render(scene, cam);

let out = null, err = null;
try {
  const b = exportVrm(src, dst, parts);
  let t = ''; for (let i = 0; i < b.length; i += 32768) t += String.fromCharCode(...b.subarray(i, i + 32768));
  out = btoa(t);
} catch (e) { err = e.message; }
window.__info = {
  verts: parts.map(p => p.pos.length / 3), mats: parts.map(p => p.material.name), err,
  matDbg: parts.map(p => { const m = p.material; return { type: m.type, isArr: Array.isArray(m), alphaTest: m.alphaTest, transparent: m.transparent, side: m.side, transparentWithZWrite: m.transparentWithZWrite, map: !!m.map, img: m.map?.image?.width, outline: m.outlineWidthMode, defines: m.defines }; }),
  srcMat: src.meshes.filter(o => take.test(matOf(o).name)).map(o => ({ arr: Array.isArray(o.material), n: Array.isArray(o.material) ? o.material.map(x => x.name + ':' + x.isOutline + ':' + x.side) : o.material.name, groups: o.geometry.groups.length, visible: o.visible })),
};
window.__out = out;
window.__ready = true;
