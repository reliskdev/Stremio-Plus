// UI test harness: drives the modded Stremio UI (http://127.0.0.1:7011) in headless Brave and saves screenshots to ./shots.
// Usage: node test.js [all|install|board|discover|details|interact|flix|episode|player|tooltip|episodes|mods|motion]  (or: bin/stremio-plus test <step>)
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
    // scroll the poster grid a little to check the fade under the filter row
    await page.evaluate(() => {
      const g = [...document.querySelectorAll('div')].find((e) => getComputedStyle(e).display === 'grid' && e.scrollHeight > e.clientHeight + 50);
      if (g) g.scrollTop = 220;
    });
    await sleep(800);
    await shot('04b-discover-grid-scrolled');
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

  if (step === 'all' || step === 'episode') {
    // Episode hero: IMDb rating + RT Tomatometer (Severance S2E10), IMDb only (Dexter S1E3)
    await page.goto(UI + '#/detail/series/tt11280740/' + encodeURIComponent('tt11280740:2:10'), { waitUntil: 'networkidle2' });
    await sleep(8000);
    await shot('12-episode-rt');
    await page.goto(UI + '#/detail/series/tt0773262/' + encodeURIComponent('tt0773262:1:3'), { waitUntil: 'networkidle2' });
    await sleep(8000);
    await shot('13-episode-imdb');
  }

  if (step === 'all' || step === 'player') {
    // Player header scrim over a bright frame: open the player for an episode, paint the frame light grey, show the overlay
    const stream = Buffer.from(require('zlib').deflateSync(JSON.stringify({ url: 'http://127.0.0.1:7010/none.mp4' }))).toString('base64');
    await page.goto(UI + '#/player/' + encodeURIComponent(stream) + '/' + encodeURIComponent('https://v3-cinemeta.strem.io/manifest.json') + '/' + encodeURIComponent('https://v3-cinemeta.strem.io/manifest.json') + '/series/tt2861424/' + encodeURIComponent('tt2861424:7:7'), { waitUntil: 'networkidle2' });
    await sleep(6000);
    await page.addStyleTag({ content: '[class*="player-container"]{background:#d6d6d6!important} [class*="background-layer"],[class*="error-layer"],[class*="buffering-layer"],video{display:none!important}' });
    await page.mouse.move(800, 400); await sleep(150); await page.mouse.move(820, 420); await sleep(600);
    await shot('22-player-header');
  }

  if (step === 'all' || step === 'tooltip') {
    // Hover tooltip on the Details action buttons (library + like), in the default (monochrome) scheme
    await page.goto(UI + '#/detail/series/tt11280740/' + encodeURIComponent('tt11280740:2:10'), { waitUntil: 'networkidle2' });
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('mods:settings') || '{}'); delete s.accent;
      localStorage.setItem('mods:settings', JSON.stringify(s));
    });
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(6000);
    await page.mouse.move(202, 926);
    await sleep(150);
    await shot('14-tooltip-early');
    await sleep(700);
    await shot('15-tooltip');
    console.log('tooltip:', await page.evaluate(() => {
      const t = [...document.querySelectorAll('[class*=tooltip-container]')].find((e) => e.className.includes('active'));
      return t ? getComputedStyle(t).backgroundColor + ' | ' + getComputedStyle(t).backdropFilter : 'none active';
    }));
  }

  if (step === 'all' || step === 'episodes') {
    // Episode list: IMDb ratings per row, no search, season dropdown
    await page.goto(UI + '#/detail/series/tt0773262', { waitUntil: 'networkidle2' });
    await page.evaluate(() => { // the default accent (monochrome) unless the profile saved another
      const s = JSON.parse(localStorage.getItem('mods:settings') || '{}'); delete s.accent;
      localStorage.setItem('mods:settings', JSON.stringify(s));
    });
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(8000);
    await shot('16-episode-list');
    const radius = () => page.evaluate(() => getComputedStyle(document.querySelector('[class*=seasons-bar] [class*=multiselect-menu]')).borderRadius);
    console.log('closed radius:', await radius());
    // freeze the open/close animations halfway to look at the motion
    const freeze = (t) => page.evaluate((t) => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = t; }), t);
    const resume = () => page.evaluate(() => document.getAnimations().forEach((a) => a.play()));
    await clickText('Season 1');
    await freeze(110);
    await shot('17a-season-dropdown-opening');
    await resume();
    await sleep(600);
    await shot('17-season-dropdown');
    console.log('sheet:', await page.evaluate(() => {
      const m = document.querySelector('[data-side]');
      const l = document.querySelector('[data-popup-side]');
      if (!m || !l) return 'not found';
      const ms = getComputedStyle(m), ls = getComputedStyle(l);
      return JSON.stringify({ side: m.dataset.side, anim: ms.animationName, dur: ms.animationDuration, menuRadius: ms.borderRadius,
        labelRadius: ls.borderRadius, labelBg: ls.backgroundColor, menuBg: ms.backgroundColor, gap: m.getBoundingClientRect().top - l.getBoundingClientRect().bottom });
    }));
    const state = () => page.evaluate(() => {
      const el = document.querySelector('[class*=seasons-bar] [class*=multiselect-menu]');
      return getComputedStyle(el).borderRadius + ' | ' + (el.className.includes('active') ? 'active' : '-') + ' | sheet:' + !!document.querySelector('[data-side]');
    });
    // close by clicking the label again (click + reading inside the page, so the 160ms close timer can't race us)
    console.log('closing via label:', await page.evaluate(() => new Promise((done) => {
      const el = document.querySelector('[class*=seasons-bar] [class*=multiselect-menu]');
      const read = () => getComputedStyle(el).borderRadius + ' | ' + (el.className.includes('active') ? 'active' : '-') + ' | sheet:' + !!document.querySelector('[data-side]');
      document.elementFromPoint(1380, 128).dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      document.elementFromPoint(1380, 128).click();
      setTimeout(() => { const mid = read(); setTimeout(() => done('80ms: ' + mid + ' || 400ms: ' + read()), 320); }, 80);
    })));
    await resume();
    await sleep(500);
    // reopen and pick another season
    await page.mouse.click(1380, 128);
    await sleep(500);
    await clickText('Season 2');
    await freeze(80);
    console.log('closing via option:', await state());
    await resume();
    await sleep(500);
    console.log('after close:', await radius(), await page.evaluate(() => !!document.querySelector('[data-side]')));
  }

  if (step === 'all' || step === 'mods') {
    await page.goto(UI + '#/settings', { waitUntil: 'networkidle2' });
    await sleep(3000);
    await clickText('Mods');
    await sleep(1500);
    await shot('18-settings-mods');
  }

  if (step === 'all' || step === 'motion') {
    // plans/001-007: dropdown curves + reopen + reduced motion, instant neighbour tooltips, lightbox, score fade
    await page.goto(UI + '#/detail/series/tt0773262', { waitUntil: 'networkidle2' });
    await sleep(8000);
    const anim = () => page.evaluate(() => document.getAnimations().map((a) => `${a.animationName || a.transitionProperty}:${a.effect.getTiming().duration}ms:${a.effect.getTiming().easing}`).join(' , '));
    await page.mouse.click(1380, 128); await sleep(30);
    console.log('open:', await anim(), '| sheet timing:', await page.evaluate(() => { const m = document.querySelector('[data-side]'); return getComputedStyle(m).animationName + ' ' + getComputedStyle(m).animationTimingFunction; }));
    await sleep(400);
    // two real clicks on the label: the first closes, the second lands while the sheet is still folding away
    const t0 = Date.now();
    await page.mouse.click(1380, 128);
    await page.mouse.click(1380, 128);
    const gap = Date.now() - t0;
    await sleep(400);
    console.log(`reopen mid-close (2nd click ${gap}ms after the 1st):`, 'sheet open after 400ms: ' + await page.evaluate(() => !!document.querySelector('[data-side]')));
    // and a single click still closes
    await page.mouse.click(1380, 128); await sleep(400);
    console.log('single click closes:', await page.evaluate(() => !document.querySelector('[data-side]')));
    await page.mouse.click(1380, 128); await sleep(400);
    await page.keyboard.press('Escape'); await sleep(500);
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.mouse.click(1380, 128); await sleep(30);
    console.log('reduced:', await anim());
    await page.keyboard.press('Escape'); await sleep(500);
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
    // lightbox
    await page.mouse.click(110, 943);
    await sleep(60);
    const opened = await page.evaluate(() => !!document.querySelector('[class*=lightbox]'));
    const lbAnim = () => page.evaluate(() => document.getAnimations().filter((a) => /lightbox/.test(a.animationName)).map((a) => `${a.animationName}:${getComputedStyle(a.effect.target).animationDuration}:${getComputedStyle(a.effect.target).animationTimingFunction}`).join(' , '));
    console.log('lightbox:', opened, await lbAnim());
    await sleep(400);
    await shot('19-lightbox');
    await page.keyboard.press('Escape'); await sleep(60);
    console.log('lightbox closing:', await lbAnim());
    await sleep(300);
    console.log('lightbox gone:', await page.evaluate(() => !document.querySelector('[class*=lightbox]')));
    // tooltips: first waits, the neighbour is instant
    await page.goto(UI + '#/detail/series/tt11280740/' + encodeURIComponent('tt11280740:2:10'), { waitUntil: 'networkidle2' });
    await sleep(6000);
    const tip = () => page.evaluate(() => { const t = [...document.querySelectorAll('[class*=tooltip-container]')].find((e) => e.className.includes('active'));
      return t ? `${t.textContent} instant=${t.className.includes('instant')} opacity=${getComputedStyle(t).opacity}` : 'none'; });
    await page.mouse.move(202, 926); await sleep(100);
    console.log('first tooltip @100ms:', await tip());
    await sleep(600);
    console.log('first tooltip @700ms:', await tip());
    await page.mouse.move(251, 926); await sleep(60);
    console.log('neighbour @60ms:', await tip());
    await page.mouse.move(800, 500); await sleep(1500);
    await page.mouse.move(202, 926); await sleep(100);
    console.log('fresh hover after a pause @100ms:', await tip());
  }

  console.log('errors:', errors.slice(0, 15).join('\n'));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
