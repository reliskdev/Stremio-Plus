# 020 · Motion audit (improve-animations) + fixes

- **Date:** 2026-11-24
- **Status:** done
- **Brief:** "run improve-animations on stremio+" then "do all of them and implement them"

## Audit
Emil Kowalski's `improve-animations` (standard effort, mod code only). Findings and plans in `plans/` (README + 001–007).
Done inline rather than with subagents: the mod's motion surface is ~15 rules in ~10 files.

## Done (web)
- 001 Dropdown: open 200ms, close 160ms, both on the house ease-out `cubic-bezier(0.2, 0.7, 0.2, 1)` (close was ease-in
  `cubic-bezier(0.4, 0, 1, 1)`; open was the drawer curve at 240ms).
- 002 Dropdown: a click on the label while the sheet folds away reopens it (`cancelClose`; portal close requests whose
  point is over the `[data-closing]` label cancel instead of close). Close duration lives once: `@sheet-close-ms` →
  `:export { sheetCloseMs }` → `CLOSE_MS` in MultiselectMenu.tsx.
- 003 Dropdown reduced motion: `sheet-fade-in/out` instead of the clip-path wipe.
- 004 Tooltips: `TooltipProvider` tracks when a tooltip has been seen (active ≥300ms); a tooltip that activates while one
  is seen, or within 300ms after, gets `instant` (no delay, no entrance), applied only once positioned.
- 005 `src/mods/motion.less` `@mods-ease`; mod files import it instead of retyping the curve.
- 006 RT lightbox: backdrop fade + image from scale(0.96), 200ms in / 150ms out (stays mounted while exiting);
  reduced motion fades only.
- 007 Episode-row IMDb rating and episode Tomatometer fade in over 150ms when their data arrives.
- Not done (by decision): trailer poster→player swap (poster frame is the same image; a fade would flash dark).

## Verification (`bin/stremio-plus test motion`, new step)
- Dropdown open: label radius/bg transitions 200ms on the house curve; sheet `sheet-open` 200ms, same curve.
- Two real clicks 8ms apart on the label: sheet open after 400ms. Single click: closes.
- Reduced motion emulated: `sheet-fade-in`.
- Lightbox: `lightbox-fade-in` + `lightbox-img-in` 0.2s; on Escape `-out` 0.15s; unmounted afterwards.
- Tooltips: first @100ms opacity 0, @700ms visible; neighbour @60ms `instant`, opacity 1; fresh hover after a 1.5s
  pause waits again.
- tsc error count unchanged (38, upstream). Builds compiled.
- Test note: synthetic `.click()` has clientX/Y 0, so it can't exercise the point-based reopen; use `page.mouse`.
