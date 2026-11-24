# 004 — Tooltips: instant once one has been shown

- **Status**: DONE
- **Commit**: web@19c3aac
- **Severity**: MEDIUM
- **Category**: Easing & duration
- **Estimated scope**: 3 files

## Problem
`web/src/App/styles.less:229` (current): `animation: tooltip-in 0.18s cubic-bezier(0.2, 0.7, 0.2, 1) 0.3s both;` applies to every tooltip,
including the next button in a toolbar (Details actions, player controls). Scanning a toolbar waits 300ms + 180ms per button.

## Target
The first tooltip keeps the 300ms delay + 180ms entrance. A tooltip that activates while another is visible, or within 300ms of a
*visible* one hiding, shows instantly (no delay, no animation). "Visible" = it was active for at least 300ms (past its delay).

## Steps
1. `web/src/common/Tooltips/TooltipProvider.js`: keep refs `lastVisibleHide = useRef(0)`; in `update(id, state)`:
   - on `state.active === true`: `instant = others.some(t => t.active && now - t.activeSince >= 300) || now - lastVisibleHide.current < 300`;
     store `activeSince: now, instant` on the tooltip.
   - on `state.active === false` for a tooltip that was active: if `now - activeSince >= 300` set `lastVisibleHide.current = now`.
   Tag edits `// [mods]`.
2. `TooltipItem.js`: accept `instant`; class `{ 'instant': instant }` (global) next to `'active'`.
3. `App/styles.less` in `.tooltip-container`: `&:global(.active.instant) { animation: none; }`.

## Verification
- `bin/stremio-plus test tooltip` still shows the first tooltip after the delay.
- Feel check: on a Details page, hover Library, wait for its tooltip, slide to Watched: its tooltip appears at once.
