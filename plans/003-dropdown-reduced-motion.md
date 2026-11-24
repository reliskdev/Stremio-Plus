# 003 — Dropdown: reduced-motion variant

- **Status**: DONE
- **Commit**: web@19c3aac
- **Severity**: MEDIUM
- **Category**: Accessibility
- **Estimated scope**: 2 files

## Problem
The sheet wipes open/closed with clip-path keyframes (`Dropdown.less:62` `animation: sheet-open …`, `MultiselectMenu.less:58-70`
`sheet-open/-close/-open-up/-close-up`) with no `prefers-reduced-motion` handling.

## Target
Under `@media (prefers-reduced-motion: reduce)` the sheet fades (opacity) with the same durations and curves instead of wiping.
```less
@keyframes sheet-fade-in { from { opacity: 0; } }
@keyframes sheet-fade-out { to { opacity: 0; } }
```

## Steps
1. `Dropdown.less`: add both keyframes inside the `.sheet-keyframes()` mixin; in `.dropdown.open` add
   `@media (prefers-reduced-motion: reduce) { animation-name: sheet-fade-in; }`.
2. `MultiselectMenu.less`: in `.menu-popup.menu-popup` add
   `@media (prefers-reduced-motion: reduce) { animation-name: sheet-fade-in; &.closing, &[data-side='above'].closing { animation-name: sheet-fade-out; } &[data-side='above'] { animation-name: sheet-fade-in; } }`
   and in `.multiselect-menu` `&[data-closing] .dropdown-sheet` the same fade-out for reduced motion.
3. Leave the label's corner/colour transition as is (shape/colour change, not movement).

## Verification
- DevTools → Rendering → emulate prefers-reduced-motion: reduce; open/close: sheet fades, no wipe. Normal mode unchanged.
