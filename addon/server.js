const express = require('express');
const path = require('path');
const { GENRES, SERVICES, BASE_CATALOGS, encodeConfig, decodeConfig, catalogsFor } = require('./lib/config');
const { seriesGraph } = require('./lib/seriesgraph');
const { buildPath, fetchPage } = require('./lib/rt');
const { resolveAll, findByImdb, guessRtUrl } = require('./lib/match');
const { renderPoster } = require('./lib/poster');
const { getDetails } = require('./lib/details');
const { enrichAll, getCinemeta } = require('./lib/enrich');
const { rtEpisode } = require('./lib/episodes');
const { imdbEpisodeRating, imdbSeriesRatings, warmImdbEpisodes } = require('./lib/imdb-episodes');
const jw = require('./lib/justwatch');
const pkg = require('./package.json');

const PORT = process.env.PORT || 7010;
const PAGE_SIZE = 40;
const MAX_RT_PAGES = 12;

const app = express();
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  next();
});

const baseUrl = (req) => `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers['x-forwarded-host'] || req.get('host')}`;

// ---------- Manifest ----------
function manifest(cfg) {
  const catalogs = catalogsFor(cfg).map((c) => ({
    id: c.id,
    type: c.type,
    name: c.name,
    extra: c.spotlight
      ? [{ name: 'skip', isRequired: false }]
      : [{ name: 'genre', options: Object.keys(GENRES), isRequired: false }, { name: 'skip', isRequired: false }],
  }));
  return {
    id: 'community.rottentomatoes.picks',
    version: pkg.version,
    name: 'Rotten Tomatoes Picks',
    description: 'The best-reviewed movies & shows from Rotten Tomatoes, with Tomatometer 🍅 and Popcornmeter 🍿 scores, critics consensus and trailers.',
    logo: 'https://www.rottentomatoes.com/assets/pizza-pie/images/favicon.ico',
    resources: ['catalog'],
    types: ['movie', 'series'],
    idPrefixes: ['tt'],
    catalogs,
    behaviorHints: { configurable: true, configurationRequired: false },
  };
}

app.get(['/manifest.json', '/:config/manifest.json'], (req, res) => {
  res.json(manifest(decodeConfig(req.params.config)));
});

// ---------- Lists ----------
// Builds a filtered + IMDb-matched list lazily, page by page from RT.
const listCache = new Map();
const LIST_TTL = 3 * 60 * 60 * 1000;

async function getList(rtPath, cfg, needed) {
  const key = `${rtPath}|${cfg.t}|${cfg.p}`;
  let entry = listCache.get(key);
  if (!entry || Date.now() - entry.at > LIST_TTL) {
    entry = { at: Date.now(), items: [], seen: new Set(), rtPage: 0, done: false, pending: null };
    listCache.set(key, entry);
  }
  while (entry.items.length < needed && !entry.done) {
    if (!entry.pending) {
      entry.pending = (async () => {
        const page = await fetchPage(rtPath, entry.rtPage);
        entry.rtPage++;
        if (!page.hasNext || entry.rtPage >= MAX_RT_PAGES) entry.done = true;
        const kept = page.items.filter((it) =>
          (cfg.t === 0 || (it.tomato ?? -1) >= cfg.t) &&
          (cfg.p === 0 || (it.popcorn ?? -1) >= cfg.p));
        const ids = await resolveAll(kept);
        kept.forEach((it, i) => {
          if (ids[i] && !entry.seen.has(ids[i].id)) {
            entry.seen.add(ids[i].id);
            entry.items.push({ ...it, imdb: ids[i].id, year: ids[i].year });
          }
        });
      })().finally(() => { entry.pending = null; });
    }
    await entry.pending;
  }
  return entry.items;
}

// Spotlight: the cream of the crop: Certified Fresh + liked by audiences, movies and TV interleaved.
async function getSpotlight(cfg) {
  const strict = { ...cfg, t: Math.max(cfg.t, 80), p: Math.max(cfg.p, 70) };
  const [movies, shows] = await Promise.all([
    getList('movies_at_home/critics:certified_fresh~sort:popular', strict, 8),
    getList('tv_series_browse/critics:fresh~sort:popular', { ...strict, t: Math.max(strict.t, 88) }, 6),
  ]);
  const out = [];
  for (let i = 0; i < 8; i++) {
    if (movies[i]) out.push(movies[i]);
    if (shows[i] && i < 5) out.push(shows[i]);
  }
  return out.slice(0, 12);
}

// ---------- Meta building ----------
const verdict = (s, cert, kind) => {
  if (s == null) return kind === 't' ? 'No Tomatometer yet' : 'No Popcornmeter yet';
  if (kind === 't') return cert ? 'Certified Fresh' : s >= 60 ? 'Fresh' : 'Rotten';
  return cert ? 'Verified Hot' : s >= 60 ? 'Upright' : 'Spilled';
};

function toMeta(it, cfg, host, extra = {}) {
  const { details: d, cm } = extra;
  const q = new URLSearchParams({
    t: it.tomato ?? 'x', tc: it.tomatoCertified ? 1 : 0,
    a: it.popcorn ?? 'x', ac: it.popcornCertified ? 1 : 0,
  });
  if (it.rtPoster) q.set('fallback', it.rtPoster);
  const scoreLine = `🍅 ${it.tomato ?? '--'}%  🍿 ${it.popcorn ?? '--'}%`;

  const parts = [];
  if (d?.criticsConsensus) parts.push(`“${d.criticsConsensus}”`);
  parts.push(d?.synopsis || cm?.description || '');
  parts.push(`🍅 ${it.tomato ?? '--'}% ${verdict(it.tomato, it.tomatoCertified, 't')}  ·  🍿 ${it.popcorn ?? '--'}% ${verdict(it.popcorn, it.popcornCertified, 'p')}`);
  const description = parts.filter(Boolean).join('\n\n');

  const genres = (d?.genres?.length ? d.genres : cm?.genres) || [];
  const cast = (d?.cast?.filter((c) => !/director|creator|producer/i.test(c.role)).map((c) => c.name) || cm?.cast || []).slice(0, 4);
  const directors = d?.director ? d.director.split(',').map((s) => s.trim()).slice(0, 2) : (cm?.director || []).slice(0, 2);
  const link = (category) => (name) => ({ name, category, url: `stremio:///search?search=${encodeURIComponent(name)}` });

  const trailerStreams = d?.trailer?.mp4
    ? [{ title: `${it.title} – Trailer`, url: d.trailer.mp4 }]
    : (cm?.trailerStreams || []);

  return {
    id: it.imdb,
    type: it.type,
    name: it.title,
    poster: cfg.b ? `${host}/poster/${it.imdb}.jpg?${q}` : `https://images.metahub.space/poster/medium/${it.imdb}/img`,
    posterShape: 'poster',
    background: cm?.background || d?.photos?.[0]?.full || `https://images.metahub.space/background/medium/${it.imdb}/img`,
    logo: cm?.logo || undefined,
    releaseInfo: [it.year, scoreLine].filter(Boolean).join('  ·  '),
    runtime: d?.runtime || cm?.runtime || undefined,
    description,
    genres,
    links: [
      { name: scoreLine, category: 'Rotten Tomatoes', url: it.rtUrl },
      ...genres.map((g) => ({ name: g, category: 'Genres', url: `stremio:///discover/${encodeURIComponent('https://v3-cinemeta.strem.io/manifest.json')}/${it.type}/top?genre=${encodeURIComponent(g)}` })),
      ...directors.map(link('Directors')),
      ...cast.map(link('Cast')),
    ],
    trailerStreams,
    behaviorHints: { defaultVideoId: it.type === 'movie' ? it.imdb : undefined },
  };
}

function parseExtra(str) {
  const out = {};
  if (!str) return out;
  for (const part of str.replace(/\.json$/, '').split('&')) {
    const [k, v] = part.split('=');
    if (k) out[k] = decodeURIComponent(v || '');
  }
  return out;
}

// ---------- Catalog ----------
app.get(['/catalog/:type/:id{/:extra}', '/:config/catalog/:type/:id{/:extra}'], async (req, res) => {
  const cfg = decodeConfig(req.params.config);
  const id = req.params.id.replace(/\.json$/, '');
  const cat = catalogsFor(cfg).find((c) => c.id === id && c.type === req.params.type);
  if (!cat) return res.json({ metas: [] });

  const extra = parseExtra(req.params.extra);
  const skip = Math.max(0, parseInt(extra.skip, 10) || 0);
  const genre = extra.genre ? GENRES[extra.genre] : null;
  try {
    let page;
    if (cat.spotlight) {
      page = skip ? [] : await getSpotlight(cfg);
    } else {
      const ccfg = { ...cfg, t: Math.max(cfg.t, cat.minT || 0), p: Math.max(cfg.p, cat.minP || 0) };
      const items = await getList(buildPath(cat.list, cat.filters, genre), ccfg, skip + PAGE_SIZE);
      page = items.slice(skip, skip + PAGE_SIZE);
    }
    const { results, complete } = await enrichAll(page, cat.spotlight ? 12000 : 5000);
    const host = baseUrl(req);
    // Short cache until every title is enriched, so the next load picks up the rest.
    res.setHeader('Cache-Control', `public, max-age=${complete ? 3600 : 60}`);
    res.json({ metas: page.map((it, i) => toMeta(it, cfg, host, results[i])) });
  } catch (e) {
    console.error('catalog error', id, e.message);
    res.json({ metas: [] });
  }
});

// ---------- Posters ----------
app.get('/poster/:imdb.jpg', async (req, res) => {
  if (!/^tt\d+$/.test(req.params.imdb)) return res.status(400).end();
  const query = { ...req.query };
  if (query.fallback && !String(query.fallback).startsWith('https://resizing.flixster.com/')) delete query.fallback;
  try {
    const img = await renderPoster(req.params.imdb, query);
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.end(img);
  } catch (e) {
    console.error('poster error', e.message);
    res.redirect(`https://images.metahub.space/poster/medium/${req.params.imdb}/img`);
  }
});

// ---------- RT detail API (used by the modded Stremio UI) ----------
// GET /api/rt/tt123?type=movie&name=Dune&year=2021
// Resolve an IMDb id to its RT page details (known match, or URL-slug guess with a title sanity check).
async function resolveRt(imdb, query) {
  const hit = findByImdb(imdb);
  let mediaUrl = hit?.mediaUrl;
  const type = hit?.type || (query.type === 'series' ? 'series' : 'movie');
  let guessedName = null;
  if (!mediaUrl) {
    let { name, year } = query;
    if (!name || !year) {
      const cm = await getCinemeta(type, imdb);
      name = name || cm?.name;
      year = year || String(cm?.year || '').slice(0, 4);
    }
    if (name) {
      guessedName = String(name);
      mediaUrl = await guessRtUrl(type, guessedName, String(year || '').slice(0, 4));
    }
  }
  if (!mediaUrl) return null;
  const d = await getDetails(`https://www.rottentomatoes.com${mediaUrl}`);
  if (!hit && guessedName) {
    const n = (s) => String(s).toLowerCase().replace(/\(\d{4}\)/, '').replace(/[^a-z0-9]/g, '');
    if (!n(d.title).includes(n(guessedName)) && !n(guessedName).includes(n(d.title))) return null;
  }
  popcorn.remember(imdb, d.scores?.audience?.score ?? null, d.scores?.critics?.score ?? null);
  return { type, mediaUrl, details: d };
}

// ---------- Card extras: scores, certified flags and short labels for the modded UI's card hover ----------
// "Won 2 Oscars. 126 wins & 375 nominations total" → "Won 2 Oscars"; nominations only when nothing was won.
function awardLabel(text) {
  if (!text) return null;
  const big = text.match(/(Won|Nominated for) (\d+) (Oscars?|Primetime Emmys?|Golden Globes?|BAFTA Film Awards?)/i);
  if (big) {
    const n = Number(big[2]);
    const one = big[3].replace(/^Primetime /i, '').replace(/ Film Awards?$/i, '').replace(/s$/, ''); // Oscar, Emmy, Golden Globe, BAFTA
    if (/^won/i.test(big[1])) return n === 1 ? `${one} winner` : `Won ${n} ${one}s`;
    return `${one} nominee`;
  }
  const wins = Number(text.match(/(\d+) wins?/)?.[1] || 0);
  const noms = Number(text.match(/(\d+) nominations?/)?.[1] || 0);
  if (wins >= 10) return 'Award-winning';
  if (noms >= 10) return 'Award-nominated';
  return null;
}

// Same text → { kind: oscar|emmy|globe|bafta|award, won, count, label } for the card's award icon.
function awardInfo(text) {
  const label = awardLabel(text);
  if (!label) return null;
  const big = text.match(/(Won|Nominated for) (\d+) (Oscars?|Primetime Emmys?|Golden Globes?|BAFTA Film Awards?)/i);
  if (big) {
    const kind = /oscar/i.test(big[3]) ? 'oscar' : /emmy/i.test(big[3]) ? 'emmy' : /globe/i.test(big[3]) ? 'globe' : 'bafta';
    return { kind, won: /^won/i.test(big[1]), count: Number(big[2]), label };
  }
  const wins = Number(text.match(/(\d+) wins?/)?.[1] || 0);
  return { kind: 'award', won: label === 'Award-winning', count: wins, label: label === 'Award-winning' ? `${wins} award wins` : label };
}

function cardLabels({ tomato, tomatoCertified, reviews, popcorn, popcornCertified, awards }) {
  const out = [];
  const a = awardLabel(awards);
  if (a) out.push(a);
  if (tomatoCertified) out.push('Certified Fresh');
  else if (tomato >= 90 && reviews >= 40) out.push('Critically acclaimed');
  if (out.length < 2) {
    if (popcornCertified && popcorn >= 90) out.push('Verified Hot');
    else if (popcorn >= 90) out.push('Audience favourite');
  }
  return out.slice(0, 2);
}

// GET /api/card/tt123?type=movie&name=&year= → { tomato, tomatoCertified, popcorn, popcornCertified, labels }
app.get('/api/card/:imdb', async (req, res) => {
  const { imdb } = req.params;
  if (!/^tt\d+$/.test(imdb)) return res.status(400).json({ error: 'bad id' });
  const type = req.query.type === 'series' ? 'series' : 'movie';
  popcorn.directStart();
  try {
    const [rt, cm] = await Promise.all([
      resolveRt(imdb, { ...req.query, type }).catch(() => undefined), // undefined = lookup failed, null = not on RT
      getCinemeta(type, imdb).catch(() => null),
    ]);
    const c = rt?.details?.scores?.critics || {}, a = rt?.details?.scores?.audience || {};
    const card = {
      tomato: c.score ?? null, tomatoCertified: !!c.certified, reviews: c.reviews ?? null,
      popcorn: a.score ?? null, popcornCertified: !!a.certified,
      awards: cm?.awards || null,
    };
    card.labels = cardLabels(card);
    card.award = awardInfo(card.awards);
    res.setHeader('Cache-Control', rt === undefined ? 'no-store' : 'public, max-age=3600');
    res.json(card);
  } finally {
    popcorn.directEnd();
  }
});

// ---------- Popcornmeter for JustWatch items (they only carry the Tomatometer) ----------
// imdb → { p: score|null, at }. Unknown titles are looked up on RT in the background, a few at a time, so the
// next load of a row has them; the card hover also asks /api/rt/:imdb directly for the one being looked at.
const popcorn = (() => {
  const fs = require('fs');
  const FILE = path.join(__dirname, 'data', 'popcorn.json');
  const MISS_RETRY = 7 * 24 * 60 * 60 * 1000;
  let store = {};
  try { store = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch {}
  let timer;
  const save = () => { clearTimeout(timer); timer = setTimeout(() => fs.writeFile(FILE, JSON.stringify(store), () => {}), 2000); };
  const queue = new Map();
  let active = 0;
  // Direct lookups (a card being hovered, the RT panel) go first: the background fill pauses while any are running.
  let direct = 0;
  const pump = () => {
    while (direct === 0 && active < 2 && queue.size) {
      const [imdb, it] = queue.entries().next().value;
      queue.delete(imdb);
      active++;
      resolveRt(imdb, { type: it.type, name: it.name, year: it.year })
        .then((r) => { if (!r) remember(imdb, null); }) // not on RT; a network error isn't remembered
        .catch(() => {})
        .finally(() => { active--; pump(); });
    }
  };
  const directStart = () => { direct++; };
  const directEnd = () => { direct = Math.max(0, direct - 1); pump(); };
  function remember(imdb, p, t = null) { store[imdb] = { p, t, at: Date.now() }; save(); }
  const known = (imdb) => { const e = store[imdb]; return e && (e.p !== null || Date.now() - e.at < MISS_RETRY) ? e : null; };
  // Adds `popcorn` to each item that has a known score and queues the rest.
  const enrich = (items) => (items || []).map((it) => {
    if (!it || !/^tt\d+$/.test(it.id)) return it;
    const e = known(it.id);
    if (!e) { if (!queue.has(it.id) && queue.size < 2000) queue.set(it.id, it); pump(); return it; }
    // JustWatch sometimes lacks the Tomatometer RT has; fill it from the same lookup.
    const out = { ...it, popcorn: e.p }; // null = RT has no Popcornmeter (the UI won't look it up again)
    if (out.tomato == null && typeof e.t === 'number') out.tomato = e.t;
    return out;
  });
  return { remember, enrich, directStart, directEnd };
})();

app.get('/api/rt/:imdb', async (req, res) => {
  const { imdb } = req.params;
  if (!/^tt\d+$/.test(imdb)) return res.status(400).json({ error: 'bad id' });
  popcorn.directStart();
  try {
    const r = await resolveRt(imdb, req.query);
    if (!r) return res.status(404).json({ error: 'not on rotten tomatoes' });
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.json({ imdb, type: r.type, ...r.details });
  } catch (e) {
    res.status(502).json({ error: e.message });
  } finally {
    popcorn.directEnd();
  }
});

// GET /api/imdb/tt123/episodes → { "1:3": 8.2, ... } (IMDb ratings for every episode of a series)
app.get('/api/imdb/:imdb/episodes', async (req, res) => {
  const { imdb } = req.params;
  if (!/^tt\d+$/.test(imdb)) return res.status(400).json({ error: 'bad id' });
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.json(await imdbSeriesRatings(imdb).catch(() => ({})));
});

// GET /api/seriesgraph/tt123 → { tmdb, url, imdb: { "1:3": 8.2 }, community: { "1:3": { avg, count } } }
app.get('/api/seriesgraph/:imdb', async (req, res) => {
  const { imdb } = req.params;
  if (!/^tt\d+$/.test(imdb)) return res.status(400).json({ error: 'bad id' });
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.json(await seriesGraph(imdb).catch(() => ({ tmdb: null, imdb: {}, community: {} })));
});

// GET /api/rt/tt123/episode/1/3?name=Dexter&year=2006 → { imdbRating, rt: { score, reviews, average, url } | null }
app.get('/api/rt/:imdb/episode/:season/:episode', async (req, res) => {
  const { imdb } = req.params;
  const season = parseInt(req.params.season, 10), episode = parseInt(req.params.episode, 10);
  if (!/^tt\d+$/.test(imdb) || !(season >= 0) || !(episode >= 0)) return res.status(400).json({ error: 'bad id' });
  const [imdbRating, rt] = await Promise.all([
    imdbEpisodeRating(imdb, season, episode).catch(() => null),
    resolveRt(imdb, { ...req.query, type: 'series' })
      .then((r) => (r && r.mediaUrl.startsWith('/tv/') ? rtEpisode(r.mediaUrl, season, episode) : null))
      .catch(() => null),
  ]);
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.json({ imdb, season, episode, imdbRating, rt });
});

// ---------- Recommendations home + Genres page (JustWatch, used by the modded UI) ----------
app.get('/api/home/options', (req, res) => {
  res.json({
    services: Object.entries(jw.SERVICES).map(([id, s]) => ({ id, name: s.name })),
    genres: Object.entries(jw.GENRES).map(([id, name]) => ({ id, name })),
    sorts: Object.keys(jw.SORTS),
  });
});

// GET /api/home/chart/netflix → { id, name, items } (top movies + shows this week)
app.get('/api/home/chart/:service', async (req, res) => {
  try {
    const chart = await jw.weeklyChart(req.params.service);
    if (!chart) return res.status(404).json({ error: 'unknown service' });
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.json({ ...chart, items: popcorn.enrich(chart.items) });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// GET /api/home/services → [{ id, name, icon }]
app.get('/api/home/services', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.json(await jw.serviceList());
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// GET /api/home/service/netflix → { id, name, icon, sections: [{ key, title, items }] }
app.get('/api/home/service/:service', async (req, res) => {
  try {
    const page = await jw.servicePage(req.params.service);
    if (!page) return res.status(404).json({ error: 'unknown service' });
    res.setHeader('Cache-Control', 'public, max-age=300'); // short: Popcornmeter scores fill in between loads
    res.json({ ...page, sections: page.sections.map((sec) => ({ ...sec, items: popcorn.enrich(sec.items) })) });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// GET /api/home/similar?seeds=tt1:movie:Dune,tt2:series:Severance&exclude=tt3,tt4 → { forYou, because }
app.get('/api/home/similar', async (req, res) => {
  const seeds = String(req.query.seeds || '').split(',').slice(0, 8).map((s) => {
    const [id, type, ...name] = s.split(':');
    return { id, type: type === 'series' ? 'series' : 'movie', name: decodeURIComponent(name.join(':')) };
  }).filter((s) => /^tt\d+$/.test(s.id) && s.name);
  const exclude = new Set(String(req.query.exclude || '').split(',').filter((x) => /^tt\d+$/.test(x)));
  try {
    res.setHeader('Cache-Control', 'no-cache'); // personal; JustWatch responses are cached server-side
    const r = await jw.recommendations(seeds, exclude);
    res.json({ forYou: popcorn.enrich(r.forYou), because: r.because.map((b) => ({ ...b, items: popcorn.enrich(b.items) })) });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// GET /api/home/browse?genre=hrr&type=movie|series&service=netflix&sort=popular&after=cursor → { items, next }
app.get('/api/home/browse', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'public, max-age=300');
    const page = await jw.browse(req.query);
    res.json({ ...page, items: popcorn.enrich(page.items) });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// ---------- Configure UI ----------
app.get('/api/options', (req, res) => {
  res.json({ catalogs: BASE_CATALOGS.map(({ id, type, name, blurb }) => ({ id, type, name, blurb })), services: SERVICES });
});

app.get('/api/preview', async (req, res) => {
  const cat = BASE_CATALOGS.find((c) => c.id === req.query.catalog) || BASE_CATALOGS[0];
  const cfg = decodeConfig(encodeConfig({ c: [], s: [], t: req.query.t, p: req.query.p, b: true }));
  try {
    const items = await getList(buildPath(cat.list, cat.filters), { ...cfg, t: Math.max(cfg.t, cat.minT || 0) }, 12);
    res.json(items.slice(0, 12).map((it) => toMeta(it, cfg, baseUrl(req))));
  } catch (e) {
    res.json([]);
  }
});

app.get(['/', '/configure', '/:config/configure'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'configure.html'));
});

// ---------- Modded Stremio web UI (stremio-web fork build) ----------
const UI_PORT = process.env.UI_PORT || 7011;
const UI_BUILD = process.env.UI_BUILD || path.join(__dirname, '..', 'web', 'build');
const ui = express();
// Always revalidate: rebuilt mods reuse the same asset paths, and this is localhost anyway.
ui.use(express.static(UI_BUILD, { setHeaders: (res) => res.set('Cache-Control', 'no-cache') }));
ui.use((req, res) => res.sendFile(path.join(UI_BUILD, 'index.html')));
ui.listen(UI_PORT, '127.0.0.1', () => console.log(`   Stremio UI: http://127.0.0.1:${UI_PORT}/`));

app.listen(PORT, () => {
  warmImdbEpisodes();
  console.log(`🍅 Rotten Tomatoes Picks running`);
  console.log(`   Configure:  http://127.0.0.1:${PORT}/configure`);
  console.log(`   Manifest:   http://127.0.0.1:${PORT}/manifest.json`);
});
