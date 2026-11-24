# 036 · Remembered stream preferences

- **Date:** 2026-11-24
- **Status:** done
- **Brief:** "Remember stream preferences: preferred quality, max file size, audio language (and avoid HDR option) so the smart stream picker's Best match follows them. Settings in Settings → Mods; picker learns preferred quality from what you play." (from the user's "do the top three" pick)

## Plan
- `mods/settings.ts`: `streamQuality` (auto / 4K / 1080p / 720p), `streamMaxGb` (0 = no limit), `streamLanguage`
  (default English), `streamNoHdr`.
- `mods/streams/prefs.ts`: play history (last 12 qualities, localStorage), learned quality for Auto, `prefScore`.
- `organize.ts`: Best match and row order add the preference score; the old English-only rule becomes the chosen language.
- `Details/Streams/Stream.tsx`: record the quality of a parsed stream when it's played.
- Settings → Mods: new "Streams" group (smart list toggle moves there) with quality and size chips, a language
  dropdown and an "Avoid HDR" toggle.

## Assumptions
- Last used still wins Best match for that title (you picked it); preferences decide everything else.
- Auto = most played quality over the last 12 plays (needs 2+), else the old behaviour (highest quality wins).
- Preferring 1080p sinks 4K below 1080p but above 720p; streams over the size cap or with HDR (when avoided) sink, never hidden.
- Language comes from Torrentio-style flag emojis: no flags = English; a release flagged with the chosen language rises.

## Done
- `web/src/mods/streams/prefs.ts`: quality / size / language options, play history (`mods:stream-plays`, last 12),
  `learnedQuality` (most played, 2+ plays), `resolvePrefs`, `prefScore`: preferred quality +150, each step above it
  -40, over the size cap -250, HDR/DV when avoided -200, non-English language: flagged release +300 (beats quality),
  unflagged -80.
- `mods/settings.ts`: `streamQuality`, `streamMaxGb`, `streamLanguage`, `streamNoHdr`.
- `mods/streams/organize.ts`: `organize(groups, pill, prefs)`; Best match and in-section row order add `prefScore`.
- `routes/Details/Streams/Streams.tsx` (`// [mods]`): passes the resolved prefs. `Stream.tsx` (`// [mods]`): records the
  quality of a parsed stream on play (row click and menu Play).
- Settings → Mods: new "Streams" group (Smart stream list toggle moved here from Look & feel), Preferred quality chips
  (Auto shows what it learned), Maximum file size chips, Audio language dropdown (Stremio's MultiselectMenu), Avoid HDR.
- `tools/ui-test/test.js` `mods` step: scrolls to the Streams group, picks 1080p / 10 GB, checks they're saved, resets.

## Verification
- Typecheck clean for touched files; build contains the new code.
- esbuild + node against synthetic Torrentio-style streams: no prefs → 4K DV; Avoid HDR → plain 4K; 1080p → 1080p;
  max 5 GB → 720p (2 GB); Spanish → the 🇪🇸 1080p (first run picked 4K, so the language weight was raised); 720p → 720p.
- `test mods`: Streams group renders in Stremio's settings style (shot 18c), chips select, values saved to `mods:settings`.
- Not verified: against a live stream list in the real app (test profile has no stream addons), and the learning loop
  end to end (needs real plays).

## Follow-ups
- Optional: one-click play of the Best match when it clearly fits the preferences.
- Language relies on flag emojis; addons that write languages as text aren't read.
