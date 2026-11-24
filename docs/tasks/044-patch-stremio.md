# 044 · Patch Stremio (no more close-and-reopen)

- **Date:** 2026-11-24
- **Status:** done on macOS; Windows not started
- **Brief:** "I dont like the fact how it opens realises it needs diff ui closes then reopens with new ui. Very choppy; both
  windows and apple, can it be fixed?" → agreed plan: Spicetify-style patch, Mac first.

## What was tried
1. **Swap the URL in the Mac binary** (`https://web.stremio.com/` → `http://127.0.0.1:7011/#/`, same 24 bytes) and
   re-sign: the re-signed app runs, but the shell loads its default URL through the streaming server's proxy, which
   only fetches https and sandboxes non-Stremio hosts ("Web interface unavailable"). Reverted from backup.
2. **Patch the proxy in `Contents/MacOS/server.js`** instead: serve :7011 for web.stremio.com requests. Needed:
   signing server.js itself (its signature lives in xattrs), the path's missing leading slash, and a `node --check`
   guard (a broken escape once stopped Stremio's server from starting). Then the UI loaded but failed:
   `Downgrade storage schema version from 31 to 25 is not allowed`: the live stock core is newer than any published
   stremio-core-web, and both now share the localhost:11470 origin.
3. **Hop to the :7011 origin** from a tiny page: the UI ran, but the native splash never went away. Dropped.
4. **Namespace the fork's core storage** when served under `/proxy/` (`src/mods/coreStorage.ts`, bridge scope with a
   prefixed localStorage). Works.

## Done
- `cli/patch.js`: status / patch / restore for macOS. Anchored string patch of server.js (refuses unknown versions),
  vanilla-flag and server-down fallback to stock, backup with `ditto`, re-sign ad hoc with original entitlements,
  syntax check with Stremio's own node, automatic rollback on any failure.
- CLI: `patch`, `restore`, `status`; `launch` / `vanilla` / agent understand patched mode (no swapping); agent re-patches
  after Stremio updates unless the user restored; `setup` patches and turns the agent on (server must be up whenever
  Stremio opens); `uninstall` restores.
- web fork: `src/mods/coreStorage.ts` + one tagged line in `src/core/createTransport.ts`.

## Verification
- Plain `open -a Stremio` (agent off): one process, the Stremio+ Board (guest until logging in once).
- `vanilla`: stock UI with the user's real account and Continue Watching (stock storage untouched).
- `launch`: mods plus chrome dylib (lsof), transparent title bar.
- `restore` → `codesign --verify --deep --strict` passes with the original team ID.

## Follow-ups
- Load the chrome dylib from the patched app (LC_LOAD_DYLIB) so non-launcher opens get the title bar.
- Windows: no proxy in stremio-shell-ng; patch the WEB_ENDPOINT string in the exe instead (its own origin then, no
  storage clash).
- Mod settings/ratings in localStorage start fresh inside patched Stremio (new origin), as does the login.
