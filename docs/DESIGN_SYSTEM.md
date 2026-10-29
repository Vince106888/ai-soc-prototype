# Interface design system

The console uses one token-based design system instead of per-page stylesheets.
Colour, type, spacing, radius and shadow values live in one place, so a visual
change is a change to a token, not a hunt through pages.

## Files (`frontend/src/design/`)

| File | Owns |
|---|---|
| `tokens.css` | Colours (light and dark), type scale, 4px spacing scale, radii, shadows, motion, layout widths |
| `base.css` | Reset, typography, form controls, focus ring, `sr-only`, skip link, reduced motion |
| `components.css` | Brand, buttons, badges and pills, panels, page header, notices, states, tabs, segmented control, metric card, modal, toast, progress |
| `layout.css` | App shell, sidebar, topbar, page canvas, off-canvas navigation at 900px |
| `pages.css` | Page compositions (overview, incidents, case detail, connections, detection, analysis, Gmail, evidence, settings) built only from components and tokens |
| `welcome.css` | Public welcome, privacy and terms pages |

Rules for new work: use a token, never a literal colour or pixel size, outside
`tokens.css`; add a reusable component class to `components.css` rather than a
page-specific copy; keep page files to layout.

## Look

Typeface: Geist Variable (self-hosted through `@fontsource-variable/geist`, no
external request). Base size 14px, scale 11.5 / 12.5 / 14 / 15.5 / 17 / 20 px, headings
at weight 600 with slightly negative tracking. Accent is indigo; severity colours
are critical rose, high orange, medium amber and low blue and are always paired
with text, never colour alone. Light and dark share the same tokens. The theme
toggle (sun and moon button in the top bar and on the public pages) sets `data-theme` on `<html>` and
remembers the choice in `localStorage` (`lindabiz.theme`); until a choice is made the theme follows the
system's `prefers-color-scheme`.

## Reusable React components (`frontend/src/ui.tsx`)

`Brand`, `PageHeader`, `Panel`, `SectionHeading`, `SeverityBadge`, `StatusBadge`,
`MetricCard`, `EmptyState`, `ErrorState`, `LoadingRows`, `InlineNotice`,
`FilterChip`, `SegmentedControl`, `Modal`, `Toast`. Every page header, including
the evidence and detection catalogue pages, uses `PageHeader`.

## Product name

The product is named **LindaBiz** everywhere, including internal identifiers (database defaults and
roles, cookie and browser-storage keys, Docker volume, the `%LOCALAPPDATA%\LindaBiz` secrets folder).
An installation created under the earlier name keeps working by pinning its original database name,
user and volume in its private env file (`POSTGRES_DB`, `POSTGRES_USER`, `AI_SOC_DATA_VOLUME`); see
[operations](OPERATIONS.md). Renaming those stored values would need a data migration. Sessions and
saved browser settings from before the rename are reset once.

## Accessibility behaviour that tests depend on

Visible 2px focus ring on every control; the 900px breakpoint switches the
sidebar to an inert off-canvas drawer; motion is disabled under
`prefers-reduced-motion`; primary buttons change `background-color` on hover.
The Playwright journey in `frontend/e2e/product.spec.ts` checks these at 375,
768, 1024 and 1440 px.

## Reviewing the interface without signing in

The signed-in pages need Google sign-in. For visual review, start the dev server
(`npm run dev` in `frontend/`) and open `/?mock=1` (signed in) or `/?mock=out`
(signed out). `src/devMock.ts` serves invented data from the browser only, rejects
every change request, and is behind `import.meta.env.DEV`, so it is not in the
production bundle (checked: no `devMock` asset and no mock text in `dist`).
