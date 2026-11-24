// Subtitle sync service used by the /api/subsync/* routes: fetch a subtitle, align it to the stream's speech,
// cache the result per (stream, subtitle URL) and keep a retimed SRT around when the framerate differs.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const speech = require('./speech');
const { getSpeech, streamKey, readCache, writeCache, prune } = speech;
const { align } = require('./align');
const { parseSubtitles, retime, toSrt } = require('./subs');

const ALIGN_VERSION = 1;
const MAX_SUB_BYTES = 5 * 1024 * 1024;

const isHttp = (u) => { try { return /^https?:$/.test(new URL(u).protocol); } catch { return false; } };

async function fetchSubtitle(url) {
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`subtitle download failed (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_SUB_BYTES) throw new Error('subtitle file too large');
  const cues = parseSubtitles(buf);
  if (!cues.length) throw new Error('no cues found in the subtitle file (only SRT / WebVTT are supported)');
  return cues;
}

const syncId = (url, sub, videoKey) => `${streamKey(url, videoKey)}-${crypto.createHash('sha1').update(sub).digest('hex').slice(0, 16)}`;
const resultFile = (id) => path.join(speech.DIR, `${id}.align.json`);
const retimedFile = (id) => path.join(speech.DIR, `${id}.srt`);

const inflight = new Map();

async function syncSubtitle(url, sub, videoKey) {
  const id = syncId(url, sub, videoKey);
  try {
    const cached = JSON.parse(readCache(resultFile(id)));
    if (cached.version === ALIGN_VERSION) {
      if (cached.retimed) readCache(retimedFile(id)); // keep the SRT as fresh as its result; throws if pruned
      return { ...cached, cached: true };
    }
  } catch { /* not cached */ }
  if (!inflight.has(id)) {
    inflight.set(id, (async () => {
      const [cues, speech] = await Promise.all([fetchSubtitle(sub), getSpeech(url, videoKey)]);
      const t0 = Date.now();
      const r = align(cues, speech);
      const result = { version: ALIGN_VERSION, id, ...r, alignMs: Date.now() - t0, speechMs: speech.ms };
      if (r.ok && r.confident && r.scale !== 1) {
        writeCache(retimedFile(id), toSrt(retime(cues, r.offset, r.scale)));
        result.retimed = true;
      }
      writeCache(resultFile(id), JSON.stringify(result));
      return result;
    })().finally(() => inflight.delete(id)));
  }
  return { ...(await inflight.get(id)), cached: false };
}

function readRetimed(id) {
  if (!/^[\w-]+$/.test(id)) return null;
  try { return fs.readFileSync(retimedFile(id), 'utf8'); } catch { return null; }
}

module.exports = { syncSubtitle, readRetimed, fetchSubtitle, isHttp, getSpeech, prune };
