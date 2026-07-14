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

- `--again`: exclude Directions already shown in the current session.
- `--session <path>`: choose the session-state file.
- `--count <number>`: choose the maximum number of results.
- `--open`: open the generated recommendation gallery in the default browser.
- `--json`: emit machine-readable JSON.

If the brief lacks essential context, the command returns targeted questions
instead of recommendations.

Direction ranking is performed by the deterministic Node.js recommendation
core. After ranking, the core selects one linked Theme for each Direction using
the brief, the default-link flag, and a stable Theme-ID tie break. Theme
selection does not change Direction scores or ordering.

Each text result and its generated gallery show the Direction ID and name
together with the selected Theme ID and name. Machine-readable results also
carry Theme appearance and tokens. Results include a local SVG card, upstream
Light/Dark references, and component guidance. Session schema v2 stores
`shownDirectionIds` and the last Direction/Theme selections. It still reads
legacy `shownStyleIds`, resolving known IDs through the alias catalog, so
`--again` excludes the corresponding Directions.

## `browse`

Print the read-only GitHub Pages URL for the complete curated style catalog:

```bash
node bin/ai-ui-style-director.mjs browse --open
```

Options:

- `--open`: open the hosted URL with the operating system's default browser.
- `--json`: emit machine-readable hosted-catalog information.

The JSON object contains `catalogUrl`, `hosted`, `catalogRevision`,
`directionCount`, `themeCount`, `linkCount`, the compatibility `styleCount`,
`sourceCount`, and `opened`. The command returns immediately and does not start
a local server. `serve` remains a compatibility alias that emits a migration
notice and otherwise has the same behavior. `--port` is rejected for both
commands; use it only with `preview --serve`.

The page shows one card per curated Direction and lets the user switch among
its linked Themes. The current checked-in snapshot contains 57 Directions and
77 Direction/Theme links; these numbers describe current data, not a product
limit or future cap. Each card includes reviewed metadata, component guidance,
references, and generated previews. Search and existing filters remain
available, including the six-value experience-type Facet and common Chinese
aliases such as `C端应用` and `后台`. URL state stores canonical values such as
`tag=experienceType:consumer-app`.

The hosted `catalog.json` uses schema version 5. It contains Direction entries,
linked Theme choices, lightweight `previewUrl` values, an inverted postings
index, and an ID-to-entry index rather than embedded SVG data. Exact tokens use
postings intersections; partial or unknown tokens use substring fallback. The
client progressively renders 24 matching Direction cards at a time. The first
unfiltered batch round-robins the six experience types; search and Facet views
retain canonical/search-index order. Canonical
previews use validated same-origin paths
`previews/v2/<direction-id>/<theme-id>.svg`; historical URLs remain available
as `previews/<legacy-style-id>.svg`.

The schema also carries a deterministic `catalogRevision`. The CLI adds its
local expected revision to the hosted URL, and the page compares it with the
deployed HTML and JSON revisions. A mismatch produces a non-blocking stale-site
warning; search and filtering remain available.

`catalog/generated/style-sources.json` currently contains 109 indexed upstream
source paths from 7 providers; the component index contains 600 paths. The
original 74 `DESIGN.md` sources remain the baseline and the 35 daisyUI themes
begin as pending. The browser reports the source-pool count for context but does
not turn those paths into style cards; only reviewed Directions appear as full
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

Generate the project design contract after the user selects a Direction and
Theme:

```bash
node bin/ai-ui-style-director.mjs apply \
  --style operational-saas-console \
  --theme theme-a1ba3ddb542f \
  --project ./my-site \
  --brief "B2B SaaS workflow dashboard"
```

Options:

- `--style <id>`: required Direction ID or legacy style ID.
- `--theme <id>`: Theme ID linked to the Direction. Recommendation flows must
  pass it explicitly.
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

At the raw CLI level, omitting `--theme` is supported for compatibility. A
legacy style ID resolves alias-first to its historical Direction/Theme pair.
An ID that identifies only a canonical Direction, and is not also a legacy
alias, falls back to its declared default Theme. Recommendation flows still
pass both IDs explicitly so the applied pair is exactly the pair
the user reviewed.

The v2 `DESIGN.md`, `selected-style.json`, and `source-attribution.json` record
Direction structure and Theme color provenance as separate layers. The project
draft carries both IDs and uses the selected semantic structure and Theme
tokens.

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
schema is separate from the hosted browser's schema-v5 `catalog.json`.

`update` remains a compatibility alias for `refresh-catalog`. It does **not**
update an installed Web Style Director skill. User-facing tool updates follow
the `Update` procedure in the root `INSTALL.md`.
