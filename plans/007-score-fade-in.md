# 007 — Fetched scores fade in instead of popping

- **Status**: DONE
- **Commit**: web@19c3aac
- **Severity**: LOW (missed opportunity)
- **Category**: Missed opportunities
- **Estimated scope**: 2 files

## Problem
The episode-row IMDb rating (`routes/Details/Videos/Video.tsx` `.rating` span, styles `Video.less` `> .rating`) and the episode
Tomatometer fact (`rt/EpisodeScore.tsx`, `EpisodeScore.less` `.score`) mount when their fetch resolves and appear abruptly.

## Target
On mount: `animation: score-in 150ms cubic-bezier(0.2, 0.7, 0.2, 1) both;` with `@keyframes score-in { from { opacity: 0; } }`.
Opacity only, so no reduced-motion variant is needed.

## Verification
- Open a series: ratings fade in over 150ms when they arrive; no layout change.
