# Stremio+

A Spicetify-style mod of Stremio for macOS and Windows (Linux: experimental). The official Stremio app is left untouched; it is launched with
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

## Install

You need the official [Stremio](https://www.stremio.com/downloads) app (Stremio 5 on Windows). Node.js 20+ is used
if you have it; otherwise the installer downloads a private copy just for Stremio+. Running the installer again updates
Stremio+ and keeps your caches.

**macOS / Linux** (Terminal):

```bash
curl -fsSL https://raw.githubusercontent.com/reliskdev/Stremio-Plus/main/install.sh | bash
```

**Windows** (PowerShell):

```powershell
irm https://raw.githubusercontent.com/reliskdev/Stremio-Plus/main/install.ps1 | iex
```

Then open **Stremio+** (macOS: ~/Applications / Spotlight · Windows: desktop and Start menu · Linux: app menu).
First run: log in to your Stremio account once (the modded UI has its own storage), and add the Rotten Tomatoes
addon from http://127.0.0.1:7010/configure.

| | macOS | Windows | Linux |
|---|---|---|---|
| Installs to | `~/.stremio-plus` | `%LOCALAPPDATA%\Stremio-Plus` | `~/.local/share/stremio-plus` |
| Launcher | `~/Applications/Stremio+.app` | Start menu + desktop shortcut | `stremio-plus.desktop` |
| Login agent (`enable`) | LaunchAgent | Startup folder shortcut | XDG autostart |
| Transparent title bar, Now Playing | yes | no | no |

## Everyday use

```bash
stremio-plus launch     # same as opening the Stremio+ launcher
stremio-plus vanilla    # back to stock Stremio (until the next launch)
stremio-plus enable     # login agent: server always on, Stremio always opens modded (disable: undo)
stremio-plus logs       # follow the server log
stremio-plus uninstall  # remove the launcher, agent and the installed files
```

## Layout

```
stremio-plus/
├── bin/                    CLI wrappers: stremio-plus (macOS/Linux), stremio-plus.cmd + hidden.vbs (Windows)
├── cli/                    the CLI (Node): index.js commands · platform/{darwin,win32,linux}.js per-OS launching,
│                           login agent and launcher shortcuts
├── addon/                  Node server: RT Stremio addon on :7010 + serves the modded UI on :7011
│   ├── server.js           manifest, catalogs, /api/rt/:imdb, posters, configure page, UI static host
│   ├── lib/                rt.js (browse API) · details.js (title page scraper) · match.js (RT → IMDb)
│   │                       enrich.js (Cinemeta art/trailers) · poster.js (badge posters) · config.js
│   ├── public/             addon configure page
│   └── data/               caches (gitignored)
├── web/                    stremio-web fork (own git repo, branch `rt-mod`, remote `upstream`); not in this repo
│   └── src/
│       ├── rt/             Rotten Tomatoes mod components (RtPanel, Spotlight extras, data hook)
│       ├── mods/           mod framework (settings store) + optional wide rows (FlixRow)
│       └── …               small hooks into Board, Discover, Details, MetaItem, Settings (marked [rt-mod] / [mods])
├── shell/chrome.m          macOS window chrome + Now Playing dylib (injected with DYLD_INSERT_LIBRARIES)
├── install.sh / install.ps1  installers (download the latest release)
├── tools/package.js        builds the release tarball (dist/stremio-plus.tar.gz)
├── tools/ui-test/          headless Brave screenshot harness (puppeteer-core)
├── docs/                   STATE.md (current state) + tasks/ (one write-up per task)
├── PRODUCT.md / DESIGN.md  design context: "Stremio+", native Stremio styling, no AI-slop UI
└── CLAUDE.md               notes for working on this with Claude Code
```

## Development

A development checkout has the stremio-web fork in `web/`; the CLI then also offers `build`, `apply` and `test`.

```bash
cd addon && npm install
cd ../web && pnpm install          # see CLAUDE.md if pnpm complains about a readonly database
cd ../tools/ui-test && npm install
cd .. && bin/stremio-plus apply && bin/stremio-plus shortcut

bin/stremio-plus apply             # after editing web/src: rebuild + restart server + relaunch Stremio
bin/stremio-plus test discover     # screenshots → tools/ui-test/shots/ (BROWSER_PATH overrides the Brave path)
```

In Claude Code: `/small-task <brief>` runs a change end to end and logs it in `docs/tasks/`.

## Releasing

```bash
# bump "version" in package.json, then:
node tools/package.js --release    # builds the UI, a universal macOS dylib, dist/stremio-plus.tar.gz,
                                   # and creates the GitHub release (needs `gh auth login`)
```

Without `--release` it only builds the tarball; upload it to a GitHub release as `stremio-plus.tar.gz`. Build releases
on a Mac so the prebuilt window-chrome dylib is included (installs never need Xcode).

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
