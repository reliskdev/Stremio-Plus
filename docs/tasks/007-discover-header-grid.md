# 007 · Discover header + grid polish

- **Date:** 2026-11-23
- **Status:** done
- **Brief:** "Improve the; search bar, filter bars in the header to better match the app theming. Dont clip on the header rather fade the contents out [Image #4]. [Image #5]. The cards should also be larger in the see more menus and have less padding also be closer to the preview card on the right."

## Plan
- Search bar (HorizontalNavBar SearchBar): slimmer DESIGN.md pill (2.75rem), overlay + blur, hover/focus white 10%, secondary-text placeholder, smaller icon.
- Discover filter pills (MultiselectMenu label in `.select-input`): 2.5rem 999px pills sized to content, overlay + blur, hover white 10%, tighter gaps, @ease transitions.
- Discover grid: fade posters out under the filter row with a mask on the scroll container instead of a hard clip (later removed, see Done).
- Discover grid: one column fewer per breakpoint, smaller card padding/gap, smaller gap to the preview panel.

## Assumptions
- "See more menus" = the Discover page (what "See all" on a Board row opens).
- The fade is a scroll-edge mask (functional), not a decorative gradient, so it fits DESIGN.md.
- Header changes apply globally (search bar is shared), filter pill changes scoped to Discover.

## Done
- `components/NavBar/HorizontalNavBar/SearchBar/styles.less` (+ nav `styles.less` height): search pill 2.75rem, overlay + blur(5px),
  hover/focus white 10%, 0.95rem text, .46 placeholder and icon, 1.25rem icon; history menu as a blurred 1.5rem panel.
- `routes/Discover/styles.less` `[mods]` block: filter pills 2.5rem, sized to content (9–16rem), 0.75rem gaps, blur,
  hover white 10%; round 2.5rem filter button.
- Grid: one column fewer at every desktop breakpoint (4 at 1600px instead of 5), card padding 1rem to 0.4rem,
  no grid gap, and the gap to the preview panel cut from ~3rem to ~1rem.
- Scroll fade: built as a mask on the grid, then **removed at the user's request** ("remove the fadeout for now").
  The grid clips under the filter row again.
- `tools/ui-test/test.js`: new `04b-discover-grid-scrolled` shot in the discover step.

## Verification
- tsc: no errors in touched files. `bin/stremio-plus build`: compiled (2 existing warnings).
- Looked at the discover shots (04, 04b) at 1600×1000: pills and search bar render as intended, cards are larger and closer to the preview.
- Not checked: other window widths, the open dropdown, or the search history menu.

## Follow-ups
- Scroll fade under the filter row, if wanted later (a mask-image on `.meta-items-container` worked).
- Maybe apply the same pill styling to the Library and Search filter bars.
