// Scrape a Rotten Tomatoes title page into structured details:
// consensus, synopsis, info, cast, photos, trailer (direct mp4/HLS), score breakdowns.

const fs = require('fs');
const path = require('path');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const DIR = path.join(__dirname, '..', 'data', 'details');
const TTL = 24 * 60 * 60 * 1000;
fs.mkdirSync(DIR, { recursive: true });

const inflight = new Map();

const decode = (s) => s
  .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
const text = (h) => decode(String(h || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();

// Strip RT's signed resizer prefix to get the original full-size image.
const fullImage = (u) => {
  if (!u) return null;
  const i = u.indexOf('/v2/');
  return i > 0 ? u.slice(i + 4) : u;
};

function between(html, startMarker, len = 4000) {
  const i = html.indexOf(startMarker);
  return i < 0 ? null : html.slice(i, i + len);
}

function parseConsensus(html, id) {
  const block = between(html, `id="${id}"`, 3000);
  if (!block) return null;
  // Content sits in the second rt-text inside the block, after the heading.
  const m = block.match(/<\/rt-text>\s*<rt-text[^>]*>([\s\S]*?)<\/rt-text>/) ||
            block.match(/<p[^>]*>([\s\S]*?)<\/p>/);
  const t = m ? text(m[1]) : null;
  return t && !/^Read (Critics|Audience)/.test(t) ? t : null;
}

function parseInfo(html) {
  const info = {};
  const re = /<rt-text class="key"[^>]*>([\s\S]*?)<\/rt-text>([\s\S]*?)<\/div>/g;
  let m;
  while ((m = re.exec(html))) {
    const k = text(m[1]);
    const v = text(m[2]).replace(/\s+,/g, ',');
    if (k && v && !info[k]) info[k] = v;
  }
  return info;
}

function parseJsonBlock(html, prefixRe) {
  const m = html.match(prefixRe);
  if (!m) return null;
  const end = html.indexOf('</script>', m.index);
  try { return JSON.parse(html.slice(m.index, end).trim()); } catch { return null; }
}

function parseScores(html) {
  // The scorecard JSON block starts with {"audienceScore":{"averageRating"...
  const d = parseJsonBlock(html, /\{"audienceScore":\{"averageRating"/) ||
            parseJsonBlock(html, /\{"audienceScore":\{"bandedRatingCount"/);
  if (!d) return {};
  const a = d.audienceScore || {}, c = d.criticsScore || {};
  return {
    critics: {
      score: c.scorePercent ? parseInt(c.scorePercent, 10) : null,
      certified: !!c.certified,
      average: c.averageRating || null,
      reviews: c.reviewCount || c.ratingCount || null,
      liked: c.likedCount ?? null,
      notLiked: c.notLikedCount ?? null,
    },
    audience: {
      score: a.scorePercent ? parseInt(a.scorePercent, 10) : null,
      certified: !!a.certified,
      average: a.averageRating || null,
      count: a.bandedRatingCount || null,
    },
  };
}

function parseCast(html) {
  const out = [];
  const re = /<a href="([^"]*)" data-qa="person-item"[\s\S]*?<\/a>/g;
  let m;
  while ((m = re.exec(html)) && out.length < 16) {
    const block = m[0];
    const name = block.match(/data-qa="person-name"[^>]*>([\s\S]*?)</);
    const role = block.match(/data-qa="person-role"[^>]*>([\s\S]*?)</);
    const img = block.match(/<rt-img[\s\S]*?src="([^"]+)"/);
    if (name) out.push({ name: text(name[1]), role: role ? text(role[1]) : '', image: img && img[1].startsWith('http') ? img[1] : null });
  }
  return out;
}

function parsePhotos(html) {
  const d = parseJsonBlock(html, /\{"title":"(?:[^"\\]|\\.)*","images":\[/);
  return (d?.images || [])
    .sort((a, b) => (b.aspectRatio === 'ASPECT_RATIO_16_9') - (a.aspectRatio === 'ASPECT_RATIO_16_9'))
    .map((i) => ({ full: fullImage(i.imageUrl), thumb: i.imageUrlTile || i.imageUrl, caption: i.caption }))
    .slice(0, 12);
}

async function resolveTrailer(html) {
  const m = html.match(/data-content-type="(?:PROMO|TRAILER|CLIP)"[\s\S]{0,400}?data-public-id="(\w+)"/) ||
            html.match(/data-public-id="(\w+)"/);
  if (!m) return null;
  const pid = m[1];
  const thumb = (html.match(/"iconic":\{"srcDesktop":"([^"]+)"/) || [])[1] || null;
  const grab = async (fmt) => {
    try {
      const r = await fetch(`https://link.theplatform.com/s/NGweTC/media/${pid}?formats=${fmt}`, { redirect: 'manual' });
      return r.headers.get('location');
    } catch { return null; }
  };
  const [mp4, hls] = await Promise.all([grab('MPEG4'), grab('M3U%2Bnone')]);
  if (!mp4 && !hls) return null;
  return { mp4, hls, thumb: fullImage(thumb) };
}

async function scrape(rtUrl) {
  const res = await fetch(rtUrl, { headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'en-US' } });
  if (!res.ok) throw new Error(`RT page ${res.status}`);
  const html = await res.text();

  const info = parseInfo(html);
  const ld = parseJsonBlock(html, /\{"@context":"http:\/\/schema.org"/) || {};
  const trailer = await resolveTrailer(html);

  return {
    url: rtUrl,
    title: ld.name || text((html.match(/<title>([\s\S]*?)\|/) || [])[1]),
    synopsis: info.Synopsis || null,
    criticsConsensus: parseConsensus(html, 'critics-consensus'),
    audienceSays: parseConsensus(html, 'audience-consensus'),
    scores: parseScores(html),
    rating: info.Rating || ld.contentRating || null,
    genres: (info.Genre || '').split(',').map((s) => s.trim()).filter(Boolean),
    runtime: info.Runtime || null,
    director: info.Director || info.Creator || null,
    network: info.Network || info.Distributor || null,
    released: info['Release Date (Theaters)'] || info['Release Date'] || null,
    streaming: info['Release Date (Streaming)'] || null,
    language: info['Original Language'] || null,
    cast: parseCast(html),
    photos: parsePhotos(html),
    trailer,
    fetchedAt: Date.now(),
  };
}

async function getDetails(rtUrl) {
  const key = rtUrl.replace(/^https:\/\/www\.rottentomatoes\.com\//, '').replace(/[^a-z0-9_-]+/gi, '_');
  const file = path.join(DIR, `${key}.json`);
  try {
    const cached = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Date.now() - cached.fetchedAt < TTL) return cached;
  } catch {}
  if (inflight.has(key)) return inflight.get(key);
  const p = scrape(rtUrl)
    .then((d) => { fs.writeFile(file, JSON.stringify(d), () => {}); return d; })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

module.exports = { getDetails };
