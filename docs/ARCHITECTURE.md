# Architecture

AI UI Style Director has six layers.

## 1. Catalog

The catalog contains normalized design knowledge:

- `catalog/style-profiles.json`: curated style directions.
- `catalog/style-visuals.json`: preview variants, themes, and real visual references.
- `catalog/previews/`: generated brand-neutral SVG cards.
- `catalog/component-kits.json`: implementation kits that can support each style.
- `catalog/providers.json`: upstream repositories used as style or component providers.
- `catalog/generated/style-sources.json`: an index of upstream style-source
  paths; these are provenance leads, not curated style profiles.
- `catalog/scenario-questions.json`: required questions when a user brief is too vague.

The catalog is intentionally structured. Agents should not load large upstream repositories into context just to choose a style.

## 2. Visual Preview Layer

`src/preview.mjs` turns normalized visual metadata into deterministic SVG
wireframes. `scripts/generate-style-previews.mjs` generates and verifies the 12
committed style cards. The same renderer creates a project-level
`first-viewport-draft.svg` after selection.

`src/core.mjs` packages each recommendation set into a self-contained
`.ui-style-director/recommendations.html` gallery. Generated SVG cards are
embedded as data URIs so terminal-only and remote users can copy or download a
single portable preview file. The CLI exposes the gallery through `preview`
and an optional cross-platform `--open` action. For terminal clients it can
also start a minimal foreground HTTP server on `127.0.0.1`; the server exposes
only the selected gallery and uses an OS-assigned port by default.

`src/loopback-server.mjs` provides the shared local-only HTTP boundary used by
both recommendation preview and complete-catalog browsing. Keeping host,
port, request, cache, and shutdown handling in one module prevents the two
surfaces from drifting while their content remains separate.

The preview layer keeps generated neutral cards separate from external
Light/Dark references. Upstream previews are links for comparison, not assets
to vendor or ship.

## 3. Catalog Browser

`src/catalog-browser.mjs` builds a browser view model from the curated style
profiles, visual metadata, generated SVG cards, profile component-kit tags,
and the upstream style-source count. `serve` exposes that model through a
read-only page with text search and family, page type, density, tone, and
component-kit filters.

The browser serves `/`, `/catalog.json`, `/app.js`, and `/styles.css` on
`127.0.0.1`. It displays every curated profile as a complete card. Entries in
`catalog/generated/style-sources.json` remain a provenance index and are shown
only as a current count, never promoted into unreviewed style profiles.

This surface is intentionally distinct from `preview --serve`: the former
browses the complete reviewed Catalog, while the latter serves one generated
recommendation batch. Neither surface is a public hosting mechanism.

## 4. Recommendation Core

`src/core.mjs` scores style profiles against the user's brief using:

- page type
- audience
- product goal
- density
- tone
- keywords
- important scenario hints

The first version uses deterministic weighted matching. Embeddings can be added later, but the selection gate does not need them to be useful.

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
It routes an explicit `serve` or catalog-browsing request directly to the
foreground catalog browser without entering the five-direction website
workflow. It also routes explicit update and uninstall requests to the
lifecycle contract in the root `INSTALL.md`, keeping installed-tool updates
separate from provider catalog maintenance.

## Why Provider Adapters

Upstream projects should be connected through adapters, not copied wholesale.

This keeps the project legally and technically cleaner:

- source attribution remains explicit
- licenses can be checked per provider
- upstream updates can be synced
- generated websites use inspired style contracts, not brand clones
