# 033 · Service page banner

- **Date:** 2026-11-24
- **Status:** done
- **Brief:** "[screenshot of the Netflix header] I want this top netflix thing to be like a banner covering the whole top bit fading out."

## Plan
- `ServicePage`: full-bleed banner at the top (under the nav bars, like Stremio's Spotlight) using the backdrop of
  the service's #1 title this week; artwork fades into the page at the bottom with a left scrim for the text.
- Logo, name and the note sit at the banner's bottom left, plus a quiet "Top this week: <title>" line saying what
  the art is. Rows start just under it.
- Nav bar gets Stremio's background once the page scrolls past the banner (Board's `scrolled` treatment).

## Assumptions
- Banner art = metahub backdrop of the first item of the first section (Top movies/shows this week).
- Fades are artwork scrims, which DESIGN.md allows.

## Done
- `web/src/mods/home/ServicePage.tsx`: banner header with the #1 title's metahub backdrop (`backdropFor`), logo,
  name, note and a "Top this week: <title>" link to that title; `scrolled` state past 200px.
- `ServicePage.less`: nav content runs under both nav bars (`.nav-content-container { top: 0; left: 0 }`), banner
  30rem (max 62vh) full-bleed, art masked to fade at the bottom, left scrim (also masked, no hard edge) behind the
  text; nav bar background fades in when scrolled (Board's `::after`); content padded past the vertical nav.

## Verification
- Build compiled. `test services`: Netflix banner with Obsession's backdrop covering the top under the search bar
  and side nav, fading into the page, logo/name/note/"Top this week: Obsession" bottom left, rows below; scrolled to
  the bottom the bar gets its background and posters clip under it. Fixed a hard band at the banner's bottom edge.

## Follow-ups
- Banner art is a still; could rotate through the top few titles or play the trailer like Spotlight.
