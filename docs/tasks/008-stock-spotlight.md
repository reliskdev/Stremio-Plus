# 008 · Reapply mods, keep Stremio's Spotlight

**Brief:** "reapply my modifications, keep the spotlight board stremio has i like it"

## Done
- Stremio had been opened stock (no `--webui-url`). Merged upstream/development (2 fixes: Details panel padding,
  Player side-drawer season selector) into `rt-mod`, rebuilt, relaunched with the modded UI.
- Board Spotlight reverted to upstream: no RT score pills / Certified Fresh note, no consensus-as-description,
  no background trailers, stock 8s slides. Removed `src/rt/RtSpotlight.*`, `useRtSpotlightDefault.ts`
  (one-time auto-switch to the RT · Spotlight catalog) and the `spotlightTrailers` mod toggle.
- Explained login: the modded UI lives on origin 127.0.0.1:7011, so it has separate storage from
  web.stremio.com; log in once there (account data syncs). User logged in.

## Verification
- `tsc`: 38 errors before and after, all in upstream files (Player, GamepadProvider); none in mod code.
- `bin/stremio-plus test board`: board renders (guest test profile has Spotlight disabled).

## Follow-ups
- RT · Spotlight catalog still exists in the addon; if the user's account still points Spotlight at it,
  change it in Settings → Interface → Spotlight.
- Test harness: a stale headless Brave can hold `tools/ui-test/.profile/SingletonLock`; kill it / remove the lock.
