# Stremio+ · current state

_Describes what exists now. History lives in `tasks/`. Updated at the end of every task._

## Running it
- `bin/stremio-plus launch` or ~/Applications/Stremio+.app → Stremio.app with `--webui-url=http://127.0.0.1:7011/`.
- One Node server (`addon/server.js`): addon on :7010, modded UI (`web/build`) on :7011.
- Modded UI has its own storage origin: the user logs in once there; the addon is installed by pasting
  `http://127.0.0.1:7010/<config>/manifest.json` into Stremio's addon search (stremio:// links force https).
- Stock Stremio loads https://web.stremio.com/; the modded origin has separate storage, hence the separate login.

- Optional login agent (`bin/stremio-plus enable`, LaunchAgent `com.stremio-plus.agent`): keeps the server up and,
  when Stremio is opened normally (Dock/Spotlight), quits and reopens it with `--webui-url` within ~1s.
  `vanilla` pauses this until the next `launch`; `disable` removes it. Log: `addon/data/agent.log`.

## Features
### Addon (`addon/`), also works in stock Stremio
- Catalogs: RT · Spotlight (curated, always on), Popular / Certified Fresh / Critics & Audiences Agree /
  New & Fresh / In Theaters movies; Popular / Critically Acclaimed (85%+) / New & Fresh TV; optional
  "Best on <service>" rows (Netflix, Prime Video, Disney+, HBO Max, Apple TV+, Hulu, Peacock, Paramount+).
- Genre filter on every row; min Tomatometer / Popcornmeter thresholds; config encoded in the manifest URL.
- Metas enriched with RT details + Cinemeta (logo, background, runtime, genres, cast, mp4/YouTube trailers).
- Posters with score badges (`/poster/tt….jpg`, sharp), toggleable.
- `/api/rt/:imdb/episode/:s/:e`: episode IMDb rating + RT Tomatometer.
- `/api/rt/:imdb`: RT details for any title (known match or URL-slug guess with title sanity check).
- Configure page at :7010/configure (still in the older gradient-heavy style; not yet restyled).

### Modded UI (`web/`, branch `rt-mod`)
- RT panel (`src/rt/RtPanel.tsx`) in Discover preview and Details hero: scores (Facts-style), synopsis with
  show more, critics consensus, audience says, trailer (mp4 or YouTube), photos + lightbox, cast, facts footer.
- Episode hero (Details with an episode selected): episode IMDb rating (IMDb datasets, `addon/data/imdb-episodes.json`)
  in Stremio's IMDb fact + RT Tomatometer fact when RT scores the episode (`/api/rt/:imdb/episode/:s/:e`).
- Episode list: IMDb rating per row (`/api/imdb/:imdb/episodes`); episode search removed.
- Dropdowns (MultiselectMenu, app-wide): attached sheet; the open label squares only the edge touching the list (far corners unchanged) and the list wipes out of it in the same colour, folding back on close. Open: corners square first, then the sheet unfolds; close is the exact reverse; inset rounded rows, accent dot for selection.
- Motion: house ease-out `@mods-ease` (`src/mods/motion.less`); animation plans and their status in `plans/`.
- Tooltips (app-wide): first one after 0.3s, neighbours instant; compact pill in the dropdown surface colour (neutral in Monochrome), 0.3s hover delay, slide-in, no glow.
- Spotlight: Stremio's stock board, unmodified (user likes it; task 008).
- Clean poster grids (`MetaItem`): no titles under any card (incl. Continue Watching / Library; ⋮ menu is a blurred pill on the poster corner); blurred hover strip with name + scores.
- Clean posters: badge posters swapped for clean metahub art in the modded UI.
- Settings → Mods: toggles (wide rows, hover trailers, clean grids, clean posters, RT panel),
  accent / colour scheme (Monochrome default: neutral greys app-wide; Stremio purple, red, tomato, emerald), addon server status, reset.
- Discover: slim blurred search + filter pills (DESIGN.md pills), larger posters (one column fewer), tight padding, small gap to preview.
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
- Discover grid still clips hard under the filter row (fade tried and removed, task 007).
- Login agent (`bin/stremio-plus enable`) written; needs the user to run it once (task 010).
