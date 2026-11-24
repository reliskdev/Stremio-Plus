# 034 · Back button on service pages

- **Date:** 2026-11-24
- **Status:** done
- **Brief:** "Back button needs to popup when tapping on a streaming service"

## Plan
- `MainNavBars` (`// [mods]`): optional `backButton` prop passed to `HorizontalNavBar` (Stremio's own back button,
  as on Details), default off.
- `ServicePage`: turn it on, so opening a service shows the back chevron top-left; it goes back to the Board.

## Assumptions
- Same back button and behaviour as Details (Stremio's `useGoBack`), keeping the side nav visible.

## Done
- `web/src/components/MainNavBars/MainNavBars.tsx` (`// [mods]`): `backButton` prop (default false) forwarded to
  `HorizontalNavBar`.
- `web/src/mods/home/ServicePage.tsx`: `backButton` on the page and its fallback.
- `tools/ui-test/test.js` `services` step: clicks the back button and logs the route.

## Verification
- Typecheck clean; build compiled. `test services`: back button present on `#/service/netflix`, click returns to
  `#/`; screenshot shows the chevron top-left over the banner.
- Not checked in the real window: next to the traffic lights it uses the same mac title-bar rules as Details' back
  button.

## Follow-ups
- None.
