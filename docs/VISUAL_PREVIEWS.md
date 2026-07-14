# Visual Previews

Web Style Director uses two complementary preview layers so users can see a
direction before choosing it without copying protected brand screenshots.

## Generated Direction/Theme cards

Runtime previews are rendered from three canonical inputs:

- `catalog/style-directions.json`: structure, intent, density, typography,
  component guidance, and Direction references;
- `catalog/style-preview-specs.json`: layout archetype, content pattern,
  content blocks, and hierarchy;
- `catalog/style-themes.json`, joined through
  `catalog/style-direction-themes.json`: appearance, semantic tokens, and pinned
  Theme sources.

The PreviewSpec controls visible structure and the Theme controls color tokens,
so two Themes linked to the same Direction keep the same layout. Every SVG uses
generic labels and shapes rather than upstream logos, copy, screenshots, or
proprietary assets.

The current snapshot contains 57 Directions and 77 linked Theme selections;
these counts are not limits. Catalog Pages generates canonical assets at
`previews/v2/<direction-id>/<theme-id>.svg`. Recommendation sessions render the
selected pairs into
`.ui-style-director/recommendation-previews/<direction-id>--<theme-id>.svg`.

The committed `catalog/previews/<legacy-style-id>.svg` files and their
`style-profiles.json` / `style-visuals.json` metadata remain the curation audit,
migration, and URL-compatibility layer. They are not the runtime recommendation
source.

Regenerate and verify cards with:

```bash
npm run previews
npm run previews:check
```

The commands retain deterministic checks for all committed legacy SVG files and
render every canonical Direction/Theme link in memory. Runtime recommendation
cards are written locally and embedded in the gallery, so recommendation works
offline and an agent does not need browser automation just to show the default
five options.

## Upstream live previews

Direction references retain narrowly scoped structural provenance. For
`awesome-design-md` references, the recommendation core derives public
overview, Light, and Dark URLs hosted by getdesign.md. Theme records separately
retain pinned token-source provenance. These sources help users inspect
structure, typography, component styling, and surface treatment in more detail.

Live previews are external reference material. They may change independently,
require network access, and must never be copied into generated websites.

## Recommendation behavior

A visual-capable agent presents the ranked Direction and selected Theme for
each result, embeds the local SVG cards, and adds the primary Light/Dark links.
Every successful recommendation also writes a self-contained
`.ui-style-director/recommendations.html` gallery with the generated cards
embedded as data URIs. A terminal-only client can start `preview --serve`,
share the printed loopback HTTP URL, and keep the process running while the user
chooses. The server binds only to `127.0.0.1`, serves only that gallery, and
stops on Ctrl+C. `file://` and `preview --open` remain fallbacks. Direction and
Theme IDs remain visible so the selected pair can be passed explicitly to
`apply`.

The gallery is the portable fallback for TUI, SSH, and headless workflows. It
does not depend on terminal-specific image protocols such as Kitty graphics or
Sixel. Without a browser on the same machine, users can forward the preview
port or copy the HTML and open it elsewhere; the structured text output and
live links remain usable.

## Complete catalog browser

The GitHub Pages catalog uses generated canonical SVG cards in a different
browsing surface. Instead of showing one default five-Direction recommendation
batch, it lists one card per curated Direction, switches its linked Themes, and
supports text search and family, page type, density, tone, and component-kit
filters:

```bash
node bin/ai-ui-style-director.mjs browse --open
```

`browse` opens the hosted project site and returns immediately. The old
`serve` name remains a compatibility alias; it no longer starts a local
complete-catalog service. Both are read-only and do not create recommendation
session state or modify a target project.

The page also reports the current 109-source upstream index from 7 providers as
provenance context; the component-source index contains 600 paths. The original
74 sources are the baseline and the 35 daisyUI themes begin as pending. Those
paths do not have the reviewed metadata required for complete cards, so they
remain a count rather than additional styles.

The browser's schema-v4 JSON keeps each Direction card lightweight by returning
linked Theme choices with relative `previewUrl` values, not embedded SVG.
Canonical previews load from same-origin
`previews/v2/<direction-id>/<theme-id>.svg`; historical URLs remain available at
`previews/<legacy-style-id>.svg`. An inverted token index handles exact search
terms, substring matching remains available for partial terms, and the client
adds matching Direction cards in batches of 24. A deterministic revision lets
the page warn when its deployed HTML or JSON is older than the local catalog
expected by the CLI.

## Project draft

After selection, `apply` writes
`.ui-style-director/first-viewport-draft.svg`. This draft combines the selected
Direction, its PreviewSpec, and the selected Theme tokens while recording both
IDs and the project brief. The agent shows it, records requested project-specific
adjustments in `DESIGN.md`, and waits for confirmation before UI implementation.

The project draft is a direction and information-architecture check, not a
pixel-perfect final mockup.

## Adding or changing catalog material

Supply-side curation may still write the legacy Profile/Visual/preview audit
artifacts. Before that material can affect runtime consumption, regenerate and
validate the canonical projection:

1. Review the Direction structure, Direction references, and PreviewSpec.
2. Review Theme tokens and pinned Theme sources independently.
3. Confirm every allowed Direction/Theme link and its single default.
4. Run `npm run previews` and visually inspect the compatibility preview.
5. Run `npm run catalog:v2:migrate` when the approved legacy curation layer has changed.
6. Run `npm run catalog:v2:validate` and `npm run previews:check`.
7. Run `npm run check`.
