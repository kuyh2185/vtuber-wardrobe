// 만든 옷 조각을 살아 있는 VRM에 입힌다. 몸 뼈대 + 치마 흔들림 뼈 + 툰 재질 + 외곽선.
import * as THREE from 'three';
import { MToonMaterial, VRMSpringBoneJoint } from '@pixiv/three-vrm';
import { Outfit, bindWeights, envelope } from './parts.js';
import { SIZE } from './tex.js';
import { matOf, torsoParam } from './body.js';

export const DROP = /Onepice|Tops|Bottoms|Accessory/i;

export function hideOld(av) { for (const o of av.meshes) if (DROP.test([].concat(o.material)[0].name)) o.visible = false; }

export function makeMaterials(tex) {
  const opt = {
    map: tex, shadeMultiplyTexture: tex, shadeColorFactor: new THREE.Color(.66, .6, .78),
    shadingToonyFactor: .82, shadingShiftFactor: -.04, giEqualizationFactor: .7,
    rimMultiplyTexture: null, rimLightingMixFactor: 1, parametricRimColorFactor: new THREE.Color(.16, .14, .22),
    parametricRimFresnelPowerFactor: 4, parametricRimLiftFactor: .05,
  };
  const body = new MToonMaterial(opt);
  const line = new MToonMaterial({ ...opt, outlineWidthMode: 'worldCoordinates', outlineWidthFactor: .0011,
    outlineColorFactor: new THREE.Color(.05, .04, .08), outlineLightingMixFactor: .5 });
  line.isOutline = true;
  line.side = THREE.BackSide;
  const sheer = new MToonMaterial({ ...opt, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  return { body, line, sheer };
}

// 옷이 덮는 살은 숨긴다. 그래야 움직일 때 살이 옷을 뚫고 나오지 않는다.
export function coverSkin(av, range) {
  let hidden = 0;
  const p = new THREE.Vector3();
  for (const o of av.meshes) {
    if (!/Body.*SKIN/i.test(matOf(o).name)) continue;
    const g = o.geometry, ix = g.index, segs = av.segs.get(o);
    if (!o.userData.ix0) o.userData.ix0 = ix.array.slice();
    ix.array.set(o.userData.ix0);
    if (range) {
      const pos = g.attributes.position;
      const inside = v => {
        const s = segs[v];
        if (!s || (s.AL || 0) + (s.AR || 0) > .3 || (s.LL || 0) + (s.LR || 0) > .3) return false;
        p.set(av.f * pos.getX(v), pos.getY(v), av.f * pos.getZ(v));
        const t = torsoParam(av.fr, p).t;
        return t > range[0] && t < range[1];
      };
      const a = ix.array, n = g.groups[0]?.count || a.length; // 뒷부분은 외곽선 패스용 사본
      for (let i = 0; i < a.length; i += 3) if (inside(a[i]) && inside(a[i + 1]) && inside(a[i + 2])) { a[i] = a[i + 1] = a[i + 2] = 0; if (i < n) hidden++; }
    }
    ix.needsUpdate = true;
  }
  return hidden;
}

export function paint(O, c) {
  c.clearRect(0, 0, SIZE, SIZE);
  for (const f of O.painters) f(c);
}

export function remove(av, w) {
  if (!w) return;
  for (const o of w.meshes) { o.parent.remove(o); o.geometry.dispose(); }
  for (const j of w.joints) av.vrm.springBoneManager.deleteJoint(j);
  for (const b of w.bones) if (b.parent) b.parent.remove(b);
  av.vrm.materials = av.vrm.materials?.filter(m => !Object.values(w.mats).includes(m));
}

// 치수를 다른 체형(from)에서 재단해 키 비율만 맞춘 옷: "보정 전" 화면용.
export function fromOther(av, from, build, params) {
  const O = new Outfit(from);
  build(O, params);
  const k = av.fr.H / from.fr.H;
  const scale = O.pos.map(x => x * k);
  O.pos = scale;
  O.av = av; O.tol = 0; // 다른 체형에서 재단한 옷은 살이 안 숨겨지니 조인 만큼도 뚫림이다
  const hips = av.vrm.humanoid.getRawBoneNode('hips');
  for (const c of O.chains) {
    c.parent = hips;
    for (const l of c.chain) { l.pts = l.pts.map(q => q.clone().multiplyScalar(k)); l.tip = l.tip.clone().multiplyScalar(k); }
  }
  return O;
}

// 몸을 뚫은 옷 점 수. 기본 자세 기준이며 안감은 세지 않는다.
export function poke(av, O) {
  const M = av.maps.T, p = new THREE.Vector3(), pts = []; // 볼록 껍질은 목·허리에서 몸보다 커서 실제 표면으로 잰다
  let n = 0, tot = 0;
  for (let v = 0; v < O.pos.length / 3; v++) {
    if (O.link[v] != null || (O.keep[v] !== 'torso' && O.keep[v] !== 'hip')) continue;
    p.set(O.pos[v * 3], O.pos[v * 3 + 1], O.pos[v * 3 + 2]);
    const c = torsoParam(av.fr, p);
    if (c.t < 2 || c.t > 5.2) continue;
    tot++;
    if (c.r < M.get(c.t, c.a) - .0015 - (O.tol || 0)) { n++; pts.push(av.f * p.x, p.y, av.f * p.z); }
  }
  return { n, tot, pts };
}

// build(O, params)가 조각을 쌓는다. skin은 옷 조각 데이터를 내보내기에도 그대로 쓴다.
export function wear(av, build, params, canvas, prev, from) {
  remove(av, prev);
  let O;
  if (from && from !== av) O = fromOther(av, from, build, params);
  else { O = new Outfit(av); build(O, params); }
  const skin = bindWeights(O);
  const hidden = coverSkin(av, from && from !== av ? null : O.cover);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(O.pos.map((x, i) => (i % 3 === 1 ? x : x * av.f))), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(O.nor.map((x, i) => (i % 3 === 1 ? x : x * av.f))), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(O.uv), 2));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(skin.ji, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(skin.wt, 4));
  g.setIndex(O.idx);

  const c = canvas.getContext('2d', { willReadFrequently: false });
  paint(O, c);
  const tex = prev?.tex || new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = true; tex.anisotropy = 8; tex.needsUpdate = true;
  const mats = prev?.mats || makeMaterials(tex);

  const skel = av.body.skeleton, bones = [], inv = [];
  const hipRaw = av.bind.hips;
  const raw = p => new THREE.Vector3(av.f * p.x, p.y, av.f * p.z);
  const made = []; // [chain, col] → 뼈 목록
  for (const ch of O.chains) {
    for (let c0 = 0; c0 < ch.cols; c0++) {
      let parent = ch.parent, parentPos = hipRaw;
      const list = [];
      for (const q of [...ch.chain[c0].pts, ch.chain[c0].tip]) {
        const r = raw(q), b = new THREE.Bone();
        b.position.copy(r).sub(parentPos);
        parent.add(b);
        bones.push(b); inv.push(new THREE.Matrix4().makeTranslation(-r.x, -r.y, -r.z));
        list.push(b); parent = b; parentPos = r;
      }
      made.push({ ch, list });
    }
  }
  const skeleton = new THREE.Skeleton([...skel.bones, ...bones], [...skel.boneInverses, ...inv]);
  const mk = (m, geo = g) => {
    const o = new THREE.SkinnedMesh(geo, m);
    o.frustumCulled = false;
    o.bind(skeleton, av.body.bindMatrix);
    av.body.parent.add(o);
    return o;
  };
  const meshes = [mk(mats.body), mk(mats.line)];
  meshes[0].castShadow = meshes[0].receiveShadow = true;
  if (O.idxS.length) { // 위치·뼈 데이터는 같이 쓰고 면 목록만 다르다
    const gs = new THREE.BufferGeometry();
    for (const k in g.attributes) gs.setAttribute(k, g.attributes[k]);
    gs.setIndex(O.idxS);
    const o = mk(mats.sheer, gs); o.renderOrder = 1; o.receiveShadow = true;
    meshes.push(o);
  }
  av.vrm.scene.updateMatrixWorld(true); // setInitState가 bone.matrix를 읽으므로 새 뼈 행렬부터 맞춘다

  // 골반·허리 충돌체까지 쓰면 치마 뿌리가 몸 안에서 시작해 수평으로 튕겨 나간다. 다리 아래쪽만 쓴다.
  const mgr = av.vrm.springBoneManager, joints = [];
  const groups = mgr.colliderGroups.filter(g => g.colliders.some(c => /LowerLeg|Knee/i.test(c.parent?.name || '')));
  // 뿌리가 약하면 중력에 처지면서 밑단이 안으로 말려 호박 모양이 된다. 뿌리를 가장 세게, 끝을 부드럽게.
  for (const { ch, list } of made) for (let i = 0; i < list.length - 1; i++) {
    const j = new VRMSpringBoneJoint(list[i], list[i + 1], {
      hitRadius: .012, stiffness: ch.stiff * (2.6 - i * .7), gravityPower: .05, gravityDir: new THREE.Vector3(0, -1, 0), dragForce: .5,
    }, groups);
    mgr.addJoint(j); j.setInitState(); joints.push(j);
  }
  if (!av.vrm.materials) av.vrm.materials = [];
  av.vrm.materials.push(...Object.values(mats));
  return { O, skin, meshes, bones, invs: inv, joints, mats, tex, made, hidden, verts: O.pos.length / 3 };
}
