# 🍅 Rotten Tomatoes Picks: Stremio addon

Adds Rotten Tomatoes rows to Stremio (Popular, Certified Fresh, Critics & Audiences Agree, New & Fresh, In Theaters, TV, and "Best on Netflix/Max/…"), with Tomatometer and Popcornmeter scores drawn on every poster.

## Run
```
npm install
npm start
```
Open http://127.0.0.1:7010/configure, choose rows, services and minimum scores, then click **Install in Stremio**.

## How it works
- Lists come from the JSON endpoint behind rottentomatoes.com/browse (cached for 3h).
- Each title is matched to an IMDb ID through Cinemeta search (cached in `data/matches.json`), so your stream addons work as usual.
- Posters are composited with `sharp` and cached in `data/posters/`.
- Every row supports Stremio's genre filter.

Note: Rotten Tomatoes has no official API, so this relies on an unofficial endpoint that can change without notice. It's intended for personal use.
