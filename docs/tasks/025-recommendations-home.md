# 025 · Recommendations home + genre browse

- **Date:** 2026-11-24
- **Status:** done
- **Brief:** "I want a home page more suited to providing movie and show recommendations whether it's from different services top shows movies for the week or based on personal preference. Also a genre based search"

## Plan
- Addon: `lib/justwatch.js` client for JustWatch's public GraphQL (IMDb ids + Tomatometer included, no matching
  needed): weekly streaming charts per service, similar titles, filtered browse (genre / service / type / sort).
- Addon endpoints: `/api/home/chart/:service`, `/api/home/similar?seeds=`, `/api/home/browse?…`.
- Board (`// [mods]`): after Spotlight + Continue Watching, a genre pill row, "Picked for you" (blend of similar titles
  for the titles you've watched), "Because you watched X" rows, and "Top this week on <service>" rows, interleaved.
  Addon catalog rows stay below.
- Taste seeds: one-shot read of the library (`library` model, sort last watched), watched titles first, cached locally.
- New Genres page (`/genres`, nav tab): genre pills, type / service / sort pills, poster grid with infinite scroll.
- Settings → Mods: "Recommendations home" toggle + "Your services" picker.

## Assumptions
- Country is US (matches the RT data and the user's service list); JustWatch package codes are US ones.
- "Top for the week" = JustWatch weekly streaming charts (`WEEKLY_POPULARITY_SAME_CONTENT_TYPE`), movies and shows
  interleaved by rank per service.
- Default services: Netflix, Prime Video, Disney+, HBO Max, Apple TV+ (changeable in Mods).
- Personal preference = what's in the library, weighted towards recently watched; no ratings exist in Stremio.
- Stock Spotlight stays on top (task 008); recommendation rows sit above the addon rows.
- Genre filter on the Genres page is single-select (one genre at a time); sorts are JustWatch's (popular, trending,
  IMDb score, release year).

## Done
- `addon/lib/justwatch.js`: JustWatch GraphQL client (US). `weeklyChart(service)` (weekly streaming charts, movies +
  shows interleaved by rank), `recommendations(seeds, exclude)` (similar titles per seed, blended into "for you";
  per-seed rows drop what "for you" already shows first), `browse({genre,type,service,sort,after})`. IMDb id to
  JustWatch id lookups cached in `addon/data/justwatch-ids.json`; responses cached 6h in memory.
- `addon/server.js`: `/api/home/options`, `/api/home/chart/:service`, `/api/home/similar?seeds=&exclude=` (no-cache,
  personal), `/api/home/browse`.
- `web/src/mods/home/`: `api.ts` (types, service/genre/sort lists, fetch cache, RecItem → MetaItem props with
  Tomatometer in releaseInfo so the clean-card hover shows it), `useTaste.ts` (one-shot read of the `library` model
  sorted by last watched: watched titles first, then saved ones; 6 seeds, cached in `mods:taste`, refreshed when older
  than 10 min on Board mount), `HomeRows.tsx/.less` (row list + rendering with Stremio's MetaRow/MetaItem and a pill
  genre row), `Genres.tsx/.less` (genre pills, type/service/sort MultiselectMenus, poster grid, infinite scroll).
- Board (`// [mods]`): home rows after Continue Watching: Picked for you, Browse by genre, then service charts and
  "Because you watched X" (up to 3) interleaved; addon catalog rows follow. Rows count into the visible-rows offset.
- `/genres` route (`router/routerPaths.tsx`) and a Genres tab in the vertical nav (`MainNavBars.tsx`).
- Settings → Mods → Home: "Recommendations" toggle (`recsHome`, on) and "Your services" chips (`services`).
- `tools/ui-test/test.js`: new `recs` step (shots 23–29).

## Verification
- curl: Netflix chart (The Body, Obsession, FROM, Yellowjackets, Godzilla Minus One...), similar for Dune: Part Two +
  Severance (blend + two distinct rows), Max horror shows with a next cursor.
- Typecheck: no errors in touched files. `bin/stremio-plus apply`: compiled, Stremio relaunched.
- `bin/stremio-plus test recs`: rows render in order; genre row and pills match Discover's pills; Genres page grid,
  dropdown sheet, Netflix filter (URL updates), infinite scroll 40 → 80; a card opens `#/detail/movie/tt0914843/…`;
  Mods page Home group. Found and fixed: the filter row clipped the dropdown (Stremio's divs default to
  `overflow: hidden`); "Because you watched" repeated the "for you" posters; the browser cached `/similar`.
- Library read checked only on the guest profile (empty library → no seeds, personal rows hidden). Personal rows were
  verified with seeds injected into `mods:taste`. Not yet seen with the user's real library in the real window.

## Follow-ups
- Rank numbers or "new this week" on chart rows if wanted (left out: Netflix-style).
- Country is fixed to US; could follow the profile/locale.
- Taste refresh happens on Board mount (usually app launch); titles watched mid-session show up next launch.
- Genres page: multi-genre selection, text search within a genre, remembering the last filters.
