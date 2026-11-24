// Voice activity detection in plain JS (no native modules or models, so it runs on every OS the server does).
// 25 ms frames every 10 ms. Per frame: speech-band (300–3400 Hz) energy, how much of the energy sits in that band,
// spectral flatness (noise and dense music are flat, voiced speech is peaky) and syllabic modulation (speech energy
// rises and falls ~4 times a second; sustained music and hum don't). Thresholds adapt to each window's own noise
// floor. Output: Uint8Array, 1 = speech, one entry per 10 ms.
const { fft } = require('./fft');

const RATE = 16000;
const HOP = 160; // 10 ms
const WIN = 400; // 25 ms
const N = 512;

const HANN = Float64Array.from({ length: WIN }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (WIN - 1)));
const BIN_LO = Math.round((300 * N) / RATE);
const BIN_HI = Math.round((3400 * N) / RATE);

const DEFAULTS = {
  floorPct: 0.15, // noise floor = this percentile of band energy
  minDb: 7, // energy must clear the floor by at least this…
  rangeFrac: 0.3, // …or this fraction of the floor→peak range, whichever is more
  minRatio: 0.3, // share of energy in the speech band
  maxFlat: 0.55, // spectral flatness ceiling
  minMod: 3.2, // dB standard deviation of band energy over ±150 ms (the strongest cue against music / FX)
  minSpeech: 12, // drop speech runs shorter than 120 ms
  maxGap: 25, // bridge pauses up to 250 ms
};

function percentile(arr, p) {
  const s = Float64Array.from(arr).sort();
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * s.length)))];
}

function features(samples) {
  const frames = Math.max(0, Math.floor((samples.length - WIN) / HOP) + 1);
  const band = new Float64Array(frames);
  const ratio = new Float64Array(frames);
  const flat = new Float64Array(frames);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let f = 0; f < frames; f++) {
    re.fill(0); im.fill(0);
    const off = f * HOP;
    for (let i = 0; i < WIN; i++) re[i] = (samples[off + i] / 32768) * HANN[i];
    fft(re, im);
    let total = 1e-12, inBand = 1e-12, logSum = 0;
    for (let k = 1; k < N / 2; k++) {
      const p = re[k] * re[k] + im[k] * im[k] + 1e-12;
      total += p;
      if (k >= BIN_LO && k <= BIN_HI) { inBand += p; logSum += Math.log(p); }
    }
    const nb = BIN_HI - BIN_LO + 1;
    band[f] = 10 * Math.log10(inBand);
    ratio[f] = inBand / total;
    flat[f] = Math.exp(logSum / nb) / (inBand / nb);
  }
  // Syllabic modulation: std of band energy over ±15 frames.
  const mod = new Float64Array(frames);
  const R = 15;
  let s = 0, s2 = 0, lo = 0, hi = -1;
  for (let f = 0; f < frames; f++) {
    while (hi < Math.min(frames - 1, f + R)) { hi++; s += band[hi]; s2 += band[hi] * band[hi]; }
    while (lo < f - R) { s -= band[lo]; s2 -= band[lo] * band[lo]; lo++; }
    const n = hi - lo + 1;
    mod[f] = Math.sqrt(Math.max(0, s2 / n - (s / n) ** 2));
  }
  return { frames, band, ratio, flat, mod };
}

function smooth(mask, minSpeech, maxGap) {
  const n = mask.length;
  // Bridge short pauses, then drop short blips.
  let i = 0;
  while (i < n) {
    if (mask[i]) { i++; continue; }
    let j = i;
    while (j < n && !mask[j]) j++;
    if (i > 0 && j < n && j - i <= maxGap) mask.fill(1, i, j);
    i = j;
  }
  i = 0;
  while (i < n) {
    if (!mask[i]) { i++; continue; }
    let j = i;
    while (j < n && mask[j]) j++;
    if (j - i < minSpeech) mask.fill(0, i, j);
    i = j;
  }
  return mask;
}

function detectSpeech(samples, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const { frames, band, ratio, flat, mod } = features(samples);
  const mask = new Uint8Array(frames);
  if (!frames) return mask;
  const floor = percentile(band, o.floorPct);
  const peak = percentile(band, 0.98);
  const th = floor + Math.max(o.minDb, o.rangeFrac * (peak - floor));
  for (let f = 0; f < frames; f++) {
    mask[f] = band[f] > th && ratio[f] > o.minRatio && flat[f] < o.maxFlat && mod[f] > o.minMod ? 1 : 0;
  }
  return smooth(mask, o.minSpeech, o.maxGap);
}

module.exports = { detectSpeech, features, DEFAULTS, STEP: HOP / RATE };
