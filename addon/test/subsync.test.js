// node --test test/  (from addon/)
// Fixture: speech mask from the real pipeline (ffmpeg windows + VAD) over Tears of Steel (Blender Foundation,
// CC-BY 3.0, tears_of_steel_720p.mov) and its official English SRT. Shifted / rescaled copies of the SRT must be
// mapped back onto the original timing.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { align } = require('../lib/subsync/align');
const { parseSubtitles, retime, toSrt } = require('../lib/subsync/subs');

const FIX = path.join(__dirname, 'fixtures');
const speech = JSON.parse(fs.readFileSync(path.join(FIX, 'tears-of-steel.speech.json'), 'utf8'));
const cues = parseSubtitles(fs.readFileSync(path.join(FIX, 'tears-of-steel.en.srt')));
const base = align(cues, speech);

test('original subtitle is already in sync', () => {
  assert.equal(base.scale, 1);
  assert.ok(Math.abs(base.offset) <= 0.3, `offset ${base.offset}`);
  assert.ok(base.confident);
});

// The retimed file maps original time t to s·t + o; the aligner must find the inverse.
for (const [o, s] of [[3.7, 1], [-12, 1], [47.25, 1], [2, 25 / 23.976], [-1.5, 23.976 / 25], [0.8, 24 / 25]]) {
  test(`recovers shift ${o} s, scale ${s.toFixed(4)}`, () => {
    const r = align(retime(cues, o, s), speech);
    assert.ok(r.confident, r.reason);
    assert.ok(Math.abs(r.scale * s - 1) < 1e-6, `scale ${r.scale}`);
    // Composite transform back to the original: r.scale·(s·t + o) + r.offset should equal t + base.offset.
    const residual = r.scale * o + r.offset - base.offset;
    assert.ok(Math.abs(residual) <= 0.1, `residual ${residual.toFixed(3)} s (offset ${r.offset})`);
    assert.ok(r.score > r.scoreBefore);
  });
}

test('scrambled subtitle is not trusted', () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let t = 5;
  const fake = cues.map((c) => {
    t += 2 + rnd() * 15;
    const q = { ...c, start: t, end: t + (c.end - c.start) };
    t = q.end;
    return q;
  });
  const r = align(fake, speech);
  assert.equal(r.confident, false);
});

test('SRT round trip', () => {
  const again = parseSubtitles(toSrt(retime(cues, 1.234, 1)));
  assert.equal(again.length, cues.length);
  assert.ok(Math.abs(again[10].start - cues[10].start - 1.234) < 0.002);
  const vtt = parseSubtitles('WEBVTT\n\n00:01.500 --> 00:03.000\nHi\n\n1:00:00.000 --> 1:00:01.000 align:start\nYo\n');
  assert.deepEqual(vtt.map((c) => [c.start, c.end]), [[1.5, 3], [3600, 3601]]);
});
