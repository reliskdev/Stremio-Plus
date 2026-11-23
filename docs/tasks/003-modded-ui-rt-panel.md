# 003 · Modded Stremio UI + RT panel

- **Date:** 2026-11-23
- **Status:** done
- **Brief:** "Improve the UI further to have better homepage rather than just rows. And when I'm in this larger dropdown show more information pulled from rotten tomato to provide better descriptions images and a trailer box. Edit stremio code if necessary" + "You can edit the actual app… like spicetify"

## Plan
- Stremio.app supports `--webui-url`; fork stremio-web, serve the build locally, never modify the app bundle.
- Scrape RT title pages (consensus, synopsis, cast, photos, trailer via thePlatform mp4) → `/api/rt/:imdb`.
- RT panel in Discover preview + Details; feed Board Spotlight from an RT catalog; background trailers.

## Done
- Addon: `lib/details.js`, `lib/enrich.js`, Spotlight catalog, `/api/rt`, UI static host on :7011.
- Web: `src/rt/*` (useRt, RtPanel, RtSpotlight, Icons, useRtSpotlightDefault, util); hooks in Discover, Hero,
  Spotlight, Slide, Board.

## Verification
- Headless Brave screenshots of Board, Discover, Details; trailer playback and lightbox exercised.
