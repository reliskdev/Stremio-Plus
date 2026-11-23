# Stremio+ design tokens (taken from stremio-web itself)

## Colour
- Background: `--primary-background-color` rgb(12 11 17) → `--secondary-background-color` rgb(26 23 62)
- Text: `--primary-foreground-color` (white 90%); secondary rgba(255,255,255,.64); tertiary rgba(255,255,255,.46)
- Surface: `--overlay-color` (white 5%) + `backdrop-filter: blur(5px)`; hover white 10%; strong white 15%
- Panel: rgba(12,11,17,.62) + `blur(8px) saturate(1.2)`, radius 1.5rem
- Accent: `--primary-accent-color` for primary actions/selection only
- No borders on surfaces. No gradients except Stremio's existing page background and artwork scrims.

## Type
- Stremio's sans (PlusJakartaSans). Facts: 1.25rem / 600, tabular numbers.
- Body: 1rem, line-height 1.75–2.
- Section label (Stremio `Links` style): 0.95rem / 700 / uppercase / opacity .3 / no letter-spacing.

## Shape
- `--border-radius` .75rem for media and tiles; pills 999px, height 2.5rem, padding 0 1.25rem.

## Motion
- `cubic-bezier(0.2, 0.7, 0.2, 1)`, 150–250ms. Background colour transitions on hover. No pop/bounce.
