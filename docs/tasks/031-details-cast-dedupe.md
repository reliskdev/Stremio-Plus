# 031 · Cast and directors only once on Details

- **Date:** 2026-11-24
- **Status:** done
- **Brief:** "[screenshot of the Cast / Directors rows] remove this from the top as its down the bottom."

## Plan
- `routes/Details/Hero/Hero.tsx` (`// [rt-mod]`): when the RT panel has data, drop the Cast, Directors (and
  Rotten Tomatoes link) rows from the hero's link groups, as Discover already does. Genres stay.

## Assumptions
- Only while the RT panel is showing (it carries "Cast & crew"); without RT data the rows stay so nothing is lost.

## Done
- `web/src/routes/Details/Hero/Hero.tsx`: link groups built from `metaItem.links` minus Cast / Directors / Rotten
  Tomatoes while RT data is present (`useRt` moved above `useMetaLinks`). Genres stay.

## Verification
- Typecheck clean; build compiled. `test details` (Dune: Part Two): hero shows Genres only, then the RT scores,
  consensus and trailer; cast stays in the RT panel's "Cast & crew" section further down.

## Follow-ups
- None.
