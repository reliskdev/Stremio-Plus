// IMDb episode ratings from IMDb's official datasets (https://datasets.imdbws.com, personal use).
// title.ratings + title.episode are joined into { seriesId: { "season:episode": rating } } and cached
// on disk (data/imdb-episodes.json), refreshed weekly in the background.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const readline = require('readline');
const { Readable } = require('stream');

const FILE = path.join(__dirname, '..', 'data', 'imdb-episodes.json');
const TTL = 7 * 24 * 60 * 60 * 1000;
const BASE = 'https://datasets.imdbws.com';

let index = null;     // loaded index
let building = null;  // in-flight build promise

async function* lines(name) {
  const res = await fetch(`${BASE}/${name}`);
  if (!res.ok) throw new Error(`${name} ${res.status}`);
  const rl = readline.createInterface({ input: Readable.fromWeb(res.body).pipe(zlib.createGunzip()), crlfDelay: Infinity });
  let first = true;
  for await (const line of rl) {
    if (first) { first = false; continue; } // header
    yield line;
  }
}

async function build() {
  const t0 = Date.now();
  const ratings = new Map();
  for await (const line of lines('title.ratings.tsv.gz')) {
    const [id, avg] = line.split('\t');
    ratings.set(id, parseFloat(avg));
  }
  const idx = {};
  for await (const line of lines('title.episode.tsv.gz')) {
    const [id, parent, season, episode] = line.split('\t');
    const r = ratings.get(id);
    if (r === undefined || season === '\\N' || episode === '\\N') continue;
    (idx[parent] ||= {})[`${season}:${episode}`] = r;
  }
  fs.writeFileSync(FILE, JSON.stringify({ at: Date.now(), idx }));
  console.log(`imdb episode ratings: ${Object.keys(idx).length} series in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return idx;
}

function refresh() {
  if (!building) {
    building = build()
      .then((idx) => { index = idx; })
      .catch((e) => console.error('imdb episodes build failed:', e.message))
      .finally(() => { building = null; });
  }
  return building;
}

// Load from disk (or build) on first use; rebuild in the background when stale.
function load() {
  if (index) return;
  try {
    const c = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    index = c.idx;
    if (Date.now() - c.at > TTL) refresh();
  } catch {
    refresh();
  }
}

async function imdbEpisodeRating(seriesId, season, episode) {
  load();
  if (!index && building) await building;
  return index?.[seriesId]?.[`${season}:${episode}`] ?? null;
}

async function imdbSeriesRatings(seriesId) {
  load();
  if (!index && building) await building;
  return index?.[seriesId] || {};
}

module.exports = { imdbEpisodeRating, imdbSeriesRatings, warmImdbEpisodes: load };
