// RT episode Tomatometer from the public episode page <show url>/sNN/eNN (criticsScore JSON).
// RT only scores episodes with 5+ reviews, mostly recent shows.

const fs = require('fs');
const path = require('path');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const DIR = path.join(__dirname, '..', 'data', 'episodes');
const TTL = 24 * 60 * 60 * 1000;
fs.mkdirSync(DIR, { recursive: true });
const inflight = new Map();

function cached(key, load) {
  const file = path.join(DIR, `${key.replace(/[^a-z0-9_-]+/gi, '_')}.json`);
  try {
    const c = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Date.now() - c.at < TTL) return Promise.resolve(c.value);
  } catch {}
  if (inflight.has(key)) return inflight.get(key);
  const p = load()
    .then((value) => { fs.writeFile(file, JSON.stringify({ at: Date.now(), value }), () => {}); return value; })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

const pad = (n) => String(n).padStart(2, '0');

// mediaUrl like "/tv/severance" → { score, reviews, average, url } or null
function rtEpisode(mediaUrl, season, episode) {
  const url = `https://www.rottentomatoes.com${mediaUrl}/s${pad(season)}/e${pad(episode)}`;
  return cached(`rt_${mediaUrl}_${season}_${episode}`, async () => {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'en-US' } });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`RT episode ${r.status}`);
    const m = (await r.text()).match(/"criticsScore":(\{[^{}]*\})/);
    if (!m) return null;
    let c;
    try { c = JSON.parse(m[1]); } catch { return null; }
    const score = c.scorePercent ? parseInt(c.scorePercent, 10) : null;
    const reviews = c.reviewCount || c.ratingCount || 0;
    if (score === null) return null; // RT shows no Tomatometer under 5 reviews
    return { score, reviews, average: c.averageRating || null, url };
  });
}

module.exports = { rtEpisode };
