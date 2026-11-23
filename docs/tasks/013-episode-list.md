# 013 · Episode list: ratings, season dropdown, no search

- **Date:** 2026-11-24
- **Status:** done
- **Brief:** "show episode ratings in the episode list, improve the dropdown bar [Image], remove the search function [Image]"

## Plan
- Addon: `GET /api/imdb/:imdb/episodes` → `{ "season:episode": rating }` from the IMDb dataset index (task 011).
- Web: `useImdbEpisodes(seriesId)` (src/rt/useRtEpisode.ts); Videos passes each row its rating; Video row meta
  shows `8.2` + IMDb mark after the date.
- Dropdown (`components/MultiselectMenu`, app-wide): raised blurred panel, no glow, inset rounded rows,
  compact type, gap below the trigger, selected row highlighted with accent dot.
- Remove the "search videos" field from the episode panel (Details/Videos).

## Assumptions
- Ratings in the list are IMDb only: RT episode scores need one RT page fetch per episode and exist for few shows;
  the hero keeps showing RT when available.
- "Dropdown bar" = the season dropdown menu shown; restyled at the shared component so every Stremio dropdown matches.

## Done
- Addon: `/api/imdb/:imdb/episodes` (`imdbSeriesRatings` in `lib/imdb-episodes.js`).
- Web: `useImdbEpisodes` in `src/rt/useRtEpisode.ts`; `Details/Videos/Videos.tsx` passes `rating` to each row;
  `Video.tsx/.less` show `8.7` + Stremio's IMDb mark after the air date (follows the RT panel toggle).
- Episode search removed (`Videos.tsx`: no `Search`, list = all episodes). `Search.tsx` left in place, unused.
- `components/MultiselectMenu` (all Stremio dropdowns): panel rgba(36,33,50,.94) + blur(16px), 1rem radius,
  0.375rem inset padding, 6px gap below the trigger, soft drop shadow (glow removed), 150ms drop-in;
  rows 2.5rem / 0.95rem, rounded hover, selected = bold + overlay background + accent dot; Button focus ring
  replaced by the hover background inside dropdowns.
- `tools/ui-test`: `episodes` step (Dexter list + season dropdown).

## Verification
- curl `/api/imdb/tt0773262/episodes` → 90+ ratings. tsc: no errors in touched files. Build compiled.
- Shots 16/17: ratings on every Dexter S1 row; dropdown fixed after two rounds (IMDb mark squashed at
  1.6×1.1rem → square 1.9rem; white focus ring on the autofocused option → removed; 7th row was cut → max-height
  includes padding).
- Other dropdowns (Discover filters, Settings) share the component; not screenshotted.

## Follow-ups
- Season average rating in the dropdown or season bar.
- Highlight standout episodes (e.g. top-rated of the season).
