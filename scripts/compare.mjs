// Side-by-side image of design reference (left) and implementation (right).
// usage: node scripts/compare.mjs <shotsDir> <ref.png> <app.png> <out.png> [maxHeight]
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const [dir, ref, app, out, maxH = '1400'] = process.argv.slice(2);
const b64 = (f) => 'data:image/png;base64,' + readFileSync(join(dir, f)).toString('base64');
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage({ viewport: { width: 1600, height: Number(maxH) } });
await page.setContent(`<body style="margin:0;background:#333;display:flex;gap:8px;align-items:flex-start;font:12px sans-serif;color:#fff">
<div style="flex:1"><div>DESIGN ${ref}</div><img src="${b64(ref)}" style="width:100%"></div>
<div style="flex:1"><div>APP ${app}</div><img src="${b64(app)}" style="width:100%"></div></body>`);
await page.waitForTimeout(300);
await page.screenshot({ path: join(dir, out), clip: { x: 0, y: 0, width: 1600, height: Number(maxH) } });
await browser.close();
