# Architecture

AI UI Style Director has six layers.

## 1. Catalog

The catalog contains normalized design knowledge:

- `catalog/style-profiles.json`: reviewed style directions governed by 12
  baseline families; the initial baseline contains four profiles per family.
- `catalog/style-visuals.json`: preview variants, themes, and real visual references.
- `catalog/previews/`: generated brand-neutral SVG cards.
- `catalog/component-kits.json`: implementation kits that can support each style.
- `catalog/providers.json`: 7 upstream repositories used as style or component providers.
- `catalog/generated/style-sources.json`: an index of upstream style-source
  paths; the current 109 entries are provenance leads, not curated style
  profiles.
- `catalog/generated/component-sources.json`: the current 600 upstream
  component-source paths.
- `catalog/scenario-questions.json`: required questions when a user brief is too vague.
- `catalog/curation-policy.json`: baseline family depth and per-family visual-diversity requirements.
- `catalog/curation/source-state.json`: content-hash processing cursor; the
  original 74 `DESIGN.md` sources are the no-cost initial baseline, while the
  35 daisyUI theme CSS sources begin as pending work.
- `catalog/curation/records/`: immutable per-source model and gate audit records
  created only after the baseline.
- `catalog/recommendation-benchmarks.json`: 12 representative briefs used to
  protect intent coverage and deterministic ranking.

The catalog is intentionally structured. Agents should not load large upstream repositories into context just to choose a style.

Supply-side curation is separate from consumer-side recommendation. The
OpenAI-compatible curator reads only bounded new/changed source material and
proposes a structured candidate. Program code owns provenance, taxonomy,
duplicate policy, promotion, preview generation, and validation. The existing
GitHub App opens an audited Draft PR only after those deterministic gates pass;
a maintainer reviews and merges it manually.

## 2. Visual Preview Layer

`src/preview.mjs` turns normalized visual metadata into deterministic SVG
wireframes. `scripts/generate-style-previews.mjs` generates and verifies one
committed card per curated style. The same renderer creates a project-level
`first-viewport-draft.svg` after selection.

`src/core.mjs` packages each recommendation set into a self-contained
`.ui-style-director/recommendations.html` gallery. Generated SVG cards are
embedded as data URIs so terminal-only and remote users can copy or download a
single portable preview file. The CLI exposes the gallery through `preview`
and an optional cross-platform `--open` action. For terminal clients it can
also start a minimal foreground HTTP server on `127.0.0.1`; the server exposes
only the selected gallery and uses an OS-assigned port by default.

`src/loopback-server.mjs` provides the local-only HTTP boundary for generated
recommendation previews. Host, port, request, cache, and shutdown handling stay
isolated from the publicly hosted complete catalog.

The preview layer keeps generated neutral cards separate from external
Light/Dark references. Upstream previews are links for comparison, not assets
to vendor or ship.

## 3. Catalog Browser

`src/catalog-browser.mjs` builds a schema-v3 browser view model from the curated
style profiles, visual metadata, profile component-kit tags, and the upstream
style-source count. Each entry carries a lightweight `previewUrl` instead of
an embedded SVG. `scripts/build-catalog-site.mjs` writes the complete static
site to `dist/pages`, including HTML, JSON, CSS, JavaScript, favicon, and one
preview SVG per curated style.

All site references are relative, so the artifact works under the GitHub
project-site subpath. `.github/workflows/pages.yml` builds the artifact for pull
requests and deploys it to GitHub Pages from `main`. `browse` prints or opens
the hosted URL; the old `serve` name is a non-blocking compatibility alias and
does not start a local complete-catalog server.

The catalog payload contains an inverted token-to-numeric-entry postings index
and a direct ID-to-entry index. Numeric postings avoid repeating long style IDs
for every searchable term. Exact query tokens use postings intersections;
unknown or partial tokens fall back to substring matching. The page keeps the
full match count but adds cards to the DOM in progressive batches of 24, which
limits initial layout and image work as the catalog grows. Entries in
`catalog/generated/style-sources.json` remain a provenance index and are shown
only as a current count, never promoted into unreviewed style profiles.

The model also carries a deterministic `catalogRevision`, derived from the
curated profiles and visual metadata. The CLI adds its local expected revision
to the Pages URL. The browser compares that value with the deployed HTML and
JSON revisions and shows a non-blocking warning if deployment is stale.

This surface is intentionally distinct from `preview --serve`: the former
browses the publicly hosted complete reviewed Catalog, while the latter serves
one generated recommendation batch on `127.0.0.1`.

## 4. Recommendation Core

`src/core.mjs` scores style profiles against the user's brief using:

- page type
- audience
- product goal
- density
- tone
- keywords
- important scenario hints

Matching is deterministic and programmatic. The Agent gathers context,
presents results, and enforces the selection gate; it does not replace the
ranking algorithm with an ad hoc judgment. Embeddings can be added later, but
the selection gate does not need them to be useful.

`scripts/validate-curated-catalog.mjs` checks the one-to-one profile, visual,
and preview relationship, the baseline of at least four profiles and three
visual variants in each required family, taxonomy fields, supported render
variants, theme colors, and the three reviewed upstream references for every style. The
12-case recommendation benchmark verifies expected family coverage and
identical rankings across repeated runs.

Recommendations include the local SVG card and expanded visual-reference URLs
alongside the scored profile.

## 5. Project Contract

After the user chooses a style, `apply` writes a project-specific `DESIGN.md`
and `.ui-style-director/first-viewport-draft.svg`.

The generated `DESIGN.md` is the implementation contract. It records:

- selected style
- source provider and source slug
- real visual-reference links
- project brief
- first-viewport architecture
- layout rules
- color roles
- typography
- component kit guidance
- brand-safety requirements

Agents show the draft, wait for confirmation, and then implement UI from the
contract instead of improvising a new direction.

## 6. Agent Skill

`skills/web-style-director/SKILL.md` wraps the CLI in an agent workflow:

1. Gather missing context.
2. Recommend five styles with local SVG cards and Light/Dark references.
3. Wait for selection.
4. Reroll if the user rejects the options.
5. Generate `DESIGN.md` and a project first-viewport draft.
6. Wait for draft confirmation.
7. Only then write UI code.

The skill can be used directly from this repository or copied into a supported
Codex or Claude Code personal skill directory. Both agents use the same
`SKILL.md`; only installation paths and explicit invocation syntax differ.
It routes an explicit `browse`, legacy `serve`, or catalog-browsing request
directly to the hosted catalog without entering the five-direction website
workflow. It also routes explicit update and uninstall requests to the
lifecycle contract in the root `INSTALL.md`, keeping installed-tool updates
separate from provider catalog maintenance.

## Why Provider Adapters

Upstream projects should be connected through adapters, not copied wholesale.

The `generic-design-md` and legacy `awesome-design-md` adapters normalize
`DESIGN.md` documents. The `daisyui-themes` Provider's `daisyui-theme-css`
adapter instead discovers the
35 files under `packages/daisyui/src/themes/`, parses only the governed theme
tokens, converts OKLCH colors deterministically, and emits canonical JSON for
hashing and Kimi input. Raw CSS instructions are never promoted directly into
the consumer catalog.

Provider inventory, style-source, and component-source artifacts use generated
schema v4. The hosted browser view model remains its independent schema v3.

This keeps the project legally and technically cleaner:

- source attribution remains explicit
- licenses can be checked per provider
- upstream updates can be synced
- generated websites use inspired style contracts, not brand clones
