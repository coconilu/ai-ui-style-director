# CLI Reference

The CLI is the implementation layer used by the `web-style-director` skill.
Most users should invoke the skill instead of running these commands directly.

Run commands from the repository root:

```bash
node bin/ai-ui-style-director.mjs <command>
```

## `recommend`

Recommend five UI directions for a brief:

```bash
node bin/ai-ui-style-director.mjs recommend \
  --brief "B2B SaaS dashboard for finance teams" \
  --count 5
```

Options:

- `--again`: exclude styles already shown in the current session.
- `--session <path>`: choose the session-state file.
- `--count <number>`: choose the maximum number of results.
- `--open`: open the generated recommendation gallery in the default browser.
- `--json`: emit machine-readable JSON.

If the brief lacks essential context, the command returns targeted questions
instead of recommendations.

Ranking is performed by the deterministic Node.js recommendation core. The
Agent is responsible for collecting context and presenting the selection gate,
not for inventing a different ranking at runtime.

Each recommendation also returns the absolute path to a generated local SVG
card, the primary upstream Light/Dark live previews, and two additional visual
reference labels. A self-contained gallery is written next to the session file
as `.ui-style-director/recommendations.html`; the text output includes both its
local path and a `file://` URL.

## `browse`

Print the read-only GitHub Pages URL for the complete curated style catalog:

```bash
node bin/ai-ui-style-director.mjs browse --open
```

Options:

- `--open`: open the hosted URL with the operating system's default browser.
- `--json`: emit machine-readable hosted-catalog information.

The JSON object contains `catalogUrl`, `hosted`, `catalogRevision`,
`styleCount`, `sourceCount`, and `opened`. The command returns immediately and
does not start a local server. `serve` remains a compatibility alias that emits
a migration notice and otherwise has the same behavior. `--port` is rejected
for both commands; use it only with `preview --serve`.

The page lists every curated entry from `catalog/style-profiles.json`. The
checked-in baseline begins with four profiles in each of 12 families. Each entry includes reviewed
metadata, component-kit suggestions, upstream Light/Dark references, and a
generated SVG preview. It supports text search plus filters for family, page
type, density, tone, and component kit. Search recognizes common Chinese
aliases such as `后台`. Multiple values within one filter group use OR;
different groups and the search query combine with AND. Search and filter
state is kept in the page URL so a filtered view survives refresh and can be
copied.

The hosted `catalog.json` uses schema version 3. It contains lightweight `previewUrl`
values, an inverted token-to-numeric-entry postings index, and an ID-to-entry index rather than
embedding SVG data. Exact query tokens use postings intersections; partial or
unknown tokens use a substring fallback. The client progressively renders 24
matching cards at a time while preserving the total match count. Preview
images are fetched from validated, relative same-origin
`previews/<style-id>.svg` paths so the site works under the GitHub project
subpath.

The schema also carries a deterministic `catalogRevision`. The CLI adds its
local expected revision to the hosted URL, and the page compares it with the
deployed HTML and JSON revisions. A mismatch produces a non-blocking stale-site
warning; search and filtering remain available.

`catalog/generated/style-sources.json` currently contains 109 indexed upstream
source paths from 7 providers; the component index contains 600 paths. The
original 74 `DESIGN.md` sources remain the baseline and the 35 daisyUI themes
begin as pending. The browser reports the source-pool count for context but does
not turn those paths into style cards; only reviewed profiles appear as full
entries.

`browse` and its `serve` alias do not create or modify a target project's
`.ui-style-director/` directory. This hosted complete catalog is intentionally
different from `preview --serve`, which still starts a loopback server for one
generated recommendation gallery.

## `preview`

Inspect or open the most recently generated, single-batch recommendation
gallery:

```bash
node bin/ai-ui-style-director.mjs preview --serve
```

Options:

- `--path <file>`: use a gallery outside the default `.ui-style-director/` directory.
- `--open`: open the gallery with the operating system's default browser.
- `--serve`: start a foreground HTTP preview server and print its local URL.
- `--port <number>`: choose a port for `--serve`; the default `0` asks the OS
  for an available port.
- `--json`: emit the gallery path, URL, and opened state as JSON.

`--serve` binds only to `127.0.0.1`, serves only the selected gallery, and runs
until Ctrl+C. Add `--open` to open the HTTP URL automatically. Without
`--serve`, the command preserves the direct-file behavior: it prints the
`file://` URL, and `--open` opens that file. The HTML embeds all five SVG cards,
so remote users can also copy or download it; an SSH session needs local port
forwarding to use the loopback HTTP link remotely.

## `apply`

Generate the project design contract after the user selects a style:

```bash
node bin/ai-ui-style-director.mjs apply \
  --style operational-saas-console \
  --project ./my-site \
  --brief "B2B SaaS workflow dashboard"
```

Options:

- `--style <id>`: required style ID.
- `--project <path>`: target project; defaults to the current directory.
- `--brief <text>`: project brief recorded in the contract.
- `--force`: replace an existing generated contract when appropriate.
- `--json`: emit machine-readable JSON.

Generated files:

```text
my-site/
  DESIGN.md
  .ui-style-director/
    first-viewport-draft.svg
    selected-style.json
    recommended-components.json
    source-attribution.json
```

`first-viewport-draft.svg` is the project-level first-viewport draft. The agent
shows it and waits for confirmation before implementation.

## `questions`

Print the scenario questions used when a brief is incomplete:

```bash
node bin/ai-ui-style-director.mjs questions
```

Add `--json` for machine-readable output.

## `sync`

Read provider configuration and write the provider lock file:

```bash
node bin/ai-ui-style-director.mjs sync
```

Add `--clone` to clone or fast-forward configured provider repositories into
the local cache. Use `--cache-dir <path>` to override the cache location.

## `refresh-catalog`

Refresh cached providers, run configured source adapters, scan component
metadata, and write committable schema-v4 provider indexes under
`catalog/generated/`:

```bash
node bin/ai-ui-style-director.mjs refresh-catalog --clone
```

Options:

- `--clone`: clone or update provider repositories before scanning.
- `--cache-dir <path>`: override the provider cache.
- `--generated-dir <path>`: override the generated-index destination.
- `--json`: emit machine-readable JSON.

Generated files:

```text
catalog/generated/
  provider-inventory.json
  style-sources.json
  component-sources.json
```

`daisyui-theme-css` restricts discovery to the 35 theme CSS files and emits
canonical JSON after deterministic OKLCH conversion. This generated-index
schema is separate from the hosted browser's schema-v3 `catalog.json`.

`update` remains a compatibility alias for `refresh-catalog`. It does **not**
update an installed Web Style Director skill. User-facing tool updates follow
the `Update` procedure in the root `INSTALL.md`.
