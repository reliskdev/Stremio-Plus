// Catalog definitions + user config encode/decode.

const SERVICES = {
  netflix: 'Netflix',
  'prime-video': 'Prime Video',
  'disney-plus': 'Disney+',
  max: 'HBO Max',
  'apple-tv-plus': 'Apple TV+',
  hulu: 'Hulu',
  peacock: 'Peacock',
  'paramount-plus': 'Paramount+',
};

// RT genre slugs verified against the cnapi browse endpoint.
const GENRES = {
  Action: 'action', Adventure: 'adventure', Animation: 'animation', Anime: 'anime',
  Biography: 'biography', Comedy: 'comedy', Crime: 'crime', Documentary: 'documentary',
  Drama: 'drama', Fantasy: 'fantasy', History: 'history', Holiday: 'holiday',
  Horror: 'horror', Music: 'music', Musical: 'musical', 'Mystery & Thriller': 'mystery_and_thriller',
  Romance: 'romance', Sports: 'sports', 'Stand-up': 'stand_up', Reality: 'reality',
  War: 'war', Western: 'western', 'LGBTQ+': 'lgbtq',
};

// Base catalogs. `list` = RT browse list, `filters` = RT filter segments.
const BASE_CATALOGS = [
  { id: 'rt-movies-popular', type: 'movie', name: 'RT · Popular Movies Streaming', list: 'movies_at_home', filters: ['sort:popular'], blurb: 'What everyone is streaming right now' },
  { id: 'rt-movies-certified', type: 'movie', name: 'RT · Certified Fresh Movies', list: 'movies_at_home', filters: ['critics:certified_fresh', 'sort:popular'], blurb: 'Critic-approved, sorted by popularity' },
  { id: 'rt-movies-crowd', type: 'movie', name: 'RT · Critics & Audiences Agree', list: 'movies_at_home', filters: ['critics:fresh', 'audience:upright', 'sort:popular'], blurb: 'Fresh Tomatometer and upright Popcornmeter' },
  { id: 'rt-movies-new', type: 'movie', name: 'RT · New & Fresh on Streaming', list: 'movies_at_home', filters: ['critics:fresh', 'sort:newest'], blurb: 'Newest arrivals that critics liked' },
  { id: 'rt-movies-theaters', type: 'movie', name: 'RT · In Theaters', list: 'movies_in_theaters', filters: ['sort:popular'], blurb: 'Top box office (often not streamable yet)' },
  { id: 'rt-tv-popular', type: 'series', name: 'RT · Popular TV', list: 'tv_series_browse', filters: ['sort:popular'], blurb: 'The shows people are watching' },
  { id: 'rt-tv-certified', type: 'series', name: 'RT · Critically Acclaimed TV', list: 'tv_series_browse', filters: ['critics:fresh', 'sort:popular'], minT: 85, blurb: 'Popular series with 85%+ on the Tomatometer' },
  { id: 'rt-tv-new', type: 'series', name: 'RT · New & Fresh TV', list: 'tv_series_browse', filters: ['critics:fresh', 'sort:newest'], blurb: 'Fresh new seasons and premieres' },
];

const DEFAULT_CONFIG = {
  c: ['rt-movies-popular', 'rt-movies-certified', 'rt-movies-crowd', 'rt-tv-popular', 'rt-tv-certified'],
  s: [],        // streaming services → extra "Best on X" catalogs
  t: 0,         // min Tomatometer
  p: 0,         // min Popcornmeter
  b: true,      // score badges on posters
};

function encodeConfig(cfg) {
  return Buffer.from(JSON.stringify(cfg)).toString('base64url');
}

function decodeConfig(str) {
  if (!str) return { ...DEFAULT_CONFIG };
  try {
    const raw = JSON.parse(Buffer.from(str, 'base64url').toString('utf8'));
    const clamp = (n) => Math.max(0, Math.min(100, Number(n) || 0));
    return {
      c: Array.isArray(raw.c) ? raw.c.filter((id) => BASE_CATALOGS.some((b) => b.id === id)) : DEFAULT_CONFIG.c,
      s: Array.isArray(raw.s) ? raw.s.filter((x) => SERVICES[x]) : [],
      t: clamp(raw.t),
      p: clamp(raw.p),
      b: raw.b !== false,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

// All catalogs active for a config (base + per-service).
const SPOTLIGHT = { id: 'rt-spotlight', type: 'movie', name: 'RT · Spotlight', spotlight: true };

function catalogsFor(cfg) {
  const out = [SPOTLIGHT, ...BASE_CATALOGS.filter((c) => cfg.c.includes(c.id))];
  for (const s of cfg.s) {
    out.push({ id: `rt-svc-${s}-movie`, type: 'movie', name: `RT · Best Movies on ${SERVICES[s]}`, list: 'movies_at_home', filters: [`affiliates:${s}`, 'critics:fresh', 'sort:popular'] });
    out.push({ id: `rt-svc-${s}-series`, type: 'series', name: `RT · Best Shows on ${SERVICES[s]}`, list: 'tv_series_browse', filters: [`affiliates:${s}`, 'critics:fresh', 'sort:popular'] });
  }
  return out;
}

module.exports = { SERVICES, GENRES, BASE_CATALOGS, DEFAULT_CONFIG, encodeConfig, decodeConfig, catalogsFor };
