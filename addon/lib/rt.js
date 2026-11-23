// Rotten Tomatoes browse client (the same JSON endpoint rottentomatoes.com/browse uses).

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const PAGE_TTL = 3 * 60 * 60 * 1000; // 3h
const cache = new Map(); // url -> { at, data }

function buildPath(list, filters, genre) {
  const segs = [...filters];
  if (genre) segs.unshift(`genres:${genre}`);
  return `${list}/${segs.join('~')}`;
}

async function fetchPage(path, pageIndex) {
  // Cursor is base64 of the index of the last item on the previous page (30/page).
  const after = pageIndex > 0 ? `?after=${encodeURIComponent(Buffer.from(String(pageIndex * 30 - 1)).toString('base64'))}` : '';
  const url = `https://www.rottentomatoes.com/cnapi/browse/${path}${after}`;
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < PAGE_TTL) return hit.data;

  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) {
    if (res.status === 404) return { items: [], hasNext: false };
    throw new Error(`RT ${res.status} for ${url}`);
  }
  const json = await res.json();
  const data = {
    items: (json.grid?.list || []).map(normalize),
    hasNext: !!json.pageInfo?.hasNextPage,
  };
  cache.set(url, { at: Date.now(), data });
  return data;
}

const num = (s) => (s?.score != null && s.score !== '' ? Number(s.score) : null);

function normalize(x) {
  return {
    title: x.title,
    type: x.type === 'TvSeries' ? 'series' : 'movie',
    rtUrl: `https://www.rottentomatoes.com${x.mediaUrl}`,
    mediaUrl: x.mediaUrl,
    tomato: num(x.criticsScore),
    tomatoCertified: !!x.criticsScore?.certified,
    popcorn: num(x.audienceScore),
    popcornCertified: !!x.audienceScore?.certified,
    dateText: x.releaseDateText || '',
    rtPoster: x.posterUri,
  };
}

module.exports = { buildPath, fetchPage };
