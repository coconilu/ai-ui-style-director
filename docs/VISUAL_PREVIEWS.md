# Visual Previews

Web Style Director uses two complementary preview layers so users can see a
direction before choosing it without copying protected brand screenshots.

## Generated style cards

`catalog/previews/` contains one deterministic SVG wireframe for every style in
`catalog/style-profiles.json`. The card communicates layout, density, hierarchy,
and palette at a glance. It deliberately uses generic labels and shapes rather
than upstream logos, copy, screenshots, or proprietary assets.

The source metadata lives in `catalog/style-visuals.json`:

- `styleId`: matching normalized style profile.
- `variant`: one of the SVG layout renderers in `src/preview.mjs`.
- `theme`: semantic colors used by the generated wireframe.
- `references`: three real upstream style slugs with a label and a narrow role.

Regenerate and verify cards with:

```bash
npm run previews
npm run previews:check
```

Generated SVG files are committed so recommendation works offline and an agent
does not need browser automation just to show five options.

## Upstream live previews

For `awesome-design-md` references, the recommendation core derives public
overview, Light, and Dark URLs hosted by getdesign.md. These pages help users
inspect tokens, typography, component styling, and surface treatment in more
detail.

Live previews are external reference material. They may change independently,
require network access, and must never be copied into generated websites.

## Recommendation behavior

A visual-capable agent embeds all five local SVG cards and adds the primary
Light/Dark links. Every successful recommendation also writes a self-contained
`.ui-style-director/recommendations.html` gallery with the five generated cards
embedded as data URIs. A terminal-only client starts `preview --serve`, shares
the printed loopback HTTP URL, and keeps the process running while the user
chooses. The server binds only to `127.0.0.1`, serves only that gallery, and
stops on Ctrl+C. `file://` and `preview --open` remain fallbacks. Two secondary
reference labels remain available when the user wants to compare more sources.

The gallery is the portable fallback for TUI, SSH, and headless workflows. It
does not depend on terminal-specific image protocols such as Kitty graphics or
Sixel. Without a browser on the same machine, users can forward the preview
port or copy the HTML and open it elsewhere; the structured text output and
live links remain usable.

## Project draft

After selection, `apply` writes
`.ui-style-director/first-viewport-draft.svg`. This draft reuses the selected
direction's neutral layout and palette while recording the project brief. The
agent shows it, records requested project-specific adjustments in `DESIGN.md`,
and waits for confirmation before UI implementation.

The project draft is a direction and information-architecture check, not a
pixel-perfect final mockup.

## Adding or changing a style

1. Add or update the normalized profile in `catalog/style-profiles.json`.
2. Add exactly one matching entry in `catalog/style-visuals.json`.
3. Use real upstream slugs and describe the narrow role of each reference.
4. Run `npm run previews`.
5. Visually inspect the generated SVG.
6. Run `npm run check`.
