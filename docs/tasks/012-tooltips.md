# 012 · Tooltip popups

- **Date:** 2026-11-24
- **Status:** done
- **Brief:** "Improve the [Image] popups." (screenshot: the "Like" hover tooltip on the Details actions)

## Plan
- Restyle the app-wide tooltip (`src/App/styles.less` `.tooltip-container`, `common/Tooltips/TooltipItem`):
  compact 999px pill, dark blurred panel surface (DESIGN.md panel), smaller type, no outer glow.
- Motion: short hover delay before showing, fade + 4px slide toward the target, instant hide.
- Tighter gap to the button (15px → 10px default margin).

## Assumptions
- "Popups" = the hover tooltips (all of them, app-wide), not menus or modals.

## Done
- `web/src/App/styles.less` `.tooltip-container` ([mods]): 2rem 999px pill, 0.85rem/600, raised neutral
  rgba(46,43,60,.9) + blur(8px) saturate(1.2), soft drop shadow; removed `--outer-glow` and the full-opacity
  modal background. Entrance keyframe (`tooltip-in`): 0.3s hover delay, 180ms fade + 4px slide from the target
  side; hides instantly; reduced motion gets a plain fade.
- `common/Tooltips/TooltipItem/TooltipItem.js`: sets `--tooltip-dx/dy` per position for the slide direction.
- `common/Tooltips/Tooltip/Tooltip.js`: default gap 15px → 10px.
- `tools/ui-test`: `tooltip` step (hovers Add to Library on Severance S2E10).

## Verification
- Build compiled. Shots 14 (150ms after hover: nothing yet) and 15 (after delay: pill above the button).
- First attempt used the dark panel colour rgba(12,11,17,.82): invisible on the dark page, so the label floated;
  switched to the raised neutral.
- Applies app-wide (nav bar, player, details); only the Details actions were screenshotted.

## Follow-ups
- Check the player control tooltips over bright video.
