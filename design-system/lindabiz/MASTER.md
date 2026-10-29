# LindaBiz console design system

Direction established 4 October 2026 using the installed UI/UX Pro Max skill.
The verified Data-Dense Dashboard recommendation fits operational analytics.
The returned marketing gateway pattern and earlier Cyberpunk recommendation do
not fit an analyst console and were excluded.

## Visual direction

Use a restrained dark navigation rail, neutral light workspace, clear ink text
and a royal blue primary action (#2563eb), with #1d4ed8 hover and #eff6ff selected surfaces. Severity colours identify priority; they never
imply a source is protecting mail. Avoid gradients, glowing shields, decorative
score rings, giant empty cards and repeated explanatory blocks.

Typography: locally available Segoe UI/system sans, 16px base, 14px data text,
13px secondary labels, 32px page headings. Monospace is reserved for rule codes
and technical identifiers. No remote font dependency or third-party assets.

Spacing follows 4/8px increments. Use 24px page gutters, 20px panel padding,
8–9px control radii and 12px card radii, visible borders and little or no shadow. Tables and split
workspaces should expose useful evidence without forcing a page-length read.

## Workflow structure

- Overview: explicit collection state, urgent review queue, retained activity,
  operational counts and a useful next step.
- Incidents: compact selectable queue and tabbed overview/evidence/activity
  detail; priority is a deterministic value, never an attack probability.
- Evidence: filters, compact results, finding summary before detailed metadata.
- Email analysis: selected message and Gmail sample are separate task modes.
- Protection coverage: capability boundaries and actual telemetry, including
  unavailable products; no decorative enable switches.
- Detection catalogue: compact rows, accessible disclosure for matcher details.

## Interaction and accessibility

Controls have visible labels, 44px touch areas, visible keyboard focus, useful
pressed/disabled states and 150ms colour transitions. Dialog focus stays inside
the dialog and returns to its opener. Mobile navigation is labelled and exposes
expanded state. Sticky headers must not obscure focused controls. All meaningful
state is expressed in words as well as colour. Honour reduced motion.

Charts include a text table alternative. Retained counts are not scanned-mail
coverage percentages. Missing telemetry and provider failures remain explicit.
Short identifiers are displayed with access to the full value; long addresses
and subjects wrap. Check 375px, 768px, 1024px and desktop widths, including zoom.

## Product upgrade, 29 October 2026

User-requested blue theme; preserve every security workflow. Verified skill
results support the Data-Dense Dashboard direction and blue operational palette.
The returned Enterprise Gateway marketing pattern does not fit and is excluded.
Retain local system typography and existing SVG icons; load no remote fonts.

Primary actions, navigation, selected rows, forms and onboarding share the blue
tokens in product.css. Hover/pressed/visible keyboard focus states identify real
controls; disabled controls remain explicit. Metrics navigate to relevant filtered
results. Search submits deliberately, and selected-message/Gmail entry points
remain distinct. The mobile drawer locks background interaction and restores
focus; account settings remain available in the phone header.

Playwright browser tests use isolated synthetic responses at 375, 768, 1024 and
1440px. They check navigation, row/tab interactions, horizontal overflow, search,
metric filters, Gmail consent enablement, dialogs and blue hover feedback. No
real mailbox data or user browser profile is captured. Generated screenshots
and traces are ignored, and the browser checks run in CI.
