# 011 · Scores per episode

- **Date:** 2026-11-24
- **Status:** done
- **Brief:** "Can there be rotten tomatoes or a review per episode?" (screenshot: Details episode hero, Dexter "Crocodile")

## Plan
- Addon `lib/episodes.js`: RT episode Tomatometer from the
  public episode page `<rt tv url>/sNN/eNN` (criticsScore JSON). Disk cache in `data/episodes/`, 24h. (IMDb source changed during the task, see Done.)
- `GET /api/rt/:imdb/episode/:season/:episode` → `{ imdbRating, rt: { score, reviews, average, url } | null }`.
  RT show URL resolution shared with `/api/rt/:imdb` (`resolveRt`).
- UI: `src/rt/useRtEpisode.ts`; episode hero Facts get the IMDb rating (Stremio's own IMDb fact) and a
  Tomatometer fact when RT has one.

## Assumptions
- RT has episode Tomatometers mostly for recent prestige shows (Severance S2E10 100%, 15 reviews; Dexter,
  Breaking Bad: none) and no per-episode audience score. IMDb rating covers every episode, so it is the fallback.
- Review quotes skipped: RT loads them client-side from an internal API; probing it was blocked, not pursued.

## Done
- `addon/lib/imdb-episodes.js`: joins IMDb's official datasets (title.ratings + title.episode from
  datasets.imdbws.com, personal use) into `data/imdb-episodes.json` (~10MB, 47k series, ~9s build, weekly refresh,
  warmed at server start). Cinemeta's `videos[].rating` was rejected: it is not IMDb (Ozymandias 8.4 vs 9.5) and
  is 0 for recent seasons.
- `addon/lib/episodes.js`: RT episode Tomatometer from `<show>/sNN/eNN`; only when RT shows a score (5+ reviews).
- `addon/server.js`: `resolveRt()` extracted from `/api/rt/:imdb`; new `/api/rt/:imdb/episode/:s/:e`.
- Web: `src/rt/useRtEpisode.ts`, `src/rt/EpisodeScore.{tsx,less}`; `Details/Hero/Hero.tsx` passes the episode
  IMDb rating to Stremio's own IMDb fact (links to the season's IMDb episode list) and adds a Tomatometer fact
  (links to the RT episode page, tooltip with review count/average). Follows the RT panel toggle.
- `tools/ui-test`: new `episode` step (Severance S2E10, Dexter S1E3).

## Verification
- curl: Dexter 1x3 → 8.2, no RT; Breaking Bad 5x14 → 9.5; Severance 2x10 → 9.4 + RT 100% (15 reviews);
  The Bear 2x6 → 9.6, RT omitted (3 reviews, no score).
- tsc: no errors in touched files (38 upstream errors unchanged). Build compiled.
- Screenshots 12-episode-rt / 13-episode-imdb: facts row "date · runtime · 9.4 IMDb · 🍅 100%" in native style.

## Follow-ups
- Episode review quotes / critics consensus (RT loads reviews client-side; would need their internal API).
- Episode ratings in the episode list (Videos) rows, e.g. a small rating next to each episode.
- Pre-existing: `/api/rt/:imdb` without `type` can guess a wrong movie for a series id (tt0773262 → /m/greed);
  the UI always passes type, so it is not hit in practice.
