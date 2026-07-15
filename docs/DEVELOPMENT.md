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
The reviewed baseline starts with four profiles in each of 12 families and can
grow through audited curation PRs. The generated indexes currently contain 7
providers, 109 style sources, and 600 component sources. The original 74
`DESIGN.md` sources remain the baseline and the 35 daisyUI themes begin as
pending; source paths are not additional curated profiles.

## Checks

Run:

```bash
npm test
npm run check
```

`npm run check` validates JavaScript syntax, the curated and generated catalog
schemas, committed preview freshness, curation state and immutable audit
records, and the test suite.

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

Validate only the AI-assisted curation state and records with:

```bash
npm run catalog:curation:validate
```

See [Automated AI-assisted style curation](AUTOMATED_CURATION.md) for the
model/program boundary, initial baseline, GitHub App workflow, and generic
provider onboarding.

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

The command recreates `dist/pages` with schema-v5 `catalog.json`, the browser
shell and assets, one canonical SVG per Direction/Theme link, and legacy alias
preview paths. The output is deterministic, uses only relative references for
the GitHub project subpath, and is intentionally not committed.
`.github/workflows/pages.yml` runs this build for pull requests and deploys it
from `main` through GitHub Pages.
For same-repository pull requests, the build uploads the validated site as a
seven-day Actions artifact and links it from the Catalog Pages job summary.
Extract the artifact and serve its root over loopback HTTP to review every new
Direction/Theme preview before merge. Pull requests never deploy the production
Pages site.

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

The catalog model derives schema v5, the inverted search index, facets, and
`catalogRevision` from reviewed Direction/Theme data, so there is no second
hand-maintained search index. Each Direction entry carries linked Theme preview
URLs; the client renders 24 Direction cards at a time, keeping initial DOM and
image work bounded as the catalog grows.
The default order must remain a complete deterministic permutation; its first
24 entries round-robin all six experience types. Search and Facet paths must
retain canonical/search-index order. Update the browser schema/asset
version whenever a contract or cached asset behavior changes.

`catalog/recommendation-benchmarks.json` contains 12 representative briefs.
When taxonomy or scoring changes, update or extend those cases deliberately;
the schema-v2 recommendation test verifies Top-1/Top-5 family and experience
coverage, the relevance promotion guards, and identical IDs, experience types,
and scores across repeated runs.

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

The `daisyui-theme-css` adapter scopes discovery to 35 theme files, converts
OKLCH deterministically, and emits canonical JSON for hashing and the configured curation model. When
adding another non-`DESIGN.md` format, add equivalent matcher, normalization,
hash, and malformed-input tests instead of widening the generic scanner.

After a source hash changes, `.github/workflows/curate-style-sources.yml`
proposes governed additions in a separate audited PR. Deterministic refresh
output and model-assisted curated output retain independent file allowlists.

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
