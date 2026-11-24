// SeriesGraph (seriesgraph.com) public data: per-episode IMDb ratings and SeriesGraph community scores.
// Their API is keyed by TMDB id; Cinemeta gives us that as `moviedb_id` (else we search SeriesGraph by name).

const fs = require('fs');
const path = require('path');

const BASE = 'https://seriesgraph.com/api';
const FILE = path.join(__dirname, '..', 'data', 'seriesgraph.json');
const TTL = 12 * 60 * 60 * 1000;
const UA = { 'User-Agent': 'stremio-plus (personal Stremio mod)' };

let store = {};
try { store = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch {}
const inflight = new Map();
let saveTimer = null;
const save = () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => fs.writeFile(FILE, JSON.stringify(store), () => {}), 500);
};

const getJson = async (url) => {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
};

async function tmdbId(imdb) {
  const meta = await getJson(`https://v3-cinemeta.strem.io/meta/series/${imdb}.json`).then((j) => j.meta || {}).catch(() => ({}));
  if (meta.moviedb_id) return { tmdb: Number(meta.moviedb_id), name: meta.name };
  if (!meta.name) return null;
  const found = await getJson(`${BASE}/shows/search?searchTerm=${encodeURIComponent(meta.name)}`).catch(() => null);
  const year = String(meta.year || meta.releaseInfo || '').slice(0, 4);
  const hit = (found?.results || []).find((r) => !year || String(r.first_air_date || '').startsWith(year)) || found?.results?.[0];
  return hit ? { tmdb: hit.id, name: meta.name } : null;
}

// { "s:e": value } maps from SeriesGraph's [{ season_number?, episodes: [{ season_number, episode_number, ... }] }]
const flatten = (seasons, pick) => {
  const out = {};
  for (const s of Array.isArray(seasons) ? seasons : []) {
    for (const e of s.episodes || []) {
      const v = pick(e);
      if (v != null && e.season_number > 0) out[`${e.season_number}:${e.episode_number}`] = v;
    }
  }
  return out;
};

async function fetchSeries(imdb) {
  const id = await tmdbId(imdb);
  if (!id) return { tmdb: null, imdb: {}, community: {} };
  const [shows, community] = await Promise.all([
    getJson(`${BASE}/shows/${id.tmdb}/season-ratings`).catch(() => []),
    getJson(`${BASE}/community-ratings/${id.tmdb}/season-ratings`).catch(() => []),
  ]);
  return {
    tmdb: id.tmdb,
    url: `https://seriesgraph.com/show/${id.tmdb}`,
    imdb: flatten(shows, (e) => (typeof e.imdb_rating === 'number' ? e.imdb_rating : null)),
    community: flatten(community, (e) => (e.community_count > 0 && typeof e.community_avg === 'number'
      ? { avg: Math.round(e.community_avg * 10) / 10, count: e.community_count } : null)),
  };
}

async function seriesGraph(imdb) {
  const hit = store[imdb];
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  if (inflight.has(imdb)) return inflight.get(imdb);
  const p = fetchSeries(imdb)
    .then((data) => {
      // Keep failures out of the cache so the next open retries.
      if (data.tmdb && (Object.keys(data.imdb).length || Object.keys(data.community).length)) {
        store[imdb] = { at: Date.now(), data };
        save();
      }
      return data;
    })
    .finally(() => inflight.delete(imdb));
  inflight.set(imdb, p);
  return p;
}

module.exports = { seriesGraph };
