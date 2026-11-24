# 046 · Sync subtitles to the dialogue

- **Date:** 2026-11-24
- **Status:** done
- **Brief:** "2 · Auto-picked, auto-synced subtitles (after the player task)
  Build milestone 1–3 of plan B in plans/008-player-and-subtitle-sync.md (Stremio+ repo, read CLAUDE.md and
  docs/STATE.md first). Plan before coding and show me the plan.
  1) Server endpoint in addon/server.js: given a stream URL, decode short audio windows with Stremio's bundled ffmpeg
  (16 kHz mono), run voice activity detection, return a speech mask at 10 ms; add a debug PNG timeline.
  2) An aligner module: SRT/VTT + speech mask → best offset and framerate scale with a score and confidence margin.
  Build a test fixture from a real episode and a deliberately shifted subtitle; it must recover the shift.
  3) Wire a "Sync subtitles" action into the player for the currently selected subtitle: apply via sub-delay (offset
  only) or a retimed subtitle served by our server (scale), show "Synced (+x.x s)" with undo, cache per video +
  subtitle.
  Leave automatic candidate ranking (milestone 4) for a follow-up and note it in docs."

## Plan
1. **Speech mask** (`addon/lib/subsync/speech.js`, `vad.js`, `ffmpeg.js`): find ffmpeg/ffprobe (Stremio bundle per
   OS, else PATH). ffprobe the duration, then decode 3 windows of 3 min (at 10 %, 45 %, 80 %) as 16 kHz mono s16le with
   `-ss` input seeking, so a torrent only fetches those ranges. Windows decode in parallel; the first one comes back
   first. VAD in pure JS (no native deps, ships on every OS): 30 ms frames / 10 ms hop, speech-band (300–3400 Hz)
   energy ratio + spectral flatness + adaptive noise floor, then hangover smoothing. Mask cached in
   `addon/data/subsync/` by a key from the URL (infoHash/fileIdx for streaming-server URLs).
   Endpoints: `GET /api/subsync/speech?url=` → `{ step: 0.01, duration, windows: [{ start, end, mask }] }` (mask
   run-length encoded), `GET /api/subsync/speech.png?url=&sub=` → debug timeline (one strip per window: speech,
   and the subtitle's cues before/after alignment when `sub` is given; rendered with sharp, already a dependency).
2. **Aligner** (`addon/lib/subsync/align.js` + `subs.js` parser for SRT/VTT): cues → mask on the same 10 ms grid;
   speech scored +1, silence −0.5, outside the decoded windows 0. For each scale in {1, 25/23.976, 23.976/25,
   24/23.976, 23.976/24, 25/24, 24/25}, FFT cross-correlation over ±90 s gives the best offset. Result:
   `{ offset, scale, score, margin, confident }`; score = fraction of cue time on speech after alignment, margin =
   best peak vs the best peak more than 1 s away. Retimer writes the transformed SRT.
3. **Fixture + test** (`addon/test/subsync.test.js`, `node --test`): Tears of Steel (Blender, CC-BY, 12 min, official
   English SRT) decoded once; the stored fixture is the speech mask + SRT (small, no video). Cases: original (≈0),
   +3.7 s shift, −12 s shift, 25/23.976 scale + 2 s shift. Must recover each to ±0.1 s and the right scale.
4. **Sync endpoint**: `POST /api/subsync/align { url, sub }` → fetch the subtitle server-side (no CORS), get/compute
   the mask, align; cache the result per (stream key, subtitle URL). If the scale isn't 1, the response includes
   `retimed: /api/subsync/retimed/<id>.srt`.
5. **Player** (`web/src/mods/player/SubSync.tsx`, small `// [mods]` hook in `SubtitlesMenu`): a "Sync subtitles"
   pill under the delay stepper for the selected addon subtitle. States: Sync subtitles → Syncing… → "Synced
   (+1.2 s)" with Undo, or "Couldn't sync: not enough dialogue" when not confident. Offset only: the stock delay
   (`onExtraSubtitlesDelayChanged`, so it's remembered per stream like a manual nudge). Scale: add the retimed track
   (`addExtraSubtitlesTracks`) and select it, delay 0. Undo restores the previous track and delay. Client remembers
   the result per (video, subtitle) in localStorage so the pill shows "Synced" on a rewatch.
6. Verify: unit test passes, curl the endpoints with a real torrent through the streaming server, look at the PNG,
   then a real run in patched Stremio with a shifted subtitle (dev-eval + screenshot of the menu). Docs: STATE,
   plan 008 (milestones 1–3 done, 4–5 open), INDEX.

## Assumptions
- Addon (external) subtitles only. Embedded tracks are usually in sync with their own file, and extracting them means
  reading the whole file; the pill hides for embedded tracks.
- Pure-JS VAD first (cross-platform, no model licence, no 50 MB onnxruntime). Silero is the upgrade path if the PNG
  shows music fooling it.
- "Real episode" fixture: Tears of Steel, since its video and subtitles are freely licensed and can live in the repo
  (as a mask, not audio). A copyrighted episode can't be committed.
- Offsets beyond ±90 s (different cut, ad breaks) are out of scope; they'll score low and say so.
- The action sits in the subtitles menu (where the delay lives) rather than as a new control-bar button.
- The user approved the plan as written ("go").

## Done
- `addon/lib/subsync/`: `ffmpeg.js` (finds Stremio's bundled ffmpeg/ffprobe per OS, else PATH; network protocols
  only; input-seeked 16 kHz mono windows), `vad.js` (pure-JS VAD: speech-band energy over an adaptive floor, band
  ratio, spectral flatness, syllabic modulation; 10 ms mask; tuned on Tears of Steel), `speech.js` (3 × 3 min windows
  at 10/45/80 %, whole file under 10 min; disk cache in `addon/data/subsync/` keyed by infoHash-fileIdx or URL hash;
  shared in-flight decode), `subs.js` (SRT/VTT parse, SRT write, retime), `fft.js`, `align.js` (FFT
  cross-correlation over ±90 s for 7 framerate ratios; score, margin, confident + reason), `timeline.js` (debug PNG
  via SVG → sharp), `index.js` (fetch sub, align, cache per stream + subtitle, write retimed SRT when scale ≠ 1).
- `addon/server.js`: `GET /api/subsync/speech?url=`, `/api/subsync/speech.png?url=&sub=`,
  `/api/subsync/align?url=&sub=`, `/api/subsync/retimed/:id.srt`. The first three answer loopback callers only.
- `addon/test/subsync.test.js` + `fixtures/` (Tears of Steel speech mask from the real pipeline + official SRT,
  CC-BY): original, +3.7 s, −12 s, +47.25 s, 25/23.976 + 2 s, 23.976/25 − 1.5 s, 24/25 + 0.8 s, scrambled subtitle
  rejected, SRT/VTT round trip. `npm test` in addon/.
- web: `src/mods/player/syncApi.ts` (client + per-device records in `mods:subsync`), `SubSync.tsx` (`useSubSync`
  at Player level, resolves the stream URL with stremio-video's own `convertStream`; `<SubSync>` pill), `SubSync.less`.
  `Player.js` / `SubtitlesMenu.js`: tagged `// [mods]` hooks (pill under DELAY).
  Offset only → stock extra-subtitle delay (persisted in stream state like a manual nudge). Framerate change → retimed
  track "<lang> · Stremio+" added and selected, delay 0; re-offered on later visits. Undo restores track + delay and
  drops the record. Failure → "Couldn't sync: <reason>" under the pill + toast; nothing changes.
- Correctness: speech score 0.53 for the real subtitle vs 0.24 to 0.30 for 8 scrambled ones (threshold 0.35).

## Verification
- `npm test` (addon): 9/9 pass. Web typecheck: no errors in touched files. `bin/stremio-plus build` compiled.
- curl: Tears of Steel over https (remote .mov, 3 windows decoded in ~8 to 10 s cold): 25→23.976 fps + 4.3 s
  sub → offset −4.01, scale 0.959, retimed SRT's first cue 23.114 s vs original 23.000. Sintel torrent through
  Stremio's streaming server (`127.0.0.1:11470/<hash>/5`): original sub −0.39 s, +6 s copy → −6.39 s (score 0.38).
  Error paths: 404 sub, non-media URL, LAN-IP caller (403), path traversal on retimed (404).
- PNG timelines looked at (ToS, Sintel): aligned cues sit on speech clusters.
- Real patched Stremio (dev-eval + window screenshots): ToS playing with two stream subtitles. +3 s English →
  "Synced (−2.9 s)", Delay stepper −2.89s, toast. 25 fps Spanish → retimed "Español · Stremio+" track selected,
  "Synced (−4.0 s)" + "Retimed 25 → 23.976 fps", line on screen at 0:29 matched the original timing. Undo → original
  track, delay 0, record gone. `test player` screenshot unchanged.
- Not verified: a cold torrent (Sintel was already downloaded; decode speed on a slow swarm unknown); a real
  catalog title with OpenSubtitles (delay persistence via stock stream state: the ad-hoc test stream has no meta, so
  stock keeps no stream state for it); Windows/Linux ffmpeg paths.

## Follow-ups
- Milestone 4 (plans/008 B): automatic candidate ranking and selection across the addon subtitles.
- Milestone 5: addon `subtitles` resource so synced files show in stock Stremio too.
- VAD counts sustained music with vocals / credits as speech (visible in the Sintel PNG); Silero VAD is the upgrade.
- Two toasts on a framerate sync (ours + stock "Subtitles loaded").
- Embedded subtitles aren't offered (pill hidden). Different cuts / ad breaks (split-aware alignment, alass-style).
- Offset-only syncs on streams without stream state (no meta) aren't re-applied on reopen; the pill shows
  "Sync subtitles" again and a resync is instant from the server cache.
