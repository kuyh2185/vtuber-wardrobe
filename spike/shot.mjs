// usage: PLAYWRIGHT=<path> node spike/shot.mjs <out dir> "<query>" ...   (query 예: m=AvatarSample_D.vrm&hide=CLOTH)
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT);
const [out, ...queries] = process.argv.slice(2);
await mkdir(out, { recursive: true });
const root = process.cwd();
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png', '.glb': 'model/gltf-binary' };
const srv = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const b = await readFile(join(root, p));
    res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' });
    res.end(b);
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const port = srv.address().port;
const page = process.env.PAGE || 'spike/view.html';

const b = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
const pg = await b.newPage({ viewport: { width: 620, height: 980 } });
pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
pg.on('console', m => m.type() === 'error' && console.log('CONSOLE', m.text()));
let i = 0;
for (const q of queries) {
  await pg.goto(`http://localhost:${port}/${page}?${q}`);
  await pg.waitForFunction(() => window.__ready, null, { timeout: 90000 });
  const info = await pg.evaluate(() => window.__info);
  const f = join(out, `${String(i++).padStart(2, '0')}.png`);
  await pg.screenshot({ path: f });
  console.log(f, q);
  await writeFile(f.replace('.png', '.json'), JSON.stringify(info, null, 1));
  const out64 = await pg.evaluate(() => window.__out || null);
  if (out64) await writeFile(f.replace('.png', '.vrm'), Buffer.from(out64, 'base64'));
}
await b.close();
srv.close();
