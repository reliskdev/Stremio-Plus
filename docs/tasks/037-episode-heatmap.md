# 037 · Episode rating heatmap

- **Date:** 2026-11-24
- **Status:** done
- **Brief:** "Episode heatmap: compact grid of episode IMDb ratings per season on series Details (from the existing /api/imdb/:imdb/episodes data), so you can see which seasons are worth it; clicking a cell selects that episode." (from the user's "do the top three" pick)

## Plan
- `web/src/rt/EpisodeHeatmap.tsx` + `.less`: one row per season (label, season average, a cell per episode with its
  rating), brightness from the rating; tooltip with episode title; click opens the episode like a list row
  (`openEpisode(deepLinks.metaDetailsStreams)`).
- Shown in the Details hero (series overview, no episode selected) inside the RT panel under the trailer, labelled
  like the other RT sections; on its own when RT has no match. Follows the RT panel toggle like the list ratings.
- `RtPanel`: `afterTrailer` slot. `Hero.tsx`: renders the heatmap.
- UI test: extend the `episodes` step (Dexter) with a heatmap shot and a cell click.

## Assumptions
- Monochrome ramp (white overlay alpha by rating), not a red/green scale: DESIGN.md keeps colour for accent only.
- Long seasons (more than 16 episodes) drop the numbers in the cells (colour only, rating in the tooltip) so a row fits.
- Specials (season 0) left out.

## Done
- `web/src/rt/EpisodeHeatmap.tsx` / `.less`: "Episode ratings" section (own Links-style label so it also works
  outside the RT panel): row per season with `S1`, the season average and one cell per episode showing its rating;
  white overlay alpha 0.05 to 0.8 from 6.0 to 9.5 (squared), dark text on bright cells; unrated episodes faint;
  tooltip "S2 E3 · Title · 8.3"; click → `openEpisode(deepLinks.metaDetailsStreams)` (same as a list row). Seasons
  with more than 16 episodes switch to small colour-only cells. Hidden when fewer than 2 episodes are rated.
- `rt/RtPanel.tsx`: `afterTrailer` slot. `routes/Details/Hero/Hero.tsx` (`// [rt-mod]`): heatmap on the series
  overview, inside the RT panel under the trailer, or on its own (`.mod-heatmap` in `Hero.less`) without RT data.
- `tools/ui-test/test.js`: `heatmap` step (Dexter, Breaking Bad, click S2 E3).
- Bug hit on the way: `[...map.entries()]` compiles to `[]` under the build's TS target, so the grid was
  empty. Uses `Array.from`; noted in CLAUDE.md gotchas.

## Verification
- Typecheck clean; build compiled.
- `test heatmap`: Dexter 8 rows / 96 cells, S8's drop (4.9 finale) clearly darker (shot 42); Breaking Bad 5 rows /
  62 cells, 16-episode S5 fits with numbers (shot 43); clicking S2 E3 opened `tt0903747:2:3`, the episode hero with
  "Bit by a Dead Bee" 8.3 (shot 44).
- Not checked: a very long series (e.g. 30+ seasons) or seasons over 16 episodes (dense cells) on screen.

## Follow-ups
- Long-running shows could cap the rows (e.g. show 10 seasons + "Show all").
- Could highlight the episode you're up to (library progress).

## Addendum: SeriesGraph colours
- User: "color them like seriesgraph". Overrides the monochrome assumption above (and DESIGN.md's accent-only colour
  rule) for this grid.
- Scale taken from seriesgraph.com's JS bundle (default IMDb buckets, rating rounded to one decimal): Absolute Cinema
  9.7+ #1DA1F2, Awesome 9.0 #186A3B, Great 8.0 #28B463, Good 7.0 #F4D03F, Average 6.0 #F39C12, Bad 4.1 #E74C3C,
  Garbage below #633974. Text black on light colours, white on dark (Absolute Cinema always white), as they do.
- `EpisodeHeatmap.tsx`: `BUCKETS` + inline cell colours, bucket name in the tooltip; colour legend under the grid
  (0.75rem tertiary text, small rounded swatches).
- Verified: `test heatmap` shots 42/43 (Dexter's S6/S8 yellows and the 4.9 red finale, Breaking Bad's 9.7+ blue cells),
  click still opens S2 E3.
