// node paintover/ortho.mjs out/v4/views [src] : 앞·옆·뒤 직교 사진과 그 자세의 메시(mesh.json)를 뽑는다.
import { createRequire } from 'module';
import { spawn } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const out = process.argv[2] || 'out/v4/views', src = process.argv[3] || '../out/blender-hanbok.vrm';
export const FRAME = { ortho: 1.32, cz: 1.20, w: 1152, h: 1536 };
mkdirSync(out, { recursive: true });
const srv = spawn('python', ['-m', 'http.server', '8124', '--bind', '127.0.0.1'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
for (const [name, yaw] of [['front', 0], ['side', 90], ['back', 180]]) {
  const p = await b.newPage({ viewport: { width: FRAME.w, height: FRAME.h } });
  p.on('pageerror', e => console.log('오류', e.message));
  await p.goto(`http://127.0.0.1:8124/atelier/view.html?src=${src}&yaw=${yaw}&ortho=${FRAME.ortho}&cz=${FRAME.cz}`);
  await p.waitForFunction('window.__ready', null, { timeout: 90000 });
  await p.screenshot({ path: `${out}/${name}.png` });
  if (name === 'front') writeFileSync(`${out}/mesh.json`, JSON.stringify({ frame: FRAME, meshes: await p.evaluate('window.__posed()') }));
  await p.close();
}
await b.close();
srv.kill();
