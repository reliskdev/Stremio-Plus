// Debug PNG: one band per decoded window. Rows: detected speech, subtitle cues as given, cues after alignment.
const sharp = require('sharp');

const W = 1600;
const PAD = 16;
const LABEL = 150;
const ROW = 18;
const GAP = 6;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const clock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

function renderTimeline(speech, { cues = null, aligned = null, title = '' } = {}) {
  const rows = [['speech', '#e8e6f0', (w) => w.speech]];
  const spans = (list) => (w) => list.filter((c) => c.end > w.start && c.start < w.end).map((c) => [c.start, c.end]);
  if (cues) rows.push(['subtitle', '#8a86a0', spans(cues)]);
  if (aligned) rows.push(['aligned', '#7b5bf5', spans(aligned)]);
  const bandH = 22 + rows.length * (ROW + GAP);
  const H = PAD * 2 + 28 + speech.windows.length * (bandH + 14);
  const plot = W - PAD * 2 - LABEL;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">` +
    `<rect width="100%" height="100%" fill="#0c0b11"/>` +
    `<text x="${PAD}" y="${PAD + 16}" fill="#fff" font-family="Helvetica" font-size="16" font-weight="700">${esc(title)}</text>`;
  let y = PAD + 36;
  for (const w of speech.windows) {
    const span = w.end - w.start;
    const x = (t) => PAD + LABEL + ((Math.max(w.start, Math.min(w.end, t)) - w.start) / span) * plot;
    svg += `<text x="${PAD}" y="${y + 13}" fill="rgba(255,255,255,.46)" font-family="Helvetica" font-size="13">${clock(w.start)} – ${clock(w.end)}</text>`;
    for (let m = Math.ceil(w.start / 10) * 10; m <= w.end; m += 10) {
      svg += `<rect x="${x(m).toFixed(1)}" y="${y + 18}" width="1" height="${bandH - 22}" fill="rgba(255,255,255,${m % 60 ? 0.06 : 0.16})"/>`;
    }
    let ry = y + 22;
    for (const [name, color, get] of rows) {
      svg += `<text x="${PAD}" y="${ry + 13}" fill="rgba(255,255,255,.64)" font-family="Helvetica" font-size="13">${name}</text>`;
      svg += `<rect x="${PAD + LABEL}" y="${ry}" width="${plot}" height="${ROW}" fill="rgba(255,255,255,.04)"/>`;
      for (const [a, b] of get(w)) {
        const x0 = x(a), x1 = x(b);
        if (x1 > x0) svg += `<rect x="${x0.toFixed(1)}" y="${ry}" width="${Math.max(1, x1 - x0).toFixed(1)}" height="${ROW}" fill="${color}"/>`;
      }
      ry += ROW + GAP;
    }
    y += bandH + 14;
  }
  svg += '</svg>';
  return sharp(Buffer.from(svg)).png().toBuffer();
}

module.exports = { renderTimeline };
