# Stremio+ · current state

_Describes what exists now. History lives in `tasks/`. Updated at the end of every task._

## Running it
- macOS: Stremio is patched (task 044, `stremio-plus patch` / `restore` / `status`; `setup` patches and enables the
  agent). Opening Stremio any way loads the mods with no relaunch; the Stremio+ launcher additionally injects the
  window-chrome dylib (a plain Dock/Spotlight launch has the normal title bar for now). The patch also swaps the
  launch animation for a purple one with a dotted "+" (`cli/splash.js`, rendered locally from Stremio's own splash).
- `bin/stremio-plus launch` or ~/Applications/Stremio+.app → Stremio.app with `--webui-url=http://127.0.0.1:7011/`.
- Cross-platform since task 043: Node CLI (`cli/`), per-OS modules for macOS / Windows / Linux, one-line installers
  (`install.sh`, `install.ps1`) that fetch the release tarball from GitHub (`tools/package.js` builds it; prebuilt UI
  in `ui/`, private Node in `runtime/` when the system has none). macOS verified; Windows and Linux untested.
- One Node server (`addon/server.js`): addon on :7010, modded UI (`web/build`) on :7011.
- Modded UI has its own storage origin: the user logs in once there; the addon is installed by pasting
  `http://127.0.0.1:7010/<config>/manifest.json` into Stremio's addon search (stremio:// links force https).
- Stock Stremio loads https://web.stremio.com/; the modded origin has separate storage, hence the separate login.

- Optional login agent (`bin/stremio-plus enable`, LaunchAgent `com.stremio-plus.agent`): keeps the server up and,
  when Stremio is opened normally (Dock/Spotlight), quits and reopens it with `--webui-url` within ~1s.
  `vanilla` pauses this until the next `launch`; `disable` removes it. Log: `addon/data/agent.log`.

- Window chrome dylib (`shell/chrome.m`, built to `shell/build/` by the CLI) is injected with `DYLD_INSERT_LIBRARIES`
  on every modded launch: no title bar, traffic lights inside the nav bar.

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
- `/api/seriesgraph/:imdb`: SeriesGraph per-episode IMDb ratings + community scores (TMDB id via Cinemeta), cached 12 h.
- `/api/home/*` (JustWatch, US): services + icons, service pages, weekly charts, similar-title picks (steered by `liked` / `avoid` thumbs), filtered browse for the Genres page.
- Configure page at :7010/configure (still in the older gradient-heavy style; not yet restyled).

### Modded UI (`web/`, branch `rt-mod`)
- RT panel (`src/rt/RtPanel.tsx`) in Discover preview and Details hero (both drop Stremio's Cast / Directors rows while it shows): scores (Facts-style), synopsis with
  show more, critics consensus, audience says, trailer (mp4 or YouTube), photos + lightbox, cast, facts footer.
- Episode hero (Details with an episode selected): episode IMDb rating (IMDb datasets, `addon/data/imdb-episodes.json`)
  in Stremio's IMDb fact + RT Tomatometer fact when RT scores the episode (`/api/rt/:imdb/episode/:s/:e`).
- Episode ratings (`src/rt/EpisodeHeatmap.tsx`): series overview on Details, under the trailer in the RT panel (alone
  without RT): season chips coloured by average (SeriesGraph's IMDb scale) + watched count; opens a popup
  (ModalDialog) with the season x episode grid, IMDb / SeriesGraph community source pills, Stremio watched badges,
  "Mark watched" mode (toggles watched via MetaDetails), legend, SeriesGraph link. Scores from
  `/api/seriesgraph/:imdb` (addon proxy of seriesgraph.com's public API), else the local IMDb dataset.
  "Random great episode" pill (Details and popup): opens a random episode rated 8.0+ (top quarter if too few);
  partway through a show only episodes you've watched; skips the last 5 picks.
- Episode list: IMDb rating per row (`/api/imdb/:imdb/episodes`); episode search removed.
- Dropdowns (MultiselectMenu, app-wide): attached sheet; the open label squares only the edge touching the list (far corners unchanged) and the list wipes out of it in the same colour, folding back on close. Open: corners square first, then the sheet unfolds; close is the exact reverse; inset rounded rows, accent dot for selection.
- Motion: house ease-out `@mods-ease` (`src/mods/motion.less`); animation plans and their status in `plans/`.
- Tooltips (app-wide): first one after 0.3s, neighbours instant; compact pill in the dropdown surface colour (neutral in Monochrome), 0.3s hover delay, slide-in, no glow.
- Spotlight: Stremio's stock board, unmodified (user likes it; task 008).
- Recommendations home (`src/mods/home/`, toggle `recsHome`, on): after Continue Watching, "Picked for you" (blend of
  titles similar to your library, watched first), a "Streaming services" row of logo cards (all 10, the ones picked in
  Settings → Mods → Home first), then "Because you watched X" rows; addon rows below.
- Service pages (`#/service/:id`, `ServicePage.tsx`, back chevron top-left): full-bleed banner (backdrop of the #1 title this week, fades out, runs under the nav bars) with logo, name and "Top this week: X", sideways-scrolling rows (top movies / shows
  this week, trending, popular movies / shows, new releases, top rated movies / shows), no See All.
- Genres page (`#/genres`, nav tab): heading from the filters ("Trending on Netflix") + ranking note, genre pills, type / service / sort dropdowns, poster grid with infinite scroll.
- Board poster rows (incl. Continue Watching): 14.5rem posters, tight gaps, sideways scroll like the service pages (`routes/Board/styles.less`).
- Clean poster grids (`MetaItem`): no titles under any card (incl. Search, Continue Watching / Library; ⋮ menu is a blurred pill on the poster corner); blurred hover strip with name, Tomatometer left and Popcornmeter right (certified icons for Certified Fresh / Verified Hot), and an award icon next to the Tomatometer (Oscar / Emmy / Golden Globe / BAFTA / trophy; gold = won with count, grey = nominated) from `/api/card/:imdb`, fetched on hover; JustWatch rows also get popcorn from `data/popcorn.json`.
- Clean posters: badge posters swapped for clean metahub art in the modded UI.
- Settings → Mods: toggles (wide rows, hover trailers, clean grids, clean posters, RT panel),
  accent / colour scheme (Monochrome default: neutral greys app-wide; Stremio purple, red, tomato, emerald), addon server status, reset.
- Mac title bar (with the dylib): transparent, UI runs to the top; traffic lights 1.18x, level with the search bar, same inset
  from the left edge as from the top; compact header (4.25rem bar, smaller search/buttons); empty bar drags/double-click zooms. Lights fade
  with the player controls. Web side: `src/mods/macChrome.ts`.
- Now Playing (needs the dylib; `src/mods/nowPlaying.ts` + `SPMedia` in `shell/chrome.m`): Control Center / media keys show
  the episode still (else backdrop, else poster), title + "Show · S1 E2" (movies: year), duration and a moving position;
  ±skip (Stremio's seek step) and scrubbing seek the player. Merged into the shell's own Now Playing (swizzled
  `setNowPlayingInfo:`); play/pause/next stay the shell's. Cleared when the player closes.
- Up next card (`src/mods/UpNext.tsx`): episodes replace the stock next-video popup (same timing, focus, dismissal)
  with still, title, "Show · S1 E2" + IMDb rating; movies show a similar title not in your library (Tomatometer 75+
  preferred, `/api/home/similar`) in the credits window (6% of runtime, 2 to 8 min), staying up when the controls fade,
  with Details / Dismiss; series finales get the same card. Live TV keeps the stock popup.
  Footer: "Liked X?" thumbs up / down (show for episodes, the movie for movies), stored on this device
  (`src/mods/ratings.ts`, `mods:ratings`). Picked for you: liked titles lead the seeds at 1.5x weight, disliked ones
  are dropped and titles similar to them pushed down (`liked` / `avoid` params on `/api/home/similar`).
- Player top bar: darker, taller eased scrim (0.8 to 0) behind the back button and title so they read over bright frames.
- Smart stream list (Details panel, `src/mods/streams/`): quality pills with counts (4K / 1080p / 720p / Other),
  Best match on top (last used, else score), sections by quality (6 shown, "Show N more"), compact rows
  (quality, HDR, size, source/codec/audio/seeds/site, flags, release dimmed), addon errors as one dim line.
  Toggle in Settings → Mods.
  Stream preferences (Settings → Mods → Streams, `src/mods/streams/prefs.ts`): preferred quality (Auto learns the most
  played of the last 12 plays), max file size, audio language (flag emojis), avoid HDR. They steer Best match (after
  Last used) and row order; nothing is hidden.
- Preview panel (MetaPreview, Discover / Player drawer / guide): scroll-edge fades (top once scrolled, bottom while more
  below) instead of a hard clip; `src/mods/useScrollEdges.ts`.
  Actions: library/watched pair + full-width Show; no trailer button in Discover while the RT panel is on.
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
- Patch follow-ups (task 044): load the chrome dylib from the patched app itself (LC_LOAD_DYLIB) so Dock launches get
  the title bar too; Windows patch (binary URL swap in stremio-shell-ng.exe, no proxy there); release v0.2.0 after the
  user has lived with it.
- Recommendations: country fixed to US; taste refreshes on Board mount only; not yet checked with the real library (task 025).
- Restyle the addon configure page to DESIGN.md.
- Discover grid still clips hard under the filter row (fade tried and removed, task 007).
- Title bar: player and fullscreen behaviour not yet checked (task 022).
- Now Playing: Control Center widget and hardware media keys not checked by hand yet (task 040).
- Stream picker: one-click play of the Best match not built; Spotlight buttons can sit under the compact header at one
  scroll position (task 023).
- Login agent (`bin/stremio-plus enable`) written; needs the user to run it once (task 010).
- Windows / Linux ports untested on real machines. Repo is public (github.com/reliskdev/Stremio-Plus, remote `origin`);
  v0.1.0 released with `PATH=/opt/homebrew/bin:$PATH node tools/package.js --release` (gh is logged in as reliskdev).
  The stremio-web fork (`web/`) isn't on GitHub (task 043).
