# Workflow

Web Style Director adds a style-selection gate before website implementation:

1. Understand whether the user wants a new website or a redesign.
2. Ask only for essential missing context.
3. Rank five relevant UI Directions, then select one linked Theme for each
   without changing Direction order.
4. Show Direction/Theme IDs and names, brand-neutral SVG cards, an offline
   gallery, and upstream references; let the user select one pair or request
   another unseen Direction set. Machine-readable results also carry Theme
   appearance and tokens.
5. Generate a project-specific `DESIGN.md` and first-viewport draft.
6. Wait for the user to confirm the draft direction.
7. Implement and verify the UI against the confirmed contract and draft.

The core rule is simple: do not start UI implementation until the user has
selected a Direction and Theme, the project has a `DESIGN.md` and first-viewport draft,
and the user has confirmed that draft direction.

## New websites

A useful brief normally identifies:

- website type;
- audience;
- primary conversion or workflow goal;
- desired density or tone;
- target stack and project path, when constrained.

When the user already provides enough context, recommend directions without
adding an intake questionnaire.

## Redesigns

Inspect at least one real source before recommending a redesign direction:

- a URL;
- screenshots;
- a local project;
- existing brand assets;
- constraints that must be preserved.

## Recommendations and rerolls

Each recommendation gives the user enough information to choose without
exposing raw catalog data: Direction and Theme IDs and names, a generated SVG
card, primary Light/Dark references, fit, first viewport, component kits, and
risk. Machine-readable results also contain Theme appearance and tokens.
Selecting by number or Direction ID keeps the Theme shown in that result. The
self-contained HTML gallery works as a local file; when a terminal client needs
HTTP, `preview --serve` exposes only that gallery through a temporary loopback
URL. The agent keeps that optional foreground server alive while the user
chooses, then stops it after selection or before a reroll.

If the user rejects the set, `--again` excludes Directions already shown in
session schema v2. Legacy `shownStyleIds` remain readable through aliases. The
workflow reports when unseen Directions are exhausted.

## The project contract

After selection, the recommendation flow calls `apply --style <direction-id>
--theme <theme-id>`. At the raw CLI level, an omitted Theme resolves a legacy
style ID alias-first to its historical pair. An ID that identifies only a
canonical Direction, and is not also a legacy alias, resolves to its declared
default Theme. `apply` writes:

```text
DESIGN.md
.ui-style-director/
  first-viewport-draft.svg
  selected-style.json
  recommended-components.json
  source-attribution.json
```

The v2 contract separates Direction structure, PreviewSpec, and Direction
references from Theme appearance, tokens, and Theme sources in `DESIGN.md`,
state, and attribution. It records both IDs, first-viewport structure, layout,
color roles, typography, component guidance, and brand-safety constraints. The
agent shows `first-viewport-draft.svg` and
waits for confirmation before implementation, then records intentional
deviations during verification.

## Visual previews

- Local SVG cards are generated from a Direction, its PreviewSpec, and selected
  Theme, work offline, and contain no upstream logos or screenshots.
- Upstream Light/Dark links are comparison references, never production assets.
- Each legacy Visual keeps three reviewed references. A canonical Direction may
  aggregate and deduplicate references from several legacy entries, so it is
  not presented as an exact clone of one brand.
- Catalog Browser schema v5 currently exposes 57 Direction cards and 77 linked
  Theme previews; these are snapshot counts, not limits. Canonical previews use
  `previews/v2/<direction-id>/<theme-id>.svg`, while legacy preview URLs remain
  at `previews/<legacy-style-id>.svg`.

## Directions, Themes, and component kits

Web Style Director is a style router rather than another component library:

- **Directions** describe coherent structure, hierarchy, and product fit.
- **Themes** describe linked appearance and color tokens without changing
  Direction ranking.
- **Component kits** provide implementation materials that may support those
  directions.

The selected Direction and Theme govern the page. Component kits are optional implementation
inputs and should fit the target stack rather than determine a new visual
direction.
