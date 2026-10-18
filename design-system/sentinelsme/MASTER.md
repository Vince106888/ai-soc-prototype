# SentinelSME console design system

Direction first established 4 October 2026 (Data-Dense Dashboard). Revised
17 October 2026: token-based light and dark themes, the evidence chain, hash
routing and keyboard triage. The principles below are unchanged in spirit: an
analyst console for non-specialists, evidence before verdicts, no decoration
that implies protection the system does not provide.

## Visual direction

A restrained dark rail (`--rail #0f1d1b`), a cool neutral workspace
(`--paper #f3f6f5`, `--surface #ffffff`), green-black ink (`--ink #13201e`) and
one deep teal action colour (`--primary #0e6b60`). Dark mode is a separately
tuned palette, not an inversion. Severity colours (critical, high, medium,
low) each have a text, tint and edge value and always appear with a word.
Avoid gradients, glowing shields, score rings, identical card grids and
all-caps eyebrow labels.

**Signature element: the evidence chain.** Every incident shows five linked
steps (observed, matched, priority, explained by, decision) in one strip. This
is the one bold element; everything around it stays quiet. The welcome screen
introduces the same chain so the idea is learned before the console opens.

Typography: Segoe UI Variable (Display for headings, Text for body) with
system fallbacks; no remote fonts. Scale 12 / 13 / 14 / 16 / 20 / 26 / 32 px.
Numbers that are compared (scores, counts) use tabular figures. Monospace
(Cascadia Mono) only for rule codes and identifiers. Sentence case for every
label, including signal types (MFA, Sign-in, OAuth grant).

Spacing follows 4/8 px steps; 32 px page gutters on desktop, 16 px on phones.
Radii: 6 px controls inside groups, 8 px controls, 12 px panels. Borders do the
structural work; shadows only on floating layers (dialogs, menus, toasts).

## Workflow structure

- Overview: collection notice, a single four-figure ledger (open, critical,
  under review, retained signals), "Needs your attention" with an open-queue
  severity mix, collection facts, recent analyses, seven-day activity chart
  with a table alternative.
- Incidents: segmented severity filter, status select, "More filters"
  (account, date range); queue ordered by severity, score, recency; detail
  with the evidence chain, Overview / Evidence / Activity tabs and a decision
  panel beside them on wide screens.
- Evidence: filters, compact list, inspector with the detection outcome first.
- Email analysis: selected message and Gmail sample as two explicit modes.
- Accounts & sources: accounts with their sources, engine capabilities,
  analysis history as a table.
- Protection coverage: one list, each area marked present or missing, with
  email platforms and the self-reported account check below.
- Detection rules: tabular catalogue with disclosure for matcher details,
  trusted senders below.

## Interaction and accessibility

Every view has a URL (`#/incidents/<id>` and so on). Keyboard: `/` search,
`j`/`k` queue, `g` + letter to navigate, `?` for the list; shortcuts never fire
while typing or with a dialog open. Controls have visible labels, 40-44 px
targets, a visible 2 px focus ring and 150 ms colour transitions. Dialogs and
the mobile drawer trap focus and return it to the opener. Charts have a legend,
per-day hover and focus tooltips and a table view; the two chart series colours
pass the colour-vision checks in both themes. Reduced motion and forced-colours
modes are honoured. Check 390, 768, 1080 and 1440 px widths in both themes.
