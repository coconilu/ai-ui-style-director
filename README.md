# AI UI Style Director

[中文版](README.zh-CN.md)

AI UI Style Director is an agent workflow and CLI for recommending UI style directions before generating or redesigning websites.

It solves a common failure mode in AI-generated websites: the agent starts coding before the visual direction is explicit. This project adds a style-selection gate:

1. Understand the user's website or redesign scenario.
2. Recommend five relevant UI style directions from a curated style catalog.
3. If the user rejects them, recommend five unseen alternatives.
4. When the user chooses one, generate a project-specific `DESIGN.md`.
5. Let the coding agent implement UI against that `DESIGN.md`.

## Why This Is Not Just Another Component Library

This project is a style router for coding agents. It connects design inspiration corpora and component libraries, but it does not copy upstream brands, screenshots, or proprietary assets.

It separates two concerns:

- **Style profiles**: agent-readable design directions inspired by `DESIGN.md` corpora.
- **Component kits**: implementation materials such as shadcn/ui, Origin UI, Magic UI, and Tremor.

## Quick Start

```bash
node bin/ai-ui-style-director.mjs recommend --brief "AI developer tool website"
```

Ask for a reroll that excludes the last recommendations:

```bash
node bin/ai-ui-style-director.mjs recommend --brief "AI developer tool website" --again
```

Generate a project `DESIGN.md` after the user picks a style:

```bash
node bin/ai-ui-style-director.mjs apply \
  --style developer-product-minimal \
  --project ./examples/new-site \
  --brief "AI SDK landing page for developers" \
  --force
```

Inspect configured upstream providers:

```bash
node bin/ai-ui-style-director.mjs sync
```

Optionally clone provider repositories into a local cache:

```bash
node bin/ai-ui-style-director.mjs sync --clone
```

Refresh provider repositories and regenerate committed indexes:

```bash
node bin/ai-ui-style-director.mjs update --clone
```

## CLI Commands

### `recommend`

Recommend five UI style directions.

```bash
node bin/ai-ui-style-director.mjs recommend --brief "B2B SaaS dashboard for finance teams" --count 5
```

Important flags:

- `--again`: exclude styles already shown in the session.
- `--session <path>`: use a custom session file.
- `--json`: return machine-readable output.

If the brief is too vague, the command returns required context questions instead of guessing.

### `apply`

Generate a project-level `DESIGN.md` and state files.

```bash
node bin/ai-ui-style-director.mjs apply --style operational-saas-console --project ./my-site
```

Generated files:

```text
my-site/
  DESIGN.md
  .ui-style-director/
    selected-style.json
    recommended-components.json
    source-attribution.json
```

### `sync`

Read provider configuration and write a provider lock file. With `--clone`, it clones or updates the configured GitHub repositories.

### `update`

Clone or update providers, scan cached repositories for `DESIGN.md`, registry files, and docs, then write generated indexes under `catalog/generated/`.

```bash
node bin/ai-ui-style-director.mjs update --clone
```

Generated files:

```text
catalog/generated/
  provider-inventory.json
  style-sources.json
  component-sources.json
```

This command is safe to run locally and in CI. It keeps upstream data discoverable without changing the hand-curated `catalog/style-profiles.json` automatically.

## Agent Skill

The Codex-compatible skill lives at:

```text
skills/web-style-director/
```

For prompt-based installation, see:

```text
docs/INSTALL_PROMPTS.md
```

The skill enforces this rule:

> Do not start writing UI code until the user has selected one recommended style and a project `DESIGN.md` has been generated.

## Provider Model

Providers are configured in `catalog/providers.json`.

Current provider roles:

- `awesome-design-md`: style corpus
- `design-md-flow`: workflow reference
- `shadcn-ui`: base components
- `origin-ui`: app and marketing blocks
- `magic-ui`: motion-rich marketing components
- `tremor`: dashboards and charts

Provider repositories are inspiration and implementation sources, not permission to copy protected brand assets.

## Development

Run checks:

```bash
npm test
npm run check
```

This MVP has no runtime npm dependencies.

## Keeping Providers Fresh

Use `update --clone` for manual refreshes. The repository also includes a scheduled GitHub Action that runs once per day, regenerates `catalog/generated/*`, runs checks, and opens a pull request when the generated indexes change.
