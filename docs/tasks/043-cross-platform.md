# 043 · Cross-platform CLI and installers

- **Date:** 2026-11-24
- **Status:** done on macOS; Windows and Linux written but untested
- **Brief:** "Begin the windows port. Make it easily installable for macos, windows etc. heres the github
  https://github.com/reliskdev/Stremio-Plus"

## Plan
- Confirm the approach carries over: Stremio 5 on Windows (`stremio-shell-ng`, Rust + WebView2) has a `--webui-url`
  option and uses a custom URL as is (source: `src/main.rs`, `app.rs`). It is single-instance (a second launch
  forwards to the running window), so the stock instance has to exit first, as on macOS. The Linux Qt shell reads
  `--webui-url=` too (`main.qml`).
- Rewrite the bash CLI in Node so one codebase covers every OS: `cli/index.js` + `cli/platform/{darwin,win32,linux}.js`.
- Ship releases as a tarball (addon + CLI + prebuilt UI + universal macOS dylib) and add one-line installers that
  fetch it, install dependencies, and make a launcher.

## Assumptions
- Users shouldn't need pnpm, webpack or Xcode: the UI is prebuilt (`ui/`, 12 MB tarball without source maps) and the
  macOS dylib is prebuilt universal (arm64 + x86_64).
- Node 20+ is used if present, otherwise the installer downloads a private Node v22.12.0 into `runtime/`.
- GitHub Releases host the tarball (`releases/latest/download/stremio-plus.tar.gz`), not the git tree, since the
  stremio-web fork lives in its own repo and the build is too big to commit on every change.
- Windows v1 has no window chrome or Now Playing integration (both rely on macOS-only dylib injection).

## Done
- `cli/` (new): commands `launch vanilla enable disable daemon start stop restart logs shortcut setup uninstall halt
  version` plus dev-only `build apply test`. Server started detached with a pid file. The agent reloads when the CLI
  changes. Local-time log stamps.
- `cli/platform/darwin.js`: the old bash logic (open -a with DYLD env, osascript quit, launchd agent), plus the
  `Stremio+.app` launcher (was `launcher/build-app.sh`, now removed), and a universal dylib build for packaging. Skips
  compiling when the Xcode command line tools are missing, so users never get the "install developer tools" prompt.
- `cli/platform/win32.js`: finds `stremio-shell-ng.exe` (STREMIO_PATH, config, known folders, uninstall registry).
  Polls `tasklist` and reads command lines through PowerShell CIM only when the pid set changes. Quits with
  `taskkill /T`, then `/F` (closing can just send it to the tray). Start menu + desktop shortcuts and a Startup-folder
  agent, all through `bin/hidden.vbs` (no console window).
- `cli/platform/linux.js`: Flatpak `com.stremio.Stremio` or `stremio` binary; .desktop launcher and XDG autostart.
- `bin/stremio-plus` is now a wrapper around `cli/index.js`; added `bin/stremio-plus.cmd` and `bin/hidden.vbs`.
- `addon/server.js`: serves `ui/` when present (installed copies), else `web/build`. Adds
  `GET :7011/__stremio-plus` → `{ root, pid }` so `stop` only ever stops its own server.
- Ownership checks: the launchd label, shortcuts and autostart entries are per user account, so the CLI only removes or
  rewrites them when they point at its own folder.
- `install.sh` (macOS/Linux) and `install.ps1` (Windows): download, private Node if needed, update in place keeping
  `addon/data` and `runtime/`, `stremio-plus setup` (npm install, dylib, launcher, re-enable the agent), PATH entry.
- `tools/package.js`: builds the UI, the universal dylib and `dist/stremio-plus.tar.gz`; `--release` publishes with gh.
- Root `package.json` (version 0.1.0). `tools/ui-test` takes `BROWSER_PATH`. README rewritten (install, platform table,
  development, releasing).

## Verification
- `node tools/package.js`: universal dylib (`x86_64 arm64`), 12.3 MB tarball.
- Installer end to end in a scratch HOME with Node off the PATH: downloads the private Node, npm install, launcher
  compiled with the right path. An installed server on spare ports serves `ui/` (200, Stremio title) and the addon.
  Re-running keeps `addon/data` and `runtime/`. `uninstall` removes the launcher and the folder.
- Real setup: `enable` (agent back up), `restart`, `launch` (Stremio with `--webui-url`, chrome dylib loaded per lsof),
  second `launch` focuses (still one process), `vanilla` opens stock, and opening stock with the agent running gets it
  reopened with the mods within ~1 s.
- Bugs found by the test and fixed: the scratch-HOME uninstall booted out the real launchd agent (labels are per user,
  not per HOME), and `stop`'s fallback `pkill` killed the dev server. Both are now ownership-checked.
- Not verified: anything on Windows or Linux. PowerShell isn't installed here and downloading it to parse-check
  `install.ps1` was blocked.

## Follow-ups
- Test on Windows: install one-liner, shortcut, `launch` / `vanilla` / `enable`, and the Stremio path lookup.
- Publish the first release (`node tools/package.js --release` needs `gh`), and make the repo public so the curl/irm
  one-liners work without auth.
- Push the stremio-web fork somewhere (branch `rt-mod`) so others can build the UI.
- Windows extras: window chrome / SMTC Now Playing would need DLL injection into WebView2; not planned for v1.
