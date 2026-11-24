# 005 — One shared motion token for mod styles

- **Status**: DONE
- **Commit**: web@19c3aac
- **Severity**: LOW
- **Category**: Cohesion & tokens
- **Estimated scope**: new file + 8 edits

## Problem
The house curve `cubic-bezier(0.2, 0.7, 0.2, 1)` is hand-typed (or redefined locally) in mod styles:
`App/styles.less:229`, `components/MetaItem/styles.less:472`, `MultiselectMenu/Dropdown/Option/Option.less:20`,
`NavBar/HorizontalNavBar/SearchBar/styles.less:119`, `routes/Discover/styles.less:498` (`@mods-ease`), `routes/Settings/Mods/Mods.less:32`,
`rt/EpisodeScore.less:11`, `mods/FlixRow.less:3` (`@ease`), plus Dropdown.less sheet curves after plan 001.

## Target
`web/src/mods/motion.less`:
```less
// Stremio+ motion tokens. Same curve as routes/Details/variables.less @ease (upstream's house ease-out).
@mods-ease: cubic-bezier(0.2, 0.7, 0.2, 1);
```
Each listed file: `@import (reference) '~stremio/mods/motion.less';` and uses `@mods-ease`. Values unchanged.

## Boundaries
- Mod-authored rules only; upstream rules and `routes/Details/*` (already use their `@ease`) untouched. Rendered CSS identical.

## Verification
- Build compiles; `grep -rn "0.2, 0.7, 0.2, 1" web/src` only hits `mods/motion.less` and `routes/Details/variables.less`.
