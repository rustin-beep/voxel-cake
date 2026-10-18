// Headless verification + perf sampling for the voxel diorama.
//
//   node scripts/measure.mjs            (needs `npm run build` first)
//
// Serves dist/ on a throwaway port, opens it in the Playwright Chromium that
// ships with this machine, then records draw calls, triangles, frame pacing,
// screenshots at desktop/phone sizes, and exercises both fallback paths.

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


const ROOT = path.resolve('dist');
const OUT = path.resolve('shots');
fs.mkdirSync(OUT, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
};

function serve(root) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent((req.url || '/').split('?')[0]);
      if (p === '/') p = '/index.html';
      const file = path.normalize(path.join(root, p));
      if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      res.writeHead(200, {
        'content-type': MIME[path.extname(file)] || 'application/octet-stream',
        'cache-control': 'no-store',
      });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}/` }));
  });
}

const sampleFps = `new Promise((res) => {
  let n = 0;
  const t0 = performance.now();
  const step = (t) => {
    n++;
    if (t - t0 < 2000) requestAnimationFrame(step);
    else res(Math.round((n * 1000) / (t - t0) * 10) / 10);
  };
  requestAnimationFrame(step);
})`;

const run = async () => {
  if (!fs.existsSync(ROOT)) throw new Error('dist/ missing — run `npm run build` first');
  const { server, url } = await serve(ROOT);
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });

  const report = { url, chrome: CHROME, errors: [], desktop: null, phone: null, fallback: null, lost: null };

  // ------------------------------------------------------------ desktop
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  page.on('console', (m) => {
    if (m.type() === 'error') report.errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => report.errors.push(`pageerror: ${String(e)}`));

  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__cake && (window.__cake.ready || window.__cake.fallback), null, {
    timeout: 20000,
  });
  await page.waitForTimeout(1600);
  await page.screenshot({ path: path.join(OUT, 'letters-desktop.png') });

  // walk the three letters by clicking, so the flow itself is verified
  const lettersFlow = [];
  const currentStep = () =>
    page.evaluate(() => document.querySelector('.letter.is-active')?.getAttribute('data-step') ?? null);
  lettersFlow.push(await currentStep());
  await page.click('.letter.is-active .btn');
  await page.waitForTimeout(560);
  lettersFlow.push(await currentStep());
  await page.click('.letter.is-active .btn');
  await page.waitForTimeout(560);
  lettersFlow.push(await currentStep());
  await page.click('.letter.is-active .btn'); // "去看蛋糕"
  await page.waitForTimeout(1500);
  lettersFlow.push(await page.evaluate(() => ({
    introDone: window.__intro?.done ?? null,
    lettersHidden: document.getElementById('letters')?.hidden ?? null,
  })));
  report.letters = lettersFlow;

  const ready = await page.evaluate(() => window.__cake.ready);
  report.desktop = {
    ready,
    stats: await page.evaluate(() => window.__cake.stats()),
    rafFps: await page.evaluate(sampleFps),
  };
  await page.screenshot({ path: path.join(OUT, 'desktop.png') });

  // -------------------------------------------------------------- phone
  const phone = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  phone.on('pageerror', (e) => report.errors.push(`phone pageerror: ${String(e)}`));
  await phone.goto(url, { waitUntil: 'load' });
  await phone.waitForFunction(() => window.__cake && (window.__cake.ready || window.__cake.fallback), null, {
    timeout: 20000,
  });
  await phone.waitForTimeout(1600);
  await phone.screenshot({ path: path.join(OUT, 'letters-phone.png') });
  await phone.evaluate(() => window.__skipIntro?.());
  await phone.waitForTimeout(1400);
  report.phone = { stats: await phone.evaluate(() => window.__cake.stats()) };
  await phone.screenshot({ path: path.join(OUT, 'phone.png') });

  // ------------------------------------------------------------ fallback
  const noGl = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1 });
  await noGl.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (String(type).startsWith('webgl')) return null;
      return orig.call(this, type, ...args);
    };
  });
  await noGl.goto(url, { waitUntil: 'load' });
  await noGl.waitForTimeout(1200);
  await noGl.evaluate(() => window.__skipIntro?.());
  await noGl.waitForTimeout(900);
  report.fallback = await noGl.evaluate(() => ({
    reason: window.__cake?.fallback || null,
    fallbackVisible: !document.getElementById('fallback').hidden,
    svgInline: !!document.querySelector('#fallback .card svg'),
    hasBlessing: !!document.querySelector('.blessing')?.textContent.trim(),
  }));
  await noGl.screenshot({ path: path.join(OUT, 'fallback.png') });

  // --------------------------------------------------------- context lost
  const lost = await page.evaluate(() => {
    const c = document.getElementById('scene');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return 'no-context';
    const ext = gl.getExtension('WEBGL_lose_context');
    if (!ext) return 'no-extension';
    ext.loseContext();
    return 'lost';
  });
  await page.waitForTimeout(800);
  report.lost = {
    trigger: lost,
    reason: await page.evaluate(() => window.__cake?.fallback || null),
    fallbackVisible: await page.evaluate(() => !document.getElementById('fallback').hidden),
  };
  await page.screenshot({ path: path.join(OUT, 'context-lost.png') });

  await browser.close();
  server.close();

  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (report.errors.length) process.exitCode = 2;
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
