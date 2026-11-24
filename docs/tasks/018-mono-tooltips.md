# 018 · Monochrome tooltips

- **Date:** 2026-11-24
- **Status:** done
- **Brief:** "Make the tooltips use the monochrome colours too"

## Done
- App tooltip (`App/styles.less`): background `var(--mods-surface)`, the same neutral as the dropdown sheet
  (was a separate "raised" grey); `saturate(1.2)` dropped from its blur so artwork colour doesn't bleed into it.
  `--mods-surface-raised` removed.
- Player seek-bar tooltip (`Player/ControlBar/SeekBar/styles.less`): `var(--mods-surface, --modal-background-color)`.

## Verification
- `tooltip` test (accent reset to the default): active tooltip computes `rgba(40, 40, 44, 0.96)`, `blur(8px)`;
  shot 15 neutral grey pill. Seek tooltip not screenshotted (needs playback).
- Non-monochrome accents keep the old tinted tooltip colour as fallback.
