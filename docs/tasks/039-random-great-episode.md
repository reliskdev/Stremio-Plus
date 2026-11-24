# 039 · Random great episode

- **Date:** 2026-11-24
- **Status:** done
- **Brief:** "Random great episode"

## Plan
- `rt/EpisodeHeatmap.tsx`: `pickRandomEpisode` (pure) + a "Random great episode" pill next to "All episodes" on the
  Details strip and in the popup's controls. Click opens the picked episode (stream list), like clicking a cell.
- Candidates: released episodes rated Great or better (IMDb 8.0+, SeriesGraph scale); fewer than 3 → the top
  quarter of the show instead.
- Remembers the last 5 picks per show (localStorage) so presses don't repeat.

## Assumptions
- Spoiler-safe: if you've watched part of a show, it only picks from episodes you've watched (a rewatch pick);
  if you've watched none or all, any episode qualifies.
- Ratings used are IMDb (SeriesGraph's, else the local dataset), whatever source the popup shows.

## Done
- `web/src/rt/EpisodeHeatmap.tsx`: exported `pickRandomEpisode(showId, seasons)`: released, rated episodes; pool =
  watched ones when you're partway through, else all; candidates rated 8.0+ (top quarter when fewer than 3); skips
  the last 5 picks (`mods:random-episode:<id>` in localStorage). "Random great episode" pill (shuffle icon) on the
  Details section and a "Random" pill in the popup controls; click opens the episode's stream list (and closes the
  popup). Tooltip says when it limits itself to episodes you've seen.
- Details layout: season chips (open the popup) on one row; "All episodes" and "Random great episode" pills on the
  row below. `EpisodeHeatmap.less`: `.actions` / `.action`, `.shuffle`; popup `.pill` is inline-flex for the icon.
- `tools/ui-test/test.js`: `random` step; heatmap/random steps target `button[class*=strip]`.

## Verification
- Typecheck clean; build compiled.
- `test random` on Dexter: nothing watched → 4 different picks, all 8.0+ (e.g. 1:5, 7:7, 4:7, 5:9); with S1 E1-E3
  ticked → every pick within S1 E1-E3, cycling through all three before repeating; ticks removed afterwards
  ("0 of 96 watched"). Shot 47 (pills under the chips), 48 (opened S5 E1 "My Bad", 8.9).

## Follow-ups
- Could start playback straight away (Best match) instead of opening the stream list, once one-click play exists.
