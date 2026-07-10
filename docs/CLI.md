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
- `--json`: emit machine-readable JSON.

If the brief lacks essential context, the command returns targeted questions
instead of recommendations.

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
    selected-style.json
    recommended-components.json
    source-attribution.json
```

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

Refresh cached providers, scan their design and component metadata, and write
committable indexes under `catalog/generated/`:

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

`update` remains a compatibility alias for `refresh-catalog`. It does **not**
update an installed Web Style Director skill. User-facing tool updates follow
the `Update` procedure in the root `INSTALL.md`.
