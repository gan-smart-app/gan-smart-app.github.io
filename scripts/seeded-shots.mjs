// Screenshots of data screens with synthetic solves, inside a throwaway
// browser context (its IndexedDB is discarded at the end). Never run against
// a real profile.
// usage: node scripts/seeded-shots.mjs <outDir> <baseUrl>
import { chromium } from 'playwright-core';
import { join } from 'node:path';

const [out, base] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const [kind, vp] of Object.entries({ desktop: { width: 1440, height: 1042 }, mobile: { width: 390, height: 844 } })) {
  const ctx = await browser.newContext({ viewport: vp, hasTouch: kind === 'mobile' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto(base + '#/practice', { waitUntil: 'networkidle' });
  const firstId = await page.evaluate(async () => {
    const { openStore } = await import('/src/core/store.mjs');
    const cube = await import('/src/core/cube.mjs');
    const store = await openStore();
    const session = { id: 'test-session', name: 'تمرین عصر (آزمایشی)', createdAt: new Date(Date.now() - 3600e3).toISOString(), kind: 'mixed' };
    await store.put('sessions', session);
    const scr = ["R U R' F2 D L' B2 U2 F R2", "F2 U' L2 D B R' U F2 L D2", "U2 R2 F' D L2 B' U R D2 F", "L' U2 F R2 D' B2 U L F2 R", "D R' F2 U L B2 D' R U2 F'", "B U' R2 F D' L2 U R' F2 D", "R2 D' F U2 L' B R D2 U' F2"];
    const times = [41230, 38900, 45120, 32450, null, 39870, 36110];
    let id0 = null;
    for (let i = 0; i < scr.length; i++) {
      const moves = cube.invertAlg(scr[i]);
      const rawMs = times[i] ?? 52000;
      const s = {
        id: 'test-' + i, sessionId: session.id, createdAt: new Date(Date.now() - (scr.length - i) * 300e3).toISOString(),
        rawMs, penalty: i === 4 ? 'DNF' : i === 2 ? '+2' : null, valid: true, source: 'device', kind: 'full', scramble: scr[i],
        startFacelets: cube.toFacelets(cube.stateFromAlg(scr[i])), moves: moves.map((m, k) => ({ m, t: Math.round((rawMs / moves.length) * k), b: k })), movesComplete: true, timing: 'host-receipt', note: i === 3 ? 'کراس خوب بود' : '',
      };
      await store.put('solves', s);
      id0 ??= s.id;
    }
    await store.setLocal('currentSession', session.id);
    return 'test-3';
  });
  for (const [name, hash] of [['stats', 'stats'], ['replay', 'solve/' + firstId], ['practice-seeded', 'practice']]) {
    await page.goto(base + '#/' + hash, { waitUntil: 'networkidle' });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(out, `${kind}-${name}.png`), fullPage: true, animations: 'disabled', timeout: 60000 }).catch((e) => console.log('FAILED', kind, name, e.message.split('\n')[0]));
    console.log('shot', kind, name);
  }
  await ctx.close();
}
await browser.close();
