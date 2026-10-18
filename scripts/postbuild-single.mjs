import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve('dist-single');
const src = path.join(dir, 'index.html');
const dest = path.join(dir, 'voxel-candle-cake.html');

if (!fs.existsSync(src)) {
  console.error('no dist-single/index.html — run `vite build --mode single` first');
  process.exit(1);
}

fs.rmSync(dest, { force: true });
fs.renameSync(src, dest);

const files = fs.readdirSync(dir);
const size = (fs.statSync(dest).size / 1024).toFixed(1);
console.log(`\n  single file → dist-single/voxel-candle-cake.html  (${size} KB)`);
console.log(`  files in dist-single: ${files.join(', ')}`);
if (files.length !== 1) {
  console.warn('  ! expected exactly one file — something was not inlined');
}
