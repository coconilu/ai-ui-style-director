# Catalog Browser

Use this route only when the user explicitly asks to run `browse` or `serve`,
or asks to search or filter the complete Web Style Director catalog. It is a
read-only hosted-catalog operation, not the five-direction website workflow.

## Open the hosted catalog

Run the wrapper from this skill's actual installation directory. From the
repository root, the equivalent command is:

```bash
node skills/web-style-director/scripts/style-director.mjs browse
```

Forward supported options when the user supplies them:

```bash
node skills/web-style-director/scripts/style-director.mjs browse --open
```

- `--open` opens the GitHub Pages URL in the default browser.
- `--json` emits machine-readable hosted-catalog information and exits.
- `serve` is a compatibility alias for `browse`; it no longer starts a local
  complete-catalog server.
- `--port` is not supported for `browse` or `serve`. It remains valid only for
  a project-specific `preview --serve` gallery.

Report the printed hosted URL. The command exits immediately, so do not create
or keep a long-running terminal session. If the page shows a catalog-revision
warning, report it, refresh the page, and confirm that Pages has deployed or
Web Style Director is updated before applying a style from that page.

## Catalog boundary

The page lists all curated entries from `catalog/style-profiles.json`, with
their generated previews and reviewed metadata. It supports text search and
filters for family, page type, density, tone, and component kit.

Entries in `catalog/generated/style-sources.json` are upstream source paths,
not curated style profiles. The browser may show their current count as source
index context, but must not present them as complete style cards.

## Keep routes separate

- `browse` and its `serve` alias open the complete hosted curated catalog and
  do not read or write a target project's `.ui-style-director/` state.
- `preview --serve` exposes only one generated five-direction recommendation
  gallery on loopback and may contain a private project brief.
- Do not run `recommend`, generate `DESIGN.md`, ask for style selection, or
  begin UI implementation as part of a catalog-browser request.
