# 032 · Board posters like the service page

- **Date:** 2026-11-24
- **Status:** done
- **Brief:** "The main page cards need to look like when im in a streaming service page, larger closer together"

## Plan
- `routes/Board/styles.less` (`// [mods]`): poster/square rows and Continue Watching get the service page layout:
  14.5rem posters, 0.35rem padding (0.7rem gaps), sideways scroll with hidden scrollbar, first poster aligned with
  the row title. Stop hiding items past the row width (they scroll now). Landscape rows unchanged.

## Assumptions
- Applies to every poster row on the Board (recommendation rows, Continue Watching, addon catalogs); See All stays.
- Rows still show Stremio's preview count (10 items), now reachable by swiping.

## Done
- `web/src/routes/Board/styles.less` (`// [mods]`): imports MetaRow's `meta-items-container` (and the placeholder's);
  `.visible-items` now only limits landscape rows; poster/square rows and Continue Watching scroll sideways with
  14.5rem items, 0.35rem item padding, 0.65rem track padding (first poster aligned with the title), hidden scrollbar,
  empty filler items hidden.
- `web/src/mods/home/ServiceCard.less`: service logos 10rem with the same 0.7rem gaps, outer cards aligned.

## Verification
- Build compiled. `test services`: Board rows (Picked for you, Because you watched, Popular - Movie / Series) show
  large posters with tight gaps cut at the right edge (swipe for more), See All kept, hover strip intact; services row
  gaps match. Continue Watching not seen (guest profile has none), same rules apply.

## Follow-ups
- Mouse-only users scroll rows with shift+wheel; hover arrows could be added.
