# 042 · Quick rating after watching

- **Date:** 2026-11-24
- **Status:** done
- **Brief:** "Quick rating after watching: thumbs up/down when you finish something, saved locally, and fed into "Picked for you" recommendations." (from the "Playback and Mac" ideas list)

## Plan
- `web/src/mods/ratings.ts`: local store (`mods:ratings` in localStorage: id → +1 / -1, type, name, time) with a
  `useRating(id)` hook.
- Ask in the Up next card (task 041), which already shows up as you finish: thumbs up / down pair next to Dismiss.
  Movies rate the movie; episodes rate the show. Series finales (no next episode) get the similar-title card too, so
  the end of a show also asks.
- "Picked for you": liked titles go first in the seeds and weigh 1.5x; disliked titles drop out of the seeds, and
  the addon pushes down titles similar to them (`avoid` param on `/api/home/similar`, up to 4 most recent).
- Recs refetch when ratings change (taste key includes them).

## Assumptions
- Show-level rating for episodes (one thumbs per show, not per episode); the choice persists across episodes and can
  be changed or cleared (click the selected thumb again).
- No separate post-credits prompt or modal: the card is the "finish" moment, and it stays quiet (no focus steal).
- Only on this device (localStorage), as the brief says; not synced to the Stremio account.

## Done
- `web/src/mods/ratings.ts` (new): `mods:ratings` store (id → `{ v: 1 | -1, type, name, at }`), `useRating`,
  `useRatings`, `setRating`, `rated(all, v)` (most recent first); syncs across windows via the storage event.
- `web/src/mods/UpNext.tsx/.less`: footer row on both cards: "Liked Rick and Morty?" (show name for episodes, the movie
  you just watched for movies) + thumbs up / down (Stremio's `thumbs-up(-outline)`, the down one rotated); after
  choosing it reads "You liked X" / "Not for you: X", selected thumb filled (white 15%); clicking it again clears.
  Cards are now a column (main row + rate row). The similar-title card also shows for series finales (no next
  episode), picking the same kind of title.
- `web/src/mods/home/HomeRows.tsx`: seeds = up to 3 most recent liked titles, then the library seeds, minus disliked;
  sends `liked=` and `avoid=` (4 most recent dislikes, also excluded); refetches when ratings change.
- `addon/server.js` + `lib/justwatch.js`: `/api/home/similar` takes `liked` (those seeds weigh 1.5x) and `avoid`
  (titles in a disliked title's similar list lose up to 0.8 by rank; anything that drops to 0 or below leaves the row).
- `tools/ui-test/test.js`: `upnext` step rates the movie and checks storage and the Board.

## Verification
- Typecheck clean; build compiled; addon restarted.
- curl, seeds Shawshank + Interstellar: baseline top 8 "GoodFellas, The Godfather, The Dark Knight, Se7en, The Green
  Mile, The Godfather Part II, Inception, Tenet"; `liked=Interstellar` → "Inception, Tenet, The Prestige, Oppenheimer,
  Arrival, GoodFellas, The Godfather, Memento"; `avoid=The Martian` → Tenet drops out of the top 8 (Schindler's List in).
- `test upnext`: both cards show the rate row (shots 49, 50); thumbs up → "You liked The Shawshank Redemption",
  stored `{"tt0111161":{"v":1,"type":"movie",...}}` (shot 52); Board then shows Picked for you and "Because you
  watched The Shawshank Redemption" (the test profile also has it in Continue Watching, so this doesn't isolate the
  rating's effect; the curl check does).
- Not verified: the real-app look; a series finale card (logic shared with the movie path).

## Follow-ups
- Rate from Details too (thumbs next to the library button), and show your thumbs on posters you've rated.
- Ratings are device-local; could sync through the addon if wanted.
