# 019 · Stremio "crashing" on open (login agent)

- **Date:** 2026-11-24
- **Status:** done
- **Brief:** "Stremio keeps crashing when trying to open"

## Cause (agent.log)
- The agent quit stock Stremio and immediately ran `open`; LaunchServices refused with error -600 while the old
  instance was still shutting down, so Stremio vanished (looked like a crash).
- Under `set -e` that failed `open` ended the daemon; launchd restarted it and, the server being in the agent's
  process group, killed the Stremio+ server too, so the modded UI had nothing to load.
- No macOS crash reports for Stremio.

## Done (`bin/stremio-plus`)
- `reopen_modded`: quit, wait (up to 15s) for that pid to exit, SIGTERM if still alive, then `open` with up to 6
  retries; logs the attempt.
- `daemon` runs with `set +e`; logs the stock pid it handled.
- LaunchAgent plist: `AbandonProcessGroup` so an agent restart never takes the server down. Agent re-enabled.

## Verification
- 3× quit + `open -a Stremio`: each reopened modded on attempt 1, no stock instance left.
- `launchctl kickstart -k` on the agent: server pid unchanged (36354 → 36354).
