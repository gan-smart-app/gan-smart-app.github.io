// The built frontend must not contain the Anthropic SDK, its endpoint or a key.
import { readdirSync, readFileSync } from 'node:fs';
const files = readdirSync('dist/assets').filter((f) => f.endsWith('.js'));
const bad = files.filter((f) => /api\.anthropic\.com|sk-ant-|x-api-key|@anthropic-ai/.test(readFileSync('dist/assets/' + f, 'utf8')));
if (bad.length) { console.error('Forbidden AI material in bundle:', bad); process.exit(1); }
console.log('Bundle clean: ' + files.length + ' JS files, no Anthropic SDK/endpoint/key');
