# 008 · Player upgrades and auto-synced subtitles (research notes, 2026-11-24)

Written before a context reset so the next session starts from what is known. Two pieces of work:
A. player upgrades (do first), B. "pick a good subtitle and sync it to the dialogue" (bigger, research-heavy).

## What we know about the player

- In the desktop shell, playback is mpv inside Stremio's process (`Contents/MacOS/libmpv.2.dylib`, 54 exported
  `mpv_*` symbols). The web UI drives it through the shell transport, in
  `web/node_modules/@stremio/stremio-video/src/ShellVideo/ShellVideo.js`:
  `ipc.send('mpv-set-prop', [name, value])`, `ipc.send('mpv-command', [...])`, `ipc.send('mpv-observe-prop', name)`.
  Stock uses it for `hwdec`, `aid`, `sid`, `sub-scale`, `sub-pos`, `speed`, `audio-spdif`, `keepaspect`, `panscan`…
- So most player upgrades can be UI-only: send more properties from a mod. **Unverified:** whether the macOS shell
  forwards any property name or only a whitelist, which mpv version / `vo` it runs (gpu vs gpu-next), and whether
  file-path properties (`glsl-shaders`) can point outside the bundle. Probe first: observe `mpv-version`,
  `current-vo`, `hwdec-current`, set a harmless property (`deband`) and read it back.
- Fallback if the bridge is whitelisted: the bundled chrome dylib runs in-process and libmpv exports its API; capture
  the handle (interpose `mpv_create` / `mpv_initialize` from a launch-time library) and call `mpv_set_property_string`.
- Windows' shell (stremio-shell-ng) speaks the same `mpv-*` IPC, so UI-side work should carry over.

## A. Player upgrade candidates (mpv properties)

| Feature | mpv | Notes |
|---|---|---|
| Better scaling | `scale=ewa_lanczossharp`, `cscale`, `dscale=mitchell`, or `profile=high-quality` | cheap, safe default candidate |
| Upscaling shaders | `glsl-shaders` (FSRCNNX for live action, Anime4K for anime) | ship shader files in Stremio+ (check licences); GPU cost; toggle |
| Smooth motion | `interpolation=yes`, `video-sync=display-resample`, `tscale=oversample` | judder fix for 24p on 60 Hz |
| Debanding | `deband=yes` | low cost |
| HDR → SDR | `tone-mapping=bt.2446a` (or `spline`), `hdr-compute-peak=yes` | only when the source is HDR |
| Night mode | `af=lavfi=[dynaudnorm=f=150:g=15]` | compresses loud/quiet |
| Dialogue boost | `af=lavfi=[pan=stereo|FL=FC+0.6*FL+0.3*BL|FR=FC+0.6*FR+0.3*BR]` | 5.1 sources; centre channel up |
| Subtitle nudge | `sub-delay` ± with keys, shown in the player | also the hook for B |
| Dual subtitles | `secondary-sid` | language learning |

UI: a "Player" group in Settings → Mods (`src/mods/settings.ts`, `src/routes/Settings/Mods/Mods.tsx`), applied when
playback starts (hook next to where ShellVideo is used, or listen for the player route). Respect DESIGN.md.

## B. Auto-picked, auto-synced subtitles: theory

Goal: when a stream starts, choose the best subtitle for the user's language from what Stremio's subtitle addons
offer (OpenSubtitles v3 etc.), align it to the actual dialogue, and select it; no manual delay fiddling.
("Open captions" read as OpenSubtitles-style community captions. If burned-in captions were meant: those can be
detected from sampled frames (OCR / text-region detection) to avoid stacking a second subtitle, or used as a timing
reference. Not planned.)

1. **Candidates.** Stremio already fetches subtitle lists per stream (the player's subtitle menu). Stock passes the
   OpenSubtitles movie hash (`/opensubHash` on the streaming server) so hash-matched subs come first; those are
   usually already in sync. Gather up to ~8 candidates in the chosen language: hash matches, then release-name
   similarity to the stream filename (e.g. WEB-DL vs BluRay, release group), then download count. Note HI/SDH
   (`[music]`, speaker labels) and prefer or avoid it per a user setting ("CC" vs plain).
2. **Where the dialogue is.** Ask the Stremio+ server to analyse the stream: it gets the local stream URL
   (`http://127.0.0.1:11470/<infoHash>/<fileIdx>` or the direct URL) and runs ffmpeg (Stremio bundles one in
   `Contents/MacOS/ffmpeg`) to decode only audio as 16 kHz mono PCM over HTTP range requests, sampling a few windows
   (e.g. 3 × 3 min at 10 %, 45 %, 80 %) rather than the whole file, so torrents don't need full download. Run voice
   activity detection (WebRTC VAD port or Silero VAD via onnxruntime-node; an energy + spectral-flatness detector is a
   cheap first pass) → a speech mask at 10 ms resolution.
3. **Alignment.** Turn each candidate into a cue mask on the same grid. Find the transform `t' = a·t + b` that maximises
   overlap between speech and cues: `b` by FFT cross-correlation, `a` from the usual framerate ratios (1,
   25/23.976, 23.976/25, 24/23.976, 25/24) or from comparing offsets found in early vs late windows. That is the
   ffsubsync approach. For cuts that differ (ad breaks, extended editions), alass's split-aware DP is the next step.
4. **Choosing.** Score = best-alignment overlap (fraction of cue time that lands on speech, penalising speech without
   cues), plus a confidence margin over the second-best offset. The highest-scoring candidate wins; that also catches
   subtitles for the wrong cut or wrong episode. Below a threshold, fall back to stock behaviour and say so.
5. **Applying.** Pure offset: `mpv-set-prop sub-delay`. Offset + scale: the server serves a retimed SRT/VTT
   (`/api/subs/synced/<id>.srt`) and the UI loads it (`mpv-command sub-add <url> select`), or our addon exposes a
   `subtitles` resource so "Stremio+ synced" shows in the normal subtitle menu. Show a small "Synced subtitles
   (+1.2 s)" note with an undo.
6. **Cache** results per (videoHash or infoHash/fileIdx, subtitle id) so a rewatch is instant.

Risks / unknowns: audio decode speed on a slow torrent (start with the first window, refine later); music-heavy
scenes fool energy VAD (use a proper VAD); forced-narrative-only subs have little cue coverage (detect by low cue
density and don't score them as "bad"); licensing of any bundled VAD model.

Suggested milestones: (1) server endpoint: stream URL → speech mask (+ debug PNG timeline); (2) offline aligner over
SRT + mask with a test fixture (a known out-of-sync sub); (3) wire into the player for the selected sub only (manual
"Sync subtitles" button); (4) automatic candidate ranking and selection; (5) addon `subtitles` resource.
