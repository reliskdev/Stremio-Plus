// UI test harness: drives the modded Stremio UI (http://127.0.0.1:7011) in headless Brave and saves screenshots to ./shots.
// Usage: node test.js [all|install|board|discover|details|interact|flix|episode|player|tooltip|episodes|mods|motion|recs]  (or: bin/stremio-plus test <step>)
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
    // scroll-edge fades on the preview body: bottom at the top, both mid-way, top at the end
    const fades = () => page.evaluate(() => {
      const b = [...document.querySelectorAll('[class*="meta-preview"] [class*="body"]')].find((e) => e.scrollHeight > e.clientHeight + 50);
      return b ? `class=${b.className.replace(/-[\w]{5}\b/g, '')} mask=${getComputedStyle(b).maskImage.slice(0, 90)}` : 'no scrollable body';
    });
    console.log('fade at end:', await fades());
    await page.evaluate(() => { const b = [...document.querySelectorAll('[class*="meta-preview"] [class*="body"]')].find((e) => e.scrollHeight > e.clientHeight + 50); if (b) b.scrollTop = 0; });
    await sleep(600);
    console.log('fade at top:', await fades());
    await shot('05b-preview-fade-top');
    await page.evaluate(() => { const b = [...document.querySelectorAll('[class*="meta-preview"] [class*="body"]')].find((e) => e.scrollHeight > e.clientHeight + 50); if (b) b.scrollTop = 380; });
    await sleep(600);
    console.log('fade mid:', await fades());
    await shot('05c-preview-fade-mid');
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
    await page.goto(UI + '#/detail/movie/tt15239678/tt15239678', { waitUntil: 'networkidle2' });
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

  if (step === 'all' || step === 'recs') {
    // Board recommendations. The guest profile's library is empty, so seed taste the way useTaste caches it.
    await page.goto(UI + '#/', { waitUntil: 'networkidle2' });
    await page.evaluate(() => localStorage.removeItem('mods:taste'));
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(5000);
    console.log('taste read from library:', await page.evaluate(() => localStorage.getItem('mods:taste')));
    await page.evaluate(() => localStorage.setItem('mods:taste', JSON.stringify({
      seeds: [{ id: 'tt15239678', type: 'movie', name: 'Dune: Part Two' }, { id: 'tt11280740', type: 'series', name: 'Severance' }],
      exclude: ['tt15239678', 'tt11280740'], at: Date.now(),
    })));
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(8000);
    const rows = () => page.evaluate(() => [...document.querySelectorAll('[data-board-row]')].map((r) => r.getAttribute('data-board-row')).join(' | '));
    console.log('rows:', await rows());
    await shot('23-recs-board');
    await page.evaluate(() => { const r = document.querySelector('[data-board-row="Picked for you"]'); r && r.scrollIntoView({ block: 'start' }); });
    await sleep(1200);
    await shot('24-recs-rows');
    await page.evaluate(() => { const r = document.querySelector('[data-board-row^="Top this week on HBO"]'); r && r.scrollIntoView({ block: 'center' }); });
    await sleep(1200);
    await shot('25-recs-rows-2');
    await page.evaluate(() => { const r = document.querySelector('[data-board-row^="Because you watched"]'); r && r.scrollIntoView({ block: 'center' }); });
    await sleep(1200);
    await shot('25b-recs-because');
    await page.evaluate(() => { const a = document.querySelector('[data-board-row^="Because you watched"] a[href]'); a && a.click(); });
    await sleep(2500);
    console.log('card opened:', await page.evaluate(() => location.hash));
    await page.goto(UI + '#/settings/mods', { waitUntil: 'networkidle2' });
    await sleep(2000);
    await page.evaluate(() => { const r = document.querySelector('[data-row-id=mods-services], #mods-services') || [...document.querySelectorAll('div')].find((d) => d.textContent.trim() === 'Your services'); r && r.scrollIntoView({ block: 'center' }); });
    await sleep(600);
    await shot('29-mods-home');
    // Genres page
    await page.goto(UI + '#/genres?genre=hrr', { waitUntil: 'networkidle2' });
    await sleep(5000);
    await shot('26-genres');
    console.log('clicked service menu:', await clickText('All services'));
    await sleep(1200);
    console.log('menu:', await page.evaluate(() => { const d = [...document.querySelectorAll('[class*=dropdown]')].map((e) => { const r = e.getBoundingClientRect(); return `${e.className.slice(0,60)} ${Math.round(r.top)},${Math.round(r.height)} op=${getComputedStyle(e).opacity} vis=${getComputedStyle(e).visibility}`; }); return d.join(' || ') + ' top@=' + (document.elementFromPoint(340, 300)?.className || '') + ' clip=' + getComputedStyle(document.querySelector('[class*=dropdown]')).clipPath + ' parentOverflow=' + [...(function*(e){while(e){yield e; e=e.parentElement;}})(document.querySelector('[class*=dropdown]'))].slice(0,6).map(e=>e.className.slice(0,25)+':'+getComputedStyle(e).overflow+':'+getComputedStyle(e).zIndex).join(' > '); }));
    await shot('27-genres-service-menu');
    console.log('picked Netflix:', await clickText('Netflix'));
    await sleep(4000);
    console.log('url:', await page.evaluate(() => location.hash));
    await shot('28-genres-netflix');
    const count = () => page.evaluate(() => document.querySelectorAll('[class*=grid] [class*=meta-item-container]').length);
    console.log('items before scroll:', await count());
    await page.evaluate(() => { const c = document.querySelector('[class*=genres-content]'); c.scrollTop = c.scrollHeight; });
    await sleep(4000);
    console.log('items after scroll:', await count());
  }

  if (step === 'all' || step === 'services') {
    // Streaming services row on the Board and a service page (#/service/netflix).
    await page.goto(UI + '#/', { waitUntil: 'networkidle2' });
    await page.evaluate(() => localStorage.setItem('mods:taste', JSON.stringify({
      seeds: [{ id: 'tt15239678', type: 'movie', name: 'Dune: Part Two' }, { id: 'tt11280740', type: 'series', name: 'Severance' }],
      exclude: ['tt15239678', 'tt11280740'], at: Date.now(),
    })));
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(8000);
    console.log('rows:', await page.evaluate(() => [...document.querySelectorAll('[data-board-row]')].map((r) => r.getAttribute('data-board-row')).join(' | ')));
    await page.evaluate(() => { const r = document.querySelector('[data-board-row="Streaming services"]'); r && r.scrollIntoView({ block: 'center' }); });
    await sleep(1500);
    await shot('30-services-row');
    // Cinemeta cards carry no RT scores; hovering one looks them up.
    await page.evaluate(() => { const r = document.querySelector('[data-board-row="Popular - Movie"]'); r && r.scrollIntoView({ block: 'center' }); });
    await sleep(1200);
    const cm = await page.evaluate(() => { const el = document.querySelector('[data-board-row="Popular - Movie"] [class*=meta-item-container]'); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await page.mouse.move(cm.x, cm.y);
    await sleep(6000);
    console.log('cinemeta hover:', await page.evaluate(() => document.querySelector('[data-board-row="Popular - Movie"] [class*=meta-item-container] [class*=mod-hover]')?.innerText.replace(/\s+/g, ' ')));
    await shot('30b-cinemeta-hover');
    await page.mouse.move(5, 500);
    await page.evaluate(() => { const a = document.querySelector('[data-board-row="Streaming services"] a[href="#/service/netflix"]'); a && a.click(); });
    await sleep(7000);
    console.log('opened:', await page.evaluate(() => location.hash));
    console.log('sections:', await page.evaluate(() => [...document.querySelectorAll('[data-board-row]')].map((r) => `${r.getAttribute('data-board-row')} (${r.querySelectorAll('[class*=meta-item-container]').length})`).join(' | ')));
    await shot('31-service-page');
    // Hover strip: Tomatometer left, Popcornmeter right (first card, then one further along that may need a lookup)
    for (const [i, name] of [[0, '31b-hover-scores'], [5, '31c-hover-scores-lazy']]) {
      const box = await page.evaluate((i) => { const el = document.querySelectorAll('[class*=service-content] [class*=meta-item-container]')[i]; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, i);
      await page.mouse.move(box.x, box.y);
      await sleep(2500);
      console.log(name, await page.evaluate((i) => document.querySelectorAll('[class*=service-content] [class*=meta-item-container]')[i].querySelector('[class*=mod-hover]')?.innerText.replace(/\s+/g, ' '), i));
      await shot(name);
    }
    await page.mouse.move(5, 500);
    await page.evaluate(() => { const t = document.querySelector('[class*=service-content] [class*=track]'); t.scrollLeft = 900; });
    await sleep(800);
    await shot('32-service-row-scrolled');
    // Award icons: first card of "Top rated movies" (Oscar winners) and "Top rated shows" (Emmys)
    for (const [title, name] of [['Top rated movies', '31d-award-movie'], ['Top rated shows', '31e-award-show']]) {
      await page.evaluate((t) => { const r = [...document.querySelectorAll('[class*=service-content] [data-board-row]')].find((x) => x.getAttribute('data-board-row') === t); r.scrollIntoView({ block: 'center' }); }, title);
      await sleep(800);
      const b = await page.evaluate((t) => { const r = [...document.querySelectorAll('[class*=service-content] [data-board-row]')].find((x) => x.getAttribute('data-board-row') === t); const el = r.querySelector('[class*=meta-item-container]').getBoundingClientRect(); return { x: el.x + el.width / 2, y: el.y + el.height / 2 }; }, title);
      await page.mouse.move(b.x, b.y);
      await sleep(4000);
      console.log(name, await page.evaluate((t) => { const r = [...document.querySelectorAll('[class*=service-content] [data-board-row]')].find((x) => x.getAttribute('data-board-row') === t); const h = r.querySelector('[class*=mod-hover]'); return h?.innerText.replace(/\s+/g, ' ') + ' | award title=' + (h?.querySelector('[title]')?.getAttribute('title') || '-'); }, title));
      await shot(name);
      await page.mouse.move(5, 500);
    }
    await page.evaluate(() => { const c = document.querySelector('[class*=service-content]'); c.scrollTop = c.scrollHeight; });
    await sleep(1500);
    await shot('33-service-page-bottom');
    // Back button (top-left chevron) returns to the Board
    console.log('back button:', await page.evaluate(() => !!document.querySelector('[class*=service-container] [class*=back-button-container]')));
    await page.evaluate(() => document.querySelector('[class*=service-container] [class*=back-button-container]')?.click());
    await sleep(2500);
    console.log('after back:', await page.evaluate(() => location.hash));
  }

  console.log('errors:', errors.slice(0, 15).join('\n'));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
