// 작업실을 실제로 눌러 보는 점검: 단계·옷·체형·막대·보정 전후·투표·내보내기, 오류 0이어야 통과.
// usage: PLAYWRIGHT=<경로> node atelier/drive.mjs <사진 폴더>
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT);
const out = process.argv[2] || 'out/drive';
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
const pg = await b.newPage({ viewport: { width: 1280, height: 760 }, acceptDownloads: true });
const errs = [];
pg.on('pageerror', e => errs.push(e.message));
pg.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push(m.text()); });
await pg.goto(`http://localhost:${srv.address().port}/atelier/index.html`);
await pg.waitForFunction(() => window.__ready, null, { timeout: 120000 });
// 첫 화면은 캐릭터 하나만 받고, 보정 비교로 가면 그때 다른 체형을 받는다
if ((await pg.evaluate(() => Object.keys(__S.avs).join())) !== 'D') errs.push('첫 화면에 캐릭터를 하나만 받아야 함');
await pg.evaluate(() => __go(2));
if ((await pg.evaluate(() => [__S.step, Object.keys(__S.avs).sort().join()].join())) !== '2,D,G') errs.push('보정 단계에서 다른 체형을 못 받음');
await pg.evaluate(() => __go(0));
await pg.locator('button.card', { hasText: '작은 체형' }).first().click();
await pg.waitForFunction(() => __S.avs.E && __S.av === __S.avs.E, null, { timeout: 60000 });
await pg.locator('button.card', { hasText: '보통 체형' }).first().click();
await pg.waitForTimeout(200);
// 수정 금지 판정: 샘플은 허용, ND·VRoid Hub 금지는 막힘
const ban = await pg.evaluate(async () => {
  const { modifyBanned: f } = await import('./export.js');
  return [f(__S.av.vrm.meta), f({ licenseName: 'CC_BY_ND' }), f({ licenseName: 'CC_BY_NC_ND' }), f({ licenseName: 'CC_BY' }), f({ licenseName: 'Other', otherLicenseUrl: 'https://hub.vroid.com/license?modification=disallow&x=1' })].join();
});
if (ban !== 'false,true,true,false,true') errs.push('수정 금지 판정 틀림 ' + ban);
const shot = async n => { await pg.waitForTimeout(500); await pg.screenshot({ path: join(out, n + '.png') }); };
const card = t => pg.locator('button.card', { hasText: t }).first();
const nextStep = n => pg.evaluate(i => window.__go(i), n);
const info = () => pg.evaluate(() => ({ verts: __S.w.verts, look: __S.look, step: __S.step }));

await shot('1_start');
const facts = [];
for (const look of ['고딕 세일러', '다크 치파오', '다크 스트리트 후드']) {
  await card(look).click();
  for (const body of ['작은 체형', '큰 체형', '보통 체형']) {
    await card(body).click();
    await pg.waitForTimeout(300);
    await shot(`look_${look}_${body}`);
    await nextStep(2);
    await pg.waitForTimeout(200);
    const nums = await pg.locator('#nums div').allTextContents();
    facts.push(`${look} ${body}: ${nums.join(' / ')}`);
    await nextStep(0);
  }
}
// 내 파일 불러오기: 샘플 파일을 손님 파일처럼 넣어 본다
await pg.locator('#upF').setInputFiles('samples/VRM1_Constraint_Twist_Sample.vrm');
await pg.waitForFunction(() => /지금은|아직/.test(document.getElementById('upT').textContent), null, { timeout: 60000 });
facts.push('VRM 1.0 넣었을 때: ' + await pg.locator('#upT').textContent());
await pg.locator('#upF').setInputFiles('samples/AvatarSample_D.vrm');
await pg.locator('button.card', { hasText: '내 캐릭터' }).waitFor({ timeout: 60000 });
await pg.waitForTimeout(300);
await shot('1_mine');
facts.push('내 파일 뼈대: ' + await pg.evaluate(() => __S.w.verts));
await card('보통 체형').click();
await nextStep(1);
await pg.locator('input[type=range]').first().fill('.2');
await pg.locator('input[type=range]').nth(3).fill('.8');
await pg.locator('input[type=text]').fill('MY CHANNEL');
await pg.locator('.sw button').nth(1).click();
await shot('2_edit');
await nextStep(2);
await card('보정 전').click();
await shot('3_raw');
await card('보정 후').click();
await shot('3_fit');
await nextStep(3);
await pg.locator('button.go', { hasText: '투표 시작' }).click();
await pg.waitForTimeout(6500);
await shot('4_vote');
await nextStep(4);
for (const m of ['춤', '돌기', '인사']) { await card(m).click(); await pg.waitForTimeout(1200); await shot('5_' + m); }
await pg.locator('button.go', { hasText: '실루엣' }).click();
await shot('5_tease');
await pg.locator('button.go', { hasText: '옷 공개' }).click();
const [dl] = await Promise.all([pg.waitForEvent('download', { timeout: 60000 }), pg.locator('button.go', { hasText: 'VRM 파일' }).click()]);
await dl.saveAs(join(out, 'export.vrm'));
const [dl2] = await Promise.all([pg.waitForEvent('download', { timeout: 60000 }), pg.locator('button.go', { hasText: '디자인 시트' }).click()]);
await dl2.saveAs(join(out, 'sheet.png'));
await pg.waitForTimeout(400);
await shot('5_after');
await writeFile(join(out, 'facts.txt'), facts.join('\n'), 'utf8');
console.log(facts.join('\n'));
console.log('오류', errs.length, errs.slice(0, 5));
await b.close();
srv.close();
process.exit(errs.length ? 1 : 0);
