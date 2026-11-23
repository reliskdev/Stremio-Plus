# 002 · Local install fix

- **Date:** 2026-11-23
- **Status:** done
- **Brief:** Screenshot: "Failed to get addon manifest from https://127.0.0.1:7010/… Load failed"

## Done
- Stremio 5 opens `stremio://` as https; the local server is http. On localhost the Install button now copies the
  http manifest URL to paste into Stremio's addon search. User confirmed install worked.
