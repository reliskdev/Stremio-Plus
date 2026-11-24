# 024 · Player header scrim

- **Date:** 2026-11-24
- **Status:** done
- **Brief:** "Need to be able to see the header, have a shadow or black thing drop down behind when I hover so I can see text" (screenshot: player title over a bright frame, unreadable)

## Plan
- Strengthen the player nav bar's existing top scrim (`routes/Player/styles.less`, `.nav-bar-layer::before`):
  darker and taller, with eased stops so it fades out without a visible edge.
- It already fades in/out with the player overlay (hover / mouse move), so no new behaviour needed.

## Assumptions
- "Header" = the player's top bar (back button + title) shown on hover; the scrim stays tied to the overlay.
- Upstream's 0.35 gradient is a legibility scrim, not decoration, so strengthening it fits DESIGN.md (blur was
  rejected: a blurred strip over moving video reads as a band, not a shadow).
- Bottom control bar left as is (not in the brief).

## Done
- `web/src/routes/Player/styles.less`: `.nav-bar-layer::before` scrim goes from 0.35→transparent over 8rem to an eased
  0.8 / 0.55 / 0.22 / 0.06 / 0 ramp over 11rem. It still fades in and out with the player overlay.
- `tools/ui-test/test.js`: new `player` step (shot `22-player-header`). It opens the player for a Cinemeta episode, paints
  the frame light grey to stand in for a bright scene, and shows the overlay.

## Verification
- Build compiled; the new gradient is in `build/…/styles/main.css`. `bin/stremio-plus test player`: the title and back
  button read clearly over the light frame, and the fade has no visible edge.
- No TS touched, so no typecheck needed. Not checked in the real Stremio window with real video.

## Follow-ups
- The bottom control bar has the same weak 0.35 scrim, and the time labels wash out over bright frames. The same
  treatment would fix it if wanted.
