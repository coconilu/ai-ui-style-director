# Providers and Source Boundaries

Provider configuration lives in `catalog/providers.json`. Providers supply
design reference material or implementation components without becoming part
of the user-facing workflow.

## Current roles

- `awesome-design-md`: style reference corpus.
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

The command refreshes local provider checkouts, scans `DESIGN.md`, registry,
and documentation files, then writes normalized indexes under
`catalog/generated/`. It does not automatically rewrite the curated
`catalog/style-profiles.json`.

The current `style-sources.json` contains 74 provider paths. These paths form a
source pool; they are not 74 user-facing styles. The checked-in 74 are baseline
sources. A future new or changed source can enter the separate AI-assisted
curation workflow, but it reaches the curated catalog only after structured
candidate, provenance, duplicate, preview, and repository gates pass. The
curated catalog starts from a reviewed baseline of four profiles in each of 12
families and can grow through audited curation PRs.

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
