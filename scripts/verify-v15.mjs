// Confirms the GAN v15 connection files are byte-identical to the handoff manifest.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('vendor/gan-v15/SOURCE_MANIFEST.json', 'utf8')).files;
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
let bad = 0;
for (const [ref, { sha256 }] of Object.entries(manifest)) {
  const rel = ref.replace('source-v15/', '');
  const targets = ['vendor/gan-v15/' + rel];
  if (rel.startsWith('dist/') && !/index\.html|app\.js|style\.css/.test(rel)) targets.push('public/gan-v15/' + rel.slice(5));
  for (const t of targets) {
    const ok = sha(t) === sha256;
    if (!ok) bad++;
    console.log((ok ? 'OK   ' : 'DIFF ') + t);
  }
}
if (bad) { console.error(bad + ' file(s) differ from the v15 manifest'); process.exit(1); }
console.log('All v15 files match SOURCE_MANIFEST.json');
