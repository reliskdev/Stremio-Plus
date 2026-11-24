// Subtitle cues + speech mask → the transform t' = scale·t + offset that puts the cues on the dialogue
// (the ffsubsync idea). Both become signals on a 10 ms grid; for each common framerate ratio an FFT
// cross-correlation scores every offset within ±MAX_OFFSET at once.
//
// Speech signal: inside decoded windows, 1 − p where speech, −p where not (p = the window's speech fraction, so a
// random placement scores ~0); outside the windows 0 (unknown). Cue signal: 1 while a cue is on screen.
const { fft, nextPow2 } = require('./fft');

const STEP = 0.01;
const MAX_OFFSET = 90; // seconds
const SCALES = [
  { scale: 1, label: null },
  { scale: 25 / 23.976, label: '23.976 → 25 fps' },
  { scale: 23.976 / 25, label: '25 → 23.976 fps' },
  { scale: 24 / 23.976, label: '23.976 → 24 fps' },
  { scale: 23.976 / 24, label: '24 → 23.976 fps' },
  { scale: 25 / 24, label: '24 → 25 fps' },
  { scale: 24 / 25, label: '25 → 24 fps' },
];
const SCALE_BIAS = 1.05; // a framerate change must beat "no change" by 5 % to be believed
const SEPARATION = 1; // seconds: the runner-up peak must be at least this far from the best one

function speechSignal(speech, n) {
  const s = new Float64Array(n);
  const known = new Uint8Array(n);
  for (const w of speech.windows) {
    const a = Math.max(0, Math.round(w.start / STEP));
    const b = Math.min(n, Math.round(w.end / STEP));
    if (b <= a) continue;
    let on = 0;
    for (const [x, y] of w.speech) {
      const i = Math.max(a, Math.round(x / STEP));
      const j = Math.min(b, Math.round(y / STEP));
      if (j > i) { s.fill(1, i, j); on += j - i; }
    }
    const p = on / (b - a);
    for (let i = a; i < b; i++) s[i] -= p;
    known.fill(1, a, b);
  }
  return { s, known };
}

function cueSignal(cues, scale, n) {
  const c = new Float64Array(n);
  for (const q of cues) {
    const i = Math.max(0, Math.round((q.start * scale) / STEP));
    const j = Math.min(n, Math.round((q.end * scale) / STEP));
    if (j > i) c.fill(1, i, j);
  }
  return c;
}

// Fraction of the cue time that falls inside the decoded windows and lands on speech.
function coverage(speech, cues, offset, scale) {
  let inWindows = 0, onSpeech = 0;
  for (const q of cues) {
    const a = q.start * scale + offset;
    const b = q.end * scale + offset;
    for (const w of speech.windows) {
      const x = Math.max(a, w.start), y = Math.min(b, w.end);
      if (y <= x) continue;
      inWindows += y - x;
      for (const [s, e] of w.speech) {
        const u = Math.max(x, s), v = Math.min(y, e);
        if (v > u) onSpeech += v - u;
      }
    }
  }
  return { inWindows, onSpeech, score: inWindows ? onSpeech / inWindows : 0 };
}

function align(cues, speech, { maxOffset = MAX_OFFSET } = {}) {
  if (!cues.length || !speech.windows.length) return { ok: false, reason: 'nothing to align' };
  const L = Math.round(maxOffset / STEP);
  const lastWindow = Math.max(...speech.windows.map((w) => w.end));
  const n = nextPow2(Math.ceil(lastWindow / STEP) + 2 * L + 1);

  const { s } = speechSignal(speech, n);
  const sRe = s, sIm = new Float64Array(n);
  fft(sRe, sIm);

  const results = SCALES.map(({ scale, label }) => {
    const cRe = cueSignal(cues, scale, n);
    const cIm = new Float64Array(n);
    fft(cRe, cIm);
    // S · conj(C) → corr[b] = Σ s[i] · c[i − b]
    const re = new Float64Array(n), im = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      re[k] = sRe[k] * cRe[k] + sIm[k] * cIm[k];
      im[k] = sIm[k] * cRe[k] - sRe[k] * cIm[k];
    }
    fft(re, im, true);
    const at = (lag) => re[(lag + n) % n];
    let best = -Infinity, bestLag = 0;
    for (let lag = -L; lag <= L; lag++) if (at(lag) > best) { best = at(lag); bestLag = lag; }
    let second = -Infinity;
    const sep = Math.round(SEPARATION / STEP);
    for (let lag = -L; lag <= L; lag++) {
      if (Math.abs(lag - bestLag) > sep && at(lag) > second) second = at(lag);
    }
    return { scale, label, offset: bestLag * STEP, corr: best, second };
  });

  const base = results[0];
  let pick = base;
  for (const r of results.slice(1)) if (r.corr > pick.corr * (pick === base ? SCALE_BIAS : 1)) pick = r;

  const cov = coverage(speech, cues, pick.offset, pick.scale);
  const before = coverage(speech, cues, 0, 1);
  const margin = pick.corr > 0 ? (pick.corr - Math.max(0, pick.second)) / pick.corr : 0;
  const reasons = [];
  if (cov.inWindows < 20) reasons.push('too little subtitle text in the sampled audio');
  if (pick.corr <= 0 || margin < 0.12) reasons.push('no clear match');
  if (cov.score < 0.35) reasons.push('subtitles barely line up with speech');
  return {
    ok: true,
    offset: +pick.offset.toFixed(2),
    scale: pick.scale,
    scaleLabel: pick.label,
    score: +cov.score.toFixed(3),
    scoreBefore: +before.score.toFixed(3),
    margin: +margin.toFixed(3),
    confident: reasons.length === 0,
    reason: reasons[0] || null,
    cueSecondsSampled: +cov.inWindows.toFixed(1),
    candidates: results.map((r) => ({ scale: +r.scale.toFixed(5), offset: +r.offset.toFixed(2), corr: +r.corr.toFixed(1) })),
  };
}

module.exports = { align, coverage, SCALES, MAX_OFFSET };
