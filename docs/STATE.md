# Stremio+ · current state

_Describes what exists now. History lives in `tasks/`. Updated at the end of every task._

## Running it
- `bin/stremio-plus launch` or ~/Applications/Stremio+.app → Stremio.app with `--webui-url=http://127.0.0.1:7011/`.
- One Node server (`addon/server.js`): addon on :7010, modded UI (`web/build`) on :7011.
- Modded UI has its own storage origin: the user logs in once there; the addon is installed by pasting
  `http://127.0.0.1:7010/<config>/manifest.json` into Stremio's addon search (stremio:// links force https).

## Features
### Addon (`addon/`), also works in stock Stremio
- Catalogs: RT · Spotlight (curated, always on), Popular / Certified Fresh / Critics & Audiences Agree /
  New & Fresh / In Theaters movies; Popular / Critically Acclaimed (85%+) / New & Fresh TV; optional
  "Best on <service>" rows (Netflix, Prime Video, Disney+, HBO Max, Apple TV+, Hulu, Peacock, Paramount+).
- Genre filter on every row; min Tomatometer / Popcornmeter thresholds; config encoded in the manifest URL.
- Metas enriched with RT details + Cinemeta (logo, background, runtime, genres, cast, mp4/YouTube trailers).
- Posters with score badges (`/poster/tt….jpg`, sharp), toggleable.
- `/api/rt/:imdb`: RT details for any title (known match or URL-slug guess with title sanity check).
- Configure page at :7010/configure (still in the older gradient-heavy style; not yet restyled).

### Modded UI (`web/`, branch `rt-mod`)
- RT panel (`src/rt/RtPanel.tsx`) in Discover preview and Details hero: scores (Facts-style), synopsis with
  show more, critics consensus, audience says, trailer (mp4 or YouTube), photos + lightbox, cast, facts footer.
- Spotlight: auto-set to RT · Spotlight once; score pills + "Certified Fresh" text; muted background trailer;
  16s slides.
- Clean poster grids (`MetaItem`): no titles under posters; blurred hover strip with name + scores.
- Clean posters: badge posters swapped for clean metahub art in the modded UI.
- Settings → Mods: toggles (wide rows, hover trailers, spotlight trailers, clean grids, clean posters, RT panel),
  accent colour (Stremio purple, red, tomato, emerald), addon server status, reset.
- Wide home rows (`src/mods/FlixRow.tsx`): landscape cards + hover preview. **Off by default** (user said
  "Stremio+, not Netflix"); restyled to native vocabulary.

## Design rules
PRODUCT.md + DESIGN.md. Native Stremio styling; no gradients/bordered tinted boxes/strokes/glows/eyebrow labels.

## Known issues
- RT has no public API; scraping can break if RT changes markup or endpoints.
- ~2% of RT titles don't match an IMDb id (very new/obscure); they're omitted from rows.
- Rows from Cinemeta appear above RT rows on the Board (addon order).
- Old-style configure page (see above).

## Open follow-ups
- Restyle the addon configure page to DESIGN.md.
- Consider showing RT scores in Search results and Library.
- Optional: auto-start server at login (LaunchAgent), not done.
