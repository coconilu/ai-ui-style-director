# Workflow

Web Style Director adds a style-selection gate before website implementation:

1. Understand whether the user wants a new website or a redesign.
2. Ask only for essential missing context.
3. Recommend five relevant UI directions with brand-neutral SVG cards, an offline HTML gallery, and upstream Light/Dark live previews.
4. Let the user select one direction or request another unseen set.
5. Generate a project-specific `DESIGN.md` and first-viewport draft.
6. Wait for the user to confirm the draft direction.
7. Implement and verify the UI against the confirmed contract and draft.

The core rule is simple: do not start UI implementation until the user has
selected a direction, the project has a `DESIGN.md` and first-viewport draft,
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
exposing raw catalog data: a generated SVG card, primary Light/Dark live
previews, the direction name, why it fits, its first viewport, useful component
kits, and the main risk. Terminal-only clients also receive a self-contained
HTML gallery URL so all five directions can be compared in a regular browser.

If the user rejects the set, the skill excludes directions already shown in the
session and recommends another set. It reports when unseen catalog options are
exhausted.

## The project contract

After selection, `apply` writes:

```text
DESIGN.md
.ui-style-director/
  first-viewport-draft.svg
  selected-style.json
  recommended-components.json
  source-attribution.json
```

`DESIGN.md` records the chosen direction, real visual references,
first-viewport structure, layout, color roles, typography, component guidance,
and brand-safety constraints. The agent shows `first-viewport-draft.svg` and
waits for confirmation before implementation, then records intentional
deviations during verification.

## Visual previews

- Local SVG cards are generated from normalized style metadata, work offline,
  and contain no upstream logos or screenshots.
- Upstream Light/Dark links are comparison references, never production assets.
- Each internal style keeps three real references so a normalized direction is
  not presented as an exact clone of one brand.

## Style profiles and component kits

Web Style Director is a style router rather than another component library:

- **Style profiles** describe coherent, agent-readable visual directions.
- **Component kits** provide implementation materials that may support those
  directions.

The selected style governs the page. Component kits are optional implementation
inputs and should fit the target stack rather than determine a new visual
direction.
