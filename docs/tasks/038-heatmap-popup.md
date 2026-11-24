# 038 · Episode ratings popup (watched ticks, SeriesGraph scores)

- **Date:** 2026-11-24
- **Status:** done
- **Brief:** "Maybe heatmap should be a popup, you can see them tick off episodes you've watched and score it through seriesgraph api or whatever that ies??"

## Plan
- Addon `lib/seriesgraph.js` + `GET /api/seriesgraph/:imdb`: IMDb id → TMDB id (Cinemeta `moviedb_id`, else
  SeriesGraph search), then SeriesGraph's public `/api/shows/:tmdb/season-ratings` (IMDb ratings) and
  `/api/community-ratings/:tmdb/season-ratings` (SeriesGraph community scores + vote counts). Cached 12 h on disk.
- Details: the inline grid becomes a compact "Episode ratings" strip (one chip per season, coloured by season
  average) that opens the popup; the popup is Stremio's own ModalDialog.
- Popup: source pills (IMDb / SeriesGraph community), the full grid with a tick on watched episodes and a
  watched count, "Mark watched" pill (clicking cells then ticks them off via Stremio's MarkVideoAsWatched instead of
  opening them), legend, "Ratings from SeriesGraph" link.
- Falls back to the local IMDb dataset when SeriesGraph has nothing.

## Assumptions
- "Score it through SeriesGraph" = scores come from SeriesGraph's API (IMDb + their community ratings). Rating
  episodes yourself on SeriesGraph needs their account login (their user endpoints answer 401), so not done.
- Watched state is Stremio's own (library), so ticks stay in sync with the episode list.

## Done
- `addon/lib/seriesgraph.js` + `GET /api/seriesgraph/:imdb` (`server.js`): TMDB id from Cinemeta `moviedb_id` (else
  SeriesGraph search by name/year), then `seriesgraph.com/api/shows/:tmdb/season-ratings` and
  `/api/community-ratings/:tmdb/season-ratings`, flattened to `{ tmdb, url, imdb: { "s:e": rating },
  community: { "s:e": { avg, count } } }`. Cached 12 h in `data/seriesgraph.json`; failures not cached.
- `web/src/rt/EpisodeHeatmap.tsx` (default export now `EpisodeRatings`): on Details, "Episode ratings" label with
  "N of M watched", a strip of season chips coloured by season average (tick when a season is fully watched) and an
  "All episodes" pill; any click opens the popup (Stremio's `ModalDialog`, widened to 64rem). Popup: IMDb /
  SeriesGraph community pills, watched count, "Mark watched" / "Done" pill, hint line, the grid (Stremio's
  `WatchedBadge` on watched cells, slightly dimmed; tooltip with rating, bucket, community votes, watched), legend,
  "Ratings from SeriesGraph" link. Normal click opens the episode and closes the popup; in mark mode a click
  dispatches `MetaDetails/MarkVideoAsWatched` (toggles), so the episode list updates too.
- IMDb values come from SeriesGraph when it has them, else the local IMDb dataset (`useImdbEpisodes`).
- `EpisodeHeatmap.less` rewritten for strip + popup. `Hero.tsx` unchanged (same import, same props).
- `tools/ui-test/test.js` `heatmap` step: strip, popup, tick S1 E1/E2 (count 0 → 2), community source, untick
  (back to 0), open S2 E3, Breaking Bad popup. Popup root has `data-episode-ratings` for tests.

## Verification
- curl `/api/seriesgraph/tt0903747`: tmdb 1396, 62 IMDb + 62 community values; `tt0773262` (Dexter): tmdb 1405, 96 + 96.
- Typecheck clean; build compiled. `test heatmap`: strip "S1 8.7 … S8 7.4 All episodes" (shot 42); popup 96 cells
  (43); ticking → "2 of 96 watched", badges on both cells and in Stremio's episode list (44); community source
  first cell "9.0 · Awesome · 9,918 votes" (45); untick → "0 of 96 watched"; S2 E3 opened
  `tt0773262:2:3` and the popup closed; Breaking Bad's 16-episode S5 fits with numbers (46).
- Noticed: SeriesGraph's IMDb values can lag IMDb (Ozymandias 9.8 there vs 10.0 on IMDb).

## Follow-ups
- Rating episodes yourself on SeriesGraph would need their login (session cookie); not attempted.
- The ModalDialog leaves some empty space under the content (its own footer area).
- "Mark season watched" shortcut (click the season label) could use `MarkSeasonAsWatched`.
