# 040 · Now Playing integration

- **Date:** 2026-11-24
- **Status:** done
- **Brief:** "Now Playing integration: feed macOS MPNowPlayingInfoCenter from the player via the chrome dylib (title, episode, artwork, position/duration, play/pause state) so Control Center and media keys (play/pause, skip ±) work with the Stremio player." (from the "Playback and Mac" ideas list)

## Plan
- Found: Stremio 5.1's Rust shell already publishes Now Playing (title, show name, logo art, paused) from upstream
  `useMediaSession.ts` and handles play/pause/toggle/next/previous (`media-key`). Build on it, don't replace it.
- `shell/chrome.m`: swizzle `-[MPNowPlayingInfoCenter setNowPlayingInfo:]` to merge our keys into whatever the shell
  sets (title/artist, artwork, duration, elapsed time, rate, media type); a `stremioPlusMedia` message handler feeds them.
- Register skip forward/back (Stremio's seek step) and scrubbing (`changePlaybackPositionCommand`) in
  MPRemoteCommandCenter; they call back into the web UI with a `stremio-plus-media` event.
- `web/src/mods/nowPlaying.ts`: `useNowPlaying` hook in the Player posts state on play/pause/seek/metadata changes
  (not every tick; Now Playing extrapolates from rate) and seeks on the events.
- CLI: link MediaPlayer in `build_chrome`.

## Assumptions
- Artwork: the episode still for episodes, else the backdrop, else the poster (the shell's choice, the transparent
  logo, looks empty in Control Center).
- Title = episode name (or movie name); subtitle = "Show · S1 E2" (or year for movies).
- Skip buttons replace next/previous in Control Center while seeking is possible; media keys' next-track still works.
- Live streams (no seek range): no scrubber or skip, just play/pause.
- When the player closes, Now Playing is cleared (stock leaves the last title in Control Center, paused).

## Done
- `shell/chrome.m`: `SPMedia` (`stremioPlusMedia` message handler). `-[MPNowPlayingInfoCenter setNowPlayingInfo:]` is
  swizzled at load; while the player is open every dict the shell sets gets our title, subtitle (artist), artwork
  (fetched with NSURLSession, `MPMediaItemArtwork`), media type video, live flag, rate (0 when paused), duration and
  elapsed time; with the player closed it passes nil and sets the playback state to stopped. Skip forward/back
  (`preferredIntervals` = Stremio's seek step) and `changePlaybackPositionCommand` are registered once and enabled only
  while seeking is possible; they send `stremio-plus-media` events back to the web view. Play/pause/next stay with the
  shell's own handlers.
- `bin/stremio-plus`: `build_chrome` links MediaPlayer.
- `web/src/mods/nowPlaying.ts` (new): `useNowPlaying` builds title/subtitle/artwork from the player's meta and selected
  video, posts state on metadata/play/pause/rate/duration changes and on position jumps over 2s (Now Playing
  extrapolates in between), posts `{active:false}` on unmount, and seeks via the Player's `commitSeek` on commands
  (no control-bar flash).
- `routes/Player/Player.js`: one `// [mods]` call after `useMediaSession`.

## Verification
- Dylib compiles clean; typecheck clean for touched files; build compiled.
- Real Stremio.app with the dylib, using a temporary debug build (JS-from-file hook + dump of the merged dict, both
  removed before commit) and a local 3-minute test mp4:
  - Episode (Rick and Morty S7 E7): title "Wet Kuat Amortican Summer", artist "Rick and Morty · S7 E7", artwork loaded,
    duration 180, media type video, not live.
  - Movie (Shawshank): title, artist "1994", artwork, duration.
  - Commands: seek to 20s → player 0:22, Now Playing elapsed 20; skip +30 → 0:55 / 53; skip −10 → 0:49 / 47.
  - Pausing in the player → rate 0, elapsed frozen; play → rate 1.
  - Closing the player → nowPlayingInfo nil.
- Not verified: the Control Center widget itself and hardware media keys (posting HID key events needs Accessibility
  permission this shell doesn't have). Play/pause keys use Stremio's own unchanged handler; skip/scrub use the same
  event path tested above.

## Follow-ups
- Check Control Center and the keyboard's media keys in daily use.
- While seeking is possible, Control Center shows ±skip buttons instead of next/previous; the next-track media key
  still goes to Stremio's handler.
