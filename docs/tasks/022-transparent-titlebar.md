# 022 · Transparent title bar

- **Date:** 2026-11-24
- **Status:** done
- **Brief:** "Integrate the apple header with the exit buttons into the app so its like transparent and fits within nicely."

## Plan
- Stremio.app can't be modified, but its signature allows `DYLD_INSERT_LIBRARIES` (library validation disabled), so
  inject a small Objective-C dylib (`shell/chrome.m`) at launch, Spicetify-style.
- The dylib hides the title bar (transparent, full-size content view, no title) so the web UI runs to the top edge.
- Traffic lights move into Stremio's nav bar: vertically centred in it, inside the left nav column where the logo sits.
- The web UI (`src/mods/macChrome.ts`) hides the logo in that mode and reports the nav bar's empty areas to the dylib
  (WKScriptMessageHandler) so the bar drags/double-click-zooms the window like a real title bar.
- `bin/stremio-plus` builds the dylib and launches Stremio with it (`open --env`).

## Assumptions
- "Apple header with the exit buttons" = the native macOS title bar with the traffic lights.
- The traffic lights replace the Stremio logo in the top-left corner rather than sitting above the nav bar.
- Follow-up from the user mid-task: "Can the 3 apple buttons be slightly larger, and the rest of the stuff in the header
  smaller. A bit like how spotify does it". Lights scaled 1.18x; header made compact only in this mode.

## Done
- `shell/chrome.m` (new): dylib injected with `DYLD_INSERT_LIBRARIES` (Stremio's entitlements allow it, bundle untouched).
  Polls `NSApp.windows` for the WKWebView window, then: full-size content view, transparent title bar, hidden title,
  no separator; web view stretched to the full window. Traffic lights: Electron `trafficLightPosition`-style (titlebar
  container resized to the bar height, only as wide as the buttons), titlebar view bounds-scaled 1.18x for larger
  lights, re-applied on resize/key/fullscreen-exit. A transparent `SPDragView` over the web view takes mouse-downs only
  inside reported drag rects minus holes: drag moves the window, double-click follows the system setting (zoom/minimise).
  Registers the `stremioPlusChrome` message handler and a document-start user script setting `window.__stremioPlusChrome`.
- `bin/stremio-plus`: `build_chrome` compiles + ad-hoc signs the dylib into `shell/build/` (gitignored) when the source is
  newer; `open_modded` launches with `open --env DYLD_INSERT_LIBRARIES=…` (launch, apply, login agent reopen).
  Falls back to a plain launch if the build fails.
- `web/src/mods/macChrome.ts` (new): in that mode sets `html[data-mac-chrome]` and posts geometry (lights column + bar
  centre, nav bar drag rect, interactive holes, hidden while the player's controls are hidden) on DOM/resize changes,
  only when it changed. No drag when something covers the bar.
- `HorizontalNavBar.js`: `data-chrome-bar` / `data-chrome-lead` / `data-chrome-logo` markers.
- `HorizontalNavBar/styles.less`: logo hidden (lights take its place), back button shifted one nav column right;
  compact controls (2.75rem buttons, 1.5rem icons, 2.25rem x 26rem search pill, smaller text).
- `App/styles.less`: `--horizontal-nav-bar-size` 4.25rem (was 5.5) under `:root[data-mac-chrome]`, so every layout
  that offsets by the bar follows.

## Verification
- Typecheck clean for touched files; `apply` compiled. Process env shows the dylib injected.
- Real-window screenshots (`screencapture -l`): Board and Details with lights centred in the bar over the sidebar
  column, back button beside them, hero art running to the top edge; window resized to 1100x700 keeps the layout.
- Synthetic mouse events: dragging empty bar moves the window; dragging on the search pill doesn't (click reaches the
  web); back button click navigates.
- Not verified: player (lights fading with controls), fullscreen enter/exit, double-click zoom. Headless UI test run
  was interrupted, so no `tools/ui-test` shots this task (that browser has no dylib, so only the data attributes apply).

## Follow-ups
- Check the player and fullscreen in daily use.
- The dylib only exists when launched through `bin/stremio-plus` / Stremio+.app / the login agent; stock launches
  without the agent keep the normal title bar.
