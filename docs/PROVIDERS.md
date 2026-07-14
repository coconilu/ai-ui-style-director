# Providers and Source Boundaries

Provider configuration lives in `catalog/providers.json`. Providers supply
design reference material or implementation components without becoming part
of the user-facing workflow.

## Current roles

- `awesome-design-md`: style reference corpus.
- `daisyui-themes`: theme-token reference corpus backed by `saadeghi/daisyui`.
- `design-md-flow`: workflow reference.
- `shadcn-ui`: foundational components.
- `origin-ui`: application and marketing sections.
- `magic-ui`: motion-rich marketing components.
- `tremor`: dashboards and charts.

## Refreshing provider indexes

Run:

```bash
node bin/ai-ui-style-director.mjs refresh-catalog --clone
```

The command refreshes local provider checkouts, lets each configured adapter
discover and normalize its style sources, scans registry and documentation
files, then writes normalized indexes under `catalog/generated/`. It does not
automatically rewrite the curated `catalog/style-profiles.json`.

The generated indexes currently describe 7 providers, 109 style sources, and
600 component sources. These paths form a source pool; they are not 109
user-facing styles. The original 74 `DESIGN.md` sources remain the checked-in
baseline, while the 35 daisyUI themes begin as pending sources. A new or changed
source can enter the separate AI-assisted curation workflow, but it reaches the
curated catalog only after structured candidate, provenance, duplicate,
preview, and repository gates pass. The curated catalog starts from a reviewed
baseline of four profiles in each of 12 families and can grow through audited
curation PRs.

The `daisyui-theme-css` adapter is deliberately format-specific. It matches
only `packages/daisyui/src/themes/*.css`, extracts governed theme tokens,
converts OKLCH colors deterministically, and produces canonical JSON for both
content hashing and bounded curation-model input. It does not treat arbitrary repository
CSS as a style source.

The adapter accepts exactly 29 declarations: one `color-scheme`, 20 governed
color tokens, and eight geometry tokens. Unknown, missing, duplicated, or
malformed declarations fail closed during refresh. If daisyUI adds or changes
its token contract, support must arrive through a normal reviewed code PR that
updates the allowlist and bumps the normalizer version; the refresh job does
not silently absorb a new upstream schema.

The catalog's single `canonicalTheme.accent` role is derived from daisyUI's
`--color-primary`, because primary is the theme's dominant brand/action color;
daisyUI's own `--color-accent` remains available in the normalized color-token
map as a secondary highlight. When a governed upstream value changes, the
canonical JSON and its hash change. The stable `providerId + path` source then
becomes pending again because its current hash no longer matches source state.

The generated provider/style/component indexes use schema v4. The hosted
browser has an independent schema-v4 `catalog.json` contract for its
Direction/Theme view model.

The scheduled GitHub workflow performs the same refresh daily, runs repository
checks, and opens a pull request only when generated indexes change.

## Visual references

`catalog/style-visuals.json` maps each normalized internal style to three real
sources. Legacy `awesome-design-md` slug references expand to getdesign.md
overview and Light/Dark live-preview links. Generic providers use exact
`provider + path` references and a GitHub source page pinned to the indexed
revision.

See [Automated AI-assisted style curation](AUTOMATED_CURATION.md) for adapter,
state, audit, and GitHub Actions details.

The links are intentionally separate from `catalog/previews/`: local SVG cards
are project-owned neutral wireframes, while hosted previews remain external
reference material and are never vendored.

## Attribution and brand safety

Provider repositories are inspiration sources and implementation materials, not
permission to clone a brand. Generated websites should use:

- project-owned assets;
- generated assets with appropriate usage rights;
- open-source component code under its license;
- required source attribution and notices.

Do not copy upstream logos, screenshots, protected brand names, proprietary
copy, or exact page layouts. Review each provider's license before incorporating
its code. See `THIRD_PARTY_NOTICES.md` for repository notices.
