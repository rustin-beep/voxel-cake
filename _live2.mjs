import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

function findChrome() {
  const base = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
  const dirs = fs.readdirSync(base).filter((d) => d.startsWith('chromium-')).sort().reverse();
  for (const d of dirs) {
    for (const sub of ['chrome-win64/chrome.exe', 'chrome-win/chrome.exe', 'chrome-linux/chrome']) {
      const p = path.join(base, d, sub);
      if (fs.existsSync(p)) return p;
    }
  }
  return '';
}

const url = 'https://rustin-beep.github.io/voxel-cake/?v=' + Date.now();
const browser = await chromium.launch({ executablePath: findChrome(), args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto(url, { waitUntil: 'load', timeout: 45000 });
await page.waitForFunction(() => window.__cake?.ready === true, null, { timeout: 30000 });
await page.waitForTimeout(1200);

for (let i = 0; i < 3; i += 1) {
  await page.click('.letter.is-active .btn');
  await page.waitForTimeout(650);
}
await page.waitForTimeout(1400);

const before = await page.evaluate(() => ({
  ritual: window.__cake.ritual(),
  visibleTitles: [...document.querySelectorAll('h1')].filter((h) => !h.classList.contains('sr-only')).length,
}));

await page.click('#ritual');
await page.waitForTimeout(900);
const dark = await page.evaluate(() => ({
  isDark: document.body.classList.contains('is-dark'),
  state: window.__cake.ritual(),
  status: document.getElementById('status')?.textContent.trim(),
}));

await page.click('#ritual');
await page.waitForTimeout(2900);
const after = await page.evaluate(() => ({
  isDark: document.body.classList.contains('is-dark'),
  state: window.__cake.ritual(),
}));
await page.screenshot({ path: 'shots/live.png' });

console.log(JSON.stringify({ url, before, dark, after, errors }, null, 2));
await browser.close();
