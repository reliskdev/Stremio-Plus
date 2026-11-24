# 035 · Scores in Search and Library

- **Date:** 2026-11-24
- **Status:** done
- **Brief:** "Scores in Search and Library: show Tomatometer/Popcornmeter (same hover strip treatment as Board cards, or visible if clean grids already handle it) on Search results and Library posters, reusing /api/card/:imdb." (from the user's "do the top three" pick)

## Plan
- Check whether Search (MetaItem via MetaRow) and Library (LibItem → MetaItem) already get the clean hover strip and
  the `/api/card` lookup; fix whatever stops them (href shape, type, missing clean class).
- New `scores` UI test step: search a title, hover the first result; add a title to the library, hover it there.

## Assumptions
- Same hover treatment as the Board (scores on hover, no always-on badges), to stay consistent with clean grids.

## Done
- No UI code change needed: Search results render through `MetaItem` and Library cards through `LibItem` → `MetaItem`
  (href = `getMetaDetailsHref(deepLinks)`, which `imdbFromHref` matches), so both already get the clean hover strip
  and the `/api/card` lookup since task 029's addendum (any movie/series card with an IMDb id).
- `tools/ui-test/test.js`: new `scores` step (search "dune part two" and hover the first result; add Pulp Fiction to
  the library and hover the first Library card).

## Verification
- `test scores`: Search hover "Dune: Part Two 92% [Oscar] 2 95%" with certified icons (screenshot 40 checked).
- Library: not verifiable headless. The test profile is a guest and Stremio's Library page says "only available for
  logged in users" (shot 41). Verified by reading the code path only: same component and lookup as Continue Watching.

## Follow-ups
- Check Library hover in the real (logged-in) app.
