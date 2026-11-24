# 027 · Browse page heading

- **Date:** 2026-11-24
- **Status:** done
- **Brief:** "Clicking \"see more\" on the top netflix etc takes me to this odd page with no description if its showing the netflix or something [screenshot]. If it is the top part should show what streaming service its showing top from or what it is etc so I know what im looking at"

## Plan
- `web/src/mods/home/Genres.tsx`: a heading at the top of the Genres page built from the current filters
  (sort + genre + type + service), e.g. "Trending on Netflix", "Top rated Horror movies on HBO Max", with one
  quiet line under it saying how the list is ranked.
- Style it like Stremio's row titles (1.6rem / 500) with the secondary line in text-tertiary; no new chrome.
- Heading updates live as the pills/dropdowns change, so it also helps when browsing from the nav tab.

## Assumptions
- "See All" keeps pointing at the browse page (service + Trending) rather than a dedicated weekly-chart page; the
  heading names it honestly as "Trending on <service>" instead of pretending it is the same 20-item chart.
- Ranking source line mentions JustWatch (US), since that is where the data comes from.

## Done
- `web/src/mods/home/Genres.tsx`: `headingFor()` builds the title from the filters ("Trending on Netflix",
  "Popular Horror movies & shows on Netflix", "Top rated shows"); `SORT_NOTES` gives one line on how it's ranked.
  Rendered above the genre pills; updates live with every pill/dropdown change.
- `Genres.less`: title 1.6rem/500 (Stremio's row-title size), note 0.95rem at .46 white. No new surfaces.

## Verification
- Typecheck: no errors in Genres files. `apply` built (build dir updated 13:15).
- `bin/stremio-plus test recs`: 28-genres-netflix.png shows "Popular Horror movies & shows on Netflix" /
  "Most popular on JustWatch in the US" above the pills. The exact "See All" landing (Trending on Netflix) wasn't
  shot separately; same code path.

## Follow-ups
- "See All" on a chart row opens JustWatch Trending, not the exact 20-item weekly chart; a true "Top this week"
  view (rank order) could be added if wanted.

## Addendum: title bar came back
- User: "What happened to the header" (stock macOS title bar, no mods chrome).
- Cause: the login agent (`bin/stremio-plus daemon`) had been running since 11:07, before task 022 added dylib
  injection. Bash keeps the functions it loaded at start, so when Stremio was opened normally at 13:44 the agent
  reopened it with `--webui-url` but without `DYLD_INSERT_LIBRARIES`.
- Fix: `daemon()` re-execs itself when `bin/stremio-plus` changes (mtime check each loop). Agent restarted
  (`launchctl kickstart -k`), Stremio quit and relaunched; `vmmap` shows the chrome dylib loaded.
