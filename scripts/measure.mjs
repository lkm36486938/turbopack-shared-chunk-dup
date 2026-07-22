// Objective measurement of the emitted client chunks. No verdicts, no interpretation —
// just counts. The reader draws their own conclusions.
//
// It answers one factual question: for each module of the shared library
// (lib/shared-lib/p00..p39), how many separate chunk files in .next/static/chunks
// contain that module's unique marker string (SHARED_LIB_PART_NN)?
//
// Usage: node scripts/measure.mjs
import fs from 'node:fs';
import path from 'node:path';

const PART_COUNT = 40;
const chunkDir = path.join(process.cwd(), '.next', 'static', 'chunks');

if (!fs.existsSync(chunkDir)) {
  console.error(`No chunk dir at ${chunkDir}. Run a production build first (next build).`);
  process.exit(1);
}

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

const files = walk(chunkDir).map((f) => ({
  rel: path.relative(chunkDir, f),
  data: fs.readFileSync(f, 'utf8'),
  size: fs.statSync(f).size,
}));

// For each shared-lib module, list the chunk files that contain it.
const partIds = Array.from({ length: PART_COUNT }, (_, i) => String(i).padStart(2, '0'));
const perPart = partIds.map((id) => {
  const marker = `SHARED_LIB_PART_${id}`;
  return { id, chunks: files.filter((x) => x.data.includes(marker)).map((x) => x.rel) };
});

const copies = perPart.map((p) => p.chunks.length);
const dist = {};
for (const c of copies) dist[c] = (dist[c] ?? 0) + 1;
const sum = copies.reduce((a, b) => a + b, 0);
const avg = (sum / PART_COUNT).toFixed(2);

const carrying = files.filter((x) => x.data.includes('SHARED_LIB_PART'));
const carryingBytes = carrying.reduce((a, x) => a + x.size, 0);
const totalBytes = files.reduce((a, x) => a + x.size, 0);
const kb = (b) => (b / 1024).toFixed(1) + ' KB';

console.log('-'.repeat(74));
console.log(`chunk directory : ${path.relative(process.cwd(), chunkDir)}`);
console.log(`total .js chunk files : ${files.length}`);
console.log(`total chunk bytes     : ${(totalBytes / 1e6).toFixed(2)} MB (${totalBytes} bytes)`);
console.log('-'.repeat(74));
console.log(`shared library : ${PART_COUNT} modules (lib/shared-lib/p00..p${String(PART_COUNT - 1).padStart(2, '0')})`);
console.log(`chunk files that contain shared-lib code : ${carrying.length}`);
console.log(`combined size of those chunk files       : ${kb(carryingBytes)} (${carryingBytes} bytes)`);
console.log('');
console.log(`per-module copy count (chunk files each module's marker appears in):`);
for (const c of Object.keys(dist).map(Number).sort((a, b) => a - b)) {
  console.log(`    ${dist[c]} of ${PART_COUNT} module(s) appear in ${c} chunk file(s)`);
}
console.log(`    total marker instances : ${sum}`);
console.log(`    min / avg / max copies per module : ${Math.min(...copies)} / ${avg} / ${Math.max(...copies)}`);
console.log('-'.repeat(74));
console.log('chunk files containing shared-lib code (size):');
for (const x of carrying.sort((a, b) => b.size - a.size)) console.log(`    ${x.rel}  ${kb(x.size)}`);
console.log('-'.repeat(74));
