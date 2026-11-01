// 입은 상태를 VRM 파일로 쓴다. 원본 GLB의 JSON을 직접 고쳐 옷 메시·재질·흔들림 뼈를 더한다.
// shortcut: VRM 0.x만 지원(샘플 3종과 VRoid 0.x 내보내기). VRM 1.0 손님이 오면 MToon·스프링 확장을 따로 써야 함.
import { DROP } from './wear.js';

// VRM 0.x 메타: CC BY-ND 계열이나 VRoid Hub 조건이 수정 금지면 옷을 입힌 파일을 내주면 안 된다.
export const modifyBanned = m => /_ND$/.test(m.licenseName || '') || /[?&]modification=disallow/.test(m.otherLicenseUrl || '');

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

export async function exportVrm(av, w, canvas) {
  if (!av.v0) throw new Error('지금은 VRM 0.x 파일만 내보낼 수 있어요');
  const { json: j, bin: B0 } = parseGlb(av.bytes), f = av.f;
  const chunks = [B0]; let len = (B0.length + 3) & ~3;
  const add = (arr, target) => {
    const u = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    const at = len; chunks.push({ at, u });
    const view = { buffer: 0, byteOffset: at, byteLength: u.length };
    if (target) view.target = target;
    j.bufferViews.push(view); len = (at + u.length + 3) & ~3;
    return j.bufferViews.length - 1;
  };
  const acc = (arr, type, comp, count, extra = {}, target = 34962) => {
    j.accessors.push({ bufferView: add(arr, target), componentType: comp, type, count, ...extra });
    return j.accessors.length - 1;
  };

  // 옛 옷 빼기. 재질 번호는 유지하고 프리미티브만 지운다.
  for (const m of j.meshes) m.primitives = m.primitives.filter(p => !DROP.test(j.materials[p.material].name));
  j.meshes.forEach((m, i) => { if (!m.primitives.length) m.primitives = null; });

  // 덮인 살 빼기: three-vrm이 읽은 몸 인덱스는 원본 프리미티브 순서대로 이어져 있지 않을 수 있어 프리미티브별로 다시 거른다.
  const skinNode = j.nodes.find(n => n.mesh != null && j.meshes[n.mesh].primitives?.some(p => /Body.*SKIN/i.test(j.materials[p.material].name)));
  const hidden = new Set(), pos = av.body.geometry.attributes.position;
  const key = (x, y, z) => `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
  for (const o of av.meshes) {
    if (!o.userData.ix0 || o.geometry.attributes.position !== pos && !o.geometry.attributes.position) continue;
    const a = o.geometry.index.array, P = o.geometry.attributes.position, n = o.geometry.groups[0]?.count || a.length;
    for (let i = 0; i < n; i += 3) if (a[i] === a[i + 1] && a[i + 1] === a[i + 2] && o.userData.ix0[i] !== a[i]) {
      const orig = o.userData.ix0;
      hidden.add([orig[i], orig[i + 1], orig[i + 2]].map(v => key(P.getX(v), P.getY(v), P.getZ(v))).join('|'));
    }
  }
  if (hidden.size) {
    const readAcc = (i) => {
      const a = j.accessors[i], v = j.bufferViews[a.bufferView], s = (v.byteOffset || 0) + (a.byteOffset || 0);
      return { a, v, s, data: B0.buffer.slice(B0.byteOffset + s, B0.byteOffset + s + a.count * ({ 5125: 4, 5123: 2, 5121: 1, 5126: 12 }[a.componentType])) };
    };
    for (const p of j.meshes[skinNode.mesh].primitives) {
      if (!/Body.*SKIN/i.test(j.materials[p.material].name)) continue;
      const I = readAcc(p.indices), P = readAcc(p.attributes.POSITION);
      const idx = I.a.componentType === 5125 ? new Uint32Array(I.data) : new Uint16Array(I.data), xyz = new Float32Array(P.data), kept = [];
      const k = v => key(xyz[v * 3], xyz[v * 3 + 1], xyz[v * 3 + 2]);
      for (let i = 0; i < idx.length; i += 3) if (!hidden.has([k(idx[i]), k(idx[i + 1]), k(idx[i + 2])].join('|'))) kept.push(idx[i], idx[i + 1], idx[i + 2]);
      p.indices = acc(new Uint32Array(kept), 'SCALAR', 5125, kept.length, {}, 34963);
    }
  }
  j.meshes.forEach(m => { if (m.primitives === null) m.primitives = []; });

  // 메운 살 그림으로 바꾸기: 화면과 같아야 어깨 드러낸 옷이 파일에서도 뚫려 보이지 않는다
  const skinMat = av.meshes.map(o => [].concat(o.material)[0]).find(m => /Body.*SKIN/i.test(m.name));
  const healed = [['_MainTex', skinMat?.map], ['_ShadeTexture', skinMat?.shadeMultiplyTexture]];
  for (const [prop, tex] of healed) {
    const c = av.heal?.get(tex);
    if (!c) continue;
    const u = new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/png'))).arrayBuffer());
    j.images.push({ name: 'Skin' + prop, mimeType: 'image/png', bufferView: add(u) });
    j.textures.push({ sampler: 0, source: j.images.length - 1 });
    j.extensions.VRM.materialProperties.forEach((mp, i) => {
      if (!/Body.*SKIN/i.test(mp.name)) return;
      mp.textureProperties[prop] = j.textures.length - 1;
      if (prop === '_MainTex') j.materials[i].pbrMetallicRoughness.baseColorTexture.index = j.textures.length - 1;
    });
  }

  // 그림
  const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
  const png = new Uint8Array(await blob.arrayBuffer());
  j.images.push({ name: 'Outfit', mimeType: 'image/png', bufferView: add(png) });
  j.textures.push({ sampler: 0, source: j.images.length - 1 });
  const tex = j.textures.length - 1;

  // 재질: 샘플의 옷 재질 형식을 복사해서 값만 바꾼다
  const proto = j.extensions.VRM.materialProperties.findIndex(m => /CLOTH/.test(m.name)), mp = JSON.parse(JSON.stringify(j.extensions.VRM.materialProperties[proto]));
  const gm = JSON.parse(JSON.stringify(j.materials[proto]));
  Object.assign(gm, { name: 'Outfit_CLOTH', alphaMode: 'OPAQUE', doubleSided: false });
  delete gm.alphaCutoff;
  gm.pbrMetallicRoughness = { baseColorTexture: { index: tex, texCoord: 0 }, baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: .9 };
  delete gm.emissiveTexture; delete gm.normalTexture; gm.emissiveFactor = [0, 0, 0];
  mp.name = 'Outfit_CLOTH';
  mp.renderQueue = 2000;
  mp.tagMap = { RenderType: 'Opaque' };
  mp.textureProperties = { _MainTex: tex, _ShadeTexture: tex };
  Object.assign(mp.floatProperties, { _BlendMode: 0, _CullMode: 2, _OutlineCullMode: 1, _ShadeShift: -.04, _ShadeToony: .82, _OutlineWidthMode: 1, _OutlineWidth: .11, _OutlineColorMode: 0, _OutlineLightingMix: .5, _ZWrite: 1, _SrcBlend: 1, _DstBlend: 0, _RimFresnelPower: 4, _RimLift: .05, _RimLightingMix: 1 });
  Object.assign(mp.vectorProperties, { _Color: [1, 1, 1, 1], _ShadeColor: [.66, .6, .78, 1], _OutlineColor: [.05, .04, .08, 1], _RimColor: [.16, .14, .22, 1] });
  mp.keywordMap = { MTOON_OUTLINE_WIDTH_WORLD: true, MTOON_OUTLINE_COLOR_FIXED: true, _ALPHATEST_ON: false };
  j.materials.push(gm);
  j.extensions.VRM.materialProperties.push(mp);
  const matId = j.materials.length - 1;

  // 뼈: 살의 skin을 그대로 두고 옷 전용 skin을 하나 더 만든다
  const body = j.skins[skinNode.skin], hipsNode = j.extensions.VRM.humanoid.humanBones.find(b => b.bone === 'hips').node;
  const ibmA = j.accessors[body.inverseBindMatrices], ibmV = j.bufferViews[ibmA.bufferView];
  const old = new Float32Array(B0.buffer.slice(B0.byteOffset + (ibmV.byteOffset || 0) + (ibmA.byteOffset || 0), B0.byteOffset + (ibmV.byteOffset || 0) + (ibmA.byteOffset || 0) + ibmA.count * 64));
  const total = body.joints.length + w.bones.length, ibm = new Float32Array(total * 16);
  ibm.set(old);
  const joints = [...body.joints], nodeOf = new Map();
  w.bones.forEach((b, i) => {
    j.nodes.push({ name: `Outfit_J${i}`, translation: [b.position.x, b.position.y, b.position.z] });
    const id = j.nodes.length - 1, parent = nodeOf.has(b.parent) ? nodeOf.get(b.parent) : hipsNode;
    nodeOf.set(b, id);
    (j.nodes[parent].children ||= []).push(id);
    joints.push(id);
  });
  // shortcut: 몸 skin 뼈 수가 three-vrm 뼈대와 같다고 본다(VRoid 내보내기는 그렇다), 다른 파일이면 여기서 막는다.
  if (body.joints.length !== av.body.skeleton.bones.length) throw new Error('이 파일의 뼈대 구성은 아직 지원하지 않아요');
  w.invs.forEach((m, i) => ibm.set(m.elements, (body.joints.length + i) * 16));
  const ibmId = acc(ibm, 'MAT4', 5126, total, {}, 0); // 역행렬 버퍼는 target을 달면 안 된다
  j.skins.push({ inverseBindMatrices: ibmId, joints, skeleton: body.skeleton, name: 'Outfit' });

  // 메시
  const g = w.meshes[0].geometry, a = g.attributes;
  const P = a.position.array, n = P.length / 3, min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) { min[c] = Math.min(min[c], P[i * 3 + c]); max[c] = Math.max(max[c], P[i * 3 + c]); }
  const uv = a.uv.array.slice();
  for (let i = 1; i < uv.length; i += 2) uv[i] = 1 - uv[i]; // glTF의 v는 위에서부터
  const prim = {
    mode: 4, material: matId, indices: acc(new Uint32Array(g.index.array), 'SCALAR', 5125, g.index.count, {}, 34963),
    attributes: {
      POSITION: acc(P, 'VEC3', 5126, n, { min, max }), NORMAL: acc(a.normal.array, 'VEC3', 5126, n), TEXCOORD_0: acc(uv, 'VEC2', 5126, n),
      JOINTS_0: acc(a.skinIndex.array, 'VEC4', 5123, n), WEIGHTS_0: acc(a.skinWeight.array, 'VEC4', 5126, n),
    },
  };
  j.meshes.push({ name: 'Outfit', primitives: [prim] });
  j.nodes.push({ name: 'Outfit', mesh: j.meshes.length - 1, skin: j.skins.length - 1 });
  j.scenes[j.scene || 0].nodes.push(j.nodes.length - 1);

  // 흔들림 뼈
  const sa = j.extensions.VRM.secondaryAnimation;
  const legs = sa.colliderGroups.map((g, i) => [g, i]).filter(([g]) => /LowerLeg|Knee/i.test(j.nodes[g.node].name)).map(e => e[1]);
  const groups = new Map();
  for (const { ch, list } of w.made) (groups.get(ch) || groups.set(ch, []).get(ch)).push(nodeOf.get(list[0]));
  for (const [ch, bones] of groups) sa.boneGroups.push({
    comment: 'Outfit_' + ch.name, stiffiness: ch.stiff * 1.9, gravityPower: .05, gravityDir: { x: 0, y: -1, z: 0 }, dragForce: .5,
    center: -1, hitRadius: .012, bones, colliderGroups: legs,
  });

  const bin = new Uint8Array(len);
  bin.set(B0);
  for (const c of chunks.slice(1)) bin.set(c.u, c.at);
  j.buffers[0].byteLength = len;
  return writeGlb(j, bin);
}
