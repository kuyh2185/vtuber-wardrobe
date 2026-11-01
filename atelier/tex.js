// 옷 그림(아틀라스) 붓들. 옷은 칸(rect)마다 그림 함수 하나를 갖고, 색을 바꾸면 전부 다시 그린다.
export const SIZE = 2048;

export function rng(seed) { let s = seed * 9301 + 49297; return () => (s = (s * 9301 + 49297) % 233280) / 233280; }

export const fill = (c, r, col) => { c.fillStyle = col; c.fillRect(r.x, r.y, r.w, r.h); };

export function shade(c, r, top = .25, bottom = .2) { // 위아래 가장자리 그늘
  const g = c.createLinearGradient(0, r.y, 0, r.y + r.h);
  g.addColorStop(0, `rgba(10,8,20,${top})`); g.addColorStop(.18, 'rgba(10,8,20,0)');
  g.addColorStop(.86, 'rgba(10,8,20,0)'); g.addColorStop(1, `rgba(10,8,20,${bottom})`);
  c.fillStyle = g; c.fillRect(r.x, r.y, r.w, r.h);
}

export function folds(c, r, seed, n = 16, dark = .22, light = .08) { // 천 주름: 부드러운 어둠 + 옆의 밝은 띠
  const R = rng(seed);
  c.save();
  c.beginPath(); c.rect(r.x, r.y, r.w, r.h); c.clip();
  for (let i = 0; i < n; i++) {
    const x = r.x + R() * r.w, y = r.y + R() * r.h * .7, len = (.15 + R() * .4) * r.h, b = (R() - .5) * r.w * .05;
    const w = 6 + R() * 16;
    c.filter = `blur(${5 + R() * 6}px)`;
    c.lineCap = 'round';
    c.strokeStyle = `rgba(8,6,18,${dark})`; c.lineWidth = w;
    c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + b, y + len / 2, x + b * .4, y + len); c.stroke();
    c.strokeStyle = `rgba(255,250,255,${light})`; c.lineWidth = w * .6;
    c.beginPath(); c.moveTo(x + w, y); c.quadraticCurveTo(x + b + w, y + len / 2, x + b * .4 + w, y + len); c.stroke();
  }
  c.restore();
}

// 모은 천의 주름 높이(0 골 ~ 1 마루). 간격이 불규칙하고 n이 정수면 둘레가 이어진다. 3D 모양과 그림이 같은 값을 쓴다.
export function fold(u, n, seed = 1) {
  const T = Math.PI * 2, s = seed * 1.37;
  const ph = u * n + .5 * Math.sin(T * (u * 3 + s)) + .28 * Math.sin(T * (u * 7 + s * 2.1)) + .14 * Math.sin(T * (u * 13 + s * 3.3));
  return Math.abs(Math.sin(Math.PI * ph)) ** .75;
}

export function gather(c, r, n, seed = 1, dark = .34, light = .1) { // 주름 골에 그늘, 마루에 빛: 3D 주름과 정확히 겹친다
  for (let x = 0; x < r.w; x++) {
    const h = fold(x / r.w, n, seed), d = (1 - h) ** 2 * dark, l = h ** 6 * light;
    if (d > .004) { c.fillStyle = `rgba(14,10,30,${d})`; c.fillRect(r.x + x, r.y, 1, r.h); }
    if (l > .004) { c.fillStyle = `rgba(255,252,255,${l})`; c.fillRect(r.x + x, r.y, 1, r.h); }
  }
}

export function lace(c, r, col, dot = 'rgba(30,24,50,.34)', step = 26) { // 레이스 구멍 무늬: 끝선 쪽 줄이 촘촘하다
  fill(c, r, col);
  c.fillStyle = dot;
  for (let row = 0; row < 3; row++) {
    const y = r.y + r.h * (.5 + row * .17), s = step * (1 - row * .15), R = 3.4 - row * .6;
    for (let x = r.x + (row % 2 ? s / 2 : 0); x < r.x + r.w; x += s) { c.beginPath(); c.arc(x, y, R, 0, Math.PI * 2); c.fill(); }
  }
  c.fillRect(r.x, r.y + r.h * .34, r.w, 2.5);
}

export function stitch(c, x0, y0, x1, y1, col, w = 2, dash = [9, 7]) {
  c.save(); c.strokeStyle = col; c.lineWidth = w; c.setLineDash(dash);
  c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); c.restore();
}

export function band(c, r, y, h, col) { c.fillStyle = col; c.fillRect(r.x, y, r.w, h); }

export function plaid(c, r, a, b, line, step = 58) { // 체크 원단
  c.fillStyle = a; c.fillRect(r.x, r.y, r.w, r.h);
  c.globalAlpha = .55; c.fillStyle = b;
  for (let x = r.x; x < r.x + r.w; x += step) c.fillRect(x, r.y, step * .42, r.h);
  for (let y = r.y; y < r.y + r.h; y += step) c.fillRect(r.x, y, r.w, step * .42);
  c.globalAlpha = .85; c.fillStyle = line;
  for (let x = r.x + step * .68; x < r.x + r.w; x += step) c.fillRect(x, r.y, 3, r.h);
  for (let y = r.y + step * .68; y < r.y + r.h; y += step) c.fillRect(r.x, y, r.w, 3);
  c.globalAlpha = 1;
}

export function metal(c, r, hi, mid, lo) { // 금속 칸
  const g = c.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
  g.addColorStop(0, hi); g.addColorStop(.45, mid); g.addColorStop(.55, hi); g.addColorStop(1, lo);
  c.fillStyle = g; c.fillRect(r.x, r.y, r.w, r.h);
}

export function cloud(c, x, y, s, col, w = 3.2) { // 상서로운 구름 무늬
  c.save(); c.translate(x, y); c.scale(s, s); c.strokeStyle = col; c.lineWidth = w / s; c.lineCap = 'round';
  const curl = (cx, cy, rad, st, en) => { c.beginPath(); c.arc(cx, cy, rad, st, en); c.stroke(); };
  curl(0, 0, 16, 0, Math.PI * 1.7); curl(0, 0, 8, Math.PI, Math.PI * 2.6);
  curl(26, 6, 12, Math.PI * .9, Math.PI * 2.5); curl(26, 6, 5, 0, Math.PI * 1.5);
  curl(-25, 8, 11, -Math.PI * .4, Math.PI * 1.1); curl(-25, 8, 4.5, Math.PI, Math.PI * 2.5);
  c.beginPath(); c.moveTo(-40, 20); c.bezierCurveTo(-14, 26, 16, 26, 46, 18); c.stroke();
  c.beginPath(); c.moveTo(-22, 30); c.bezierCurveTo(-4, 34, 14, 34, 30, 29); c.stroke();
  c.restore();
}

export function waves(c, r, y0, y1, col, step = 44) { // 금실 물결 자수: 아래로 갈수록 진해진다
  c.save(); c.beginPath(); c.rect(r.x, r.y, r.w, r.h); c.clip();
  c.strokeStyle = col; c.lineWidth = 2.2;
  let row = 0;
  for (let y = y1; y > y0 - step; y -= step * .5, row++) {
    c.globalAlpha = Math.max(0, Math.min(1, ((y - y0) / (y1 - y0)) ** 1.6 + .04));
    for (let x = r.x - step + (row % 2 ? step : 0); x < r.x + r.w + step; x += step * 2) {
      c.fillStyle = 'rgba(20,16,26,1)';
      c.beginPath(); c.arc(x, y, step, Math.PI, 0); c.closePath(); c.fill();
      for (const k of [1, .72, .44, .18]) { c.beginPath(); c.arc(x, y, step * k, Math.PI, 0); c.stroke(); }
    }
  }
  c.restore();
}

export function lattice(c, r, col, step = 46) { // 같은 색 계열 자카드 격자
  c.save(); c.beginPath(); c.rect(r.x, r.y, r.w, r.h); c.clip();
  c.strokeStyle = col; c.lineWidth = 1.6;
  for (let x = r.x - r.h; x < r.x + r.w + r.h; x += step) {
    c.beginPath(); c.moveTo(x, r.y); c.lineTo(x + r.h, r.y + r.h); c.stroke();
    c.beginPath(); c.moveTo(x + r.h, r.y); c.lineTo(x, r.y + r.h); c.stroke();
  }
  c.restore();
}

// 입체감을 그림으로 새긴다: 몸의 옆면과 윗단 아래를 그늘색으로 눌러 어떤 프로그램에서 열어도 굴곡이 남는다.
export function form(c, r, col, k = 1) {
  c.save(); c.globalAlpha = .34 * k;
  for (const [a, b] of [[.13, .27], [.87, .73]]) { // 옆구리
    const g = c.createLinearGradient(r.x + r.w * a, 0, r.x + r.w * b, 0);
    g.addColorStop(0, col); g.addColorStop(.55, col); g.addColorStop(.62, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(r.x, r.y, r.w, r.h);
  }
  const g = c.createLinearGradient(0, r.y + r.h * .55, 0, r.y + r.h); // 아래로 갈수록 그늘
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, col);
  c.globalAlpha = .26 * k; c.fillStyle = g; c.fillRect(r.x, r.y, r.w, r.h);
  c.restore();
}

export function blossom(c, x, y, s, col, core = 'rgba(255,255,255,.75)') { // 벚꽃 한 송이: 끝이 살짝 갈라진 꽃잎 다섯 장
  c.save(); c.translate(x, y); c.fillStyle = col;
  for (let i = 0; i < 5; i++) {
    c.rotate(Math.PI * 2 / 5);
    c.beginPath(); c.moveTo(0, 0);
    c.bezierCurveTo(-s * .62, -s * .4, -s * .5, -s * 1.02, -s * .1, -s);
    c.lineTo(0, -s * .86); c.lineTo(s * .1, -s);
    c.bezierCurveTo(s * .5, -s * 1.02, s * .62, -s * .4, 0, 0); c.fill();
  }
  c.fillStyle = core; c.beginPath(); c.arc(0, 0, s * .16, 0, Math.PI * 2); c.fill();
  c.restore();
}

// 비치는 레이스 앞치마: 칸 전체를 반투명으로 채우고, 끝선은 물결로 파낸다. 투명 재질에서만 쓴다.
export function sheerLace(c, r, col = '255,255,255', rows = 3, n = 30) {
  c.save(); c.beginPath(); c.rect(r.x, r.y, r.w, r.h); c.clip();
  c.clearRect(r.x, r.y, r.w, r.h);
  const g = c.createLinearGradient(0, r.y, 0, r.y + r.h);
  g.addColorStop(0, `rgba(${col},.04)`); g.addColorStop(.4, `rgba(${col},.42)`); g.addColorStop(1, `rgba(${col},.62)`);
  c.fillStyle = g; c.fillRect(r.x, r.y, r.w, r.h);
  const s = r.w / n;
  for (let k = 0; k < rows; k++) { // 물결 레이스 줄
    const y = r.y + r.h * (.48 + k * .2), rad = s * .5;
    c.strokeStyle = `rgba(${col},.95)`; c.lineWidth = 3 - k * .5;
    for (let x = r.x + (k % 2 ? s / 2 : 0); x < r.x + r.w + s; x += s) {
      c.beginPath(); c.arc(x, y, rad, 0, Math.PI); c.stroke();
      c.beginPath(); c.arc(x, y + rad * .3, rad * .32, 0, Math.PI * 2); c.stroke();
    }
  }
  for (let x = r.x; x < r.x + r.w; x += s / 2) { // 꽃무늬 점
    c.fillStyle = `rgba(${col},.9)`; c.beginPath(); c.arc(x, r.y + r.h * .4 + Math.sin(x * .05) * 6, 2.6, 0, Math.PI * 2); c.fill();
  }
  c.globalCompositeOperation = 'destination-out'; // 끝선 물결
  for (let x = r.x; x < r.x + r.w + s; x += s) { c.beginPath(); c.arc(x + s / 2, r.y + r.h + s * .12, s * .46, 0, Math.PI * 2); c.fill(); }
  c.restore();
}

export function logo(c, cx, cy, text, col, size, font = '900 %px "Arial Black", Pretendard, sans-serif') {
  c.save(); c.fillStyle = col; c.font = font.replace('%', size); c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(text, cx, cy); c.restore();
}
