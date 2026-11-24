// Stream URL → speech mask. Decodes a few audio windows (whole file when short), runs the VAD on each and returns
// speech runs in seconds on a 10 ms grid. Cached on disk per stream (a caller-supplied video key such as Stremio's
// videoHash, else infoHash/fileIdx for Stremio's streaming server, else a hash of the URL); concurrent requests for
// the same stream share one decode. Old cache files are pruned (see prune()).
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { probeDuration, decodeWindow } = require('./ffmpeg');
const { detectSpeech, STEP } = require('./vad');

let DIR = path.join(__dirname, '..', '..', 'data', 'subsync');
const VERSION = 1; // bump when the VAD changes, so stale masks are recomputed
const WINDOW = 180; // seconds per window
const SPOTS = [0.1, 0.45, 0.8];

const MAX_AGE = 90 * 24 * 3600 * 1000;
const MAX_FILES = 600;

// A key the client derived from the video itself (videoHash + size, or filename + size). Debrid and other
// direct links often carry a session token, so the URL alone would miss the cache on every visit.
const validKey = (k) => typeof k === 'string' && /^[\w.:@+-]{4,200}$/.test(k);

function streamKey(url, videoKey) {
  if (validKey(videoKey)) return 'v' + crypto.createHash('sha1').update(videoKey).digest('hex');
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

const isStreamingServer = (url) => {
  try { return /^(127\.0\.0\.1|localhost)$/.test(new URL(url).hostname); } catch { return false; }
};

async function computeSpeech(url, { vad } = {}) {
  const t0 = Date.now();
  const duration = await probeDuration(url);
  const one = async (w) => {
    const samples = await decodeWindow(url, w.start, w.end - w.start);
    const end = w.start + samples.length / 16000; // short read near EOF / failed range
    return { start: r2(w.start), end: r2(end), speech: toRuns(detectSpeech(samples, vad), w.start) };
  };
  const plan = planWindows(duration);
  let windows;
  if (isStreamingServer(url)) {
    // Torrent (or proxied) stream: one window at a time, so the swarm isn't asked for three far-apart regions at
    // once while the player is still buffering.
    windows = [];
    for (const w of plan) windows.push(await one(w));
  } else {
    windows = await Promise.all(plan.map(one));
  }
  return { version: VERSION, step: STEP, duration: r2(duration), windows, ms: Date.now() - t0 };
}

const inflight = new Map();

// Read a cache file and mark it used (mtime), so pruning drops the least recently used first.
function readCache(file) {
  const text = fs.readFileSync(file, 'utf8');
  const now = new Date();
  try { fs.utimesSync(file, now, now); } catch { /* read-only: fine */ }
  return text;
}

function writeCache(file, text) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(file, text);
  schedulePrune();
}

// Drop cache files unused for MAX_AGE, then the oldest beyond MAX_FILES.
function prune() {
  let files;
  try { files = fs.readdirSync(DIR); } catch { return 0; }
  const now = Date.now();
  const entries = files.map((name) => {
    const file = path.join(DIR, name);
    try { return { file, at: fs.statSync(file).mtimeMs }; } catch { return null; }
  }).filter(Boolean).sort((a, b) => b.at - a.at);
  let removed = 0;
  entries.forEach((e, i) => {
    if (i >= MAX_FILES || now - e.at > MAX_AGE) {
      try { fs.rmSync(e.file); removed++; } catch { /* gone already */ }
    }
  });
  return removed;
}
let pruneTimer = null;
const schedulePrune = () => {
  if (!pruneTimer) pruneTimer = setTimeout(() => { pruneTimer = null; prune(); }, 5000).unref();
};

async function getSpeech(url, videoKey) {
  const key = streamKey(url, videoKey);
  const file = path.join(DIR, `${key}.speech.json`);
  try {
    const cached = JSON.parse(readCache(file));
    if (cached.version === VERSION) return { key, ...cached, cached: true };
  } catch { /* not cached */ }
  if (!inflight.has(key)) {
    inflight.set(key, computeSpeech(url).then((res) => {
      writeCache(file, JSON.stringify(res));
      return res;
    }).finally(() => inflight.delete(key)));
  }
  return { key, ...(await inflight.get(key)), cached: false };
}

// Tests point the cache at a temp folder.
const _withDir = (dir) => { DIR = dir; return module.exports; };

module.exports = { getSpeech, computeSpeech, streamKey, planWindows, prune, readCache, writeCache, _withDir, get DIR() { return DIR; } };
