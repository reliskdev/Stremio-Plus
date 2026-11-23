# 016 · Dropdown corners, motion, shadow, leftover purple

- **Date:** 2026-11-24
- **Status:** done
- **Brief:** "Keep it whats seen before unrounding the bottom corners. Right now it looks about half. Before it got twice as round in dropdown. The animations feel rough, theres still purple, and theres a odd clipping shadow which all needs fixing" (screenshot: sheet corner with a hard-edged shadow)

## Plan
- Corners: the open label keeps exactly its closed corner radius on the far side; only the corners touching the
  list square off. (Task 014's 2.75rem grew once the bottom radii were 0 because the browser no longer clamped it;
  task 015 halved it to 0.75rem. Both wrong.)
- Motion: one curve for opening (240ms, cubic-bezier(.32,.72,0,1)) on label and sheet together; a real close
  animation (160ms ease-in) by keeping the menu mounted while it folds back.
- Shadow: the wipe's clip-path ended at `inset(0 0 -2rem 0)`, cutting the blur at the sides; extend all sides
  except the label seam; softer shadow.
- Purple: saved accents predate Monochrome, so the user's profile still had `stremio`; migrate once.

## Done
- `MultiselectMenu.less` rewritten: `--ms-radius` (label pill radius; SeasonsBar sets 1.375rem, 1.5rem on mobile)
  used for closed and open-far-side corners; open state only when not `[data-closing]`, so label colour/corners
  ease back while the sheet closes. Portal sheet `.closing` plays `sheet-close`/`sheet-close-up`.
- `Dropdown.less`: shared tokens (`@sheet-radius` back to 1.375rem, shadow 0 .75rem 1.5rem /.3, open/close
  durations and curves) and a `.sheet-keyframes()` mixin used by both modules; clip-path keeps -3rem on the three
  free sides.
- `MultiselectMenu.tsx`: `closeMenu` sets `closing`, waits 160ms, then unmounts; toggling routes through it;
  `data-closing` on the label container, `closing` class on the portal menu.
- `SeasonsBar.less`: `--ms-radius`, open colour only when not closing.
- `mods/settings.ts`: one-time `mods:scheme-mono-v1` migration moves a saved accent to `mono`.

## Verification
- Build compiled; tsc clean for touched files.
- `episodes` test: closed label radius 19.25px; open label 19.25px 19.25px 0 0; sheet 0 0 19.25px 19.25px; same
  bg; gap 0; after close the menu is unmounted and the label is back to 19.25px.
- Frames frozen with `document.getAnimations()`: opening at 110ms (nearly open; fast-out curve), closing at 80ms
  (half folded). No hard shadow edges.
- Migration not exercised on the user's real profile; it runs on their next load.

## Follow-ups
- Gamepad modal and toasts still use hard-coded purple (not on screens the user has shown).
