# DESIGN.md Contract

After the user selects a style:

1. Run `apply` to generate or update `DESIGN.md` and
   `.ui-style-director/first-viewport-draft.svg`.
2. Read `DESIGN.md`, show the draft, and wait for the user to confirm the visual
   direction before code edits.
3. If the user selects another style, return to recommendation. For a smaller
   project-specific adjustment, update `DESIGN.md` and the draft together, then
   ask for confirmation again.
4. Treat the confirmed `DESIGN.md` as the source of truth for UI
   implementation.
5. Preserve the selected style's first viewport, density, typography, palette,
   component kits, visual references, and risks.
6. If the target repo already has a design system, map the selected direction
   onto existing tokens and components instead of replacing unrelated
   architecture.
7. If the selected direction conflicts with user constraints or existing brand
   assets, explain the conflict and ask whether to choose a different style or
   adapt the selected style.
8. After implementation, verify a browser screenshot against both `DESIGN.md`
   and the confirmed draft.

Brand safety:

- Do not copy upstream logos, screenshots, protected brand names, or exact
  proprietary layouts.
- Use generated cards and upstream live previews as inspiration and structure,
  not clone templates or production assets.
- Prefer project-owned assets or generated assets for imagery.
