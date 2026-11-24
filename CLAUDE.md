# Stremio+ — working notes

Spicetify-style mod of the Stremio desktop app (macOS). See README.md for layout and commands.

## Task history (read first)
- `docs/STATE.md`: what exists now, known issues, open follow-ups.
- `docs/tasks/INDEX.md` → one write-up per task (brief, plan, assumptions, done, verification, follow-ups).
- Work is usually driven by `/small-task <brief>` (skill at ~/.claude/skills/small-task): no scoping questions,
  execute the brief, verify, commit, then log it in docs/ and update STATE.md.

## How it fits together
- Stremio.app is never modified. `bin/stremio-plus launch` runs it with `--webui-url=http://127.0.0.1:7011/`.
- `shell/chrome.m`: dylib injected via `DYLD_INSERT_LIBRARIES` (`open --env`, Stremio allows it) for the transparent
  title bar; the web UI talks to it through the `stremioPlusChrome` WKScriptMessageHandler (`src/mods/macChrome.ts`).
  `apply`/`launch` rebuild it when the source changes. Can't be tested in the headless UI test.
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
  (steps: install, board, discover, details, interact, flix, episode, player, tooltip, episodes, mods, motion, recs). The test browser profile lives in
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
- Title → IMDb matching via Cinemeta search (`lib/match.js`); ~98% hit rate.
- Recommendations use JustWatch's public GraphQL (`lib/justwatch.js`, `apis.justwatch.com/graphql`, no key, US):
  `streamingCharts` (weekly), `node(id){similarTitlesV2}`, `popularTitles` (filters/sort). Enum values must be passed
  as variables, not inline strings. Introspection is disabled.

## Environment gotchas
- pnpm may fail with "attempt to write a readonly database" in sandboxed shells; set XDG_DATA_HOME,
  XDG_CACHE_HOME, XDG_STATE_HOME, XDG_CONFIG_HOME to a writable temp dir before `pnpm install`.
- Stremio's global CSS gives every div `overflow: hidden`; containers holding a MultiselectMenu need `overflow: visible`.
- `stremio://` links always open as https in Stremio, so the local addon is installed by pasting the
  `http://127.0.0.1:7010/<config>/manifest.json` URL into Stremio's addon search.
