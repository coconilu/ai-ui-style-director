# Architecture

AI UI Style Director has six layers.

## 1. Catalog

The catalog contains normalized design knowledge. Runtime consumers read the
canonical v2 projection:

- `catalog/style-directions.json`: reviewed structural Directions, product fit,
  layout guidance, typography, component suggestions, and Direction references.
- `catalog/style-themes.json`: reusable appearance, semantic color tokens, and
  pinned Theme sources.
- `catalog/style-direction-themes.json`: allowed Direction/Theme pairs and one
  default link per Direction.
- `catalog/style-preview-specs.json`: one structural PreviewSpec per Direction.
- `catalog/style-aliases.json`: legacy style IDs mapped to historical
  Direction/Theme pairs.
- `catalog/style-profiles.json`, `catalog/style-visuals.json`, and
  `catalog/previews/*.svg`: legacy curation, audit, migration, and preview
  compatibility artifacts; they are not the runtime recommendation source.
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

The current canonical snapshot contains 57 Directions and 77 linked Theme
selections. These values describe checked-in data, not configured limits.

The catalog is intentionally structured. Agents should not load large upstream repositories into context just to choose a style.

Supply-side curation is separate from consumer-side recommendation. The
OpenAI-compatible curator reads only bounded new/changed source material and
proposes a structured candidate. Program code owns provenance, taxonomy,
duplicate policy, promotion, preview generation, and validation. The existing
GitHub App opens an audited Draft PR only after those deterministic gates pass;
a maintainer reviews and merges it manually.

## 2. Visual Preview Layer

`src/preview.mjs` renders deterministic SVG wireframes from a Direction,
PreviewSpec, and Theme. The PreviewSpec controls layout archetype, content
pattern, blocks, and hierarchy; the Theme supplies appearance and semantic
tokens, so changing only Theme preserves structure.

`scripts/generate-style-previews.mjs` continues to generate and verify committed
legacy cards for compatibility, and renders every linked Direction/Theme pair
in memory to verify deterministic v2 completeness. The same semantic renderer
creates recommendation cards and the project-level
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

`src/catalog-browser.mjs` builds a schema-v4 browser view model from canonical
Directions, linked Themes, PreviewSpecs, component-kit tags, and the upstream
style-source count. Each entry represents one Direction and carries linked
Theme choices with lightweight `previewUrl` values instead of embedded SVG.
`scripts/build-catalog-site.mjs` writes the complete static site to `dist/pages`,
including HTML, JSON, CSS, JavaScript, favicon, canonical previews at
`previews/v2/<direction-id>/<theme-id>.svg`, and compatible historical previews
at `previews/<legacy-style-id>.svg`.

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
limits initial layout and image work as the catalog grows. Theme switching
updates the preview inside a Direction card rather than duplicating cards.
Entries in
`catalog/generated/style-sources.json` remain a provenance index and are shown
only as a current count, never promoted into unreviewed Direction cards.

The model also carries a deterministic `catalogRevision`, derived from the
canonical Direction, Theme, link, PreviewSpec, and alias documents. The CLI
adds its local expected revision to the Pages URL. The browser compares that
value with the deployed HTML and JSON revisions and shows a non-blocking warning
if deployment is stale.

This surface is intentionally distinct from `preview --serve`: the former
browses the publicly hosted complete reviewed Catalog, while the latter serves
one generated recommendation batch on `127.0.0.1`.

## 4. Recommendation Core

`src/core.mjs` scores Directions against the user's brief using:

- page type
- audience
- product goal
- density
- tone
- keywords
- important scenario hints

Matching is deterministic and programmatic. After Direction ranking and
diversification, `selectThemeForDirection` scores only the linked Themes against
the same brief. Stable ties prefer the default link and then Theme ID; this
second stage does not change Direction scores or order. The Agent gathers
context, presents results, and enforces the selection gate; it does not replace
the ranking algorithm with an ad hoc judgment.

`scripts/validate-curated-catalog.mjs` retains the legacy Profile/Visual/preview
curation gate. `scripts/migrate-direction-theme-catalog.mjs --check` verifies
that the canonical projection is deterministic, while
`scripts/validate-direction-theme-catalog.mjs` checks Direction, Theme, link,
PreviewSpec, alias, provenance, and token integrity. The 12-case recommendation
benchmark verifies expected family coverage and identical Direction rankings
across repeated runs.

Session schema v2 tracks `shownDirectionIds`; `--again` excludes Directions,
while legacy `shownStyleIds` remain readable through aliases. Recommendations
include the scored Direction, selected Theme, PreviewSpec, local SVG card,
Direction-reference URLs, and Theme provenance.

## 5. Project Contract

After the user chooses a Direction/Theme pair, the recommendation flow passes
both IDs to `apply`, which writes a project-specific `DESIGN.md` and
`.ui-style-director/first-viewport-draft.svg`.

The generated `DESIGN.md` is the implementation contract. It records:

- selected Direction and Theme IDs
- Direction structure and matching PreviewSpec
- Direction-reference links
- Theme appearance, semantic tokens, and pinned Theme sources
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
2. Rank five Directions, select one linked Theme for each, and show local SVG
   cards with Light/Dark references.
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
hashing and bounded curation-model input. Raw CSS instructions are never promoted directly into
the consumer catalog.

Provider inventory, style-source, and component-source artifacts use generated
schema v4. The hosted browser view model independently uses schema v4 as well;
the matching number does not make their contracts interchangeable.

This keeps the project legally and technically cleaner:

- source attribution remains explicit
- licenses can be checked per provider
- upstream updates can be synced
- generated websites use inspired style contracts, not brand clones
