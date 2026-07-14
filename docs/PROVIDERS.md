# Providers and Source Boundaries

Provider configuration lives in `catalog/providers.json`. A Provider supplies
reference material or implementation components; it does not directly create a
user-facing choice. Source indexing and catalog curation are separate stages.

## Current providers

| Provider | Role | Style Adapter | Effective curation capability |
| --- | --- | --- | --- |
| `awesome-design-md` | style reference corpus | `awesome-design-md` | Direction + Theme |
| `daisyui-themes` | theme-token corpus | `daisyui-theme-css` | Theme only |
| `design-md-flow` | workflow reference | none | none |
| `shadcn-ui` | foundational components | none | none |
| `origin-ui` | application and marketing sections | none | none |
| `magic-ui` | motion-rich marketing components | none | none |
| `tremor` | dashboards and charts | none | none |

The current generated snapshot contains 7 providers, 109 style sources, and
600 component sources. These are source-pool counts, not fixed catalog limits
or 109 user-facing styles.

## Source-to-catalog boundary

```mermaid
flowchart LR
  A["Provider repository"] --> B["Adapter discovery + normalization"]
  B --> C["catalog/generated indexes"]
  C --> D["AI-assisted curation"]
  D --> E["Canonical Direction/Theme files"]
  E --> F["Draft PR + maintainer review"]
```

Run the index refresh with:

```bash
node bin/ai-ui-style-director.mjs refresh-catalog --clone
```

The command refreshes local Provider checkouts, lets each Adapter discover and
normalize supported style sources, scans component registry/documentation
files, and writes indexes under `catalog/generated/`. It does not modify the
canonical Direction/Theme catalog or legacy profile/visual/alias files.

A new or changed indexed source enters the separate curation queue. It reaches
the user-facing catalog only after schema, capability, provenance, two-stage
duplicate, canonical catalog, immutable-record, and repository checks pass in
a reviewed Draft PR.

| Layer | Files | Ownership |
| --- | --- | --- |
| Generated source index | `catalog/generated/provider-inventory.json`, `style-sources.json`, component indexes | refresh workflow |
| Canonical consumer catalog | `style-directions.json`, `style-themes.json`, `style-direction-themes.json`, `style-preview-specs.json` | reviewed curation |
| Compatibility projection | `style-profiles.json`, `style-visuals.json`, `style-aliases.json`, legacy previews | read-only for automated curation |

## Adapter and capability contract

Style-source format handling belongs in an Adapter. Every Adapter defines:

- source discovery and `sourceType`;
- strict normalization and `normalizerVersion`;
- its maximum `createDirection` / `createTheme` capability;
- optional format-derived constraints such as a required Theme.

A Provider may explicitly narrow the Adapter ceiling:

```json
{
  "id": "example-provider",
  "adapter": "generic-design-md",
  "capabilities": {
    "createDirection": true,
    "createTheme": true
  }
}
```

Effective capabilities are the boolean intersection of the Provider
declaration and Adapter ceiling. Omitting `capabilities` accepts the Adapter
ceiling; declaring `true` cannot override an Adapter's `false`.

The effective result is bound into a per-source `processingPolicyHash` together
with the explicit processing-policy version, Adapter ID, and normalizer
version. Changing this policy makes affected sources pending without relying
on a global prompt-version replay.

### `DESIGN.md` adapters

`awesome-design-md` preserves the existing Awesome corpus semantics and hosted
overview/Light/Dark reference links. A non-Awesome Provider without an explicit
Adapter defaults to `generic-design-md`, which recursively discovers files
named `DESIGN.md`. Both Adapter ceilings allow Direction and Theme creation;
the Provider declaration may narrow them.

Model output is still constrained to governed taxonomy and exact indexed
references. Supporting a genuinely new source format should add a reviewed
Adapter instead of weakening the generic parser or passing arbitrary upstream
content directly to the consumer catalog.

### `daisyui-theme-css`

This Adapter deliberately matches only:

```text
packages/daisyui/src/themes/*.css
```

It extracts governed theme tokens, converts OKLCH colors deterministically,
and emits canonical JSON for both content hashing and bounded model input. It
does not treat arbitrary repository CSS as a style source.

The accepted contract is exactly 29 declarations: one `color-scheme`, 20 color
tokens, and eight geometry tokens. Unknown, missing, duplicated, or malformed
declarations fail closed. DaisyUI `--color-primary` becomes the catalog's
single brand/action `accent`; DaisyUI `--color-accent` remains in the full
normalized source map as an auxiliary highlight.

The Adapter ceiling is Theme-only. `daisyui-themes` also declares that limit
explicitly, so it can add or link a Theme only after trusted code selects an
eligible existing Direction. It can never create a Direction. A historical
source retains its alias-resolved Direction; a brand-new source must match an
existing Direction from the bounded allowed context or becomes `invalid`.

If upstream changes the token schema, support must arrive through a normal
reviewed code PR that updates the allowlist and bumps `normalizerVersion`.

## Adding a provider

| Step | Required change | Review question |
| --- | --- | --- |
| 1 | Add repository metadata to `catalog/providers.json` | Is the role and license clear? |
| 2 | Select an existing Adapter or implement a strict new one | Is the input format normalized and bounded? |
| 3 | Declare capabilities when the Provider needs a narrower policy | Can this source add structure, Theme, or neither? |
| 4 | Refresh generated indexes | Are discovery paths and hashes stable? |
| 5 | Run `npm run check` | Do contracts, provenance, and migrations still hold? |
| 6 | Merge the source-index PR | The curation workflow then drains all pending sources in batches of five |

There is no fixed provider, source, Direction, or Theme count. Five is only the
maximum number of sources processed in one curator batch; `--drain` loops until
every pending source has been handled.

## Provenance and revision semantics

Every indexed source is addressed by exact `providerId + path` and versioned by
its normalized content hash. Provider inventory pins a 40-character Git
revision. New canonical Themes record a `source-pinned` reference containing
provider, path, repository, revision, content hash, and source URL.

That provenance is historical evidence. A later refresh may advance the
Provider inventory, but it must not rewrite an existing Theme's pinned revision
to the current upstream head. If the governed source content or processing
policy changes, the stable source identity becomes pending and the new
immutable event records its own snapshot.

Legacy Awesome slug references can still expand to getdesign.md overview and
Light/Dark links. Generic references use exact Provider paths and a GitHub page
pinned to the event revision. Legacy `style-visuals.json` is a compatibility
projection, not the write target for new curation.

See [Automated AI-assisted style curation](AUTOMATED_CURATION.md) for state,
duplicate, record, Action allowlist, and Draft PR details.

## Attribution and brand safety

Provider repositories are inspiration sources and implementation materials,
not permission to clone a brand. Generated websites should use project-owned
or properly licensed assets, comply with open-source licenses, and include
required attribution/notices.

Do not copy upstream logos, screenshots, protected brand names, proprietary
copy, or exact page layouts. Review each Provider license before incorporating
its code. See `THIRD_PARTY_NOTICES.md` for repository notices.
