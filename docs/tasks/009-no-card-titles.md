# 009 · No names below cards

**Brief:** "Remove the names below the cards." (screenshot: "Dexter" + ⋮ under a Continue Watching card)

## Done
- Clean cards already hid titles, but only on cards without a ⋮ menu (`!hasOptions`), so Continue Watching /
  Library cards kept their name row. Now the title bar is hidden on every card when Clean cards is on.
- The ⋮ menu moves onto the poster's top-right as a 2rem blurred pill (`--overlay-color` + blur(5px)),
  shown on hover like before (always visible on touch). Name + scores still appear in the hover strip.
- Files: `src/components/MetaItem/MetaItem.js` (`mod-clean` class), `styles.less` ([mods] block).

## Verification
- Build OK; tsc error count unchanged (38, all upstream). Board shot: no titles under catalog cards.
- Not screenshotted: menu pill (guest test profile has no Continue Watching/Library items).

## Follow-ups
- Check the menu pill on real Continue Watching cards.
