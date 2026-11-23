# 015 · Monochrome scheme + halved dropdown corners

- **Date:** 2026-11-24
- **Status:** done
- **Brief:** "Top two uicorners need their amount halved when the bottom uncorners. I also want the monochrome color scheme" (screenshots: open dropdown label; streams filter dropdown with purple dot)

## Plan
- Open dropdown label: top radius pill → `--border-radius` (0.75rem, half the pill); sheet bottom matches.
- New accent "Monochrome" in Settings → Mods, made the default: neutral grey accents, neutral backgrounds,
  neutral dropdown/tooltip surfaces, white selection dot.

## Assumptions
- "Monochrome colour scheme" = a whole-app scheme (accents + backgrounds), offered as an accent choice so it can be
  switched back. Stremio logo and status colours (Running green, IMDb yellow, RT icons) stay coloured.
- Sheet bottom corners also set to 0.75rem so the open shape has one radius (brief only named the top).

## Done
- `mods/settings.ts`: `Accent` gains `mono` (default). Accents can set `--secondary-accent-color`; mono also sets
  `--mods-surface`, `--mods-surface-raised`, `--mods-selection`, neutral `--primary/secondary-background-color`,
  `--modal-background-color`, and a black shadow for `--outer-glow`.
- Dropdown / season label / tooltip surfaces read `--mods-surface(-raised)` with the old tinted colours as fallback;
  the selected-option dot reads `--mods-selection`.
- `MultiselectMenu.less`: open label radius `0.75rem 0.75rem 0 0` (mirrored when above); resting radius 2.75rem →
  1.5rem so the transition starts immediately instead of waiting through the clamped range.
- `Settings/Mods/Mods.tsx`: swatch can differ from the accent (white swatch for mono). **Bug fix:** since task 008
  removed a toggle, `TOGGLES.slice(0, 5)` / `TOGGLES[5]` put the RT toggle in Look & feel and read `undefined`
  (page crash); now `slice(0, 4)` / `TOGGLES[4]`.
- `tools/ui-test`: `mods` step; `episodes` step clears a saved accent first.

## Verification
- Build compiled; tsc clean for touched files.
- Computed styles: label radius 10.5px 10.5px 0 0, sheet 0 0 10.5px 10.5px, both rgba(40,40,44,.96), gap 0.
- Shots 17 (neutral dropdown, white dot) and 18 (Settings → Mods in monochrome: grey background, grey toggles).
- A saved accent in the user's profile wins over the new default; they may need to pick the white swatch once.

## Follow-ups
- Player and Discover not screenshotted in monochrome.
