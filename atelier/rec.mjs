// 버튜버에게 보낼 시연 영상: 작업실을 실제로 조작하며 한 칸씩 찍는다(연출 화면 없음, 화면의 숫자도 실측).
// usage: PLAYWRIGHT=<경로> node atelier/rec.mjs <폴더>  → <폴더>/f%05d.png, ffmpeg로 묶는다
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir, rm } from 'node:fs/promises';
import { join, extname } from 'node:path';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT);
const out = process.argv[2] || 'out/rec', FPS = 24;
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript' };
const srv = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const data = await readFile(join(process.cwd(), p));
    res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const b = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
const pg = await b.newPage({ viewport: { width: 1280, height: 720 } });
pg.on('pageerror', e => { console.log('오류', e.message); });
await pg.goto(`http://localhost:${srv.address().port}/atelier/index.html?rec=1`);
await pg.waitForFunction(() => window.__ready, null, { timeout: 120000 });
await pg.evaluate(() => Promise.all(['E', 'G'].map(window.__need)));
await pg.addStyleTag({ content: `#cap{position:absolute;left:0;right:0;bottom:56px;text-align:center;font-weight:800;font-size:26px;letter-spacing:-.02em;text-shadow:0 2px 12px #000,0 0 3px #000;pointer-events:none;padding:0 24px}#tag{display:none}` });
await pg.evaluate(() => { const c = document.createElement('div'); c.id = 'cap'; document.getElementById('stage').append(c); });

let n = 0;
const cap = t => pg.evaluate(x => { document.getElementById('cap').textContent = x; }, t);
const tick = async (sec, each) => {
  const N = Math.round(sec * FPS);
  for (let i = 0; i < N; i++) {
    if (each) await each(i / Math.max(1, N - 1));
    await pg.evaluate(dt => new Promise(r => requestAnimationFrame(() => { window.__tick(dt); r(); })), 1 / FPS);
    await pg.screenshot({ path: join(out, `f${String(n++).padStart(5, '0')}.png`) });
  }
};
const go = i => pg.evaluate(k => window.__go(k), i);
const card = t => pg.locator('button.card', { hasText: t }).first();
const slide = (i, v) => pg.evaluate(([k, x]) => { const e = document.querySelectorAll('input[type=range]')[k]; e.value = x; e.dispatchEvent(new Event('input')); }, [i, v]);

await cap('이 옷은 완성품이 아니에요');
await tick(2.4);
await cap('버튜버가 직접 바꾸는 출발점이에요');
await tick(1.8);

await card('오프숄더 스트릿').click(); // 글자 넣기가 있는 옷으로 보여 준다
await go(1);
await cap('치마 길이를 줄이고');
await tick(2, t => slide(2, .75 - .6 * t));
await cap('소매를 더 크게 만들고');
await tick(1.6, t => slide(0, .3 + .5 * t));
await cap('색을 고르고');
for (const i of [1, 2, 3]) { await pg.locator('.sw button').nth(i).click(); await tick(.5); }
await cap('내 방송 이름을 넣어요');
for (const w of ['N', 'NO', 'NOV', 'NOVA', 'NOVA T', 'NOVA TV']) {
  await pg.locator('input[type=text]').fill(w);
  await tick(.2);
}
await tick(1);

await go(0);
await cap('체형이 달라도 몸에 맞춰 다시 재단돼요');
for (const t of ['작은 체형', '큰 체형', '보통 체형']) { await card(t).click(); await tick(1.1); }

await go(2);
await pg.waitForTimeout(100);
const nums = await pg.evaluate(() => [...document.querySelectorAll('#nums b')].map(e => e.textContent));
await card('보정 전').click();
await cap(`다른 체형용 옷을 그대로 입히면: 몸을 뚫은 점 ${nums[0]}개`);
await tick(2.6);
await card('보정 후').click();
await cap(`이 몸으로 다시 재단하면: ${nums[1]}개`);
await tick(2.6);

await go(3);
await cap('공개 방송에서는 시청자가 고르게 할 수 있어요 (가상의 표)');
await tick(.8);
await pg.locator('button.go', { hasText: '투표 시작' }).click();
await tick(5.4);
await cap('결과가 그 자리에서 옷이 돼요');
await tick(1.6);

await go(4);
await pg.locator('button.go', { hasText: '실루엣' }).click();
await cap('실루엣으로 먼저 예고하고');
await card('가만히').click();
await tick(1.8);
await pg.locator('button.go', { hasText: '옷 공개' }).click();
await card('돌기').click();
await cap('공개! 치마 흔들림 뼈까지 자동으로 달려요');
await tick(2.6);
await card('춤').click();
await tick(2.4);
await card('인사').click();
await cap('VRM 파일과 디자인 시트로 받아 가요');
await tick(2.4);

console.log('프레임', n, '길이', (n / FPS).toFixed(1), '초', '실측', nums);
await b.close();
srv.close();
