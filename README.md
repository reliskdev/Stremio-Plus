# Stremio+

A Spicetify-style mod of Stremio for macOS. The official Stremio app is left untouched; it is launched with
`--webui-url` pointing at a locally built, modified copy of [stremio-web](https://github.com/Stremio/stremio-web).
Torrent streaming, addons, library and account sync work exactly as in stock Stremio.

What it adds:

- **Rotten Tomatoes**: Tomatometer + Popcornmeter, critics consensus, trailer, photos and cast in the Discover
  preview and the Details page, for any title (not just RT catalogs).
- **Board Spotlight** fed by a curated RT catalog, with score pills and the trailer playing behind the hero.
- **Clean poster grids**: no titles under posters; name and scores on hover.
- **Settings → Mods**: toggle each mod, pick an accent colour.
- **RT addon** (works in stock Stremio too): Popular / Certified Fresh / New & Fresh / per-streaming-service rows,
  posters with score badges, configure page.

## Layout

```
stremio-plus/
├── bin/stremio-plus        CLI (launch / build / apply / test / logs …)
├── addon/                  Node server: RT Stremio addon on :7010 + serves web/build on :7011
│   ├── server.js           manifest, catalogs, /api/rt/:imdb, posters, configure page, UI static host
│   ├── lib/                rt.js (browse API) · details.js (title page scraper) · match.js (RT → IMDb)
│   │                       enrich.js (Cinemeta art/trailers) · poster.js (badge posters) · config.js
│   ├── public/             addon configure page
│   └── data/               caches (gitignored)
├── web/                    stremio-web fork (own git repo, branch `rt-mod`, remote `upstream`)
│   └── src/
│       ├── rt/             Rotten Tomatoes mod components (RtPanel, Spotlight extras, data hook)
│       ├── mods/           mod framework (settings store) + optional wide rows (FlixRow)
│       └── …               small hooks into Board, Discover, Details, MetaItem, Settings (marked [rt-mod] / [mods])
├── tools/ui-test/          headless Brave screenshot harness (puppeteer-core)
├── launcher/               builds ~/Applications/Stremio+.app
├── docs/                   STATE.md (current state) + tasks/ (one write-up per task)
├── PRODUCT.md / DESIGN.md  design context: "Stremio+", native Stremio styling, no AI-slop UI
└── CLAUDE.md               notes for working on this with Claude Code
```

## Everyday use

```bash
bin/stremio-plus launch     # or open ~/Applications/Stremio+.app
bin/stremio-plus apply      # after editing web/src: rebuild + restart server + relaunch Stremio
bin/stremio-plus test discover   # screenshots → tools/ui-test/shots/
bin/stremio-plus vanilla    # back to stock Stremio
```

In Claude Code: `/small-task <brief>` runs a change end to end and logs it in `docs/tasks/`.

First run in the modded UI: log in to your Stremio account once (it has its own storage origin), and install the
addon from http://127.0.0.1:7010/configure if it isn't already synced.

## Setup from scratch

```bash
cd addon && npm install
cd ../web && pnpm install          # see CLAUDE.md if pnpm complains about a readonly database
cd ../tools/ui-test && npm install
cd .. && bin/stremio-plus apply && launcher/build-app.sh
```

## Updating to a new Stremio release

```bash
cd web && git fetch upstream && git rebase upstream/development   # or the release tag
pnpm install && ../bin/stremio-plus apply
```

Mod code lives in `web/src/rt` and `web/src/mods`; edits to upstream files are small and tagged `[rt-mod]` / `[mods]`
so rebase conflicts are easy to find (`git grep -n "\[rt-mod\]\|\[mods\]"`).

## Caveats

Rotten Tomatoes has no public API; the addon reads the JSON behind rottentomatoes.com/browse and scrapes title
pages. It can break if RT changes its site. Personal use only.
