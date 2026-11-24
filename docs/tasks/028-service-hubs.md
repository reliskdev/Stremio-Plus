# 028 · Streaming service hubs

- **Date:** 2026-11-24
- **Status:** done
- **Brief:** "main page should have all the streaming services which you can look at their top shows with a big logo on their card. you click on their card get into a new page itll have the streaming service logo name etc up the top with the sections you can scroll through; top movies, top shows etc. You can just swipe right and scroll through them there (no see more here)."

## Plan
- Addon: `jw.servicePage(id)` + `GET /api/home/service/:id` → service name, JustWatch app icon, and sections
  (Top movies this week, Top shows this week, Trending now, Popular movies, Popular shows, New releases,
  Top rated movies, Top rated shows). `/api/home/services` lists every service with its icon.
- Board: one "Streaming services" row of cards (big app icon + name), all services, your picked ones first.
  It replaces the per-service "Top this week on X" rows; personal rows stay.
- New page `#/service/:id`: header with the big logo, name and a one-line note; then horizontally scrolling poster
  rows (trackpad swipe / shift-scroll), no See All.

## Assumptions
- Logo = JustWatch's square app icon for the service (crisp at 332px; the wide wordmarks are 160px and too small).
- "All the streaming services" = the 10 the addon knows (Netflix, Prime Video, Disney+, HBO Max, Apple TV+, Hulu,
  Peacock, Paramount+, Crunchyroll, MUBI). Settings "Your services" now only orders the row.
- The services row replaces the chart rows on the Board (each chart now lives on the service page).

## Done
- `addon/lib/justwatch.js`: `serviceList()` (services + JustWatch app icons, 332px), `servicePage(id)` with rows
  Top movies / Top shows this week (weekly charts per type), Trending now, Popular movies, Popular shows,
  New releases (popular, released this year or last), Top rated movies / shows (best IMDb among the 100 most popular
  with 7.5+). Rows under 5 titles are dropped. `browse()` takes an `extra` filter.
- `addon/server.js`: `GET /api/home/services`, `GET /api/home/service/:id`.
- `web/src/mods/home/`: `ScrollRow` (titled row that scrolls sideways, hidden scrollbar, MetaRow-style title),
  `ServiceCard` (the app icon is the card, name under it; hover scales the icon, reduced-motion safe),
  `ServicePage` (`#/service/:id`: 6.5rem logo, name, "What people are watching on X in the US this week", rows of
  posters, placeholders while loading, error/empty message).
- `HomeRows.tsx`: "Top this week on X" rows removed; one "Streaming services" row (all 10, picked ones first) after
  Picked for you. `routerPaths.tsx` (`// [mods]`) adds the route. Settings → Mods copy updated.
- `tools/ui-test/test.js`: `services` step (shots 30–33).

## Verification
- curl `/api/home/services` (10 with icons), `/api/home/service/netflix` and `/mubi` (8 rows each, sensible titles).
- Typecheck clean for touched files; build compiled; `apply` relaunched Stremio (needed one retry: LaunchServices -600).
- `test services`: Board rows "Picked for you | Streaming services | Because you watched ..."; card opens
  `#/service/netflix`; header and 8 rows render; a row scrolled sideways; bottom of the page. Screenshots checked.
- Not tested: trackpad swipe itself (headless); scrolling relies on native overflow-x so it should just work.

## Follow-ups
- Mouse users without a trackpad only get shift+wheel; hover arrows could be added.
- Genres page "See All" from the old chart rows no longer has an entry point from the Board (still in the nav).
- Country fixed to US.
