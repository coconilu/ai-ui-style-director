# Workflow

Web Style Director adds a style-selection gate before website implementation:

1. Understand whether the user wants a new website or a redesign.
2. Ask only for essential missing context.
3. Recommend five relevant UI directions.
4. Let the user select one direction or request another unseen set.
5. Generate a project-specific `DESIGN.md`.
6. Implement and verify the UI against that contract.

The core rule is simple: do not start UI implementation until the user has
selected a direction and the project has a `DESIGN.md`.

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
exposing raw catalog data: the direction name, why it fits, its first viewport,
useful component kits, and the main risk.

If the user rejects the set, the skill excludes directions already shown in the
session and recommends another set. It reports when unseen catalog options are
exhausted.

## The project contract

After selection, `apply` writes:

```text
DESIGN.md
.ui-style-director/
  selected-style.json
  recommended-components.json
  source-attribution.json
```

`DESIGN.md` records the chosen direction, first-viewport structure, layout,
color roles, typography, component guidance, and brand-safety constraints. The
agent reads it immediately before implementation and records intentional
deviations during verification.

## Style profiles and component kits

Web Style Director is a style router rather than another component library:

- **Style profiles** describe coherent, agent-readable visual directions.
- **Component kits** provide implementation materials that may support those
  directions.

The selected style governs the page. Component kits are optional implementation
inputs and should fit the target stack rather than determine a new visual
direction.
