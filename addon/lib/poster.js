// Composite Tomatometer + Popcornmeter badges onto a poster.

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const DIR = path.join(__dirname, '..', 'data', 'posters');
fs.mkdirSync(DIR, { recursive: true });

const W = 300, H = 450;

function tomatoIcon(score, certified) {
  if (score == null) return '<circle cx="16" cy="18" r="12" fill="#555"/>';
  if (score < 60) {
    // Rotten splat
    return `<path fill="#0AC855" d="M16 4c3 4 6 1 8 4s-1 5 2 8 5 3 3 7-5 1-7 4-1 6-6 5-4-4-8-4-6 2-7-3 3-4 1-7-5-4-2-7 5 0 7-3 3-6 6-4z"/>`;
  }
  return `
    ${certified ? '<circle cx="16" cy="18" r="14.5" fill="none" stroke="#FFD43B" stroke-width="2"/>' : ''}
    <circle cx="16" cy="19" r="11" fill="#FA320A"/>
    <ellipse cx="12" cy="15" rx="3.5" ry="2" fill="#ff7a5c" opacity=".7"/>
    <path fill="#00912D" d="M16 9l2.5-4 .5 4 4-1.5-3 3.5 4 1-4.5 1-1 3-2-3-3.5 1.5 1.5-3.5-4-1.5 4.5-.5z"/>`;
}

function popcornIcon(score, certified) {
  if (score == null) return '<rect x="8" y="10" width="16" height="18" rx="2" fill="#555"/>';
  const bucket = `
    <path d="M7 13h18l-2.5 16h-13z" fill="#fff"/>
    <path d="M10.2 13h3l.8 16h-2.5zM17 13h3l-1.2 16h-2.5z" fill="#FA320A"/>`;
  if (score < 60) {
    // Tipped bucket, spilled kernels
    return `<g transform="rotate(-70 16 20)">${bucket}</g>
      <circle cx="27" cy="27" r="2.6" fill="#FFD43B"/><circle cx="23" cy="29" r="2.2" fill="#FFE380"/>`;
  }
  return `
    ${certified ? '<circle cx="16" cy="18" r="14.5" fill="none" stroke="#FFD43B" stroke-width="2"/>' : ''}
    <circle cx="11" cy="11" r="4" fill="#FFE380"/><circle cx="16" cy="8.5" r="4.4" fill="#FFD43B"/>
    <circle cx="21" cy="11" r="4" fill="#FFE380"/>${bucket}`;
}

function pill(x, icon, score) {
  const label = score == null ? '--' : `${score}%`;
  return `
    <g transform="translate(${x} ${H - 56})">
      <rect width="128" height="42" rx="21" fill="rgba(12,12,14,.78)" stroke="rgba(255,255,255,.18)"/>
      <g transform="translate(8 3)">${icon}</g>
      <text x="80" y="29" text-anchor="middle" font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
            font-weight="700" font-size="22" fill="#fff">${label}</text>
    </g>`;
}

function overlaySvg(q) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".85"/>
    </linearGradient></defs>
    <rect y="${H - 110}" width="${W}" height="110" fill="url(#g)"/>
    ${pill(14, tomatoIcon(q.t, q.tc), q.t)}
    ${pill(W - 142, popcornIcon(q.a, q.ac), q.a)}
  </svg>`);
}

const parseScore = (v) => (v === undefined || v === '' || v === 'x' ? null : Math.max(0, Math.min(100, Number(v))));

async function renderPoster(imdbId, query) {
  const q = {
    t: parseScore(query.t), tc: query.tc === '1',
    a: parseScore(query.a), ac: query.ac === '1',
  };
  const file = path.join(DIR, `${imdbId}_${q.t}_${+q.tc}_${q.a}_${+q.ac}.jpg`);
  if (fs.existsSync(file)) return fs.promises.readFile(file);

  let base;
  const res = await fetch(`https://images.metahub.space/poster/medium/${imdbId}/img`);
  if (res.ok) base = Buffer.from(await res.arrayBuffer());
  else if (query.fallback) {
    const r2 = await fetch(query.fallback);
    if (r2.ok) base = Buffer.from(await r2.arrayBuffer());
  }
  const canvas = base
    ? sharp(base).resize(W, H, { fit: 'cover' })
    : sharp({ create: { width: W, height: H, channels: 3, background: '#1b1b1f' } });

  const out = await canvas.composite([{ input: overlaySvg(q) }]).jpeg({ quality: 86 }).toBuffer();
  fs.promises.writeFile(file, out).catch(() => {});
  return out;
}

module.exports = { renderPoster };
