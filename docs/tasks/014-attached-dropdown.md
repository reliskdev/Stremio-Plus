# 014 · Attached dropdown sheet

- **Date:** 2026-11-24
- **Status:** done
- **Brief:** "The dropdown should animate the bottom two uicorners sharp and have the square list animateo ut of that with the same coloring and stylinog" (screenshot: season dropdown from task 013)

## Plan
- Label and list become one shape: on open the label takes the sheet colour and its bottom corners animate to 0;
  the list sits flush (no gap) with square top corners and rounded bottom, and wipes down out of the label.
- Mirror when the menu opens upward. Apply to all MultiselectMenu dropdowns (portal and inline).

## Assumptions
- Replaces task 013's floating panel with a 6px gap (brief wins).
- Closing is instant (menu unmounts); only the label corners animate back.

## Done
- `components/Popup/Popup.js` ([mods]): `attached` prop removes the 4px gap; sets `data-side` on the menu and
  `data-popup-side` on the label (below/above), cleared on close.
- `components/MultiselectMenu/MultiselectMenu.tsx`: portal menus pass `attached`.
- `MultiselectMenu.less`: open label (`.active` / global `.active`) gets sheet bg + blur, bottom radii 0 with a
  180ms radius transition (top radii when opening above); label button inherits the container radius. Portal sheet
  `.menu-popup`: sheet bg, radius 0 0 1.375rem 1.375rem, drop shadow, `sheet-down`/`sheet-up` clip-path wipe 200ms.
- `Dropdown/Dropdown.less`: shared sheet tokens; inline dropdown flush at `top: 100%`, same radius and wipe.
- `Details/Videos/SeasonsBar.less`: open season label uses the sheet colour, no hover tint.

## Verification
- Build compiled. Shot 17 (Dexter season dropdown): label and list read as one shape.
- Computed styles in the `episodes` test: side below, animation `sheet-down` 0.2s, menu radius 0 0 19px 19px,
  label radius 38px 38px 0 0, identical bg rgba(36,33,50,.96), gap 0.
- Animation frames not captured (headless screenshot latency > 200ms). Upward opening and the Settings/Discover
  dropdowns not screenshotted.

## Follow-ups
- Settings dropdowns: the sheet is max(11rem, label width), so it can be wider than a narrow label.
- Exit animation (would need the menu to stay mounted while closing).
