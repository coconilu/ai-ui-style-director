import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { validateCurationArtifacts } from "../scripts/validate-curation.mjs";
import {
  CURATION_PROCESSING_POLICY_VERSION,
  CURATION_PROMPT_VERSION,
  detectPendingSources,
  processingPolicyHashForProvider
} from "../src/curation.mjs";
import {
  deterministicThemeId,
  themeTokenDistance
} from "../src/curation-catalog-v2.mjs";
import {
  declaredProviderCapabilities,
  pinnedProviderSourceUrl,
  resolveProviderAdapter,
  resolveProviderCapabilities
} from "../src/provider-adapters.mjs";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CATALOG_DIR = join(ROOT_DIR, "catalog");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function bareSha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function recordIdFor(record) {
  return bareSha256([
    record.source.providerId,
    record.source.path,
    record.source.contentHash,
    record.source.sourceType,
    record.source.adapterId,
    String(record.source.normalizerVersion),
    record.agent.promptVersion,
    JSON.stringify({
      adapter: record.checks.capability.adapter,
      declared: record.checks.capability.declared,
      effective: record.checks.capability.effective
    }),
    String(record.source.processingPolicyVersion),
    record.source.processingPolicyHash,
    record.transition.fromHash || "unseen",
    record.agent.responseId || "no-response-id",
    record.agent.responseHash,
    record.createdAt,
    String(record.eventNonce)
  ].join("\u0000"));
}

function nearbyTheme(tokens) {
  const result = structuredClone(tokens);
  const value = Number.parseInt(result.accent.slice(1, 3), 16);
  const next = value === 255 ? 254 : value + 1;
  result.accent = `#${next.toString(16).padStart(2, "0")}${result.accent.slice(3)}`.toUpperCase();
  return result;
}

function catalogPaths(overrides = {}) {
  return {
    profilesPath: join(CATALOG_DIR, "style-profiles.json"),
    visualsPath: join(CATALOG_DIR, "style-visuals.json"),
    previewsDir: join(CATALOG_DIR, "previews"),
    directionsPath: join(CATALOG_DIR, "style-directions.json"),
    themesPath: join(CATALOG_DIR, "style-themes.json"),
    directionThemesPath: join(CATALOG_DIR, "style-direction-themes.json"),
    previewSpecsPath: join(CATALOG_DIR, "style-preview-specs.json"),
    aliasesPath: join(CATALOG_DIR, "style-aliases.json"),
    styleSourcesPath: join(CATALOG_DIR, "generated", "style-sources.json"),
    providersPath: join(CATALOG_DIR, "providers.json"),
    ...overrides
  };
}

function createMixedFixture({ mutateRecord } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "style-curation-validator-v2-"));
  const recordsDir = join(dir, "records");
  const statePath = join(dir, "source-state.json");
  mkdirSync(recordsDir, { recursive: true });

  const oldState = readJson(join(CATALOG_DIR, "curation", "source-state.json"));
  const aliases = readJson(join(CATALOG_DIR, "style-aliases.json")).aliases;
  const directions = readJson(join(CATALOG_DIR, "style-directions.json")).directions;
  const themes = readJson(join(CATALOG_DIR, "style-themes.json")).themes;
  const styleSources = readJson(join(CATALOG_DIR, "generated", "style-sources.json")).sources;
  const providers = readJson(join(CATALOG_DIR, "providers.json"));
  const promotedEntries = oldState.sources.filter((entry) => entry.status === "promoted").slice(0, 2);
  assert.equal(promotedEntries.length, 2);
  const [v1Entry, sourceEntry] = promotedEntries;
  const legacyAlias = (entry) => aliases.find((alias) => alias.legacyStyleId === entry.styleIds[0]);
  const v1Alias = legacyAlias(v1Entry);
  const selection = legacyAlias(sourceEntry);
  const provider = providers.find((candidate) => candidate.id === sourceEntry.providerId);
  const indexedSource = styleSources.find((source) =>
    source.providerId === sourceEntry.providerId && source.path === sourceEntry.path
  );
  const adapter = resolveProviderAdapter(provider);
  const declared = declaredProviderCapabilities(provider.capabilities);
  const effective = resolveProviderCapabilities(provider);
  const capabilitySnapshot = { adapter: adapter.capabilities, declared, effective };
  const selectedDirection = directions.find((direction) => direction.id === selection.directionId);
  const selectedTheme = themes.find((theme) => theme.id === selection.themeId);
  const candidateTheme = nearbyTheme(selectedTheme.tokens);
  const distance = themeTokenDistance(candidateTheme, selectedTheme.tokens);
  assert.ok(distance > 0 && distance <= 0.04);
  const responseHash = sha256("validator-v2-response");
  const processingPolicyHash = processingPolicyHashForProvider(provider);
  const record = {
    schemaVersion: 2,
    recordId: "",
    createdAt: "2026-07-14T00:00:00.000Z",
    eventNonce: 0,
    transition: {
      fromHash: sourceEntry.processedHash,
      toHash: sourceEntry.processedHash
    },
    source: {
      providerId: sourceEntry.providerId,
      path: sourceEntry.path,
      sourceType: indexedSource.sourceType,
      adapterId: adapter.id,
      normalizerVersion: adapter.normalizerVersion,
      contentHash: sourceEntry.processedHash,
      processingPolicyVersion: CURATION_PROCESSING_POLICY_VERSION,
      processingPolicyHash,
      capabilities: effective,
      revision: "a".repeat(40),
      truncated: false,
      consumedCharacters: 100
    },
    agent: {
      provider: "test-provider",
      model: "test-model",
      promptVersion: CURATION_PROMPT_VERSION,
      responseId: "validator-v2-response",
      responseHash,
      usage: null,
      attemptCount: 1,
      attempts: [{
        phase: "initial",
        responseId: "validator-v2-response",
        responseHash,
        model: "test-model",
        usage: null,
        validationErrors: []
      }]
    },
    candidate: {
      decision: "promote",
      rationale: "Near-identical Theme for deterministic duplicate validation.",
      profile: {
        family: selectedDirection.family,
        experienceType: selectedDirection.experienceType
      },
      visual: { theme: candidateTheme }
    },
    checks: {
      capability: { ...capabilitySnapshot, passed: true },
      direction: {
        threshold: 0.85,
        basis: "state-alias",
        nearestDirectionId: selection.directionId,
        score: 1,
        selectedDirectionId: selection.directionId,
        passed: true
      },
      theme: {
        threshold: 0.04,
        nearestThemeId: selection.themeId,
        distance: Number(distance.toFixed(6)),
        duplicate: true,
        passed: false
      },
      schema: { passed: true, errors: [] },
      provenance: { passed: true, primarySourceRequired: true },
      themeBinding: {
        required: true,
        applied: true,
        passed: true,
        expectedTheme: candidateTheme
      },
      duplicate: {
        threshold: 0.85,
        nearestStyleId: selection.directionId,
        score: 1,
        paletteThreshold: 0.04,
        paletteDistance: Number(distance.toFixed(6)),
        passed: false
      }
    },
    result: {
      action: "duplicate-theme",
      directionId: selection.directionId,
      themeId: selection.themeId
    },
    decision: "duplicate",
    reason: "Theme tokens are within the duplicate threshold.",
    promotion: null,
    workflow: {
      repository: "example/repo",
      runId: "1",
      runUrl: "https://github.com/example/repo/actions/runs/1",
      commitSha: "b".repeat(40)
    }
  };
  mutateRecord?.(record, { selectedTheme, selection, effective, adapter });
  record.recordId = recordIdFor(record);

  const oldRecordPath = join(CATALOG_DIR, "curation", "records", `${v1Entry.recordId}.json`);
  writeFileSync(join(recordsDir, `${v1Entry.recordId}.json`), readFileSync(oldRecordPath, "utf8"), "utf8");
  writeJson(join(recordsDir, `${record.recordId}.json`), record);

  const state = {
    schemaVersion: 2,
    promptVersion: CURATION_PROMPT_VERSION,
    sources: [
      {
        ...v1Entry,
        processingPolicyHash,
        directionIds: [v1Alias.directionId],
        themeIds: [v1Alias.themeId]
      },
      {
        ...sourceEntry,
        processingPolicyHash: record.source.processingPolicyHash,
        status: record.decision,
        recordId: record.recordId,
        directionIds: [selection.directionId],
        themeIds: [selection.themeId]
      }
    ].sort((left, right) => (
      `${left.providerId}\u0000${left.path}`.localeCompare(`${right.providerId}\u0000${right.path}`, "en")
    ))
  };
  writeJson(statePath, state);
  return {
    options: catalogPaths({ statePath, recordsDir }),
    record,
    state,
    provider,
    indexedSource
  };
}

function withUnprovenCanonicalEntities(fixture) {
  const dir = mkdtempSync(join(tmpdir(), "style-curation-unproven-canonical-"));
  const directions = readJson(join(CATALOG_DIR, "style-directions.json"));
  const themes = readJson(join(CATALOG_DIR, "style-themes.json"));
  const links = readJson(join(CATALOG_DIR, "style-direction-themes.json"));
  const previewSpecs = readJson(join(CATALOG_DIR, "style-preview-specs.json"));
  const directionId = "canonical-only-unproven-direction";
  const tokens = {
    canvas: "#FAFAFA",
    surface: "#FFFFFF",
    surfaceAlt: "#F0F0F0",
    text: "#111111",
    muted: "#666666",
    accent: "#FF00AA",
    border: "#DDDDDD"
  };
  const themeId = deterministicThemeId(tokens);
  directions.directions.push({
    ...structuredClone(directions.directions[0]),
    id: directionId,
    name: "Canonical Only Unproven Direction",
    legacyStyleIds: [],
    legacyReferences: []
  });
  themes.themes.push({
    ...structuredClone(themes.themes[0]),
    id: themeId,
    name: "Canonical Only Unproven Theme",
    legacyStyleIds: [],
    tokens,
    palette: Object.entries(tokens).map(([field, value]) => `${field} ${value}`),
    appearance: "light",
    tones: ["experimental"],
    sources: [structuredClone(themes.themes[0].sources[0])],
    legacyReferences: []
  });
  links.links.push({ directionId, themeId, isDefault: true });
  const previewSpec = structuredClone(previewSpecs.previewSpecs[0]);
  delete previewSpec.legacyVariant;
  previewSpec.directionId = directionId;
  previewSpec.contentPattern = directionId;
  previewSpecs.previewSpecs.push(previewSpec);
  directions.directions.sort((left, right) => left.id.localeCompare(right.id, "en"));
  themes.themes.sort((left, right) => left.id.localeCompare(right.id, "en"));
  links.links.sort((left, right) => (
    `${left.directionId}\u0000${left.themeId}`.localeCompare(`${right.directionId}\u0000${right.themeId}`, "en")
  ));
  previewSpecs.previewSpecs.sort((left, right) => left.directionId.localeCompare(right.directionId, "en"));
  writeJson(join(dir, "style-directions.json"), directions);
  writeJson(join(dir, "style-themes.json"), themes);
  writeJson(join(dir, "style-direction-themes.json"), links);
  writeJson(join(dir, "style-preview-specs.json"), previewSpecs);
  return {
    options: {
      ...fixture.options,
      directionsPath: join(dir, "style-directions.json"),
      themesPath: join(dir, "style-themes.json"),
      directionThemesPath: join(dir, "style-direction-themes.json"),
      previewSpecsPath: join(dir, "style-preview-specs.json")
    },
    directionId,
    themeId
  };
}

function withPartiallyProvenCanonicalTheme(fixture) {
  const dir = mkdtempSync(join(tmpdir(), "style-curation-partial-theme-proof-"));
  const themes = readJson(join(CATALOG_DIR, "style-themes.json"));
  const links = readJson(join(CATALOG_DIR, "style-direction-themes.json"));
  const tokens = {
    canvas: "#080A10",
    surface: "#121722",
    surfaceAlt: "#1B2433",
    text: "#F7F9FC",
    muted: "#95A0B2",
    accent: "#F05A28",
    border: "#313D50"
  };
  const themeId = deterministicThemeId(tokens);
  const source = {
    kind: "source-pinned",
    provider: fixture.record.source.providerId,
    slug: "partial-proof",
    path: fixture.record.source.path,
    repo: fixture.provider.repo,
    revision: fixture.record.source.revision,
    contentHash: fixture.record.source.contentHash,
    sourceUrl: pinnedProviderSourceUrl({
      repo: fixture.provider.repo,
      revision: fixture.record.source.revision,
      path: fixture.record.source.path
    })
  };
  const unprovenSource = {
    ...source,
    slug: "unproven-extra-source",
    path: "packages/daisyui/src/themes/unproven-extra-source.css",
    contentHash: `sha256:${"e".repeat(64)}`,
    sourceUrl: pinnedProviderSourceUrl({
      repo: fixture.provider.repo,
      revision: fixture.record.source.revision,
      path: "packages/daisyui/src/themes/unproven-extra-source.css"
    })
  };
  themes.themes.push({
    id: themeId,
    name: "Partially Proven Theme",
    legacyStyleIds: [],
    tokens,
    palette: Object.entries(tokens).map(([field, value]) => `${field} ${value}`),
    appearance: "dark",
    tones: ["focused"],
    sources: [source, unprovenSource],
    legacyReferences: []
  });
  links.links.push({
    directionId: fixture.record.result.directionId,
    themeId,
    isDefault: false
  });
  themes.themes.sort((left, right) => left.id.localeCompare(right.id, "en"));
  links.links.sort((left, right) => (
    `${left.directionId}\u0000${left.themeId}`.localeCompare(`${right.directionId}\u0000${right.themeId}`, "en")
  ));
  writeJson(join(dir, "style-themes.json"), themes);
  writeJson(join(dir, "style-direction-themes.json"), links);

  const oldRecordId = fixture.record.recordId;
  const selectedTheme = readJson(join(CATALOG_DIR, "style-themes.json")).themes.find((theme) => (
    theme.id === fixture.record.result.themeId
  ));
  const distance = themeTokenDistance(tokens, selectedTheme.tokens);
  assert.ok(distance > fixture.record.checks.theme.threshold);
  fixture.record.candidate.visual.theme = tokens;
  fixture.record.checks.theme = {
    threshold: 0.04,
    nearestThemeId: selectedTheme.id,
    distance: Number(distance.toFixed(6)),
    duplicate: false,
    passed: true
  };
  fixture.record.checks.themeBinding.expectedTheme = tokens;
  fixture.record.checks.duplicate.paletteDistance = Number(distance.toFixed(6));
  fixture.record.checks.duplicate.passed = true;
  fixture.record.result = {
    action: "added-theme-to-direction",
    directionId: fixture.record.result.directionId,
    themeId
  };
  fixture.record.decision = "promoted";
  fixture.record.reason = "Added a distinct Theme to an existing Direction.";
  fixture.record.promotion = {
    action: "added-theme-to-direction",
    directionId: fixture.record.result.directionId,
    themeId,
    files: [
      "catalog/style-themes.json",
      "catalog/style-direction-themes.json"
    ]
  };
  fixture.record.recordId = recordIdFor(fixture.record);
  rmSync(join(fixture.options.recordsDir, `${oldRecordId}.json`));
  writeJson(join(fixture.options.recordsDir, `${fixture.record.recordId}.json`), fixture.record);
  const stateEntry = fixture.state.sources.find((entry) => (
    entry.providerId === fixture.record.source.providerId && entry.path === fixture.record.source.path
  ));
  stateEntry.status = fixture.record.decision;
  stateEntry.recordId = fixture.record.recordId;
  stateEntry.themeIds = [...new Set([...stateEntry.themeIds, themeId])].sort();
  writeJson(fixture.options.statePath, fixture.state);
  return {
    options: {
      ...fixture.options,
      themesPath: join(dir, "style-themes.json"),
      directionThemesPath: join(dir, "style-direction-themes.json")
    },
    themeId,
    unprovenSource
  };
}

function mutateToTerminalRecord(record, terminalDecision) {
  const validationErrors = terminalDecision === "invalid"
    ? ["candidate failed deterministic validation"]
    : [];
  record.candidate = terminalDecision === "invalid"
    ? {
        rejected: true,
        declaredDecision: "promote",
        validationErrors
      }
    : {
        decision: "skip",
        rationale: "No distinct reusable direction or theme.",
        profile: null,
        visual: null
      };
  record.checks.direction = {
    threshold: 0.85,
    basis: "none",
    nearestDirectionId: null,
    score: 0,
    selectedDirectionId: null,
    passed: false
  };
  record.checks.theme = {
    threshold: 0.04,
    nearestThemeId: null,
    distance: null,
    duplicate: false,
    passed: false
  };
  record.checks.schema = {
    passed: terminalDecision !== "invalid",
    errors: validationErrors
  };
  record.checks.themeBinding.applied = false;
  record.checks.themeBinding.passed = true;
  record.checks.duplicate.paletteDistance = null;
  record.checks.duplicate.passed = true;
  record.agent.attempts.at(-1).validationErrors = validationErrors;
  record.result = {
    action: terminalDecision,
    directionId: null,
    themeId: null
  };
  record.decision = terminalDecision;
  record.reason = terminalDecision === "invalid"
    ? "Candidate failed deterministic validation."
    : "The model selected the governed skip outcome.";
  record.promotion = null;
}

function withNewCloserLinkedTheme(fixture) {
  const dir = mkdtempSync(join(tmpdir(), "style-curation-closer-theme-"));
  const themes = readJson(join(CATALOG_DIR, "style-themes.json"));
  const links = readJson(join(CATALOG_DIR, "style-direction-themes.json"));
  const aliases = readJson(join(CATALOG_DIR, "style-aliases.json"));
  const legacyThemeIds = new Set(aliases.aliases.map((alias) => alias.themeId));
  const linkedThemeIds = new Set(
    links.links
      .filter((link) => link.directionId === fixture.record.result.directionId)
      .map((link) => link.themeId)
  );
  const closerTheme = themes.themes.find((theme) => (
    theme.id !== fixture.record.result.themeId
      && legacyThemeIds.has(theme.id)
      && !linkedThemeIds.has(theme.id)
  ));
  assert.ok(closerTheme, "expected an unlinked legacy Theme for the temporal regression fixture");
  closerTheme.tokens = structuredClone(fixture.record.candidate.visual.theme);
  links.links.push({
    directionId: fixture.record.result.directionId,
    themeId: closerTheme.id,
    isDefault: false
  });
  writeJson(join(dir, "style-themes.json"), themes);
  writeJson(join(dir, "style-direction-themes.json"), links);
  return {
    ...fixture.options,
    themesPath: join(dir, "style-themes.json"),
    directionThemesPath: join(dir, "style-direction-themes.json")
  };
}

test("curation artifact validator accepts mixed v1/v2 records and a near-color duplicate", () => {
  const fixture = createMixedFixture();
  assert.deepEqual(validateCurationArtifacts(fixture.options), {
    stateSourceCount: 2,
    recordCount: 2,
    processedSourceCount: 2
  });
});

test("historical v2 capability snapshots remain valid after an adapter ceiling evolves", () => {
  const historicalFullCapability = createMixedFixture({
    mutateRecord(record) {
      const full = { createDirection: true, createTheme: true };
      record.source.capabilities = full;
      record.checks.capability.adapter = full;
      record.checks.capability.declared = full;
      record.checks.capability.effective = full;
      record.source.processingPolicyHash = sha256(JSON.stringify({
        processingPolicyVersion: record.source.processingPolicyVersion,
        adapterId: record.source.adapterId,
        normalizerVersion: record.source.normalizerVersion,
        effectiveCapabilities: full
      }));
    }
  });
  assert.doesNotThrow(() => validateCurationArtifacts(historicalFullCapability.options));
});

test("a Theme-only capability snapshot cannot claim a Direction-creation action", () => {
  const forbiddenAction = createMixedFixture({
    mutateRecord(record, { selectedTheme }) {
      record.candidate.visual.theme = selectedTheme.tokens;
      record.checks.theme = {
        threshold: 0.04,
        nearestThemeId: null,
        distance: null,
        duplicate: false,
        passed: true
      };
      record.result.action = "created-direction-and-theme";
      record.decision = "promoted";
      record.promotion = {
        action: "created-direction-and-theme",
        directionId: record.result.directionId,
        themeId: record.result.themeId,
        files: [
          "catalog/style-directions.json",
          "catalog/style-themes.json",
          "catalog/style-direction-themes.json",
          "catalog/style-preview-specs.json"
        ]
      };
    }
  });
  assert.throws(
    () => validateCurationArtifacts(forbiddenAction.options),
    /requires effective createDirection and createTheme capabilities/u
  );
});

test("a created Direction must use the deterministic ID derived from its candidate Profile", () => {
  const fixture = createMixedFixture({
    mutateRecord(record, { selectedTheme }) {
      const full = { createDirection: true, createTheme: true };
      record.source.capabilities = full;
      record.checks.capability = {
        adapter: full,
        declared: full,
        effective: full,
        passed: true
      };
      record.source.processingPolicyHash = sha256(JSON.stringify({
        processingPolicyVersion: record.source.processingPolicyVersion,
        adapterId: record.source.adapterId,
        normalizerVersion: record.source.normalizerVersion,
        effectiveCapabilities: full
      }));
      record.candidate.profile = {
        family: "consumer",
        experienceType: "consumer-app",
        pageTypes: ["landing"],
        audiences: ["consumers"],
        goals: ["conversion"],
        density: "medium",
        keywords: ["story"],
        componentKits: ["shadcn-ui"],
        composition: "split-hero",
        emphasis: "story",
        typographyStyle: "editorial",
        spacing: "generous",
        motion: "subtle"
      };
      record.candidate.visual.theme = selectedTheme.tokens;
      record.checks.direction = {
        threshold: 0.85,
        basis: "created",
        nearestDirectionId: null,
        score: 0,
        selectedDirectionId: record.result.directionId,
        passed: true
      };
      record.checks.theme = {
        threshold: 0.04,
        nearestThemeId: null,
        distance: null,
        duplicate: false,
        passed: true
      };
      record.result.action = "created-direction-with-existing-theme";
      record.decision = "promoted";
      record.promotion = {
        action: "created-direction-with-existing-theme",
        directionId: record.result.directionId,
        themeId: record.result.themeId,
        files: [
          "catalog/style-directions.json",
          "catalog/style-direction-themes.json",
          "catalog/style-preview-specs.json"
        ]
      };
    }
  });
  assert.throws(
    () => validateCurationArtifacts(fixture.options),
    /result\.directionId must be derived deterministically from candidate\.profile/u
  );
});

test("v2 source snapshots reject unsafe or ill-typed immutable provenance fields", () => {
  for (const [mutateRecord, pattern] of [
    [(record) => { record.source.providerId = "Bad Provider"; }, /source\.providerId must be lowercase kebab-case/u],
    [(record) => { record.source.path = "\.\.\/secret"; }, /source\.path must be a safe POSIX-relative path/u],
    [(record) => { record.source.truncated = "false"; }, /source\.truncated must be boolean/u],
    [(record) => { record.source.consumedCharacters = -1; }, /source\.consumedCharacters must be a non-negative integer/u]
  ]) {
    const fixture = createMixedFixture({ mutateRecord });
    assert.throws(() => validateCurationArtifacts(fixture.options), pattern);
  }
});

test("prompt-v2 records require a governed candidate experienceType", () => {
  const fixture = createMixedFixture({
    mutateRecord(record) {
      record.candidate.profile.experienceType = "desktop-game";
    }
  });
  assert.throws(
    () => validateCurationArtifacts(fixture.options),
    /candidate\.profile\.experienceType must be a governed experience type/u
  );
});

test("historical prompt-v1 records remain valid without experienceType", () => {
  const fixture = createMixedFixture({
    mutateRecord(record) {
      record.agent.promptVersion = "direction-theme-curation-v1";
      delete record.candidate.profile.experienceType;
    }
  });
  assert.doesNotThrow(() => validateCurationArtifacts(fixture.options));
});

test("real v2 skipped and invalid records retain an explicit unexecuted Theme-check state", () => {
  for (const terminalDecision of ["skipped", "invalid"]) {
    const fixture = createMixedFixture({
      mutateRecord(record) {
        mutateToTerminalRecord(record, terminalDecision);
      }
    });
    assert.doesNotThrow(() => validateCurationArtifacts(fixture.options));
  }
});

test("terminal v2 records reject fabricated Theme-check execution state", () => {
  const corruptions = [
    ["nearestThemeId", "theme-0123456789ab"],
    ["distance", 0],
    ["duplicate", true],
    ["passed", true]
  ];
  for (const terminalDecision of ["skipped", "invalid"]) {
    for (const [field, value] of corruptions) {
      const fixture = createMixedFixture({
        mutateRecord(record) {
          mutateToTerminalRecord(record, terminalDecision);
          record.checks.theme[field] = value;
        }
      });
      assert.throws(
        () => validateCurationArtifacts(fixture.options),
        /must retain the explicit unexecuted Theme-check state/u
      );
    }
  }
});

test("duplicate-theme requires successful capability and Direction gates", () => {
  for (const gate of ["capability", "direction"]) {
    const fixture = createMixedFixture({
      mutateRecord(record) {
        record.checks[gate].passed = false;
      }
    });
    assert.throws(
      () => validateCurationArtifacts(fixture.options),
      new RegExp(`duplicate-theme result must pass the ${gate === "capability" ? "capability" : "Direction"} gate`, "u")
    );
  }
});

test("historical duplicate remains valid when a later linked Theme becomes closer", () => {
  const fixture = createMixedFixture();
  const evolvedCatalogOptions = withNewCloserLinkedTheme(fixture);
  assert.doesNotThrow(() => validateCurationArtifacts(evolvedCatalogOptions));
});

test("canonical-only Direction and Theme require immutable v2 creation proof", () => {
  const fixture = withUnprovenCanonicalEntities(createMixedFixture());
  assert.throws(
    () => validateCurationArtifacts(fixture.options),
    new RegExp(
      `canonical-only Direction ${fixture.directionId} has no immutable v2 creation record[\\s\\S]*`
      + `canonical-only Theme ${fixture.themeId} source .+ has no immutable v2 creation record`,
      "u"
    )
  );
});

test("every source of a canonical-only Theme needs its own immutable creation proof", () => {
  const fixture = withPartiallyProvenCanonicalTheme(createMixedFixture());
  assert.throws(
    () => validateCurationArtifacts(fixture.options),
    new RegExp(
      `canonical-only Theme ${fixture.themeId} source ${fixture.unprovenSource.provider}`
      + `/${fixture.unprovenSource.path} has no immutable v2 creation record`,
      "u"
    )
  );
});

test("historical v2 record survives upstream content and provider-policy evolution", () => {
  const fixture = createMixedFixture();
  const dir = mkdtempSync(join(tmpdir(), "style-curation-evolved-index-"));
  const providers = readJson(join(CATALOG_DIR, "providers.json"));
  providers.find((provider) => provider.id === fixture.provider.id).capabilities = {
    createDirection: false,
    createTheme: false
  };
  const styleSources = readJson(join(CATALOG_DIR, "generated", "style-sources.json"));
  styleSources.sources.find((source) =>
    source.providerId === fixture.indexedSource.providerId && source.path === fixture.indexedSource.path
  ).contentHash = `sha256:${"c".repeat(64)}`;
  writeJson(join(dir, "providers.json"), providers);
  writeJson(join(dir, "style-sources.json"), styleSources);

  assert.doesNotThrow(() => validateCurationArtifacts({
    ...fixture.options,
    providersPath: join(dir, "providers.json"),
    styleSourcesPath: join(dir, "style-sources.json")
  }));
});

test("inventory revision and equivalent declared-capability changes do not replay or invalidate current work", () => {
  const fixture = createMixedFixture();
  const dir = mkdtempSync(join(tmpdir(), "style-curation-equivalent-policy-"));
  const providers = readJson(join(CATALOG_DIR, "providers.json"));
  const changedProvider = providers.find((provider) => provider.id === fixture.provider.id);
  changedProvider.capabilities = { createDirection: true, createTheme: true };
  assert.equal(processingPolicyHashForProvider(changedProvider), fixture.record.source.processingPolicyHash);
  const inventory = readJson(join(CATALOG_DIR, "generated", "provider-inventory.json"));
  const inventoryProvider = inventory.providers.find((provider) => provider.id === fixture.provider.id);
  inventoryProvider.revision = inventoryProvider.revision === "c".repeat(40) ? "d".repeat(40) : "c".repeat(40);
  assert.notEqual(inventoryProvider.revision, fixture.record.source.revision);
  writeJson(join(dir, "providers.json"), providers);
  writeJson(join(dir, "provider-inventory.json"), inventory);

  assert.doesNotThrow(() => validateCurationArtifacts({
    ...fixture.options,
    providersPath: join(dir, "providers.json"),
    // Deliberately supplied as a regression sentinel: immutable validation must not bind to current repo SHA.
    inventoryPath: join(dir, "provider-inventory.json")
  }));
  assert.deepEqual(
    detectPendingSources(
      { sources: [fixture.indexedSource] },
      fixture.state,
      { providers: [changedProvider] }
    ),
    []
  );
});

test("record v2 policy version and hash are immutable identity fields", () => {
  const fixture = createMixedFixture({
    mutateRecord(record) {
      record.source.processingPolicyVersion += 1;
    }
  });
  assert.throws(
    () => validateCurationArtifacts(fixture.options),
    /processingPolicyHash must bind the recorded version/u
  );
});
