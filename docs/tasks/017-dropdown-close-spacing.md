# 017 · Dropdown close order + option spacing

- **Date:** 2026-11-24
- **Status:** done
- **Brief:** "Uicorner shouldnt round back until the dropdown is fully folded back in. Each selection item in the dropdown needs a bit more spacing."

## Plan
- Label keeps its open look (sheet colour, square edge) for the whole close animation; it rounds back only after
  the menu unmounts.
- Options: 2.5rem → 2.75rem rows, 2px gap, 1rem side padding.

## Done
- `MultiselectMenu.less` / `SeasonsBar.less`: open styles no longer exclude `[data-closing]`; the label's resting
  transition (160ms) runs after the sheet is gone.
- `Option.less`: height 2.75rem, padding 0 1rem, 0.125rem between rows. `Dropdown.less`: `@item-pitch` used for
  the 7-row max-height (parenthesised: unparenthesised it expanded inside calc() to one row).

## Verification
- `episodes` test, read inside the page: 80ms into closing via the label: radius 19.25 19.25 0 0, active, sheet
  mounted; 400ms: 19.25px, sheet gone. Same when closing by picking a season.
- Shot 17: seven roomier rows. First build showed a single row (calc precedence), fixed and re-shot.
- Test note: freezing animations doesn't pause the 160ms close timer; multi-call puppeteer clicks can race it.
