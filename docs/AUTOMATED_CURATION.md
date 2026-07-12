# Automated AI-Assisted Style Curation

This pipeline turns newly indexed upstream `DESIGN.md` material into governed
catalog proposals. The model participates in interpretation and synthesis, but
it cannot directly approve files, invent provenance, or bypass repository
checks.

## End-to-end flow

1. `refresh-providers.yml` scans configured providers and updates the generated
   source indexes. Every style source is identified by `providerId + path` and
   versioned with a normalized SHA-256 content hash.
2. `curate-style-sources.yml` detects source paths whose current hash is not in
   `catalog/curation/source-state.json`.
3. The workflow checks out the exact provider revision recorded in
   `provider-inventory.json` and verifies the source hash before any model call.
4. The OpenAI-compatible client sends a bounded request to Kimi Code, marks the
   source as untrusted data, and supplies only a small relevant profile context,
   a bounded reference pool, and the allowed catalog taxonomy.
5. The model returns either `skip` or controlled taxonomy/design primitives,
   theme colors, and exact source selections. It does not author consumer prose.
6. Programmatic gates validate the schema, trusted vocabulary, component kits,
   exact source paths, three unique references, primary-source inclusion, theme
   colors, unique style ID, and deterministic duplicate score.
7. Program-owned templates turn passing primitives into the name, first viewport,
   layout rules, typography, risks, and reference labels; a deterministic neutral
   SVG preview is generated. Duplicate, skipped,
   and invalid candidates do not enter the user-facing catalog.
8. Every processed source writes one immutable record under
   `catalog/curation/records/` and updates source state. `npm run check` then
   validates the complete repository.
9. Only after those gates pass does the workflow create a write-capable token
   for the existing `ai-ui-style-director-refresh` GitHub App. The App commits
   the allowlisted artifacts, opens a PR, and enables squash auto-merge. The
   required `test` check still has to pass.

The GitHub App is the audited repository identity, not the reasoning engine.
Kimi Code proposes the candidate; Node.js code applies policy; GitHub branch
protection decides whether the App PR can merge.

This is a defense-in-depth boundary for untrusted upstream text: model-authored
free text is retained only as an audit rationale, while everything later read by
the consumer Agent is generated from trusted taxonomy and program templates.
`DESIGN.md` also states that catalog metadata never authorizes credentials,
network access, shell/tool execution, or instruction changes.

The model cannot create a new family, taxonomy value, component kit, or prose
template. Expanding those governance vocabularies requires a normal reviewed
code/policy PR; automated curation can only recombine approved primitives.

## State and audit contract

`catalog/curation/source-state.json` is a compact processing cursor. Each entry
contains:

- stable source identity: provider and exact path;
- the last processed content hash;
- status: `baseline`, `promoted`, `duplicate`, `skipped`, or `invalid`;
- the immutable record ID;
- any promoted style IDs.

Record IDs are SHA-256 digests of the immutable processing event: provider,
path, current and previous content hashes, prompt version, response identity and
hash, timestamp, and a collision sequence. This keeps repeated A→B→A source transitions append-only
instead of overwriting an older decision. A record also preserves source
revision, token usage, the normalized candidate, deterministic gate results,
promotion files, and the GitHub Actions run. API keys, authorization headers,
and raw requests are never stored.

The initial 74 sources are committed as `baseline`. They are not sent to the
model retroactively. Only a new source path or changed content hash becomes
pending.

## Provider adapters

Provider scanning no longer depends on a fixed number of choices. Add a provider
to `catalog/providers.json`; a non-Awesome provider defaults to the
`generic-design-md` adapter and recursively discovers files named `DESIGN.md`.
The existing corpus explicitly uses `awesome-design-md` to preserve its hosted
overview and Light/Dark preview URLs.

Generic visual references use exact `{ provider, path }` provenance. Their
source link is generated from the provider repository, pinned inventory
revision, and encoded path. Adding a future source format should be done by
adding an adapter that produces the same normalized source record, not by
changing the curation and catalog contracts.

All matching `DESIGN.md` files are indexed; there is no fixed style-source or
user-choice count. The five-source value below is a per-run cost limit, not a
catalog-size limit.

## GitHub configuration

The existing App configuration is reused:

- repository variable: `REFRESH_APP_CLIENT_ID`;
- repository secret: `REFRESH_APP_PRIVATE_KEY`.

Add one model credential before processing future changes:

```text
KIMI_CODE_API_KEY
```

The workflow maps it to the generic `CURATOR_API_KEY` only for the model step.
Defaults are:

```text
CURATOR_BASE_URL=https://api.kimi.com/coding/v1
CURATOR_MODEL=kimi-for-coding
CURATOR_MAX_SOURCES=5
CURATOR_MAX_INPUT_CHARS=80000
CURATOR_MAX_OUTPUT_TOKENS=4096
CURATOR_MAX_RETRIES=1
CURATOR_REQUEST_TIMEOUT_MS=120000
```

Only trusted `main` pushes, the daily schedule, and manual dispatch can run the
workflow. It never runs model credentials in a pull-request context. The model
step also cannot access the GitHub App token because that token is created only
after deterministic validation.

## Local operations

Validate the state and immutable records:

```bash
npm run catalog:curation:validate
```

Create a baseline only for a fresh deployment with no existing state:

```bash
npm run catalog:curate:baseline
```

Process pending sources locally:

```bash
CURATOR_BASE_URL=https://api.kimi.com/coding/v1 \
CURATOR_MODEL=kimi-for-coding \
CURATOR_API_KEY=... \
npm run catalog:curate -- --clone --max-sources 5
```

The command is a clean no-op when nothing is pending, so it does not require an
API key for the checked-in baseline. Infrastructure/authentication errors fail
without advancing state. A structurally invalid model result is recorded as
`invalid`, which prevents an endless paid retry loop for the same source hash.

## Scale and cost controls

The workflow processes at most five sources per run, clips each upstream
document at 80,000 characters, passes at most 60 reference candidates and 40
nearby profiles to the model, and retries at most once. A daily run provides a
retry path if an earlier infrastructure call fails; source-state changes also
drain larger batches across successive guarded PRs.

Duplicate comparison is deterministic and scans the curated profile metadata,
not the raw provider corpus. This is sufficient for tens to hundreds of styles.
The consumer catalog already uses a numeric inverted index, facet filters,
independent SVG routes, and progressive batches of 24 cards. If the curated
catalog grows into the thousands, the same contracts can add a persisted search
index or embeddings without changing source identity or audit history.
