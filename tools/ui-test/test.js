// UI test harness: drives the modded Stremio UI (http://127.0.0.1:7011) in headless Brave and saves screenshots to ./shots.
// Usage: node test.js [all|install|board|discover|details|interact|flix]  (or: bin/stremio-plus test <step>)
const puppeteer = require('puppeteer-core');
const path = require('path');

const OUT = path.join(__dirname, 'shots');
require('fs').mkdirSync(OUT, { recursive: true });
const UI = 'http://127.0.0.1:7011/';
const MANIFEST = 'http://127.0.0.1:7010/manifest.json';
const step = process.argv[2] || 'all';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    headless: 'new',
    userDataDir: path.join(__dirname, '.profile'),
    args: ['--window-size=1600,1000', '--autoplay-policy=no-user-gesture-required', '--no-first-run'],
    defaultViewport: { width: 1600, height: 1000, deviceScaleFactor: 1 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  const shot = async (name) => { await page.screenshot({ path: path.join(OUT, name + '.png') }); console.log('shot', name); };
  const clickText = async (text) => page.evaluate((text) => {
    const el = [...document.querySelectorAll('button, [role=button], a, div')].reverse()
      .find((e) => e.textContent.trim() === text && e.offsetParent !== null);
    if (el) { el.click(); return true; }
    return false;
  }, text);

  await page.goto(UI, { waitUntil: 'networkidle2' });
  await sleep(2500);

  if (step === 'all' || step === 'install') {
    // Skip intro / login if shown
    await page.goto(UI + '#/addons?addon=' + encodeURIComponent(MANIFEST), { waitUntil: 'networkidle2' });
    await sleep(3000);
    await shot('01-install-modal');
    console.log('clicked install:', await clickText('Install'));
    await sleep(2500);
  }

  if (step === 'all' || step === 'board') {
    await page.goto(UI + '#/', { waitUntil: 'networkidle2' });
    await sleep(9000);
    await shot('02-board');
    await sleep(5000);
    await shot('03-board-trailer');
  }

  if (step === 'all' || step === 'discover') {
    await page.goto(UI + '#/discover/' + encodeURIComponent(MANIFEST) + '/movie/rt-movies-certified', { waitUntil: 'networkidle2' });
    await sleep(7000);
    await shot('04-discover');
    // scroll the preview panel down to see the trailer/photos/cast
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('[class*="body"]')].find((e) => e.scrollHeight > e.clientHeight + 50);
      if (b) b.scrollTop = 99999;
    });
    await sleep(1500);
    await shot('05-discover-scrolled');
  }

  if (step === 'flix') {
    await page.goto(UI + '#/', { waitUntil: 'networkidle2' });
    await sleep(7000);
    await shot('10-home');
    // scroll down to rows
    await page.evaluate(() => { const c = document.querySelector('[class*="board-content"]'); if (c) c.scrollTop = 520; });
    await sleep(2500);
    await shot('11-home-rows');
    // hover a card in the first flix row
    const cards = await page.$$('section[data-board-row] a[href]');
    console.log('flix cards:', cards.length);
    if (cards[2]) {
      await cards[2].hover();
      await sleep(3500);
      await shot('12-hover-preview');
    }
    await page.mouse.move(5, 5);
    await page.goto(UI + '#/discover/' + encodeURIComponent(MANIFEST) + '/movie/rt-movies-certified', { waitUntil: 'networkidle2' });
    await sleep(6000);
    const items = await page.$$('[class*="meta-item-container"]');
    if (items[3]) { await items[3].hover(); await sleep(900); }
    await shot('13-discover-clean');
    await page.goto(UI + '#/settings/mods', { waitUntil: 'networkidle2' });
    await sleep(2500);
    await shot('14-settings-mods');
  }

  if (step === 'interact') {
    await page.goto(UI + '#/discover/' + encodeURIComponent(MANIFEST) + '/movie/rt-movies-certified', { waitUntil: 'networkidle2' });
    await sleep(6000);
    const clicked = await page.evaluate(() => {
      const b = document.querySelector('button[aria-label="Play trailer"]');
      if (b) { b.scrollIntoView({ block: 'center' }); b.click(); return true; }
      return false;
    });
    console.log('trailer button clicked:', clicked);
    await sleep(5000);
    const vid = await page.evaluate(() => {
      const v = document.querySelector('video[controls]');
      return v ? { t: v.currentTime, paused: v.paused, ready: v.readyState, err: v.error && v.error.code } : null;
    });
    console.log('trailer video state:', JSON.stringify(vid));
    await shot('07-trailer-playing');
    const opened = await page.evaluate(() => {
      const p = document.querySelector('button[aria-label*="Blue Film"], button[aria-label="Photo"]');
      const any = p || [...document.querySelectorAll('button')].find((b) => b.querySelector('img') && b.closest('[class*="photos"]'));
      if (any) { any.click(); return true; }
      return false;
    });
    console.log('photo opened:', opened);
    await sleep(1500);
    await shot('08-lightbox');
    await page.keyboard.press('Escape');
    // Cinemeta (non-RT catalog) title: does the slug-guess lookup work?
    await page.goto(UI + '#/discover/' + encodeURIComponent('https://v3-cinemeta.strem.io/manifest.json') + '/series/top', { waitUntil: 'networkidle2' });
    await sleep(8000);
    await shot('09-cinemeta-series');
  }

  if (step === 'all' || step === 'details') {
    await page.goto(UI + '#/detail/movie/tt45368240/tt45368240', { waitUntil: 'networkidle2' });
    await sleep(8000);
    await shot('06-details');
  }

  console.log('errors:', errors.slice(0, 15).join('\n'));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
