# 047 · Subtitle sync hardening + patch restart fix

- **Date:** 2026-11-24
- **Status:** done
- **Brief:** "Fix those then push" (the caveats listed after task 046)

## Plan
- `stremio-plus patch`: actually restart a running Stremio when the patch or bundled chrome changed (task 045 bug).
- Subtitle sync: decode torrent windows one at a time; cache key from the video itself (`?key=`) so expiring links
  still hit the cache; prune `data/subsync/`; tooltip saying which way subtitles moved.
- Keep `addon/test/` out of the release tarball. Clear the test state left in the app. Push the root repo.

## Assumptions
- "Push" = the root repo to `origin` (github.com/reliskdev/Stremio-Plus, `main`). `web/` only has `upstream`
  (Stremio's own repo), so it is committed locally and not pushed.
- Port 7098's listener isn't ours; left alone. The retimed-SRT route stays open (it serves only server-written files).
- Restart only when `patcher.patch()` changed something (not on "already patched"), so a no-op patch never closes
  the user's player.

## Done
- `cli/index.js` `patch`: the old code called `launch()`, which sees the patched window as already modded and just
  focuses it. Now: start the server, quit the running Stremio, `openPatched()`, unless the result is "already patched".
- `addon/lib/subsync/speech.js`: streaming-server URLs decode windows sequentially (direct URLs stay parallel);
  `streamKey(url, videoKey)` (validated charset, hashed); LRU-ish cache (reads touch mtime; prune drops files unused
  for 90 days and beyond 600 files; runs at startup and 5 s after writes). `index.js`: video key in the sync id.
- `addon/server.js`: `?key=` on `/api/subsync/speech`, `speech.png`, `align`; `subsync.prune()` on listen.
- web `syncApi.ts`: `videoKeyOf(stream)` (behaviorHints videoHash + size, else filename + size), sent as `key`;
  on-device records keyed by it. `SubSync.tsx`: tooltip "Subtitles now show 2.9 s earlier / later".
- `tools/package.js`: `test` added to ADDON_SKIP.
- Patched app: test record removed from `mods:subsync`.

## Verification
- Patch fix: made the bundled chrome look stale → `stremio-plus patch` printed "updated the window chrome",
  "restarting Stremio…", PID 57770 → 58800, `.root` restored, status patched. Second `patch` → "already patched",
  PID unchanged.
- `npm test` (addon): 11/11 (new: key tests, prune with an aged file in a temp dir).
- curl: same video key, two different URLs (`?session=a` / `b`): first decoded in 7.8 s, second `cached: true`.
  Sintel torrent with its cache deleted: sequential decode, still −6.39 s.
- Real app: stream with `behaviorHints.videoHash` → record keyed `v:hash:…`, tooltip text right, Undo clears it.
  Web typecheck clean for touched files; build compiled.
- Not verified: bandwidth effect of sequential decoding on a live slow swarm (no cold torrent available).

## Follow-ups
- Milestones 4–5 of plans/008 B remain (see task 046).
