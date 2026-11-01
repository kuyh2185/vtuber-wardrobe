// 막대 끝값 전수: 모든 옷 × 체형 3 × 손잡이 0/1. 몸을 뚫은 점이 하나라도 있으면 실패.
// usage: PLAYWRIGHT=<경로> node atelier/ends.mjs
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT);
const root = process.cwd(), types = { '.html': 'text/html', '.js': 'text/javascript' };
const srv = createServer(async (req, res) => { try { const f = decodeURIComponent(new URL(req.url, 'http://x').pathname), d = await readFile(join(root, f)); res.writeHead(200, { 'content-type': types[extname(f)] || 'application/octet-stream' }); res.end(d); } catch { res.writeHead(404); res.end(); } }).listen(0);
const b = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
const pg = await b.newPage({ viewport: { width: 200, height: 200 } });
const errs = []; pg.on('pageerror', e => errs.push(e.message.slice(0, 200)));
await pg.goto(`http://localhost:${srv.address().port}/atelier/look.html?look=frill&m=D`);
await pg.waitForFunction(() => window.__ready, null, { timeout: 90000 });
const res = await pg.evaluate(async () => {
  const { loadAvatar } = await import('./body.js');
  const { wear, hideOld, poke } = await import('./wear.js');
  const { LOOKS } = await import('./looks.js');
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const { VRMLoaderPlugin, VRMUtils } = await import('@pixiv/three-vrm');
  const { SIZE } = await import('./tex.js');
  const loader = new GLTFLoader(); loader.register(p => new VRMLoaderPlugin(p));
  const c = document.createElement('canvas'); c.width = c.height = SIZE;
  const out = []; let total = 0;
  for (const m of ['D', 'E', 'G']) {
    const av = await loadAvatar(loader, `../samples/AvatarSample_${m}.vrm`);
    hideOld(av); VRMUtils.rotateVRM0(av.vrm); av.vrm.scene.updateMatrixWorld(true);
    let w = null;
    for (const [id, L] of Object.entries(LOOKS)) {
      const base = structuredClone(L.params), sets = [base];
      for (const k of L.controls) for (const v of k.toggle ? [0, 1] : [0, 1]) sets.push({ ...structuredClone(base), [k.key]: v });
      for (const p of sets) {
        w = wear(av, L.build, p, c, w); total++;
        const n = poke(av, w.O).n;
        if (n) out.push(`${m} ${id} ${JSON.stringify(Object.fromEntries(Object.entries(p).filter(([k, v]) => k !== 'pal' && v !== base[k])))} 뚫림 ${n}`);
      }
    }
  }
  return { total, out };
});
console.log('조합', res.total, '뚫림 있는 조합', res.out.length); console.log(res.out.slice(0, 30).join('\n')); console.log('오류', errs.length, errs.slice(0, 3));
await b.close(); srv.close();
process.exit(res.out.length || errs.length ? 1 : 0);
