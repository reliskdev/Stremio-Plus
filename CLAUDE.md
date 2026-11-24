# Stremio+ — working notes

Spicetify-style mod of the Stremio desktop app (macOS, Windows, Linux experimental). See README.md for layout,
install and commands.

## Task history (read first)
- `docs/STATE.md`: what exists now, known issues, open follow-ups.
- `docs/tasks/INDEX.md` → one write-up per task (brief, plan, assumptions, done, verification, follow-ups).
- Work is usually driven by `/small-task <brief>` (skill at ~/.claude/skills/small-task): no scoping questions,
  execute the brief, verify, commit, then log it in docs/ and update STATE.md.

## How it fits together
- Stremio is patched Spicetify-style, always restorable (`cli/patch.js`, task 044; macOS only so far). Mac Stremio loads
  web.stremio.com through its bundled streaming server (`localhost:11470/proxy/…`, `Contents/MacOS/server.js`); the
  patch makes that proxy serve the Stremio+ UI from :7011 (falls back to stock when the server is down or the vanilla
  flag is set), then re-signs ad hoc with the original entitlements (server.js first: it is signed via xattrs).
  Backups (server.js, main exe, _CodeSignature, entitlements; copied with `ditto`) live in
  `addon/data/stremio-backup/macos-<version>/`; `restore` brings the Apple signature back. The agent re-patches after
  Stremio updates unless config `patch: false`. So any launch (Dock, Spotlight, links) opens the mods directly.
- The window chrome dylib is bundled into patched Stremio too: copied to `Contents/MacOS/libstremio-plus-chrome.dylib`
  (+ a `.root` file pointing at the Stremio+ folder) and weak-loaded via an `LC_LOAD_WEAK_DYLIB` inserted into the
  executable's header padding (`addWeakDylib` in cli/patch.js). The launcher then skips DYLD injection (no double
  load). The dylib does nothing when `addon/data/.vanilla` exists. `apply` / `patch` refresh the bundled copy when
  shell/chrome.m is rebuilt. Config `chrome: false` keeps it launcher-only.
- Inside patched Stremio the UI shares the stock origin (localhost:11470). The live stock core writes storage schema 31,
  the published stremio-core-web the fork uses is schema 25 and refuses to downgrade, so the fork namespaces core
  storage (`web/src/mods/coreStorage.ts`, keys prefixed `stremio-plus:`) whenever it is served under `/proxy/`.
  Consequence: one login inside patched Stremio; stock data is never touched. A top-level hop to 127.0.0.1:7011 was
  tried and leaves the native splash up (the shell only dismisses it for its own page).
- Unpatched fallback (other OSes, or patch failed): `bin/stremio-plus launch` runs Stremio with
  `--webui-url=http://127.0.0.1:7011/` (macOS Stremio.app, Windows `stremio-shell-ng.exe`, Linux Qt shell / Flatpak).
- The CLI is Node: `cli/index.js` (commands) + `cli/platform/<os>.js` (find/launch/quit Stremio, login agent,
  launcher shortcut). `bin/stremio-plus` (bash) and `bin/stremio-plus.cmd` are thin wrappers that prefer the private
  Node in `runtime/` (installer-downloaded) over the system one. Windows shortcuts go through `bin/hidden.vbs`.
- Installed copies (install.sh / install.ps1 → `~/.stremio-plus`, `%LOCALAPPDATA%\Stremio-Plus`) come from the
  release tarball built by `tools/package.js`: no `web/`, prebuilt UI in `ui/` (the server prefers `ui/` over
  `web/build`), universal dylib in `shell/build/`. `build`/`apply`/`test` only exist in a dev checkout.
- Per-user things (launchd label, shortcuts, autostart entries) can belong to another copy (dev checkout vs install);
  the CLI only touches them when they point at its own ROOT. `stop` asks `GET :7011/__stremio-plus` for the server's
  root + pid and never kills another copy's server.
- `shell/chrome.m`: dylib (bundled into patched Stremio, else injected via `DYLD_INSERT_LIBRARIES`) for the transparent
  title bar; the web UI talks to it through the `stremioPlusChrome` WKScriptMessageHandler (`src/mods/macChrome.ts`).
  `apply`/`launch` rebuild it when the source changes. Can't be tested in the headless UI test.
  It also feeds macOS Now Playing: `stremioPlusMedia` handler (`src/mods/nowPlaying.ts`) + swizzled
  `-[MPNowPlayingInfoCenter setNowPlayingInfo:]`, since Stremio's shell already publishes a basic Now Playing.
- `bin/stremio-plus apply` never exits when piped (the server keeps the pipe open); run it unpiped or in the background.
- `addon/server.js` is one Node process: Stremio addon on :7010 and static host for `web/build` on :7011.
- The modded UI talks to the addon over HTTP: `GET :7010/api/rt/:imdb?type=&name=&year=` returns RT details
  (scores, consensus, synopsis, cast, photos, direct mp4 trailer). Base URL comes from the installed addon's
  transportUrl (`web/src/rt/useRt.ts`), falling back to 127.0.0.1:7010.

## Working on the UI (web/)
- Separate git repo, branch `rt-mod`, remote `upstream` = Stremio/stremio-web. Commit mod work there.
- Put new code in `src/rt/` (Rotten Tomatoes) or `src/mods/` (general mods). Keep edits to upstream files minimal
  and tag them `// [rt-mod]` or `// [mods]`.
- New user-facing toggles go in `src/mods/settings.ts` (`ModSettings` + `DEFAULTS`) and the Settings page
  `src/routes/Settings/Mods/Mods.tsx`. Read them with `useMods()`.
- Build: `bin/stremio-plus build` (~10s). The build folder is named after the git commit; the server sends
  `no-cache`, so a rebuild + Stremio reload (Cmd+R or `apply`) picks it up.
- Typecheck: `cd web && npx tsc --noEmit -p .`
- Verify visually with `bin/stremio-plus test <step>` and read the PNGs in `tools/ui-test/shots/`
  (steps: install, board, discover, details, interact, flix, episode, player, tooltip, episodes, mods, motion, recs, services, scores, heatmap, random, upnext). `upnext` needs a Range-capable mp4 server on :7099. The test browser profile lives in
  `tools/ui-test/.profile` (guest account with the addon installed).

## Design rules (from PRODUCT.md / DESIGN.md, user feedback)
- "Stremio+", not Netflix: reuse Stremio's own vocabulary: `var(--overlay-color)` + `blur(5px)` surfaces,
  999px pills, Links-style labels (0.95rem/700/uppercase/opacity .3), text .64/.46 white, `--border-radius`.
- No decorative gradients, no coloured/tinted bordered boxes, no outlines/strokes, no glows, no gold badges,
  no letter-spaced eyebrow labels. Blur for legibility over artwork. Accent only for primary actions/selection.
- The `impeccable` skill is installed; use it (with PRODUCT.md / DESIGN.md at this root) for UI work.
- Motion: Emil Kowalski's skills are installed (`animate`, `choreograph`, `animation-performance`, and the
  user-invoked `review-animations` / `improve-animations`). Use `animate`/`choreograph` for any new or changed motion.

## Working on the addon (addon/)
- `node server.js` (or `bin/stremio-plus restart`). Caches in `addon/data/` (matches, details, cinemeta, posters);
  delete a cache file to force a refetch.
- RT endpoints used: `https://www.rottentomatoes.com/cnapi/browse/<list>/<filters>?after=<b64 index>`
  (lists: movies_at_home, movies_in_theaters, tv_series_browse; filters like `critics:fresh~sort:popular`,
  `affiliates:netflix`, `genres:horror`). TV has no certified flag in browse data.
  Trailers: `link.theplatform.com/s/NGweTC/media/<publicId>?formats=MPEG4` redirects to the mp4.
- SeriesGraph (`lib/seriesgraph.js`): public `seriesgraph.com/api/shows/:tmdb/season-ratings` and
  `/api/community-ratings/:tmdb/season-ratings`, keyed by TMDB id (Cinemeta's `moviedb_id`). User endpoints need login.
- Title → IMDb matching via Cinemeta search (`lib/match.js`); ~98% hit rate.
- Recommendations use JustWatch's public GraphQL (`lib/justwatch.js`, `apis.justwatch.com/graphql`, no key, US):
  `streamingCharts` (weekly), `node(id){similarTitlesV2}`, `popularTitles` (filters/sort). Enum values must be passed
  as variables, not inline strings. Introspection is disabled.

## Environment gotchas
- The login agent (`bin/stremio-plus daemon`) reloads itself when `bin/stremio-plus` or `cli/*.js` change (macOS: exits
  and launchd restarts it; elsewhere it respawns). Log: `addon/data/agent.log`.
- Windows can't be tested from this Mac (no VM; downloading PowerShell to lint was blocked). Treat Windows/Linux code
  paths as unverified until the user reports back.
- pnpm may fail with "attempt to write a readonly database" in sandboxed shells; set XDG_DATA_HOME,
  XDG_CACHE_HOME, XDG_STATE_HOME, XDG_CONFIG_HOME to a writable temp dir before `pnpm install`.
- The web build's TS target doesn't downlevel iterators: `[...map.entries()]` / `[...set]` silently become `[]`.
  Use `Array.from(...)`.
- Stremio's global CSS gives every div `overflow: hidden`; containers holding a MultiselectMenu need `overflow: visible`.
- `stremio://` links always open as https in Stremio, so the local addon is installed by pasting the
  `http://127.0.0.1:7010/<config>/manifest.json` URL into Stremio's addon search.
