// 버튜버 의상 작업실: 고르기 → 내 손으로 바꾸기 → 자동 보정 → 시청자와 고르기 → 움직여 보고 받기
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { loadAvatar } from './body.js';
import { wear, hideOld, poke, remove, fromOther } from './wear.js';
import { LOOKS } from './looks.js';
import { SIZE } from './tex.js';
import { exportVrm, modifyBanned } from './export.js';

const $ = id => document.getElementById(id);
const REC = new URLSearchParams(location.search).has('rec'); // 영상 녹화: 시간을 밖에서 한 칸씩 민다
const AV = [
  { id: 'E', label: '작은 체형', file: 'AvatarSample_E.vrm' },
  { id: 'D', label: '보통 체형', file: 'AvatarSample_D.vrm' },
  { id: 'G', label: '큰 체형', file: 'AvatarSample_G.vrm' },
];
const STEPS = ['고르기', '바꾸기', '보정', '시청자', '받기'];

const stage = $('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
stage.prepend(renderer.domElement);
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(20, 1, .1, 50);
scene.add(new THREE.AmbientLight(0xffffff, 1));
const keyL = new THREE.DirectionalLight(0xfff4ee, 2.1); keyL.position.set(-1, 2, 2.4); scene.add(keyL);
const rimL = new THREE.DirectionalLight(0xc8a8ff, .9); rimL.position.set(2, 1.5, -2); scene.add(rimL);
const floor = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), r = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  r.addColorStop(0, 'rgba(0,0,0,.55)'); r.addColorStop(.55, 'rgba(0,0,0,.18)'); r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r; g.fillRect(0, 0, 256, 256);
  const m = new THREE.Mesh(new THREE.CircleGeometry(.75, 48), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = .002;
  return m;
})();
scene.add(floor);
const turn = new THREE.Group(); scene.add(turn); // 회전 동작용
const orbit = new OrbitControls(cam, renderer.domElement);
orbit.enableDamping = true; orbit.enablePan = false; orbit.minDistance = .7; orbit.maxDistance = 9;

const loader = new GLTFLoader();
loader.register(p => new VRMLoaderPlugin(p));
const canvas = document.createElement('canvas');
canvas.width = canvas.height = SIZE;

const S = { step: 0, av: null, avs: {}, look: 'hood', params: {}, w: null, raw: false, motion: 'idle', t: 0, vote: null, tease: false, cover: 0 };
window.__S = S;

function fit() {
  const W = stage.clientWidth, H = stage.clientHeight;
  renderer.setSize(W, H, false);
  cam.aspect = W / H;
  cam.updateProjectionMatrix();
}
addEventListener('resize', fit);

const fullH = av => av.fr.H + .24; // fr.H는 머리뼈 높이라 정수리까지 더한다
function frame(av, keep, close) {
  const H = fullH(av), y = close ? H * .68 : H * .5, span = close ? H * .52 : H;
  orbit.target.set(0, y, 0);
  if (keep) return;
  const D = span / 2 / Math.tan(cam.fov * Math.PI / 360) * 1.1;
  cam.position.set(D * .12, y + .02, D);
}

function freshParams(id) {
  const p = structuredClone(LOOKS[id].params);
  if (LOOKS[id].text) p[LOOKS[id].text.key] = LOOKS[id].text.value;
  return p;
}

function dress() {
  const L = LOOKS[S.look], av = S.av;
  const from = S.raw ? otherBody(av) : null;
  S.w = wear(av, L.build, S.params, canvas, S.w, from);
  $('hudT').textContent = L.label;
  $('hudS').textContent = `${AV.find(a => S.avs[a.id] === av).label} · 옷 조각 ${S.w.verts.toLocaleString()}점`;
  if (S.step === 2) metrics();
}
const otherId = av => (av === S.avs.G ? 'E' : 'G');
function otherBody(av) { return S.avs[otherId(av)]; }
const bodyName = av => AV.find(a => S.avs[a.id] === av).label;

let queued = false;
function redress() { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; dress(); }); }

// 캐릭터 파일이 15MB씩이라 첫 화면엔 하나만 받고 나머지는 고를 때 받는다.
async function need(id) {
  if (S.avs[id]) return S.avs[id];
  const L = $('load');
  L.textContent = '캐릭터를 불러오는 중이에요';
  L.classList.remove('off');
  try {
    const av = await loadAvatar(loader, '../samples/' + AV.find(a => a.id === id).file);
    prep(av);
    return S.avs[id] = av;
  } finally { L.classList.add('off'); }
}
const offline = () => { $('tag').textContent = '캐릭터를 받지 못했어요. 인터넷을 확인하고 다시 눌러 주세요'; };

async function setAvatar(id, keepCam) {
  let av;
  try { av = await need(id); } catch (e) { console.warn(e); offline(); if (S.av) stepView(); else throw e; return; }
  if (S.av === av) return;
  if (S.av) { remove(S.av, S.w); S.w = null; turn.remove(S.av.vrm.scene); }
  S.av = av;
  turn.add(av.vrm.scene);
  av.vrm.scene.updateMatrixWorld(true);
  frame(av, keepCam);
  dress();
}

function setLook(id) { S.look = id; S.params = freshParams(id); dress(); }

// ---- 움직임: 잘 보이게 손으로 짠 짧은 동작 ----
function pose(av, t) {
  const h = av.vrm.humanoid, n = b => h.getNormalizedBoneNode(b).rotation, sn = Math.sin, m = S.motion;
  const hips = h.getNormalizedBoneNode('hips');
  const set = (b, x, y, z) => n(b).set(x, y, z);
  const breath = sn(t * 1.7) * .012;
  set('leftUpperArm', 0, 0, 1.2 + breath); set('rightUpperArm', 0, 0, -1.2 - breath);
  set('leftLowerArm', 0, 0, .12); set('rightLowerArm', 0, 0, -.12);
  set('spine', 0, 0, sn(t * .9) * .012); set('chest', breath, 0, 0); set('head', 0, sn(t * .6) * .05, 0); set('hips', 0, 0, 0);
  hips.position.y = av.hip0;
  turn.rotation.y = 0;
  if (m === 'wave') {
    // shortcut: VRM 0.x 샘플 기준 부호(오른팔 +z가 위), VRM 1.0을 넣을 때 뒤집어야 한다
    set('rightUpperArm', 0, 0, .12);
    set('rightLowerArm', 0, 0, 1.75 + sn(t * 8) * .32);
    set('head', 0, 0, .07); set('spine', 0, 0, -.05);
  } else if (m === 'dance') {
    const b = t * 5.2, s = sn(b), c = Math.cos(b);
    hips.position.y = av.hip0 - Math.abs(s) * .035;
    set('hips', 0, s * .3, s * .07); set('spine', 0, -s * .14, -s * .07); set('chest', 0, -s * .1, -s * .06);
    set('leftUpperArm', 0, 0, 1 - s * .5); set('rightUpperArm', 0, 0, -1 - s * .5);
    set('leftLowerArm', 0, .8 + c * .4, 0); set('rightLowerArm', 0, -.8 - c * .4, 0);
    set('head', 0, s * .12, c * .05);
  } else if (m === 'spin') {
    turn.rotation.y = t * 4.2;
    set('leftUpperArm', 0, 0, .85); set('rightUpperArm', 0, 0, -.85);
  }
}

const tease = new THREE.MeshBasicMaterial({ color: 0x07060b });
let last = performance.now();
function step(dt) {
  S.t += dt;
  if (S.av) {
    pose(S.av, S.t);
    S.av.vrm.update(dt);
  }
  voteTick(dt);
  orbit.update();
  scene.overrideMaterial = S.tease ? tease : null;
  floor.visible = !S.tease;
  renderer.render(scene, cam);
}
if (!REC) renderer.setAnimationLoop(() => { const n = performance.now(), dt = Math.min((n - last) / 1000, .05); last = n; step(dt); });

// ---- 화면 조각 ----
const h = (s) => { const t = document.createElement('template'); t.innerHTML = s.trim(); return t.content.firstChild; };
const body = $('body');
function stepView() {
  S.tease = false; S.raw = false; S.vote = null;
  clearDots();
  frame(S.av, false, S.step === 2);
  body.replaceChildren();
  $('badge').className = '';
  [renderStart, renderEdit, renderFix, renderVote, renderTake][S.step]();
  [...$('nav').children].forEach((b, i) => { if (i === S.step) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
  $('prev').disabled = S.step === 0;
  $('next').disabled = S.step === STEPS.length - 1;
  body.scrollTop = 0;
}
async function go(n) {
  if (n === 2) try { await need(otherId(S.av)); } catch (e) { console.warn(e); offline(); return; } // 보정 비교에 다른 체형이 필요
  const wasRaw = S.raw;
  S.step = n;
  stepView();
  if (wasRaw) dress();
}

function picks(el, list, cur, on) {
  list.forEach(([id, title, sub]) => {
    const b = h(`<button class="card" aria-pressed="${id === cur}"><b></b>${sub ? '<span></span>' : ''}</button>`);
    b.querySelector('b').textContent = title;
    if (sub) b.querySelector('span').textContent = sub;
    b.onclick = () => { [...el.children].forEach(x => x.setAttribute('aria-pressed', x === b)); on(id); };
    el.append(b);
  });
}

function renderStart() {
  body.append(h('<h2>옷을 받는 게 아니라, 직접 만들어요</h2>'));
  body.append(h('<p class="lead">아래 세 벌은 완성품이 아니라 출발점이에요. 고른 뒤 길이·품·색·글자를 바꾸면 내 캐릭터 몸에 맞춰 그 자리에서 다시 만들어집니다.</p>'));
  body.append(h('<h3>시작할 옷</h3>'));
  const a = h('<div class="pick"></div>');
  picks(a, Object.entries(LOOKS).map(([id, l]) => [id, l.label, l.why]), S.look, setLook);
  body.append(a);
  body.append(h('<h3>캐릭터 (체형이 달라도 같은 옷이 맞아요)</h3>'));
  const b = h('<div class="row3"></div>');
  picks(b, AV.map(x => [x.id, x.label]), AV.find(x => S.avs[x.id] === S.av).id, id => setAvatar(id));
  body.append(b);
  body.append(h('<h3>내 캐릭터로 해 보기</h3>'));
  const up = h('<label class="card" style="text-align:center;font-weight:700"><span id="upT" style="color:inherit;font-size:14px;margin:0">내 VRM 파일 불러오기</span><input id="upF" type="file" accept=".vrm" style="position:absolute;opacity:0;width:1px;height:1px"></label>');
  up.querySelector('input').onchange = e => e.target.files[0] && mine(e.target.files[0]);
  body.append(up);
  body.append(h('<p class="note">파일은 이 브라우저 안에서만 열리고 어디로도 올라가지 않아요. 기본 캐릭터는 VRoid 공식 샘플입니다.</p>'));
}

// shortcut: VRoid로 만든 VRM 0.x만 받는다(옛 옷을 재질 이름으로 찾음). VRM 1.0은 내보내기까지 고친 뒤 푼다.
async function mine(file) {
  const t = $('upT');
  t.textContent = '불러오는 중이에요';
  const url = URL.createObjectURL(file);
  try {
    const av = await loadAvatar(loader, url);
    if (!av.v0) throw new Error('지금은 VRM 0.x 파일만 입힐 수 있어요. VRoid Studio에서 내보낼 때 VRM 0.0을 골라 주세요');
    prep(av);
    S.avs.U = av;
    if (!AV.some(a => a.id === 'U')) AV.push({ id: 'U', label: '내 캐릭터' });
    await setAvatar('U');
    stepView();
  } catch (e) {
    console.warn(e);
    t.textContent = /^지금은/.test(e.message) ? e.message : '이 파일은 아직 입힐 수 없어요. VRoid로 만든 파일인지 확인해 주세요';
  }
  URL.revokeObjectURL(url);
}
function prep(av) {
  hideOld(av);
  if (av.v0) VRMUtils.rotateVRM0(av.vrm);
  av.hip0 = av.vrm.humanoid.getNormalizedBoneNode('hips').position.y;
}

function renderEdit() {
  const L = LOOKS[S.look];
  body.append(h('<h2>내 손으로 바꾸기</h2>'));
  body.append(h('<p class="lead">막대를 움직이면 옷이 바로 다시 만들어져요. 어떤 값이든 옷이 몸을 따라갑니다.</p>'));
  const tg = h('<div class="tg"></div>');
  for (const c of L.controls) {
    if (c.toggle) {
      const b = h(`<button aria-pressed="${!!S.params[c.key]}"></button>`);
      b.textContent = c.label;
      b.onclick = () => { S.params[c.key] = S.params[c.key] ? 0 : 1; b.setAttribute('aria-pressed', !!S.params[c.key]); redress(); };
      tg.append(b);
      continue;
    }
    const e = h(`<label class="s"><span></span><i></i><input type="range" min="0" max="1" step=".01" value="${S.params[c.key]}"></label>`);
    e.children[0].textContent = c.label; e.children[1].textContent = c.hint || '';
    e.querySelector('input').oninput = ev => { S.params[c.key] = +ev.target.value; redress(); };
    body.append(e);
  }
  if (tg.children.length) { body.append(h('<h3>넣고 빼기</h3>')); body.append(tg); }
  for (const g of L.colors) {
    body.append(h(`<h3>${g.label}</h3>`));
    const r = h('<div class="sw"></div>');
    for (const v of g.values) {
      const b = h(`<button aria-pressed="${S.params.pal[g.key] === v}" style="background:${v}" aria-label="${g.label} ${v}"></button>`);
      b.onclick = () => { S.params.pal[g.key] = v; [...r.children].forEach(x => x.setAttribute('aria-pressed', x === b)); redress(); };
      r.append(b);
    }
    body.append(r);
  }
  if (L.text) {
    body.append(h(`<h3>${L.text.label}: 내 방송 이름을 넣어 보세요</h3>`));
    const i = h(`<input type="text" maxlength="${L.text.max}" aria-label="${L.text.label}">`);
    i.value = S.params[L.text.key];
    i.oninput = () => { S.params[L.text.key] = i.value; redress(); };
    body.append(i);
  }
}

const dotMat = new THREE.PointsMaterial({ color: 0xff2d55, size: .009, depthTest: false, transparent: true });
let dots = null;
function clearDots() { if (!dots) return; dots.parent.remove(dots); dots.geometry.dispose(); dots = null; }
function showDots(av, pts) {
  clearDots();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  dots = new THREE.Points(g, dotMat);
  dots.renderOrder = 9;
  av.vrm.scene.add(dots); // 몸 안쪽 점이라 깊이 검사를 끄고 옷 위로 보여 준다
}
function metrics() {
  const L = LOOKS[S.look], av = S.av, O = fromOther(av, otherBody(av), L.build, S.params);
  const pb = poke(av, O), before = pb.n, pa = S.w && !S.raw ? poke(av, S.w.O) : null, after = pa ? pa.n : null;
  showDots(av, S.raw ? pb.pts : pa.pts);
  const box = $('nums');
  if (!box) return;
  const hide = S.w ? S.w.hidden : 0;
  box.replaceChildren();
  const row = (k, v) => { const d = h('<div><span></span><b></b></div>'); d.children[0].textContent = k; d.children[1].textContent = v; box.append(d); };
  S.m ||= {};
  S.m.before = before; if (after != null) S.m.after = after;
  row('그대로 입혔을 때 몸을 뚫은 점', before.toLocaleString());
  row('체형에 맞춘 뒤', S.m.after != null ? S.m.after.toLocaleString() : '-');
  row('자동으로 달린 흔들림 뼈', `${S.w.bones.length}개`);
  if (hide) row('옷이 덮어서 숨긴 살 면', `${hide.toLocaleString()}개`);
  const raw = S.raw;
  $('badge').className = 'show ' + (raw ? 'bad' : 'good');
  $('badge').textContent = raw ? `보정 전: ${bodyName(otherBody(av))}용 옷을 키만 맞춤` : '보정 후: 이 캐릭터 몸으로 다시 재단';
}

function renderFix() {
  body.append(h('<h2>자동 보정이 하는 일</h2>'));
  body.append(h('<p class="lead">빨간 점은 옷이 몸을 뚫고 들어간 곳이에요. 다른 체형용 옷을 그대로 입힌 경우와, 이 캐릭터 몸으로 다시 재단한 경우를 비교해 보세요.</p>'));
  const b = h('<div class="row3" style="grid-template-columns:1fr 1fr"></div>');
  const mode = raw => { S.raw = raw; dress(); metrics(); };
  picks(b, [['raw', '보정 전'], ['fit', '보정 후']], 'fit', id => mode(id === 'raw'));
  body.append(b);
  body.append(h('<div class="nums" id="nums"></div>'));
  body.append(h('<h3>자동으로 맞추는 것</h3>'));
  body.append(h('<p style="margin:0;font-size:14px">가슴·허리·엉덩이·어깨 둘레, 소매와 팔 길이, 치마가 시작되는 허리 높이, 움직일 때 옷을 끌고 갈 뼈, 치마의 흔들림, 옷에 덮인 살 숨기기.</p>'));
  body.append(h('<h3>사람이 봐야 하는 것</h3>'));
  body.append(h('<p style="margin:0;font-size:14px">긴 머리와 옷깃이 겹치는 곳, 팔을 높이 드는 큰 동작, 인간형이 아닌 캐릭터. 지금은 VRoid로 만든 캐릭터까지만 맞습니다.</p>'));
  body.append(h('<p class="note">숫자는 이 옷·이 체형을 지금 재서 나온 값이고, 기본 자세 기준이에요.</p>'));
  metrics();
}

// ---- 시청자 투표 체험 ----
function renderVote() {
  body.append(h('<h2>시청자와 같이 고르기</h2>'));
  body.append(h('<p class="lead">방송에서 링크를 열면 시청자가 부위별로 투표하고, 끝나는 순간 옷이 그 자리에서 바뀌어요. 공개 방송 자체가 콘텐츠가 됩니다.</p>'));
  const L = LOOKS[S.look], box = h('<div id="polls"></div>');
  const polls = L.vote.map((v, i) => {
    const e = h('<div class="vote"><b></b></div>');
    e.firstChild.textContent = v.q;
    const bars = v.opts.map(([name]) => {
      const b = h('<div class="bar"><i style="width:0"></i><span><em style="font-style:normal"></em><small>0</small></span></div>');
      b.querySelector('em').textContent = name;
      e.append(b);
      return b;
    });
    box.append(e);
    return { v, bars, n: v.opts.map(() => 0), bias: v.opts.map((_, k) => .35 + .65 * Math.abs(Math.sin(i * 7.3 + k * 2.1 + S.t))) };
  });
  body.append(box);
  const start = h('<button class="go">투표 시작</button>');
  body.append(start);
  body.append(h('<p class="note">지금 숫자는 흐름을 보여 주는 가상의 표예요. 실제 투표 서버는 아직 없습니다.</p>'));
  S.vote = { polls, left: 0, done: false };
  start.onclick = () => { start.disabled = true; start.textContent = '투표 중'; S.vote.left = 5; };
  S.vote.start = start;
}
function voteTick(dt) {
  const V = S.vote;
  if (!V || V.left <= 0 || V.done) return;
  V.left -= dt;
  for (const p of V.polls) {
    const tot0 = p.n.reduce((a, b) => a + b, 0) + 1;
    p.n = p.n.map((x, i) => x + p.bias[i] * dt * (60 + Math.random() * 60));
    const tot = p.n.reduce((a, b) => a + b, 0) || tot0;
    p.bars.forEach((b, i) => { b.querySelector('i').style.width = `${p.n[i] / tot * 100}%`; b.querySelector('small').textContent = Math.round(p.n[i]); });
  }
  if (V.left > 0) return;
  V.done = true;
  for (const p of V.polls) {
    const w = p.n.indexOf(Math.max(...p.n));
    p.bars[w].classList.add('win');
    const c = p.v.opts[w][1];
    for (const k in c) { if (k === 'pal') Object.assign(S.params.pal, c.pal); else S.params[k] = c[k]; }
  }
  dress();
  V.start.textContent = '시청자가 고른 옷으로 바뀌었어요';
  $('badge').className = 'show good';
  $('badge').textContent = '투표 결과 적용됨';
}

function renderTake() {
  body.append(h('<h2>움직여 보고 받기</h2>'));
  body.append(h('<p class="lead">실제 방송에서처럼 움직이게 해 보고, 마음에 들면 파일로 받아요.</p>'));
  body.append(h('<h3>움직임</h3>'));
  const m = h('<div class="row3" style="grid-template-columns:repeat(4,1fr)"></div>');
  picks(m, [['idle', '가만히'], ['wave', '인사'], ['dance', '춤'], ['spin', '돌기']], S.motion, id => { S.motion = id; });
  body.append(m);
  body.append(h('<h3>공개 방송 준비</h3>'));
  const t = h('<button class="go alt">실루엣 예고 보기</button>');
  t.onclick = () => { S.tease = !S.tease; t.textContent = S.tease ? '옷 공개하기' : '실루엣 예고 보기'; };
  body.append(t);
  body.append(h('<h3>받기</h3>'));
  const a = h('<button class="go">VRM 파일 받기</button>');
  a.onclick = async () => {
    a.disabled = true; a.textContent = '파일 만드는 중';
    try {
      const b = await exportVrm(S.av, S.w, canvas);
      save(new Blob([b]), `${LOOKS[S.look].label}.vrm`);
      a.textContent = 'VRM 파일 받기';
    } catch (e) { a.textContent = e.message; }
    a.disabled = false;
  };
  const banned = modifyBanned(S.av.vrm.meta);
  if (banned) { a.disabled = true; a.textContent = 'VRM 파일은 받을 수 없어요'; }
  body.append(a);
  if (banned) body.append(h('<p class="note">이 캐릭터는 제작자가 수정을 금지했어요. 입어 보기와 디자인 시트만 쓸 수 있습니다.</p>'));
  const d = h('<button class="go alt">앞·옆·뒤 디자인 시트 받기</button>');
  d.onclick = async () => save(await sheet(), `${LOOKS[S.look].label}_디자인시트.png`);
  body.append(d);
  body.append(h('<p class="note">디자인 시트는 Live2D 작가에게 그대로 보낼 수 있어요. VRM은 표준 형식이고 브라우저에서 다시 열어 확인했어요. VSeeFace·Warudo에서는 아직 시험 전입니다.</p>'));
}

function save(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function sheet() {
  const W = 1800, H0 = 1200, out = document.createElement('canvas');
  out.width = W; out.height = H0;
  const c = out.getContext('2d');
  c.fillStyle = '#f4f0ea'; c.fillRect(0, 0, W, H0);
  const av = S.av, H = fullH(av), D = H / 2 / Math.tan(cam.fov * Math.PI / 360) * 1.1;
  const keep = cam.position.clone(), ka = cam.aspect, motion = S.motion;
  S.motion = 'idle'; pose(av, 0); av.vrm.update(0); floor.visible = false;
  renderer.setSize(560, 1000, false); cam.aspect = .56; cam.updateProjectionMatrix();
  [0, 90, 180].forEach((deg, i) => {
    const a = deg * Math.PI / 180;
    cam.position.set(Math.sin(a) * D, H * .5, Math.cos(a) * D); cam.lookAt(0, H * .5, 0);
    renderer.render(scene, cam);
    c.drawImage(renderer.domElement, 30 + i * 590, 130, 560, 1000);
    c.fillStyle = '#16131d'; c.font = '600 26px Pretendard, sans-serif'; c.fillText(['앞', '옆', '뒤'][i], 30 + i * 590 + 20, 1160);
  });
  c.fillStyle = '#16131d'; c.font = '800 44px Pretendard, sans-serif'; c.fillText(LOOKS[S.look].label, 44, 76);
  const pal = LOOKS[S.look].colors.map(g => S.params.pal[g.key]);
  pal.forEach((col, i) => { c.fillStyle = col; c.fillRect(W - 60 - i * 56, 40, 44, 44); });
  cam.position.copy(keep); cam.aspect = ka; fit(); S.motion = motion;
  return new Promise(r => out.toBlob(r, 'image/png'));
}

// ---- 시작 ----
STEPS.forEach((s, i) => {
  const b = h(`<button><b>${i + 1}</b>${s}</button>`);
  b.onclick = () => go(i);
  $('nav').append(b);
});
$('prev').onclick = () => go(S.step - 1);
$('next').onclick = () => go(S.step + 1);
fit();
if (matchMedia('(pointer: coarse)').matches) $('tag').textContent = '끌어서 돌리고, 두 손가락으로 확대해요';
S.params = freshParams(S.look);
try {
  await setAvatar('D');
  stepView();
} catch (e) {
  $('load').classList.remove('off');
  $('load').textContent = '캐릭터를 받지 못했어요. 새로고침해 주세요';
  throw e;
}
window.__need = need;
window.__tick = dt => step(dt);
window.__go = go;
window.__ready = true;
