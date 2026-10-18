// Verifies that the standalone single-file build still boots.
//   node scripts/check-single.mjs

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

function findChrome() {
  if (process.env.PW_CHROME) return process.env.PW_CHROME;
  const base = path.join(process.env.LOCALAPPDATA || process.env.HOME || '', 'ms-playwright');
  if (!fs.existsSync(base)) return '';
  const dirs = fs
    .readdirSync(base)
    .filter((d) => d.startsWith('chromium-'))
    .sort()
    .reverse();
  for (const d of dirs) {
    for (const sub of [
      'chrome-win64/chrome.exe',
      'chrome-win/chrome.exe',
      'chrome-linux/chrome',
      'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
    ]) {
      const p = path.join(base, d, sub);
      if (fs.existsSync(p)) return p;
    }
  }
  return '';
}

const CHROME = findChrome();
if (!CHROME) {
  console.error(
    '\n  No Chromium found for Playwright.\n' +
      '  Run once:  pnpm exec playwright install chromium\n' +
      '  or point PW_CHROME at a Chrome/Chromium executable.\n',
  );
  process.exit(1);
}


const file = path.resolve('dist-single/voxel-candle-cake.html');
if (!fs.existsSync(file)) throw new Error('build the single file first: npm run build:single');

const root = path.dirname(file);
const server = http.createServer((req, res) => {
  const name = req.url === '/' ? path.basename(file) : decodeURIComponent(req.url.split('?')[0]);
  const target = path.join(root, name);
  if (!fs.existsSync(target)) {
    res.writeHead(404);
    res.end('nope');
    return;
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  fs.createReadStream(target).pipe(res);
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch({ executablePath: CHROME, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__cake && (window.__cake.ready || window.__cake.fallback), null, {
  timeout: 20000,
});
await page.waitForTimeout(1200);
await page.evaluate(() => window.__skipIntro?.());
await page.waitForTimeout(1300);
const stats = await page.evaluate(() => window.__cake.stats());
await page.screenshot({ path: 'shots/single-file.png' });

const external = await page.evaluate(() =>
  [...document.querySelectorAll('script[src], link[href]')].map((el) => el.getAttribute('src') || el.getAttribute('href')),
);

console.log(
  JSON.stringify(
    { url, sizeKB: +(fs.statSync(file).size / 1024).toFixed(1), ready: await page.evaluate(() => window.__cake.ready), stats, externalRequests: external, errors },
    null,
    2,
  ),
);

await browser.close();
server.close();
