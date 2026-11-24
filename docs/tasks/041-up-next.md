# 041 · Up next card

- **Date:** 2026-11-24
- **Status:** done
- **Brief:** "Up next card at the credits: near the end of an episode show the next episode with its IMDb rating; near the end of a movie suggest a similar title with its RT score." (from the "Playback and Mac" ideas list)

## Plan
- `web/src/mods/UpNext.tsx` + `.less`: one card in the DESIGN.md panel surface, bottom right above the control bar.
  Episode: still, "Up next" label, episode title, "Show · S1 E2" + IMDb rating, Watch now (accent) / Dismiss.
  Movie: poster, "Watch next" label, title, year + Tomatometer icon, Details (accent) / Dismiss.
- Episodes replace the stock NextVideoPopup (same timing, dismissal, focus and binge behaviour); live TV (EPG) keeps
  the stock popup.
- Movies: pick from `/api/home/similar` seeded with the current movie, skipping titles already in the library
  (`mods:taste` exclude list); fetched once 80% in, shown in the credits window.
- Player.js: small `// [mods]` swap at the render site plus the movie hook.

## Assumptions
- Credits window for movies: the last 6% of the runtime, clamped to 2 to 8 minutes (stock's 35s notification is too
  late for film credits). Respects Stremio's "next video notification" setting: off means no card for movies either.
- The movie card isn't a menu: it doesn't take focus or block Space/arrow shortcuts, and stays visible when the player
  controls fade (it's what you look at during credits). Details opens the title's stream list, leaving the player.
- IMDb rating from the local IMDb dataset (`/api/imdb/:id/episodes`), same source as the episode list.
- Panel is denser than DESIGN.md's .62 (.8 + blur 16px): it sits over bright, moving frames, and the grey text washed
  out at .62 in the test shots.

## Done
- `web/src/mods/UpNext.tsx` (new): `UpNextEpisode` (episode still, blurred when Stremio's hide-spoilers applies;
  "Up next" label; title; "Show · S7 E8" + IMDb rating from `useImdbEpisodes`; Watch now (accent, focused after the
  entrance like stock) / Dismiss). `useUpNextMovie` fetches `/api/home/similar` seeded with the movie once 80% in,
  drops titles in your library (`mods:taste`), prefers a movie with Tomatometer 75+, and returns it only in the
  credits window (`creditsWindow`: 6% of runtime, 2 to 8 min). `UpNextMovie`: poster, "Watch next", title, year +
  Tomatometer icon, Details (opens the stream list) / Dismiss.
- `web/src/mods/UpNext.less` (new): panel surface, no border or shadow, sized to content (24 to 32rem), same spot as
  Stremio's menus; 999px pills, focus shown as the hover fill (no outline ring); 0.25s rise-and-fade entrance with
  `@mods-ease`, fade only under reduced motion.
- `routes/Player/Player.js` (`// [mods]`): episodes render `UpNextEpisode` instead of `NextVideoPopup` (EPG keeps
  the stock popup); `useUpNextMovie` + `UpNextMovie` when there's no next video. Shares the stock dismissal state.
- `tools/ui-test/test.js`: `upnext` step (needs a Range-capable mp4 server on :7099).

## Verification
- Typecheck clean; build compiled.
- `test upnext` with a local 3-minute mp4: Rick and Morty S7 E7 25s from the end shows "Up next · Rise of the
  Numbericons: The Movie · Rick and Morty · S7 E8 · IMDb 4.4", Watch now focused (shot 49). Shawshank 40s from the
  end shows "Watch next · GoodFellas · 1990 · 93%" with the Certified Fresh icon (shot 50); still shown after the
  controls fade (shot 51); Dismiss removes it.
- Not verified: Watch now (stock `onNextVideoRequested`, unchanged), and the Details link landing on GoodFellas'
  stream list; the real-app look (headless Brave only).

## Follow-ups
- The movie pick could prefer something on your streaming services, or offer "Add to library" instead of leaving the
  player.
