// SRT / WebVTT parsing and SRT writing. Cues are { start, end, text } in seconds.
const TIME = /(?:(\d+):)?(\d{1,2}):(\d{2})[,.](\d{1,3})/;
const ARROW = /^\s*(\S+)\s*-->\s*(\S+)/;

function toSeconds(stamp) {
  const m = TIME.exec(stamp);
  if (!m) return null;
  return (+(m[1] || 0)) * 3600 + +m[2] * 60 + +m[3] + +m[4].padEnd(3, '0') / 1000;
}

// Buffer or string. Falls back to latin1 when UTF-8 decoding produced lots of replacement characters.
function decode(input) {
  if (typeof input === 'string') return input;
  let text = input.toString('utf8');
  const bad = (text.match(/�/g) || []).length;
  if (bad > 10) text = input.toString('latin1');
  return text;
}

function parseSubtitles(input) {
  const text = decode(input).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const cues = [];
  for (const block of text.split(/\n{2,}/)) {
    const lines = block.split('\n');
    const at = lines.findIndex((l) => ARROW.test(l));
    if (at < 0) continue;
    const m = ARROW.exec(lines[at]);
    const start = toSeconds(m[1]);
    const end = toSeconds(m[2]);
    if (start === null || end === null || end <= start) continue;
    const body = lines.slice(at + 1).join('\n').trim();
    if (!body) continue;
    cues.push({ start, end, text: body });
  }
  return cues.sort((a, b) => a.start - b.start);
}

function stamp(t) {
  const ms = Math.max(0, Math.round(t * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms % 1000, 3)}`;
}

function toSrt(cues) {
  return cues.filter((c) => c.end > 0)
    .map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}\n`).join('\n');
}

// t' = scale·t + offset
const retime = (cues, offset, scale = 1) =>
  cues.map((c) => ({ ...c, start: c.start * scale + offset, end: c.end * scale + offset }));

module.exports = { parseSubtitles, toSrt, retime };
