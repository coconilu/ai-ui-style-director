# DESIGN.md Contract

After the user selects a Direction and its recommended Theme:

1. Run `apply` with both IDs to generate or update `DESIGN.md` and
   `.ui-style-director/first-viewport-draft.svg`:

   ```bash
   node skills/web-style-director/scripts/style-director.mjs apply --style <direction-id> --theme <theme-id> --project <project-path> --brief "<brief>"
   ```

   Only for an explicitly entered legacy style ID, `--theme` may be omitted;
   this restores the historical Direction and Theme selection.
2. Read `DESIGN.md`, show the draft, and wait for the user to confirm the visual
   direction before code edits.
3. If the user selects another Direction or Theme, return to recommendation.
   For a smaller project-specific adjustment, update `DESIGN.md` and the draft
   together, then ask for confirmation again.
4. Treat the confirmed `DESIGN.md` as the source of truth for UI
   implementation.
5. Preserve the Direction's first viewport, density, typography, component
   kits, structural references, and risks. Preserve the Theme's appearance,
   palette, tokens, and Theme references.
6. If the target repo already has a design system, map the selected Direction
   onto existing tokens and components instead of replacing unrelated
   architecture.
7. If the selected Direction or Theme conflicts with user constraints or
   existing brand assets, explain the conflict and ask whether to choose a
   different selection or adapt it.
8. After implementation, verify a browser screenshot against both `DESIGN.md`
   and the confirmed draft.

## v2 Provenance

`DESIGN.md` locks two independent layers:

- **Direction provenance:** `directionId`, structural source references,
  layout archetype, content pattern, content blocks, and hierarchy.
- **Theme provenance:** `themeId`, Theme name and appearance, color tokens, and
  Theme source references.

Do not merge these layers into one source claim. A Theme change does not change
the selected structure; a Direction change requires a new structural review.

Brand safety:

- Do not copy upstream logos, screenshots, protected brand names, or exact
  proprietary layouts.
- Use generated cards and upstream live previews as inspiration and structure,
  not clone templates or production assets.
- Prefer project-owned assets or generated assets for imagery.
