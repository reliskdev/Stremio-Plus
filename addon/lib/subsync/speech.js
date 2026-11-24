// Stream URL → speech mask. Decodes a few audio windows (whole file when short), runs the VAD on each and returns
// speech runs in seconds on a 10 ms grid. Cached on disk per stream (infoHash/fileIdx for Stremio's streaming server,
// else a hash of the URL); concurrent requests for the same stream share one decode.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { probeDuration, decodeWindow } = require('./ffmpeg');
const { detectSpeech, STEP } = require('./vad');

const DIR = path.join(__dirname, '..', '..', 'data', 'subsync');
const VERSION = 1; // bump when the VAD changes, so stale masks are recomputed
const WINDOW = 180; // seconds per window
const SPOTS = [0.1, 0.45, 0.8];

function streamKey(url) {
  try {
    const u = new URL(url);
    const m = /^\/([0-9a-f]{40})\/(-?\d+)/i.exec(u.pathname);
    if (m && /^(127\.0\.0\.1|localhost)$/.test(u.hostname)) return `${m[1].toLowerCase()}-${m[2]}`;
  } catch { /* fall through */ }
  return crypto.createHash('sha1').update(url).digest('hex');
}

function planWindows(duration) {
  if (duration <= WINDOW * SPOTS.length + 60) return [{ start: 0, end: duration }];
  return SPOTS.map((p) => {
    const start = Math.max(0, Math.min(duration - WINDOW, p * duration - WINDOW / 2));
    return { start, end: start + WINDOW };
  });
}

// Uint8Array mask (10 ms) → [[start, end], …] seconds, offset by the window start.
function toRuns(mask, offset) {
  const runs = [];
  for (let i = 0; i < mask.length;) {
    if (!mask[i]) { i++; continue; }
    let j = i;
    while (j < mask.length && mask[j]) j++;
    runs.push([+(offset + i * STEP).toFixed(2), +(offset + j * STEP).toFixed(2)]);
    i = j;
  }
  return runs;
}

const r2 = (n) => +n.toFixed(2);

async function computeSpeech(url, { vad } = {}) {
  const t0 = Date.now();
  const duration = await probeDuration(url);
  const windows = await Promise.all(planWindows(duration).map(async (w) => {
    const samples = await decodeWindow(url, w.start, w.end - w.start);
    const end = w.start + samples.length / 16000; // short read near EOF / failed range
    return { start: r2(w.start), end: r2(end), speech: toRuns(detectSpeech(samples, vad), w.start) };
  }));
  return { version: VERSION, step: STEP, duration: r2(duration), windows, ms: Date.now() - t0 };
}

const inflight = new Map();

async function getSpeech(url) {
  const key = streamKey(url);
  const file = path.join(DIR, `${key}.speech.json`);
  try {
    const cached = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (cached.version === VERSION) return { key, ...cached, cached: true };
  } catch { /* not cached */ }
  if (!inflight.has(key)) {
    inflight.set(key, computeSpeech(url).then((res) => {
      fs.mkdirSync(DIR, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(res));
      return res;
    }).finally(() => inflight.delete(key)));
  }
  return { key, ...(await inflight.get(key)), cached: false };
}

module.exports = { getSpeech, computeSpeech, streamKey, planWindows, DIR };
