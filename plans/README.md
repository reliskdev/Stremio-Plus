# Stremio+ animation plans

From `improve-animations` (standard), 2026-11-24, web@19c3aac. Scope: mod code (`src/rt`, `src/mods`, `[mods]`/`[rt-mod]` edits).

| # | Plan | Severity | Status |
|---|---|---|---|
| 001 | [Dropdown curves](001-dropdown-curves.md) | HIGH | DONE |
| 002 | [Dropdown reopen mid-close](002-dropdown-interrupt.md) | MEDIUM | DONE |
| 003 | [Dropdown reduced motion](003-dropdown-reduced-motion.md) | MEDIUM | DONE |
| 004 | [Tooltips instant after the first](004-tooltip-instant-neighbours.md) | MEDIUM | DONE |
| 005 | [Shared motion token](005-motion-token.md) | LOW | DONE |
| 006 | [Lightbox enter/exit](006-lightbox-motion.md) | LOW | DONE |
| 007 | [Score fade-in](007-score-fade-in.md) | LOW | DONE |
| 008 | [Player upgrades and auto-synced subtitles](008-player-and-subtitle-sync.md) | HIGH | TODO |

Order: 005 → 001 (uses the token) → 002 → 003 → 004 → 006 → 007. 002/003 touch the same files as 001.

Not planned: RT trailer poster→player swap (the video's poster is the same image, so it already reads as seamless; a fade would flash dark).

All seven implemented in task 020 (docs/tasks/020-motion-audit.md). 002 needed one extra change: in portal mode the
click-catching layer covers the label, so the reopen is detected in the close-request handler (point over the closing label).
