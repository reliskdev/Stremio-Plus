# 029 · Popcornmeter on card hover

- **Date:** 2026-11-24
- **Status:** done
- **Brief:** "add back the popcorn rating on the oppisote side to where the tomatoes sit on the hover of a card."

## Plan
- Hover strip: Popcornmeter pushed to the right edge, Tomatometer stays left.
- JustWatch rows (home picks, service pages, Genres) carry no Popcornmeter: the addon looks scores up on RT and adds
  them; cards still missing one fetch it on hover.

## Assumptions
- "Add back": the popcorn score went missing on the JustWatch-backed cards (tasks 025/028); RT addon rows always had it.
- Applies to every clean card hover, not just the service page.

## Done
- `addon/server.js`: `popcorn` store (`data/popcorn.json`, imdb → { p, t }), filled whenever `resolveRt` scrapes RT
  details, plus a background queue (3 at a time) for unknown JustWatch titles. `/api/home/service`, `/chart`,
  `/similar`, `/browse` add `popcorn` (null = RT has none) and fill a missing Tomatometer. Service/browse cache 5 min.
- `web/src/mods/home/api.ts`: score text includes `🍿 N%` / `🍿 --%`; unknown scores leave 🍿 out (and write `🍅 --%`
  when the tomato is missing too) so the hover knows to look them up.
- `web/src/mods/usePopcorn.ts`: hover-only lookup via `/api/rt/:imdb` (shared cache with the RT panel).
- `MetaItem.js` (`// [mods]`): uses the lazy scores; `styles.less`: `.mod-score-popcorn { margin-left: auto }` + fade.
- `mods/scores.ts`: `popcornListed` flag.
- `tools/ui-test/test.js` `services` step: hover shots 31b/31c.

## Verification
- curl `/api/home/service/netflix`: Obsession 93/94, Godzilla Minus One 99/98, The Body 87/96 after the queue ran.
- Typecheck clean; build compiled; `test services`: hover strip "🍅 93% ... 🍿 94%" on the first card and "57% 68%" on
  a later one; screenshot shows tomato left, popcorn right.

## Follow-ups
- First visit to a fresh row shows popcorn only on hover until the background queue fills it (next load).
