# 030 · Certified icons and card labels

- **Date:** 2026-11-24
- **Status:** done
- **Brief:** "Is there a way to change the tomato/popcorn icon based on th rating. And have things like \"critically acclaimed\" or \"nominate for award\" more data on them."

## Plan
- `rt/Icons.tsx`: icons already switch fresh/rotten and upright/spilled; add drawn Certified Fresh (tomato on a
  scalloped seal) and Verified Hot (overflowing bucket with a star) variants, used when `certified` is passed.
- Addon `GET /api/card/:imdb`: RT scores + certified flags (resolveRt) and Cinemeta awards text, turned into up to two
  short labels: awards ("Won 2 Oscars", "Oscar nominee", "Won 10 Emmys", "Award-winning"), critics ("Certified
  Fresh", "Critically acclaimed" at 90%+ with 40+ reviews), audience ("Verified Hot", "Audience favourite" at 90%+).
- Card hover (`MetaItem`, clean cards): one lookup per movie/series on hover (replaces the popcorn-only lookup);
  certified icons + a third line with the labels in secondary text, one line, ellipsis.

## Assumptions
- Labels are plain text in the hover strip (no badges/pills: DESIGN.md bans gold badges and tinted boxes).
- Award data = Cinemeta's `awards` (OMDb text); "nominated" only shown when there are no wins worth naming.
- Icons are drawn, not RT's trademarked artwork (same rule as the existing ones).

## Done
- `web/src/rt/Icons.tsx`: Certified Fresh (red scalloped seal, stem, white tick) and Verified Hot (heaped bucket with
  a red tick seal) variants; existing fresh/rotten and upright/spilled kept. RT panel now passes `certified`.
- `addon/lib/enrich.js`: Cinemeta cache keeps `awards` (older entries refetched once).
- `addon/server.js`: `GET /api/card/:imdb` → scores, certified flags, review count, awards text and `labels` (max 2):
  "Won N Oscars/Emmys/Golden Globes/BAFTAs", "Oscar winner", "Emmy nominee", "Award-winning" (10+ wins),
  "Award-nominated" (10+ nominations); "Certified Fresh" or "Critically acclaimed" (90%+, 40+ reviews);
  "Verified Hot" or "Audience favourite" (90%+). Counts as a direct lookup (background popcorn fill pauses).
- `web/src/mods/useCardExtras.ts` (replaces `usePopcorn.ts`): one `/api/card` lookup per title on hover; failures
  not kept. `MetaItem.js` (`// [mods]`): certified icons, scores from the lookup when releaseInfo lacks them, and a
  third line with the labels (0.8rem, .64 white, one line). `forgetRt` removed from `useRt.ts`.
- `tools/ui-test/test.js`: details step now opens Dune: Part Two (certified on both scores).

## Verification
- curl `/api/card`: Dune: Part Two → "Won 2 Oscars", "Certified Fresh"; Severance → "Won 10 Emmys",
  "Critically acclaimed"; Pulp Fiction → "Oscar winner", "Certified Fresh"; Criminal Minds → "Emmy nominee".
- Typecheck clean; build compiled. `test services`: Obsession hover "93% 94% Award-winning · Certified Fresh" with the
  certified icons (screenshot checked). `test details`: both certified icons in the RT panel.

## Follow-ups
- Labels could also show in the RT panel / Details hero.
- Awards text comes from Cinemeta (OMDb); very new titles often have none yet.

## Addendum: award icons in the score row
- User: "Find icons for them and put them next to the popcorn/tomatometer not underneath."
- `web/src/mods/AwardIcon.tsx`: drawn silhouettes (not the academies' artwork): Oscar statuette, Emmy winged figure
  with atom, Golden Globe on a pedestal, BAFTA mask, trophy cup for other awards. Winners muted gold (#E3B04B),
  nominees .64 white.
- `addon/server.js`: `/api/card` adds `award: { kind, won, count, label }` (`awardInfo`).
- `MetaItem.js`: award icon sits right after the Tomatometer (win count shown when >1; full label as tooltip);
  the labels line underneath is gone (Certified Fresh / Verified Hot are carried by the score icons; "Critically
  acclaimed" / "Audience favourite" text no longer shown). Award icon 1.3rem so statuettes read at card size.
- Verified: `test services` hovers: Breaking Bad "96% [Emmy] 16 97%" (Won 16 Emmys), The Prestige "77% [grey Oscar]
  92%" (Oscar nominee); icon sheet rendered large and at 16/20px to check the shapes.
