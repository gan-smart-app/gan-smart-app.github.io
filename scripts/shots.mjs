// Screenshots of app routes (and optionally the design reference HTMLs) with
// headless system Chrome, for side-by-side visual comparison.
// usage: node scripts/shots.mjs <outDir> <baseUrl> [routes...] [--ref <designDir>]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [out, base, ...rest] = process.argv.slice(2);
const refIdx = rest.indexOf('--ref');
const refDir = refIdx >= 0 ? rest[refIdx + 1] : null;
const routes = (refIdx >= 0 ? rest.slice(0, refIdx) : rest);
const sizes = { desktop: { width: 1440, height: 1042 }, mobile: { width: 390, height: 844 } };
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const [kind, vp] of Object.entries(sizes)) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, hasTouch: kind === 'mobile' });
  for (const r of routes) {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log(`[${kind}] pageerror`, e.message));
    const [name, hash] = r.includes('=') ? r.split('=') : [r.replace(/\W+/g, '_'), r];
    await page.goto(base + '#/' + hash, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    try {
      await page.screenshot({ path: join(out, `${kind}-${name}.png`), fullPage: true, animations: 'disabled', timeout: 60000 });
      console.log('shot', kind, name);
    } catch (e) { console.log('FAILED', kind, name, e.message.split('\n')[0]); }
    await page.close();
  }
  await ctx.close();
}
if (refDir) {
  for (const kind of ['desktop', 'mobile']) {
    const ctx = await browser.newContext({ viewport: sizes[kind], deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const { readdirSync } = await import('node:fs');
    for (const f of readdirSync(join(refDir, kind)).filter((x) => x.endsWith('.html'))) {
      await page.goto('file://' + join(refDir, kind, f), { waitUntil: 'networkidle' }).catch(() => {});
      await page.waitForTimeout(1500);
      await page.screenshot({ path: join(out, `ref-${kind}-${f.replace('.html', '')}.png`), fullPage: true, animations: 'disabled', timeout: 60000 }).catch((e) => console.log('FAILED ref', f, e.message.split('\n')[0]));
      console.log('ref', kind, f);
    }
    await ctx.close();
  }
}
await browser.close();
