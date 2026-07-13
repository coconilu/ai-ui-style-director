# AI UI Style Director

[简体中文](README.zh-CN.md)

AI UI Style Director is a UI-direction workflow for coding agents. Before a new website or redesign is implemented, it recommends five relevant visual directions. After you choose one, it generates a project-specific `DESIGN.md` and lets the agent start building from that contract.

Codex and Claude Code have first-class support on Windows, macOS, and Linux. Other Agent Skills-compatible tools are supported on a best-effort basis.

## Install

Send this to your coding agent:

```text
Read and follow:
https://raw.githubusercontent.com/coconilu/ai-ui-style-director/main/INSTALL.md

Install Web Style Director for the current agent and run its verification when finished.
```

Installation requires Git and Node.js 20 or newer.

## Use

Codex:

```text
$web-style-director I want to build an AI developer tool website
```

Claude Code:

```text
/web-style-director I want to build an AI developer tool website
```

The agent shows a brand-neutral SVG draft and upstream Light/Dark live-preview links for each of the five directions. After selection, it generates a project-specific `DESIGN.md` and first-viewport draft, then implements only after confirmation.

The agent orchestrates this workflow, but it does not improvise the match. The
Node.js core ranks the reviewed catalog with deterministic, testable rules, so
the same brief and catalog produce the same result.

## Browse the curated catalog

Open a searchable view of every curated style without starting a website
workflow:

Codex:

```text
$web-style-director browse
```

Claude Code:

```text
/web-style-director browse
```

Or run the CLI directly and open the page automatically:

```bash
node bin/ai-ui-style-director.mjs browse --open
```

The catalog is hosted at
[coconilu.github.io/ai-ui-style-director](https://coconilu.github.io/ai-ui-style-director/).
The legacy `serve` command remains a compatibility alias for `browse`; it no
longer starts a local complete-catalog server.

The catalog starts from a reviewed baseline of 48 profiles: four directions in
each of 12 families, and it can grow through audited curation PRs. The page
supports text search plus family, page type, density, tone, and component-kit
filters. It loads a lightweight schema-v3 catalog, fetches previews from
independent same-origin SVG paths, and progressively renders 24 cards at a
time. A deterministic catalog revision is attached to the URL and assets so
the page can warn about a stale deployment without blocking browsing.

The generated indexes currently describe 7 providers, 109 upstream style
sources, and 600 component sources. The 109 style-source paths remain a
governed source pool; they are not 109 additional styles. The original 74
`DESIGN.md` sources remain the no-cost baseline, while 35 daisyUI theme CSS
sources enter the audited AI-assisted curation queue. Only passing candidates
become user-facing profiles. The page reports the current source count without
misrepresenting unreviewed paths as style cards.
The `daisyui-themes` Provider uses a format-specific adapter that converts
governed CSS tokens and OKLCH colors into canonical JSON before hashing and
bounded processing by the configured curation model.
`browse` is read-only and does not create or modify project
`.ui-style-director/` state.

The command returns immediately. Use `--open` to launch the browser or
`--json` for machine-readable hosted-catalog information. `--port` is reserved
for the project-specific `preview --serve` command.

## Example: choose an admin dashboard direction

One prompt becomes five comparable directions before any UI code is written:

![Web Style Director recommending five admin dashboard directions](docs/assets/admin-dashboard-example.en.png)

## Example: carry a selected direction into production

This real Mason Market Timeline refactor shows the complete gated workflow:
recommend five directions, combine direction 4 with direction 2's financial
semantics, generate a project-specific `DESIGN.md` and first-viewport draft,
then implement only after explicit confirmation. The image also keeps the
original UI visible beside the responsive production result.

![Mason Market Timeline UI redesign from style selection through implementation and verification](docs/assets/mason-market-timeline-case-study.en.png)

This complete-catalog page is separate from a single recommendation preview.
For a terminal-only client, every recommendation also writes a self-contained
`.ui-style-director/recommendations.html` gallery. Start the local preview
server and open the printed link:

```bash
node bin/ai-ui-style-director.mjs preview --serve
```

The server listens only on `127.0.0.1`, chooses an available port, and runs
until you press Ctrl+C. `preview --open` remains available as a direct-file
fallback.

## Update

Codex:

```text
$web-style-director update
```

Claude Code:

```text
/web-style-director update
```

You can also say: `Update web-style-director and verify it afterward.`

## Uninstall

Codex:

```text
$web-style-director uninstall
```

Claude Code:

```text
/web-style-director uninstall
```

`delete` and “remove web-style-director” are also treated as uninstall intent. Uninstall removes only the tool; it does not delete project `DESIGN.md` files, `.ui-style-director/` state, or website code.

## Documentation

- [Project overview](docs/OVERVIEW.md)
- [Workflow](docs/WORKFLOW.md)
- [Visual previews](docs/VISUAL_PREVIEWS.md)
- [Supported platforms](docs/PLATFORMS.md)
- [CLI reference](docs/CLI.md)
- [Providers and source boundaries](docs/PROVIDERS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Implementation and open-source integration](docs/IMPLEMENTATION.md)
- [Automated provider refresh](docs/AUTOMATED_REFRESH.md)
- [Automated AI-assisted style curation](docs/AUTOMATED_CURATION.md)
- [Development and maintenance](docs/DEVELOPMENT.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)

MIT License. Follow upstream licenses and do not copy protected brand assets, proprietary copy, or exact page layouts.
