import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { resolveLegacyDirectionId } from "../scripts/migrate-direction-theme-catalog.mjs";
import { validateDirectionThemeCatalog } from "../scripts/validate-direction-theme-catalog.mjs";

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

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
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
    theme.sources[0].contentHash = `sha256:${"0".repeat(64)}`;
  });
  assert.throws(
    () => validateDirectionThemeCatalog(fabricatedProvenance),
    /contentHash must match style-sources\.json/u
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
