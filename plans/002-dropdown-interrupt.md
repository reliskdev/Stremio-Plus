# 002 — Dropdown: reopening mid-close works; one source for the close duration

- **Status**: DONE
- **Commit**: web@19c3aac
- **Severity**: MEDIUM
- **Category**: Interruptibility
- **Estimated scope**: 2 files

## Problem
`web/src/components/MultiselectMenu/MultiselectMenu.tsx:30-45` (current):
```tsx
const closeMenu = React.useCallback(() => {
    if (closeTimer.current !== null) return;
    setClosing(true);
    closeTimer.current = window.setTimeout(() => { closeTimer.current = null; setClosing(false); closeMenuNow(); }, CLOSE_MS);
}, [closeMenuNow]);
const toggleMenu = React.useCallback(() => {
    if (menuOpen) closeMenu(); else openMenu();
}, [menuOpen, closeMenu, openMenu]);
```
While the sheet folds away (160ms), `menuOpen` is still true, so a click on the label calls `closeMenu`, which returns early: the click is
swallowed and the user cannot reopen. `CLOSE_MS = 160` also duplicates `@sheet-close-duration` in `Dropdown.less`.

## Target
- Toggling while closing cancels the close (timer cleared, `closing` false): the label stays open-styled and the sheet replays its open.
- The close duration lives once in Less and is exported to TS via CSS-modules `:export`.

## Steps
1. `Dropdown.less`: replace `@sheet-close-duration: 0.16s;` with
   `@sheet-close-ms: 160;` and `@sheet-close-duration: unit(@sheet-close-ms, ms);`
2. `MultiselectMenu.less` (top level): add `:export { sheetCloseMs: @sheet-close-ms; }`
3. `MultiselectMenu.tsx`: `const CLOSE_MS = Number(styles.sheetCloseMs) || 160;` (replace the literal), add
   ```tsx
   const cancelClose = React.useCallback(() => {
       if (closeTimer.current === null) return;
       window.clearTimeout(closeTimer.current);
       closeTimer.current = null;
       setClosing(false);
   }, []);
   ```
   and make `toggleMenu`: `if (closing) cancelClose(); else if (menuOpen) closeMenu(); else openMenu();` (deps: closing, cancelClose).

## Boundaries
- Don't touch Popup.js or the outside-click/escape paths (they keep closing with the animation).

## Verification
- Mechanical: `cd web && npx tsc --noEmit -p .` no new errors in MultiselectMenu; build compiles.
- Feel check: open the season dropdown, click the label to close and immediately click again: it reopens instead of ignoring the click.
- Done when: CLOSE_MS reads from styles; the double-click test reopens.
