# 001 — Dropdown open/close: ease-out, 200ms, house curve

- **Status**: DONE
- **Commit**: web@19c3aac
- **Severity**: HIGH (close uses ease-in) + LOW (open uses a parallel drawer curve)
- **Category**: Easing & duration / Cohesion
- **Estimated scope**: 1 file, 4 lines

## Problem
`web/src/components/MultiselectMenu/Dropdown/Dropdown.less:13-16` (current):
```less
@sheet-open-duration: 0.24s;
@sheet-open-ease: cubic-bezier(0.32, 0.72, 0, 1);
@sheet-close-duration: 0.16s;
@sheet-close-ease: cubic-bezier(0.4, 0, 1, 1);
```
The close (sheet wipe and label rounding back, used in `MultiselectMenu.less:23,49,61,70`) is an **ease-in** curve on an exit: it starts slow,
delaying exactly what the user is watching. The open uses an iOS drawer curve at 240ms, a parallel token; dropdowns budget 150–250ms ease-out.

## Target
```less
@sheet-open-duration: 0.2s;
@sheet-open-ease: cubic-bezier(0.2, 0.7, 0.2, 1);   // house ease-out (routes/Details/variables.less @ease)
@sheet-close-duration: 0.16s;
@sheet-close-ease: cubic-bezier(0.2, 0.7, 0.2, 1);  // exits ease out too
```
(If plan 005 has landed, use `@mods-ease` from `web/src/mods/motion.less` instead of the literal.)

## Repo conventions
- House curve: `web/src/routes/Details/variables.less:15` `@ease: cubic-bezier(0.2, 0.7, 0.2, 1);`
- `CLOSE_MS = 160` in `MultiselectMenu.tsx` must keep matching `@sheet-close-duration` (plan 002 removes the duplication).

## Steps
1. Replace the four lines above with the target values.

## Boundaries
- Only these token values. No keyframe, markup or JS changes.

## Verification
- Mechanical: `bin/stremio-plus build` → "compiled".
- Feel check: open/close the season dropdown on a series page; in DevTools Animations at 10% the close starts moving immediately
  (no slow start) and the label's bottom corners round back with the same curve.
- Done when: no `cubic-bezier(0.4, 0, 1, 1)` or `0.32, 0.72, 0, 1` remains under `web/src/components/MultiselectMenu/`.
