# Catalog Browser

Use this route only when the user explicitly asks to run `serve` or browse,
search, or filter the complete Web Style Director catalog. It is a read-only
catalog operation, not the five-direction website workflow.

## Start the browser

Run the wrapper from this skill's actual installation directory. From the
repository root, the equivalent command is:

```bash
node skills/web-style-director/scripts/style-director.mjs serve
```

Forward supported options when the user supplies them:

```bash
node skills/web-style-director/scripts/style-director.mjs serve --port 4173 --open
```

- `--port <number>` requests a specific loopback port. Without it, the
  operating system chooses an available port.
- `--open` opens the HTTP URL in the default browser after startup.
- `--json` emits machine-readable startup information while keeping the
  service in the foreground.

Start the command in a long-running terminal session, report the printed
`http://127.0.0.1:<port>/` URL, and keep the process alive while the user
browses. Stop it with Ctrl+C when the user asks, when the task ends, or before
starting a replacement instance. Never change the host to `0.0.0.0` or present
the URL as public.

## Catalog boundary

The page lists all curated entries from `catalog/style-profiles.json`, with
their generated previews and reviewed metadata. It supports text search and
filters for family, page type, density, tone, and component kit.

Entries in `catalog/generated/style-sources.json` are upstream source paths,
not curated style profiles. The browser may show their current count as source
index context, but must not present them as complete style cards.

## Keep routes separate

- `serve` browses the complete curated catalog and does not read or write a
  target project's `.ui-style-director/` state.
- `preview --serve` exposes only one generated five-direction recommendation
  gallery.
- Do not run `recommend`, generate `DESIGN.md`, ask for style selection, or
  begin UI implementation as part of a catalog-browser request.
