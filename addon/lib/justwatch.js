// JustWatch public GraphQL client: weekly streaming charts per service, similar titles and filtered browse.
// Every title carries its IMDb id, so no Cinemeta matching is needed.

const fs = require('fs');
const path = require('path');

const URL = 'https://apis.justwatch.com/graphql';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const COUNTRY = 'US';
const TTL = 6 * 60 * 60 * 1000;

// Streaming services (US JustWatch package codes). Peacock/Paramount+ have several tiers; list them all.
const SERVICES = {
  netflix: { name: 'Netflix', packages: ['nfx'] },
  prime: { name: 'Prime Video', packages: ['amp'] },
  disney: { name: 'Disney+', packages: ['dnp'] },
  max: { name: 'HBO Max', packages: ['mxx'] },
  apple: { name: 'Apple TV+', packages: ['atp'] },
  hulu: { name: 'Hulu', packages: ['hlu'] },
  peacock: { name: 'Peacock', packages: ['pct', 'pcp'] },
  paramount: { name: 'Paramount+', packages: ['ppp', 'ppe'] },
  crunchyroll: { name: 'Crunchyroll', packages: ['cru'] },
  mubi: { name: 'MUBI', packages: ['mbi'] },
};

const GENRES = {
  act: 'Action & Adventure', ani: 'Animation', cmy: 'Comedy', crm: 'Crime', doc: 'Documentary', drm: 'Drama',
  fnt: 'Fantasy', hst: 'History', hrr: 'Horror', fml: 'Kids & Family', msc: 'Music', trl: 'Mystery & Thriller',
  rly: 'Reality', rma: 'Romance', scf: 'Science Fiction', spt: 'Sport', war: 'War', wsn: 'Western',
};

const SORTS = { popular: 'POPULAR', trending: 'TRENDING', rated: 'IMDB_SCORE', newest: 'RELEASE_YEAR' };

const CONTENT = `content(country: $c, language: "en") {
  title originalReleaseYear posterUrl shortDescription
  genres { shortName }
  scoring { imdbScore tomatoMeter certifiedFresh }
  externalIds { imdbId }
}`;

const cache = new Map();
async function gql(query, variables) {
  const key = query + JSON.stringify(variables);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  const res = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({ query, variables: { c: COUNTRY, ...variables } }),
  });
  if (!res.ok) throw new Error(`JustWatch ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(`JustWatch: ${json.errors[0].message}`);
  cache.set(key, { at: Date.now(), data: json.data });
  return json.data;
}

// JustWatch node → the item shape the modded UI renders.
function toItem(node) {
  const c = node?.content;
  const imdb = c?.externalIds?.imdbId;
  if (!c || !imdb) return null;
  return {
    id: imdb,
    type: node.objectType === 'SHOW' ? 'series' : 'movie',
    name: c.title,
    year: c.originalReleaseYear || null,
    poster: c.posterUrl
      ? `https://images.justwatch.com${c.posterUrl.replace('{profile}', 's332').replace('{format}', 'webp')}`
      : `https://images.metahub.space/poster/medium/${imdb}/img`,
    description: c.shortDescription || null,
    genres: (c.genres || []).map((g) => GENRES[g.shortName]).filter(Boolean),
    tomato: c.scoring?.tomatoMeter ?? null,
    certified: !!c.scoring?.certifiedFresh,
    imdbScore: c.scoring?.imdbScore ?? null,
  };
}

const dedupe = (items) => {
  const seen = new Set();
  return items.filter((it) => it && !seen.has(it.id) && seen.add(it.id));
};

// Top titles this week on a service: movies and shows charts, interleaved by rank.
async function weeklyChart(serviceId, limit = 20) {
  const svc = SERVICES[serviceId];
  if (!svc) return null;
  const q = `query($c: Country!, $f: StreamingChartsFilter, $n: Int!) {
    streamingCharts(country: $c, first: $n, filter: $f) {
      edges { streamingChartInfo { rank } node { objectType ${CONTENT} } }
    }
  }`;
  const chart = (objectType) => gql(q, {
    n: limit,
    f: { category: 'WEEKLY_POPULARITY_SAME_CONTENT_TYPE', objectType, packages: svc.packages },
  }).then((d) => d.streamingCharts.edges.map((e) => ({ rank: e.streamingChartInfo?.rank ?? 999, item: toItem(e.node) })));
  const [movies, shows] = await Promise.all([chart('MOVIE'), chart('SHOW')]);
  const merged = [...movies, ...shows].sort((a, b) => a.rank - b.rank).map((x) => x.item);
  return { id: serviceId, name: svc.name, items: dedupe(merged).slice(0, limit) };
}

// IMDb id → JustWatch node id, found by title search. Persisted; misses retried after a day.
const IDS_FILE = path.join(__dirname, '..', 'data', 'justwatch-ids.json');
let ids = {};
try { ids = JSON.parse(fs.readFileSync(IDS_FILE, 'utf8')); } catch {}
let saveTimer;
const saveIds = () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => fs.writeFile(IDS_FILE, JSON.stringify(ids), () => {}), 2000);
};

async function jwIdFor(imdb, type, name) {
  const hit = ids[imdb];
  if (hit && (hit.id || Date.now() - hit.at < 24 * 60 * 60 * 1000)) return hit.id || null;
  if (!name) return null;
  const q = `query($c: Country!, $f: TitleFilter) {
    popularTitles(country: $c, first: 8, filter: $f) { edges { node { id content(country: $c, language: "en") { externalIds { imdbId } } } } }
  }`;
  const d = await gql(q, { f: { searchQuery: name, objectTypes: [type === 'series' ? 'SHOW' : 'MOVIE'] } });
  const node = d.popularTitles.edges.map((e) => e.node).find((n) => n.content?.externalIds?.imdbId === imdb);
  ids[imdb] = { id: node?.id || null, at: Date.now() };
  saveIds();
  return node?.id || null;
}

async function similarTo(imdb, type, name, limit = 20) {
  const id = await jwIdFor(imdb, type, name);
  if (!id) return [];
  const q = `query($c: Country!, $id: ID!, $n: Int!) {
    node(id: $id) { ... on MovieOrShow { similarTitlesV2(country: $c, first: $n) { edges { node { objectType ${CONTENT} } } } } }
  }`;
  const d = await gql(q, { id, n: limit });
  return dedupe((d.node?.similarTitlesV2?.edges || []).map((e) => toItem(e.node)));
}

// Personal picks. seeds: [{ id, type, name }] most important first.
// Returns a blended "for you" list (titles similar to several seeds rank higher) and per-seed lists.
async function recommendations(seeds, exclude = new Set()) {
  const lists = await Promise.all(seeds.map((s) => similarTo(s.id, s.type, s.name).catch(() => [])));
  const skip = new Set([...exclude, ...seeds.map((s) => s.id)]);
  const scores = new Map();
  lists.forEach((list, si) => {
    const seedWeight = 1 / (1 + si * 0.25);
    list.forEach((it, rank) => {
      if (skip.has(it.id)) return;
      const cur = scores.get(it.id) || { it, score: 0 };
      cur.score += seedWeight * (1 - rank / (list.length + 5));
      scores.set(it.id, cur);
    });
  });
  const forYou = [...scores.values()].sort((a, b) => b.score - a.score).map((x) => x.it).slice(0, 30);
  // Per-seed rows leave out what the "for you" row already shows up front, so rows don't repeat each other.
  const shown = new Set(forYou.slice(0, 10).map((it) => it.id));
  const because = seeds
    .map((s, i) => ({ seed: { id: s.id, type: s.type, name: s.name }, items: lists[i].filter((it) => !skip.has(it.id) && !shown.has(it.id)) }))
    .filter((b) => b.items.length >= 5);
  return { forYou, because };
}

// Filtered browse for the Genres page. Cursor pagination via JustWatch's `after`.
async function browse({ genre, type, service, sort, after }, limit = 40) {
  const f = {};
  if (genre && GENRES[genre]) f.genres = [genre];
  if (type === 'movie') f.objectTypes = ['MOVIE'];
  else if (type === 'series') f.objectTypes = ['SHOW'];
  if (service && SERVICES[service]) f.packages = SERVICES[service].packages;
  const q = `query($c: Country!, $f: TitleFilter, $s: PopularTitlesSorting!, $n: Int!, $a: String) {
    popularTitles(country: $c, first: $n, after: $a, filter: $f, sortBy: $s) {
      pageInfo { endCursor hasNextPage }
      edges { node { objectType ${CONTENT} } }
    }
  }`;
  const d = await gql(q, { f, s: SORTS[sort] || 'POPULAR', n: limit, a: after || null });
  const p = d.popularTitles;
  return { items: dedupe(p.edges.map((e) => toItem(e.node))), next: p.pageInfo.hasNextPage ? p.pageInfo.endCursor : null };
}

module.exports = { SERVICES, GENRES, SORTS, weeklyChart, recommendations, browse };
