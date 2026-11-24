# 023 · Better stream picker

- **Date:** 2026-11-24
- **Status:** done
- **Brief:** "better stream picker"

## Plan
- Parse each stream's name/description (Torrentio-style: `[AD+] Torrentio\n4k DV | HDR`, `👤 546 💾 29.26 GB ⚙️ Source`,
  flags line) into resolution, HDR, source, codec, audio, size, seeders, languages, cached (debrid `+`).
- Group the list by quality (4K / 1080p / 720p / SD / Other) instead of one long addon list; quality pills with counts.
- "Best match" at the top: last used, else a score (quality, cached, seeders, sane size, not foreign-only, no CAM).
- Rows rewritten as a compact summary (quality line + size, meta line, release name in one dimmed line).
- Addon errors (e.g. "Invalid AllDebrid ApiKey/Token!") taken out of the list into one quiet note at the bottom.
- Long sections show 6 and a "Show N more" button. Toggle in Settings → Mods ("Smart stream list", on).

## Assumptions
- English is the user's language: releases whose flags are all non-English (and not multi/dual audio) sort lower.
- Streams the parser can't read (non-torrent addons) keep Stremio's own row rendering, in an "Other" section.
- The addon dropdown stays; quality pills sit under it. SD folds into the "Other" pill so the row fits the panel.
- "Instant" only shows when the list mixes cached and uncached/plain-torrent streams (otherwise it's on every row).

## Done
- `web/src/mods/streams/parse.ts`: `parseStream` (quality, HDR, source, codec, audio, size, seeds, site, flags,
  multi-audio, debrid cached + service, release, CAM), `parseStreamError`, `streamScore` (best match),
  `rowOrder` (cached first, then score; foreign-only and non-Latin-titled dubs sink), `formatSize`.
- `organize.ts`: best match (last used, else top score; only when >3 streams), sections by quality, unknown streams,
  deduped errors, counts, `mixedCache`. `PILLS` (4K / 1080p / 720p / Other = SD + unknown).
- `SmartStreams.tsx` / `.less`: `QualityPills` (overlay pills with counts, selected = stronger overlay) and
  `SmartStreamList` (Best match, Links-style section labels, 6 per section in All / 30 when filtered, "Show N more",
  "Other streams" with Stremio's own row, errors as dim one-liners at the bottom).
- `StreamSummary.tsx`: row body. Line 1 quality + HDR, Last used / Instant, size; line 2 source · codec · audio ·
  seeds · site · addon (when several) · flags / Not cached; line 3 release name dimmed. Full description as tooltip.
- `Details/Streams/Stream.tsx` (`// [mods]`): optional `info`/`showAddon`/`showInstant`; parsed rows use the summary.
- `Details/Streams/Streams.tsx` (`// [mods]`): pills in the header, smart list when on and anything parsed, panel
  scroll resets per addon + quality.
- Settings → Mods: "Smart stream list" toggle (`smartStreams`, on).
- `shell/chrome.m` (bug from task 022): switching to a full-size content view shrank the frame by the title bar's
  height, and Stremio saved that, so the window lost 28pt on every launch. Frame is now kept; window restored to
  1512x846.

## Verification
- Typecheck clean for touched files; `apply` compiled.
- Parser + organiser bundled with esbuild and run against the live Torrentio response for Dune: Part Two (452
  streams): counts 4K 119 / 1080p 228 / 720p 46 / SD 11 / Other 48, error stream pulled out, cached stream won best match.
- Real window (screencapture + synthetic clicks): Guarding Stars (105 streams, two Torrentio addons) and Dune (846):
  Best match + 4K section, rows readable at the panel width, pills fit after tightening, 1080p pill filters,
  "Show 30 more of 416" appears, 720p section follows.
- Window height stable across two relaunches (846 -> 846).
- Not verified: the error note rendering in the real app (the AD error was folded out but I didn't scroll to the
  bottom), addons other than Torrentio, mobile/touch layout. Headless UI tests not run (test profile has no stream addons).

## Follow-ups
- Remember a preferred quality pill (and optionally auto-play the best match).
- Language preference instead of the English assumption.
- Board: the stock Spotlight's buttons can sit under the compact header when the scroll stops just before the
  "scrolled" cover kicks in (sentinel is `100% - nav size`).
