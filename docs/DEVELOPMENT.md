# Development and Maintenance

## Repository layout

```text
ai-ui-style-director/
  bin/                         # CLI entry point
  src/                         # recommendation, apply, and provider logic
  scripts/                     # deterministic preview and static-site generation
  catalog/                     # styles, visuals, previews, providers, and questions
  skills/web-style-director/   # agent skill
  examples/new-site/           # example brief and generated DESIGN.md
  docs/                        # detailed documentation
  test/                        # Node.js tests
```

The project has no runtime npm dependencies and requires Node.js 20 or newer.
The current reviewed catalog contains 48 profiles, balanced as four profiles
in each of 12 families. The 74 provider paths in
`catalog/generated/style-sources.json` are a source pool, not additional
curated profiles.

## Checks

Run:

```bash
npm test
npm run check
```

`npm run check` validates JavaScript syntax, the curated and generated catalog
schemas, committed preview freshness, and the test suite.

Validate only the curated profile/visual/reference contract with:

```bash
npm run catalog:curated:validate
```

This command applies `catalog/curation-policy.json`, including the baseline of
at least four profiles and three visual variants in every required family. It
also checks unique IDs, required profile fields and taxonomy values, one
matching visual and preview per profile, supported render variants, valid theme
colors, and exactly three unique references that exist in the generated
provider source index.

Regenerate style cards after changing `style-visuals.json` or preview rendering:

```bash
npm run previews
npm run previews:check
```

The preview check verifies that every profile has an up-to-date committed SVG.

Build the deployable catalog site with:

```bash
npm run catalog:build
```

The command recreates `dist/pages` with schema-v3 `catalog.json`, the browser
shell and assets, and one preview SVG per curated profile. The output is
deterministic, uses only relative references for the GitHub project subpath,
and is intentionally not committed. `.github/workflows/pages.yml` runs this
build for pull requests and deploys it from `main` through GitHub Pages.

## Adding or changing a curated style

1. Add or update the reviewed profile in `catalog/style-profiles.json`. Keep
   the 12-family taxonomy and the baseline in `catalog/curation-policy.json`
   intact.
2. Add exactly one matching visual entry in `catalog/style-visuals.json`, using
   a supported renderer variant, a complete semantic theme, and three distinct
   provider references.
3. Choose references from `catalog/generated/style-sources.json`; do not
   promote a provider path into a style without the reviewed profile and visual
   metadata.
4. Run `npm run previews`, then visually inspect the generated SVG.
5. Run `npm run catalog:curated:validate`.
6. Run `npm run check` before committing.

The catalog model derives schema v3, the inverted search index, facets, and
`catalogRevision` from reviewed data, so there is no second hand-maintained
search index. Each entry carries a relative `previewUrl`; the client renders 24
cards at a time, keeping initial DOM and image work bounded as the catalog
grows.

`catalog/recommendation-benchmarks.json` contains 12 representative briefs.
When taxonomy or scoring changes, update or extend those cases deliberately;
the recommendation test verifies expected Top-1/Top-5 family coverage and
identical IDs and scores across repeated runs.

Validate the skill separately with the Codex `skill-creator` validator when it
is available:

```bash
python <skill-creator>/scripts/quick_validate.py skills/web-style-director
```

## Provider maintenance

Refresh provider-derived indexes with:

```bash
node bin/ai-ui-style-director.mjs refresh-catalog --clone
npm run check
```

`.github/workflows/refresh-providers.yml` performs this work daily and opens a
pull request if `catalog/generated/` changes.

## User-facing releases

Keep these surfaces consistent when installation layout or lifecycle behavior
changes:

- root `INSTALL.md`;
- `docs/PLATFORMS.md` and `docs/PLATFORMS.zh-CN.md`;
- `docs/VISUAL_PREVIEWS.md` and `docs/VISUAL_PREVIEWS.zh-CN.md`;
- `catalog/style-visuals.json` and `catalog/previews/`;
- `skills/web-style-director/SKILL.md`;
- `skills/web-style-director/references/lifecycle.md`;
- `skills/web-style-director/scripts/style-director.mjs`;
- the four operations shown in both README files.

An installed copy uses the repository as the CLI source and a separately
registered skill folder. Updating therefore refreshes the repository, redeploys
the skill folder, and verifies the installed wrapper.

The wrapper must keep these first-class discovery paths covered by tests:

- Codex repository under `$HOME/.codex/tools` with the skill under
  `$HOME/.agents/skills`;
- existing Codex skill installations under `$HOME/.codex/skills`;
- Claude Code repository and skill under `CLAUDE_CONFIG_DIR`, or `$HOME/.claude`
  when that variable is unset.
