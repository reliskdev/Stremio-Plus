# 001 · Rotten Tomatoes addon

- **Date:** 2026-11-23
- **Status:** done
- **Brief:** "Can you build a plugin to pull the best recommended shows/movies from rotten tomatoes with the popcornmeter tomatometer etc to show what can be watched. All with nice UI"

## Plan
- Use RT's browse JSON (`/cnapi/browse/...`); no public API exists.
- Match titles to IMDb ids via Cinemeta search so stream addons work.
- Express server implementing the Stremio addon protocol; configure page; badge posters via sharp.

## Done
- `addon/server.js`, `lib/rt.js`, `lib/match.js`, `lib/poster.js`, `lib/config.js`, `public/configure.html`.
- Catalogs incl. per-service rows, genre filter, score thresholds, config in URL.

## Verification
- All catalogs return data; 146/149 titles matched; posters rendered and inspected.

## Follow-ups
- Configure page style predates DESIGN.md.
