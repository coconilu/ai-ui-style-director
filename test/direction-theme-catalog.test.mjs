import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { resolveLegacyDirectionId } from "../scripts/migrate-direction-theme-catalog.mjs";
import { validateDirectionThemeCatalog } from "../scripts/validate-direction-theme-catalog.mjs";
import { validateGeneratedCatalog } from "../scripts/validate-generated-catalog.mjs";
import { EXPERIENCE_TYPE_IDS } from "../src/experience-types.mjs";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const catalogDir = join(rootDir, "catalog");
const validatorPath = join(rootDir, "scripts", "validate-direction-theme-catalog.mjs");

const DOCUMENTS = Object.freeze({
  directions: ["style-directions.json", "directionsPath"],
  themes: ["style-themes.json", "themesPath"],
  directionThemes: ["style-direction-themes.json", "directionThemesPath"],
  previewSpecs: ["style-preview-specs.json", "previewSpecsPath"],
  aliases: ["style-aliases.json", "aliasesPath"],
  legacyProfiles: ["style-profiles.json", "legacyProfilesPath"],
  legacyVisuals: ["style-visuals.json", "legacyVisualsPath"]
});

const EXPECTED_DIRECTIONS_BY_EXPERIENCE_TYPE = Object.freeze({
  "consumer-app": Object.freeze([
    "consumer-local-service-concierge",
    "consumer-media-discovery-playground",
    "consumer-wellness-companion-soft",
    "education-kids-exploration-path",
    "finance-consumer-money-companion",
    "learning-platform-friendly"
  ]),
  "marketing-site": Object.freeze([
    "consumer-brand-story",
    "consumer-centered-hero-community",
    "consumer-centered-hero-story",
    "consumer-centered-hero-trust",
    "developer-open-source-community-hub",
    "developer-product-minimal",
    "enterprise-executive-transformation-brief",
    "enterprise-infrastructure-blueprint",
    "enterprise-trust-solution",
    "fintech-precision-trust",
    "launch-centered-hero-story",
    "launch-centered-hero-trust",
    "launch-cinematic-product-reveal",
    "launch-community-countdown-campaign",
    "launch-proof-led-early-access",
    "motion-rich-launch",
    "portfolio-case-study-narrative",
    "portfolio-centered-hero-story",
    "portfolio-experimental-creative-canvas",
    "portfolio-studio-grid",
    "portfolio-technical-builder-showcase"
  ]),
  commerce: Object.freeze([
    "commerce-direct-response-product-detail",
    "commerce-marketplace-discovery-grid",
    "commerce-premium-catalog",
    "commerce-wholesale-order-workbench"
  ]),
  "content-docs": Object.freeze([
    "ai-lab-research-notebook",
    "developer-cli-workbench",
    "developer-editorial-stack-content",
    "docs-api-reference-workbench",
    "docs-knowledge-base-help-center",
    "docs-product-guides-library",
    "editorial-technical-docs",
    "enterprise-governance-evidence-room",
    "research-benchmark-evaluation-board",
    "research-scientific-publication-archive"
  ]),
  "business-app": Object.freeze([
    "education-certification-study-console",
    "education-cohort-learning-workspace",
    "finance-investment-research-terminal",
    "operational-saas-console",
    "research-experiment-control-workbench",
    "saas-automation-flow-builder",
    "saas-collaborative-workspace-canvas",
    "saas-customer-success-inbox"
  ]),
  "admin-console": Object.freeze([
    "dashboard-executive-kpi-briefing",
    "dashboard-field-operations-mapboard",
    "dashboard-incident-response-wallboard",
    "data-dashboard-command-center",
    "developer-api-observability-lab",
    "developer-dashboard-grid-data",
    "enterprise-dashboard-grid-data",
    "finance-treasury-operations-console"
  ])
});

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function themeIdFor(tokens) {
  const fields = ["canvas", "surface", "surfaceAlt", "text", "muted", "accent", "border"];
  const signature = JSON.stringify(fields.map((field) => [field, tokens[field].toUpperCase()]));
  return `theme-${createHash("sha256").update(signature).digest("hex").slice(0, 12)}`;
}

function addCanonicalOnlyPair(documents) {
  const direction = structuredClone(documents.directions.directions[0]);
  direction.id = "canonical-curated-direction";
  direction.name = "Canonical Curated Direction";
  delete direction.legacyStyleIds;
  delete direction.legacyReferences;
  documents.directions.directions.push(direction);

  const sourceTheme = documents.themes.themes.find((theme) =>
    theme.sources.some((source) => source.kind === "source-pinned")
  );
  const theme = structuredClone(sourceTheme);
  theme.tokens.accent = "#123456";
  theme.palette = theme.palette.map((entry) => entry.startsWith("accent ") ? "accent #123456" : entry);
  theme.id = themeIdFor(theme.tokens);
  theme.name = "Canonical Curated Theme";
  delete theme.legacyStyleIds;
  delete theme.legacyReferences;
  documents.themes.themes.push(theme);

  documents.directionThemes.links.push({
    directionId: direction.id,
    themeId: theme.id,
    isDefault: true
  });
  const previewSpec = structuredClone(documents.previewSpecs.previewSpecs[0]);
  previewSpec.directionId = direction.id;
  delete previewSpec.legacyVariant;
  documents.previewSpecs.previewSpecs.push(previewSpec);
  return { direction, theme, previewSpec };
}

function writeFixture(mutate) {
  const dir = mkdtempSync(join(tmpdir(), "style-director-v2-validator-"));
  const generatedDir = join(dir, "generated");
  mkdirSync(generatedDir, { recursive: true });
  const documents = {};
  const paths = {};

  for (const [key, [fileName, optionName]] of Object.entries(DOCUMENTS)) {
    documents[key] = readJson(join(catalogDir, fileName));
    paths[optionName] = join(dir, fileName);
  }
  documents.styleSources = readJson(join(catalogDir, "generated", "style-sources.json"));
  paths.styleSourcesPath = join(generatedDir, "style-sources.json");
  mutate?.(documents);

  for (const [key, [fileName]] of Object.entries(DOCUMENTS)) {
    writeFileSync(join(dir, fileName), `${JSON.stringify(documents[key], null, 2)}\n`, "utf8");
  }
  writeFileSync(paths.styleSourcesPath, `${JSON.stringify(documents.styleSources, null, 2)}\n`, "utf8");
  return paths;
}

function writeGeneratedFixture(mutateProviders) {
  const dir = mkdtempSync(join(tmpdir(), "style-director-generated-validator-"));
  const generatedDir = join(dir, "generated");
  mkdirSync(generatedDir, { recursive: true });
  const providers = readJson(join(catalogDir, "providers.json"));
  mutateProviders?.(providers);
  writeFileSync(join(dir, "providers.json"), `${JSON.stringify(providers, null, 2)}\n`, "utf8");
  for (const file of ["provider-inventory.json", "style-sources.json", "component-sources.json"]) {
    writeFileSync(
      join(generatedDir, file),
      `${JSON.stringify(readJson(join(catalogDir, "generated", file)), null, 2)}\n`,
      "utf8"
    );
  }
  return { providersPath: join(dir, "providers.json"), generatedDir };
}

test("real v2 catalog preserves all legacy styles and the five approved Theme clusters", () => {
  const result = validateDirectionThemeCatalog();
  const legacyProfiles = readJson(join(catalogDir, "style-profiles.json"));
  const directions = readJson(join(catalogDir, "style-directions.json")).directions;
  const themes = readJson(join(catalogDir, "style-themes.json")).themes;
  const links = readJson(join(catalogDir, "style-direction-themes.json")).links;
  const previewSpecs = readJson(join(catalogDir, "style-preview-specs.json")).previewSpecs;
  const aliases = readJson(join(catalogDir, "style-aliases.json")).aliases;

  assert.equal(result.schemaVersion, 2);
  assert.equal(result.legacyStyleCount, legacyProfiles.length);
  assert.equal(result.aliasCount, legacyProfiles.length);
  assert.equal(result.directionCount, directions.length);
  assert.equal(result.themeCount, themes.length);
  assert.equal(result.linkCount, links.length);
  assert.equal(result.previewSpecCount, previewSpecs.length);
  assert.equal(result.previewSpecCount, result.directionCount);
  assert.equal(
    result.pinnedSourceCount + result.legacySourceCount,
    themes.flatMap((theme) => theme.sources).length
  );

  const expectedClusters = new Map([
    ["consumer-centered-hero-community", 4],
    ["consumer-centered-hero-trust", 2],
    ["developer-dashboard-grid-data", 11],
    ["developer-editorial-stack-content", 6],
    ["enterprise-dashboard-grid-data", 2]
  ]);
  for (const [prefix, count] of expectedClusters) {
    const cluster = aliases.filter((alias) => alias.directionId === prefix);
    assert.equal(cluster.length, count);
    assert.deepEqual(new Set(cluster.map((alias) => alias.directionId)), new Set([prefix]));
  }
  const launch = aliases.find((alias) => alias.legacyStyleId === "launch-community-countdown-campaign");
  const wellness = aliases.find((alias) => alias.legacyStyleId === "consumer-wellness-companion-soft");
  assert.notEqual(launch.directionId, wellness.directionId);

  const launchPreview = previewSpecs.find((previewSpec) => previewSpec.directionId === launch.directionId);
  const wellnessPreview = previewSpecs.find((previewSpec) => previewSpec.directionId === wellness.directionId);
  assert.deepEqual(
    {
      contentPattern: launchPreview.contentPattern,
      contentBlocks: launchPreview.contentBlocks,
      hierarchy: launchPreview.hierarchy
    },
    {
      contentPattern: "community-countdown-campaign",
      contentBlocks: ["campaign-message", "countdown", "community-proof", "reminder-action"],
      hierarchy: {
        primary: "campaign-message",
        secondary: ["countdown", "community-proof"],
        supporting: ["reminder-action"]
      }
    }
  );
  assert.deepEqual(
    {
      contentPattern: wellnessPreview.contentPattern,
      contentBlocks: wellnessPreview.contentBlocks,
      hierarchy: wellnessPreview.hierarchy
    },
    {
      contentPattern: "wellness-daily-ritual",
      contentBlocks: ["daily-ritual", "human-moment", "progress", "membership-action"],
      hierarchy: {
        primary: "daily-ritual",
        secondary: ["human-moment", "progress"],
        supporting: ["membership-action"]
      }
    }
  );
  assert.notDeepEqual(
    {
      pattern: launchPreview.contentPattern,
      blocks: launchPreview.contentBlocks,
      hierarchy: launchPreview.hierarchy
    },
    {
      pattern: wellnessPreview.contentPattern,
      blocks: wellnessPreview.contentBlocks,
      hierarchy: wellnessPreview.hierarchy
    }
  );
});

test("real catalog has the reviewed 57-Direction experience type backfill without family inference", () => {
  const directions = readJson(join(catalogDir, "style-directions.json")).directions;
  const result = validateDirectionThemeCatalog();
  const allExpectedIds = EXPERIENCE_TYPE_IDS.flatMap(
    (experienceType) => EXPECTED_DIRECTIONS_BY_EXPERIENCE_TYPE[experienceType]
  );

  assert.deepEqual(Object.keys(EXPECTED_DIRECTIONS_BY_EXPERIENCE_TYPE), EXPERIENCE_TYPE_IDS);
  assert.equal(allExpectedIds.length, 57);
  assert.equal(new Set(allExpectedIds).size, 57);
  assert.equal(directions.length, 57);
  assert.deepEqual(
    [...new Set(allExpectedIds)].sort(),
    directions.map((direction) => direction.id).sort()
  );

  for (const experienceType of EXPERIENCE_TYPE_IDS) {
    assert.deepEqual(
      directions
        .filter((direction) => direction.experienceType === experienceType)
        .map((direction) => direction.id)
        .sort(),
      [...EXPECTED_DIRECTIONS_BY_EXPERIENCE_TYPE[experienceType]].sort()
    );
  }
  assert.deepEqual(result.experienceTypeCounts, {
    "consumer-app": 6,
    "marketing-site": 21,
    commerce: 4,
    "content-docs": 10,
    "business-app": 8,
    "admin-console": 8
  });

  const developerExperienceTypes = new Set(
    directions
      .filter((direction) => direction.family === "developer")
      .map((direction) => direction.experienceType)
  );
  assert.deepEqual(
    developerExperienceTypes,
    new Set(["marketing-site", "content-docs", "admin-console"])
  );
  const marketingFamilies = new Set(
    directions
      .filter((direction) => direction.experienceType === "marketing-site")
      .map((direction) => direction.family)
  );
  assert.ok(marketingFamilies.size > 1);
});

test("legacy Direction resolution uses an explicit allowlist and preserves unknown future ids", () => {
  assert.equal(
    resolveLegacyDirectionId("developer-dashboard-grid-data-184a9fda"),
    "developer-dashboard-grid-data"
  );
  assert.equal(
    resolveLegacyDirectionId("future-pinned-direction-deadbeef"),
    "future-pinned-direction-deadbeef"
  );
  assert.throws(() => resolveLegacyDirectionId(""), /non-empty string/u);
});

test("v2 validator is executable as a CLI", () => {
  const validated = validateDirectionThemeCatalog();
  const result = spawnSync(process.execPath, [validatorPath], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(
    result.stdout.includes(`${validated.aliasCount}/${validated.legacyStyleCount} legacy aliases`)
  );
  assert.ok(result.stdout.includes(`${validated.pinnedSourceCount} pinned`));
  assert.ok(result.stdout.includes(`${validated.legacySourceCount} legacy provenance entries`));
  assert.ok(
    result.stdout.includes(
      "experience coverage: consumer-app=6, marketing-site=21, commerce=4, content-docs=10, business-app=8, admin-console=8"
    )
  );
});

test("strict v2 validator rejects a missing or uncontrolled Direction experienceType", () => {
  const missing = writeFixture(({ directions }) => {
    delete directions.directions[0].experienceType;
  });
  assert.throws(
    () => validateDirectionThemeCatalog(missing),
    /experienceType must be one of/u
  );

  const invalid = writeFixture(({ directions }) => {
    directions.directions[0].experienceType = "developer-tool";
  });
  assert.throws(
    () => validateDirectionThemeCatalog(invalid),
    /experienceType must be one of/u
  );
});

test("v2 validator rejects incomplete legacy coverage and invalid defaults", () => {
  const missingAlias = writeFixture(({ aliases }) => aliases.aliases.pop());
  assert.throws(
    () => validateDirectionThemeCatalog(missingAlias),
    /legacy style has no v2 alias/u
  );

  const missingDefault = writeFixture(({ directionThemes }) => {
    directionThemes.links[0].isDefault = false;
  });
  assert.throws(
    () => validateDirectionThemeCatalog(missingDefault),
    /must have exactly one default theme link/u
  );
});

test("v2 validator rejects provenance fabrication, token drift, and lost references", () => {
  const fabricatedProvenance = writeFixture(({ themes }) => {
    const theme = themes.themes.find((candidate) => candidate.sources[0].kind === "source-pinned");
    const source = theme.sources[0];
    source.sourceUrl = "https://example.invalid/fabricated";
  });
  assert.throws(
    () => validateDirectionThemeCatalog(fabricatedProvenance),
    /sourceUrl must be revision-pinned/u
  );

  const tokenDrift = writeFixture(({ themes }) => {
    themes.themes[0].tokens.canvas = "#010101";
  });
  assert.throws(
    () => validateDirectionThemeCatalog(tokenDrift),
    /tokens must preserve .* legacy theme/u
  );

  const lostReference = writeFixture(({ directions }) => {
    directions.directions[0].legacyReferences.pop();
  });
  assert.throws(
    () => validateDirectionThemeCatalog(lostReference),
    /legacyReferences must preserve .* visual references/u
  );
});

test("v2 validator rejects incomplete or ambiguous PreviewSpec hierarchy", () => {
  const missingBlock = writeFixture(({ previewSpecs }) => {
    previewSpecs.previewSpecs[0].hierarchy.supporting.pop();
  });
  assert.throws(
    () => validateDirectionThemeCatalog(missingBlock),
    /hierarchy must be a complete partition of contentBlocks/u
  );

  const repeatedBlock = writeFixture(({ previewSpecs }) => {
    const previewSpec = previewSpecs.previewSpecs[0];
    previewSpec.hierarchy.supporting.push(previewSpec.hierarchy.primary);
  });
  assert.throws(
    () => validateDirectionThemeCatalog(repeatedBlock),
    /hierarchy levels must not repeat content blocks/u
  );
});

test("v2 validator accepts canonical-only Direction, Theme, and PreviewSpec with pinned provenance", () => {
  const paths = writeFixture((documents) => {
    addCanonicalOnlyPair(documents);
  });
  const result = validateDirectionThemeCatalog(paths);
  const baseline = validateDirectionThemeCatalog();

  assert.equal(result.directionCount, baseline.directionCount + 1);
  assert.equal(result.themeCount, baseline.themeCount + 1);
  assert.equal(result.linkCount, baseline.linkCount + 1);
  assert.equal(result.previewSpecCount, baseline.previewSpecCount + 1);
  assert.equal(result.aliasCount, baseline.aliasCount);
});

test("v2 validator keeps canonical provenance strict without relaxing legacy compatibility fields", () => {
  const fabricatedSource = writeFixture((documents) => {
    const { theme } = addCanonicalOnlyPair(documents);
    const source = theme.sources[0];
    source.sourceUrl = "https://example.invalid/fabricated";
  });
  assert.throws(
    () => validateDirectionThemeCatalog(fabricatedSource),
    /sourceUrl must be revision-pinned/u
  );

  const fabricatedLegacySource = writeFixture((documents) => {
    const { theme } = addCanonicalOnlyPair(documents);
    theme.sources = [{ kind: "legacy-curated", provider: "fabricated", slug: "fabricated" }];
  });
  assert.throws(
    () => validateDirectionThemeCatalog(fabricatedLegacySource),
    /canonical-only Theme provenance must be source-pinned/u
  );

  const fabricatedLegacyFields = writeFixture((documents) => {
    const { direction, theme, previewSpec } = addCanonicalOnlyPair(documents);
    direction.legacyStyleIds = ["fabricated-legacy-style"];
    direction.legacyReferences = [{}];
    theme.legacyStyleIds = ["fabricated-legacy-style"];
    theme.legacyReferences = [{}];
    previewSpec.legacyVariant = "dashboard";
  });
  assert.throws(
    () => validateDirectionThemeCatalog(fabricatedLegacyFields),
    /canonical-only Direction|canonical-only Theme/u
  );
});

test("v2 validator preserves historical Theme provenance when an indexed source advances or disappears", () => {
  const paths = writeFixture((documents) => {
    const theme = documents.themes.themes.find((candidate) =>
      candidate.sources.some((source) => source.kind === "source-pinned")
    );
    const source = theme.sources.find((candidate) => candidate.kind === "source-pinned");
    const indexed = documents.styleSources.sources.find((candidate) =>
      candidate.providerId === source.provider && candidate.path === source.path
    );
    documents.styleSources.sources = documents.styleSources.sources.filter((candidate) => candidate !== indexed);
  });
  assert.doesNotThrow(() => validateDirectionThemeCatalog(paths));
});

test("generated catalog resolves capability policy and rejects malformed declarations", () => {
  const missingPolicy = writeGeneratedFixture((providers) => {
    delete providers.find((provider) => provider.id === "awesome-design-md").capabilities;
  });
  assert.throws(
    () => validateGeneratedCatalog(missingPolicy),
    /must explicitly declare curation capabilities/u
  );

  const malformedPolicy = writeGeneratedFixture((providers) => {
    providers.find((provider) => provider.id === "awesome-design-md").capabilities = {
      createDirection: true
    };
  });
  assert.throws(
    () => validateGeneratedCatalog(malformedPolicy),
    /invalid curation capabilities/u
  );
});
