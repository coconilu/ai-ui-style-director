# DESIGN.md Contract

After the user selects a style:

1. Run `apply` to generate or update `DESIGN.md`.
2. Read `DESIGN.md` before code edits.
3. Treat it as the source of truth for UI implementation.
4. Preserve the selected style's first viewport, density, typography, palette, component kits, and risks.
5. If the target repo already has a design system, map the selected direction onto existing tokens and components instead of replacing unrelated architecture.
6. If the selected direction conflicts with user constraints or existing brand assets, explain the conflict and ask whether to choose a different style or adapt the selected style.
7. After implementation, verify a browser screenshot against `DESIGN.md`.

Brand safety:

- Do not copy upstream logos, screenshots, protected brand names, or exact proprietary layouts.
- Use upstream design files as inspiration and structure, not as clone templates.
- Prefer project-owned assets or generated assets for imagery.

