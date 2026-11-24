# 021 · Dropdown open/close mirrored

- **Date:** 2026-11-24
- **Status:** done
- **Brief:** "Animate out on the dropdown menu needs to be the reverse of the animate in. The corners need to go first then the dropdown menu all smoothly; apple esque"

## Plan
- Open is two overlapping steps: the label's corners square off (and take the sheet colour), then the sheet unfolds.
- Close mirrors it: the sheet folds up, then the label's corners round back, all inside one timer.

## Done
- `Dropdown.less`: choreography tokens: corners 140ms, wipe 220ms, 60ms overlap. Open delay 80ms, close total 300ms
  (`@sheet-close-ms`, still drives the unmount timer). Sheet curve is now `cubic-bezier(0.32, 0.72, 0, 1)` (iOS sheet),
  corners `cubic-bezier(0.25, 0.1, 0.25, 1)`.
- `MultiselectMenu.less`: inline and portal sheets open after `@sheet-open-delay`. `.active[data-closing]` returns the
  label to its resting radius/colour/blur, with a 160ms delay, so it's at rest before unmount (no jump when `.active` drops).
  Resting colour comes from `--ms-rest-bg` (SeasonsBar sets it to `--overlay-color`; its active rule skips `[data-closing]`).
- `MultiselectMenu.tsx`: `reopened` flag. A click while closing reopens the sheet with no delay, since the label is already square.

## Verification
- Probe that samples every 20ms in the test browser (season dropdown, portal path):
  open: radius 19.25→0 over 0–140ms, clip starts at ~80ms and is done ~300ms.
  close: clip 0–220ms, radius stays 0 until ~170ms, then rounds to 19.25 by ~300ms, sheet unmounts at 320ms.
- `episodes` test passes; shot 17 unchanged.
