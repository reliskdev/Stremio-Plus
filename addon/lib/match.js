// Map RT titles → IMDb ids via Cinemeta search, so Stremio's stream addons work.

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'matches.json');
const MISS_TTL = 24 * 60 * 60 * 1000;
let store = {};
try { store = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch {}

let saveTimer;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => fs.writeFile(FILE, JSON.stringify(store), () => {}), 2000);
}

const norm = (s) => s.toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/^(the|a|an) /, '')
  .trim();

function yearHints(item) {
  const hints = [];
  const slugYear = item.mediaUrl.match(/_(\d{4})$/);
  if (slugYear) hints.push(Number(slugYear[1]));
  const dateYear = item.dateText.match(/(\d{4})/);
  if (dateYear) {
    const y = Number(dateYear[1]);
    // Streaming date is often a year after the theatrical release.
    hints.push(y, y - 1);
  }
  return hints;
}

function firstYear(releaseInfo) {
  const m = String(releaseInfo || '').match(/(\d{4})/);
  return m ? Number(m[1]) : null;
}

async function searchCinemeta(type, query) {
  const url = `https://v3-cinemeta.strem.io/catalog/${type}/top/search=${encodeURIComponent(query)}.json`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const json = await res.json();
  return json.metas || [];
}

async function resolve(item) {
  const key = `${item.type}:${item.mediaUrl}`;
  const hit = store[key];
  if (hit && (hit.id || Date.now() - hit.at < MISS_TTL)) return hit.id ? hit : null;

  const want = norm(item.title);
  const hints = yearHints(item);
  let best = null;
  try {
    const metas = await searchCinemeta(item.type, item.title);
    const exact = metas.filter((m) => m.id?.startsWith('tt') && norm(m.name) === want);
    if (exact.length) {
      const slugYear = item.mediaUrl.match(/_(\d{4})$/);
      if (slugYear) {
        // RT disambiguates remakes with a year suffix — trust it.
        const y0 = Number(slugYear[1]);
        best = exact.find((m) => Math.abs((firstYear(m.releaseInfo) ?? -99) - y0) <= 1) || null;
      } else if (hints.length) {
        // Streaming date is just an upper bound; take the most popular match released before it.
        const maxYear = Math.max(...hints);
        best = exact.find((m) => (firstYear(m.releaseInfo) ?? 0) <= maxYear) || null;
      } else {
        best = exact[0]; // Cinemeta ranks by popularity
      }
    }
  } catch (e) {
    return null; // network blip — don't cache
  }

  store[key] = best
    ? { id: best.id, year: firstYear(best.releaseInfo), at: Date.now() }
    : { id: null, at: Date.now() };
  persist();
  return best ? store[key] : null;
}

// Resolve many items with bounded concurrency, preserving order.
async function resolveAll(items, concurrency = 8) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await resolve(items[idx]);
    }
  }));
  return out;
}

// IMDb id → RT mediaUrl, using matches we've already made.
function findByImdb(imdb) {
  for (const [key, v] of Object.entries(store)) {
    if (v.id === imdb) {
      const [type, mediaUrl] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
      return { type, mediaUrl };
    }
  }
  return null;
}

// For titles not in any RT list we've browsed: guess RT's URL slug and verify it exists.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const guessCache = new Map();
async function guessRtUrl(type, name, year) {
  const key = `${type}|${name}|${year}`;
  if (guessCache.has(key)) return guessCache.get(key);
  const slug = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, 'and').replace(/['’.]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const base = type === 'series' ? '/tv/' : '/m/';
  const candidates = year ? [`${base}${slug}_${year}`, `${base}${slug}`] : [`${base}${slug}`];
  let found = null;
  for (const c of candidates) {
    try {
      const r = await fetch(`https://www.rottentomatoes.com${c}`, { method: 'HEAD', headers: { 'User-Agent': UA }, redirect: 'follow' });
      if (r.ok) { found = new URL(r.url).pathname.replace(/\/$/, ''); break; }
    } catch {}
  }
  guessCache.set(key, found);
  return found;
}

module.exports = { resolveAll, findByImdb, guessRtUrl };
