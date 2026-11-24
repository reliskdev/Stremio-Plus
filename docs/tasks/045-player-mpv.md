# 045 · Player upgrades via mpv

- **Date:** 2026-11-24
- **Status:** done (smooth motion dropped, see below)
- **Brief:** "Upgrade the Stremio+ player using mpv properties. Read plans/008-player-and-subtitle-sync.md first (section
  "What we know about the player" and table A). Step 1: probe the shell bridge from the modded UI during real playback
  in patched Stremio: observe mpv-version, current-vo, hwdec-current; set `deband` and read it back; try one af and one
  glsl-shaders value. Record which properties the macOS shell forwards. If it whitelists, fall back to the bundled
  chrome dylib calling libmpv directly and note that. Step 2: add a "Player" group to Settings → Mods with toggles that
  work: better scaling (default on if cheap), smooth motion, debanding, night mode (dynaudnorm), dialogue boost for 5.1,
  HDR tone mapping when the source is HDR, and sub-delay nudge keys with an on-screen value. Apply them when playback
  starts and when toggled mid-play. Skip upscaling shaders unless step 1 shows glsl-shaders works with a file we ship
  (check shader licences). Verify by playing a real stream in patched Stremio and reading the properties back. Follow
  DESIGN.md for the settings UI."

## Plan
- Probe: dev-only eval channel in the chrome dylib (file-based, only when `addon/data/dev/` exists) to run JS in the
  real patched Stremio; start playback, send `mpv-observe-prop` / `mpv-set-prop` through the shell IPC, record replies.
- Fallback bridge in `shell/chrome.m`: interpose `mpv_create` / `mpv_terminate_destroy` to hold the shell's handle;
  `stremioPlusMpv` message handler with get / set (property allowlist) / audio-filter presets / reset to originals.
- `web/src/mods/player/`: settings → mpv properties, applied on video-ready and on toggle; sub-delay keys + toast.
- Settings → Mods → Player group (`settings.ts`, `Mods.tsx`).
- Verify with a real stream in patched Stremio, reading every property back through the bridge.

## Assumptions
- The probe uses the real patched Stremio, driven through a dev-only eval channel in the dylib (file-based, only when
  `addon/data/dev/` exists), since nothing else can run JS in the shell's WKWebView.
- "Real stream": Sintel (Blender, CC-BY) as a torrent through Stremio's streaming server (5.1 audio, 15 min), Jellyfin's
  public HDR10 test clip for HDR, and a local mkv muxed from Sintel + its English SRT for embedded subtitles.
- Toggles also live in the player's ⋯ menu: Settings unmounts the player, so "toggled mid-play" needs a control there.
- Defaults: sharper scaling on (measured free), HDR tone mapping on (only acts on HDR video on an SDR output), subtitle
  keys on; debanding, night mode, dialogue boost, anime upscaling off.
- Anime upscaling only applies to titles whose genres include Animation (or kitsu ids), with Anime4K's fast mode.
- Embedded subtitle delay isn't remembered per stream (stock only remembers addon-subtitle delay).

## Probe (step 1): what the macOS shell forwards
Shell 5.1.31, mpv v0.41.0-3-g512025b92, `current-vo=libmpv` (render API, OpenGL), `hwdec-current=videotoolbox`.
- The shell (Rust, wry + libmpv2) parses `mpv-set-prop` / `mpv-observe-prop` into a fixed enum. Strings in the binary:
  aid, vid, sid, volume, pause, speed, sub-delay, sub-scale, sub-pos, sub-color, sub-back-color, sub-border-color,
  sub-ass-override, keepaspect, panscan, hwdec, osc, tone-mapping, target-trc, target-prim, target-peak,
  video-output-levels, screenshot-tag-colorspace, input-default-bindings, input-vo-keyboard, icc-profile-auto,
  mpv-version, ffmpeg-version, track-list, video-params, time-pos, cache props. Commands: only `loadfile`, `sub-add`,
  `sub-remove`, `stop` ("unsupported MPV command").
- At runtime from the modded UI: observing `mpv-version` and `sub-delay` answered; `current-vo`, `hwdec-current`,
  `deband`, `af`, `glsl-shaders`, `scale` got no reply at all; setting `deband` / `af` / `glsl-shaders` did nothing.
  **Whitelisted.**
- Fallback built: the chrome dylib interposes `mpv_create` / `mpv_terminate_destroy` (dyld `__interpose`, works for the
  weak-loaded bundled copy and the DYLD-injected one) and calls `mpv_get/set_property_string` / `mpv_command_string`
  on the shell's handle. Through it: `deband` set and read back; `af` (dynaudnorm, pan) applied; `glsl-shaders` from a
  file in `<root>/shaders/` works (an invert test shader visibly inverted the picture); paths elsewhere are refused.
- Shell defaults found: scale/cscale spline36, dscale hermite, deband yes (1 pass, grain 32), video-sync audio. With an
  EDR screen the shell plays HDR as real HDR (target-trc pq, target-peak 1600, tone-mapping bt.2390); "SDR mode" sets
  target-* auto and tone-mapping auto. Our `af` survives into the next file unless cleared.
- **Smooth motion doesn't work in this host.** `interpolation` needs display sync; the render API never reports a display
  rate (display-fps null), and even with `display-fps-override` set to the screen's 120 Hz, mpv estimated the display
  at ~1350 Hz (the shell's render loop isn't vsync-paced). Over 5 s: `video-sync=audio` 1 delayed frame;
  `display-resample` 658 to 746 delayed and 122 to 589 mistimed frames. So no toggle; it would make playback worse.

## Done
- `shell/chrome.m`: mpv bridge (`stremioPlusMpv` handler, ops get / set / af / shaders / forget; property allowlist;
  audio filter and shader presets resolved in the dylib so the page never passes filter graphs or paths; `null`
  restores the value found before our first change). Dev eval channel (`addon/data/dev/eval.js` → `eval.out.json`).
- `cli/platform/darwin.js`: link flags for the interposed libmpv symbols (`-Wl,-U`, weak).
- `tools/dev-eval.js`: run JS in the real app (`node tools/dev-eval.js '<async body>'` or `-f file.js`).
- `shaders/anime4k/`: Anime4K v4.0.1 Mode A (Fast) chain, MIT, with LICENSE; packaged by `tools/package.js`.
  FSRCNNX (GPL-3.0) and RAVU (LGPL-3.0) left out.
- web: `src/mods/player/mpv.ts` (bridge client), `usePlayerTweaks.ts` (applies on load, on audio track change, on
  toggle; HDR re-checked every 5 s and backs off when the shell switches to EDR), `PlayerMenu.tsx/.less` (Player
  section in the ⋯ options menu). Settings → Mods → Player group (`Mods.tsx`, `settings.ts`).
- G / H on embedded tracks: `useVideo.setEmbeddedSubtitlesDelay` (mpv sub-delay through the shell's own whitelisted
  prop, so it works without the dylib too), `useSubtitles` routes the keys there when an embedded track is selected,
  Indicator shows a signed `subtitlesDelay` and now treats 0 as a value.

## Verification
- dylib build clean; web typecheck: no new errors (29 pre-existing in useSubtitles/Indicator from global types);
  `bin/stremio-plus build` compiled.
- Real patched Stremio, Sintel torrent with all toggles on, read back through the bridge: scale ewa_lanczossharp,
  dscale mitchell, correct/linear-downscaling + sigmoid-upscaling yes, deband 4/35/16/4, af = dialogue + night
  (5.1 in, stereo out), glsl-shaders = the 6 Anime4K files (genre Animation), tone-mapping untouched (SDR video).
- Cost: 0 dropped / 0 delayed frames over 10 s with everything on, without Anime4K, and with stock scaling
  (1024 px video upscaled to a 1512 pt Retina window). Not measured fullscreen on a 4K/5K external display.
- Mid-play, clicking the ⋯ menu rows: night mode and Anime4K off → af/shaders cleared; on → back. Scaling/deband off →
  spline36 / hermite / 1 pass / grain 32 (stock) restored.
- HDR10 clip: EDR screen → left alone (bt.2390, PQ out). Forced SDR output via the shell's own target-* props →
  bt.2446a + hdr-compute-peak within the 5 s check; toggled off mid-play → auto; on → bt.2446a.
- Embedded SRT in an mkv: H×3 → sub-delay 0.3 and "Subtitles delay: +0.30s" on screen; G×5 → -0.2; H×2 → 0.00s.
- Screenshots looked at: ⋯ menu Player section, Settings → Mods → Player group, the delay indicator.
- Not verified: dialogue boost / night mode by ear (filters confirmed in mpv's af chain only); real SDR-only display;
  Windows (no dylib there: video/audio toggles are disabled with a note, subtitle keys still work).

## Follow-ups
- Smooth motion: would need the dylib to pace the shell's render loop (interpose `mpv_render_context_render`, report
  swaps / block on vsync). Measurements above.
- `bin/stremio-plus patch` printed "restarting Stremio to load the patch…" but the running Stremio (started 19:03) was
  not restarted; had to quit and reopen by hand. Not investigated.
- Remember embedded subtitle delay per stream like stock does for addon subtitles.
- Dual subtitles (`secondary-sid`) and plan 008 part B (auto-synced subtitles) can reuse the bridge.
