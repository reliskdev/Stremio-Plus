// Combine RT page details + Cinemeta meta (logo, backdrop, YouTube trailer) per title.

const fs = require('fs');
const path = require('path');
const { getDetails } = require('./details');

const DIR = path.join(__dirname, '..', 'data', 'cinemeta');
const TTL = 3 * 24 * 60 * 60 * 1000;
fs.mkdirSync(DIR, { recursive: true });
const mem = new Map();

async function getCinemeta(type, id) {
  const file = path.join(DIR, `${type}_${id}.json`);
  if (mem.has(file)) return mem.get(file);
  try {
    const c = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Date.now() - c.at < TTL) { mem.set(file, c.meta); return c.meta; }
  } catch {}
  const p = fetch(`https://v3-cinemeta.strem.io/meta/${type}/${id}.json`)
    .then((r) => (r.ok ? r.json() : {}))
    .then((j) => {
      const m = j.meta || null;
      const slim = m && {
        name: m.name,
        logo: m.logo || null,
        background: m.background || null,
        runtime: m.runtime || null,
        genres: m.genres || [],
        cast: m.cast || [],
        director: m.director || [],
        trailerStreams: (m.trailerStreams || []).slice(0, 2),
        imdbRating: m.imdbRating || null,
        year: m.year || m.releaseInfo || null,
        description: m.description || null,
      };
      fs.writeFile(file, JSON.stringify({ at: Date.now(), meta: slim }), () => {});
      return slim;
    })
    .catch(() => null);
  mem.set(file, p);
  const res = await p;
  mem.set(file, res);
  return res;
}

const withTimeout = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r(undefined), ms))]);

// Enrich a list in place-ish; returns parallel array of {details, cm}. Anything not done
// within `budgetMs` keeps loading in the background and will be ready next time.
async function enrichAll(items, budgetMs = 6000, concurrency = 6) {
  const out = new Array(items.length).fill(null).map(() => ({}));
  let i = 0;
  const work = Promise.all(Array.from({ length: concurrency }, async () => {
    while (i < items.length) {
      const idx = i++;
      const it = items[idx];
      const [details, cm] = await Promise.all([
        getDetails(it.rtUrl).catch(() => null),
        getCinemeta(it.type, it.imdb),
      ]);
      out[idx] = { details, cm };
    }
  }));
  await withTimeout(work, budgetMs);
  return { results: out, complete: i >= items.length && out.every((o) => 'details' in o) };
}

module.exports = { enrichAll, getCinemeta };
