# SentinelSME console design system

Direction established 4 October 2026 using the installed UI/UX Pro Max skill.
The verified Data-Dense Dashboard recommendation fits operational analytics.
The returned marketing gateway pattern and earlier Cyberpunk recommendation do
not fit an analyst console and were excluded.

## Visual direction

Use a restrained dark navigation rail, neutral light workspace, clear ink text
and a deep teal primary action. Severity colours identify priority; they never
imply a source is protecting mail. Avoid gradients, glowing shields, decorative
score rings, giant empty cards and repeated explanatory blocks.

Typography: locally available Segoe UI/system sans, 16px base, 14px data text,
13px secondary labels, 32px page headings. Monospace is reserved for rule codes
and technical identifiers. No remote font dependency or third-party assets.

Spacing follows 4/8px increments. Use 24px page gutters, 20px panel padding,
8px component radii, visible borders and little or no shadow. Tables and split
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
