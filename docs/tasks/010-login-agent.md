# 010 · Mods survive reopening Stremio

**Brief:** "It unbounded the mods to my stremio every time I open and closed"

## Cause
Stremio 5.1.31 only takes the UI URL as a launch flag (`--webui-url`); no env var, no persisted setting.
Opening Stremio from the Dock/Spotlight starts it stock. Stremio.app must not be modified.

## Done
- `bin/stremio-plus enable|disable|daemon`: a LaunchAgent (`~/Library/LaunchAgents/com.stremio-plus.agent.plist`,
  RunAtLoad + KeepAlive) runs `daemon`, which keeps the server up and, when a Stremio process younger than 20s
  without `--webui-url` appears, quits it and reopens with the modded UI.
- `vanilla` writes `addon/data/.vanilla` so the agent leaves stock Stremio alone; `launch` clears it.

## Verification
- `bash -n` OK. Not yet run: installing the agent was blocked pending user approval.

## Follow-ups
- User runs `bin/stremio-plus enable`; check `addon/data/agent.log` after reopening Stremio from the Dock.
