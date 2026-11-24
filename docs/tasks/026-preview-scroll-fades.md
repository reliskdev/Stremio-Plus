# 026 · Preview card scroll fades

- **Date:** 2026-11-24
- **Status:** done
- **Brief:** "Improve this side card with clipping fadeouts whatever, [Image #19]" (screenshot: Discover preview panel,
  "PHOTOS" label sliced in half at the bottom of the scroll area, empty gap above the action buttons)

## Plan
- `MetaPreview` body (`// [mods]`): replace the hard clip with scroll-edge fades (CSS mask), shown only on the edge
  that has more content: bottom while there is more below, top once scrolled down.
- Small hook `src/mods/useScrollEdges.ts` tracks overflow on scroll and when content grows (RT panel loads late).
- Fade sizes animate in/out via registered custom properties so they don't pop.
- Tighten the dead gap between the scroll area and the action buttons so the fade runs into the buttons.

## Assumptions
- "This side card" = the Discover preview panel (`components/MetaPreview`); the same fades also apply where
  MetaPreview is reused (Player side drawer, TV guide preview), which is wanted behaviour there too.
- A scroll-edge mask is functional, not a decorative gradient (same reasoning as task 007, where the user later
  removed a grid fade; this brief asks for fades explicitly).

## Done
- `web/src/mods/useScrollEdges.ts`: reports which edges of a scroll container hide content; re-measures on scroll,
  on resize of the container or any child, and when children change (RT panel content arrives late).
- `components/MetaPreview/MetaPreview.tsx` (`// [mods]`): body gets `fade-top` / `fade-bottom` classes from the hook.
- `MetaPreview.less` (`// [mods]`): body mask `linear-gradient(transparent, #000 var(--fade-top), #000
  calc(100% - var(--fade-bottom)), transparent)`; 3rem top fade once scrolled, 4.5rem bottom fade while more content
  is below; the two lengths are `@property`-registered so they ease in and out (0.2s, house curve). Gap above the
  action buttons cut from 3.5rem to 1.25rem.
- `tools/ui-test/test.js` discover step: logs the fade classes at top / end and takes `05b-preview-fade-top`,
  `05c-preview-fade-mid`.

## Verification
- Typecheck clean for touched files; `apply` compiled; `@property` rules present in the built CSS.
- `test discover` (1600x1000): at the top only `fade-bottom` (the Photos label dissolves above the buttons instead of
  being sliced); at the end only `fade-top` (top line fades, Genres pills sit right above the buttons).
- Not checked: the Player side drawer and TV guide preview, which share MetaPreview; the real Stremio window.

## Follow-ups
- Same treatment for other hard-clipping scroll areas (Details stream list, Discover grid under the filter row from
  task 007) if wanted.

## Addendum: action buttons fill the row
- User: "These buttons need to be improved to fill the space. Remove the trailer button" (screenshot: trailer circle,
  library/watched pair and a small Show pill spread across the row with gaps).
- `routes/Discover/Discover.js` (`// [mods]`): no trailer button in the Discover preview while the RT panel is on
  (the panel already plays the trailer); with the RT panel off it comes back so a trailer stays reachable.
- `components/MetaPreview/Actions.less` (`// [mods]`): Show grows to fill the rest of the row (`flex: 1 1 auto`), so the
  row is the library/watched pair plus one wide Show button.
- Verified: `apply` compiled; `test discover` shot `05b`: pair on the left, Show filling the remaining width.
