import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  LEGACY_STYLE_DIRECTION_OVERRIDES,
  assertLegacyProjectionSubset,
  buildCatalogV2Projection,
  mergeLegacyProjectionIntoCanonical,
  resolveLegacyDirectionId
} from "../scripts/migrate-direction-theme-catalog.mjs";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const profiles = JSON.parse(readFileSync(join(ROOT_DIR, "catalog", "style-profiles.json"), "utf8"));
const visuals = JSON.parse(readFileSync(join(ROOT_DIR, "catalog", "style-visuals.json"), "utf8"));

test("uses only the explicit reviewed legacy direction overrides", () => {
  assert.equal(Object.keys(LEGACY_STYLE_DIRECTION_OVERRIDES).length, 29);
  assert.equal(
    resolveLegacyDirectionId("developer-dashboard-grid-data-6ced1427"),
    "developer-dashboard-grid-data"
  );
  assert.equal(
    resolveLegacyDirectionId("launch-centered-hero-story-cff58e59"),
    "launch-centered-hero-story"
  );
  assert.equal(
    resolveLegacyDirectionId("future-pinned-style-deadbeef"),
    "future-pinned-style-deadbeef"
  );
  assert.throws(() => resolveLegacyDirectionId(""), /non-empty string/u);
});

test("projects the live legacy catalog without freezing its style or Direction counts", () => {
  const projection = buildCatalogV2Projection(profiles, visuals);
  const directions = projection.directions.directions;
  const expectedDirectionIds = new Set(
    profiles.map((profile) => resolveLegacyDirectionId(profile.id))
  );
  const mergedCounts = Object.fromEntries(
    directions
      .filter((direction) => direction.legacyStyleIds.length > 1)
      .map((direction) => [direction.id, direction.legacyStyleIds.length])
  );

  assert.equal(projection.aliases.aliases.length, profiles.length);
  assert.equal(directions.length, expectedDirectionIds.size);
  assert.equal(projection.previewSpecs.previewSpecs.length, directions.length);
  assert.equal(
    new Set(projection.aliases.aliases.map((alias) => alias.legacyStyleId)).size,
    profiles.length
  );
  const linkPairs = new Set(
    projection.directionThemes.links.map((link) => `${link.directionId}\u0000${link.themeId}`)
  );
  for (const alias of projection.aliases.aliases) {
    assert.ok(linkPairs.has(`${alias.directionId}\u0000${alias.themeId}`));
  }
  assert.deepEqual(mergedCounts, {
    "consumer-centered-hero-community": 4,
    "consumer-centered-hero-trust": 2,
    "developer-dashboard-grid-data": 11,
    "developer-editorial-stack-content": 6,
    "enterprise-dashboard-grid-data": 2
  });
});

test("migration check treats the legacy projection as a strict canonical subset", () => {
  const projection = buildCatalogV2Projection(profiles, visuals);
  const extras = {
    directions: ["directions", { id: "future-curated-direction", name: "Future Curated Direction" }],
    themes: ["themes", { id: "theme-futurecurated", name: "Future Curated Theme" }],
    directionThemes: ["links", { directionId: "future-curated-direction", themeId: "theme-futurecurated", isDefault: true }],
    previewSpecs: ["previewSpecs", { directionId: "future-curated-direction", layoutArchetype: "future-layout" }]
  };
  const canonicalByKey = {};
  for (const [documentKey, [collection, extra]] of Object.entries(extras)) {
    const canonical = structuredClone(projection[documentKey]);
    canonical[collection].push(extra);
    canonicalByKey[documentKey] = canonical;
    assert.doesNotThrow(() => assertLegacyProjectionSubset(
      documentKey,
      projection[documentKey],
      canonical
    ));
  }

  const canonicalDirections = canonicalByKey.directions;
  canonicalDirections.directions[0].experienceType = "content-docs";
  assert.doesNotThrow(() => assertLegacyProjectionSubset(
    "directions",
    projection.directions,
    canonicalDirections
  ));
  canonicalDirections.directions[0].name = "Drifted legacy direction";
  assert.throws(
    () => assertLegacyProjectionSubset("directions", projection.directions, canonicalDirections),
    /legacy projection field has drifted/u
  );

  const aliasesWithExtra = structuredClone(projection.aliases);
  aliasesWithExtra.aliases.push({
    legacyStyleId: "not-a-legacy-style",
    directionId: projection.aliases.aliases[0].directionId,
    themeId: projection.aliases.aliases[0].themeId
  });
  assert.throws(
    () => assertLegacyProjectionSubset("aliases", projection.aliases, aliasesWithExtra),
    /exact immutable legacy compatibility projection/u
  );
});

test("migration write preserves canonical growth while restoring the legacy subset", () => {
  const projection = buildCatalogV2Projection(profiles, visuals);
  const extras = {
    directions: ["directions", { id: "future-curated-direction", name: "Future Curated Direction" }],
    themes: ["themes", { id: "theme-futurecurated", name: "Future Curated Theme" }],
    directionThemes: ["links", { directionId: "future-curated-direction", themeId: "theme-futurecurated", isDefault: true }],
    previewSpecs: ["previewSpecs", { directionId: "future-curated-direction", layoutArchetype: "future-layout" }]
  };
  for (const [documentKey, [collection, extra]] of Object.entries(extras)) {
    const canonical = structuredClone(projection[documentKey]);
    canonical.catalogRevision = `curated-${documentKey}`;
    canonical[collection].push(extra);
    const merged = mergeLegacyProjectionIntoCanonical(documentKey, projection[documentKey], canonical);
    assert.equal(merged.catalogRevision, `curated-${documentKey}`);
    assert.deepEqual(
      merged[collection].find((entity) => (
        documentKey === "directionThemes"
          ? entity.directionId === extra.directionId && entity.themeId === extra.themeId
          : entity[documentKey === "previewSpecs" ? "directionId" : "id"] === extra[documentKey === "previewSpecs" ? "directionId" : "id"]
      )),
      extra
    );
    assert.doesNotThrow(() => assertLegacyProjectionSubset(documentKey, projection[documentKey], merged));
  }

  const canonicalThemes = structuredClone(projection.themes);
  const firstThemeId = canonicalThemes.themes[0].id;
  canonicalThemes.themes[0].name = "Drifted legacy theme";
  const mergedThemes = mergeLegacyProjectionIntoCanonical("themes", projection.themes, canonicalThemes);
  assert.equal(
    mergedThemes.themes.find((theme) => theme.id === firstThemeId).name,
    projection.themes.themes[0].name
  );
  assert.doesNotThrow(() => assertLegacyProjectionSubset("themes", projection.themes, mergedThemes));

  const enrichedDirections = structuredClone(projection.directions);
  enrichedDirections.directions[0].experienceType = "content-docs";
  const mergedDirections = mergeLegacyProjectionIntoCanonical(
    "directions",
    projection.directions,
    enrichedDirections
  );
  assert.equal(mergedDirections.directions[0].experienceType, "content-docs");
  assert.doesNotThrow(() => assertLegacyProjectionSubset("directions", projection.directions, mergedDirections));

  const aliasesWithExtra = structuredClone(projection.aliases);
  aliasesWithExtra.aliases.push({ legacyStyleId: "future", directionId: "future", themeId: "future" });
  assert.deepEqual(
    mergeLegacyProjectionIntoCanonical("aliases", projection.aliases, aliasesWithExtra),
    projection.aliases
  );
});

test("keeps an unknown future pinned profile independent instead of guessing from its hash", () => {
  const baseline = buildCatalogV2Projection(profiles, visuals);
  const sourceProfile = profiles.find((profile) => typeof profile.sourceContentHash === "string");
  const sourceVisual = visuals.find((visual) => visual.styleId === sourceProfile.id);
  const futureProfile = {
    ...structuredClone(sourceProfile),
    id: "future-pinned-style-deadbeef",
    name: "Future Pinned Style"
  };
  const futureVisual = {
    ...structuredClone(sourceVisual),
    styleId: futureProfile.id,
    theme: {
      ...structuredClone(sourceVisual.theme),
      accent: "#123456"
    }
  };

  const projection = buildCatalogV2Projection(
    [...profiles, futureProfile],
    [...visuals, futureVisual]
  );
  const alias = projection.aliases.aliases.find(
    (candidate) => candidate.legacyStyleId === futureProfile.id
  );

  assert.equal(projection.aliases.aliases.length, baseline.aliases.aliases.length + 1);
  assert.equal(projection.directions.directions.length, baseline.directions.directions.length + 1);
  assert.equal(projection.themes.themes.length, baseline.themes.themes.length + 1);
  assert.equal(alias.directionId, futureProfile.id);
  assert.ok(
    projection.directions.directions.some((direction) => direction.id === futureProfile.id)
  );
});

test("emits consumable and distinct content structures for the two similar legacy previews", () => {
  const projection = buildCatalogV2Projection(profiles, visuals);
  const specs = new Map(
    projection.previewSpecs.previewSpecs.map((previewSpec) => [previewSpec.directionId, previewSpec])
  );
  const campaign = specs.get("launch-community-countdown-campaign");
  const wellness = specs.get("consumer-wellness-companion-soft");

  assert.equal(campaign.contentPattern, "community-countdown-campaign");
  assert.deepEqual(campaign.contentBlocks, [
    "campaign-message",
    "countdown",
    "community-proof",
    "reminder-action"
  ]);
  assert.deepEqual(campaign.hierarchy, {
    primary: "campaign-message",
    secondary: ["countdown", "community-proof"],
    supporting: ["reminder-action"]
  });

  assert.equal(wellness.contentPattern, "wellness-daily-ritual");
  assert.deepEqual(wellness.contentBlocks, [
    "daily-ritual",
    "human-moment",
    "progress",
    "membership-action"
  ]);
  assert.deepEqual(wellness.hierarchy, {
    primary: "daily-ritual",
    secondary: ["human-moment", "progress"],
    supporting: ["membership-action"]
  });
  assert.notEqual(
    JSON.stringify([campaign.contentPattern, campaign.contentBlocks, campaign.hierarchy]),
    JSON.stringify([wellness.contentPattern, wellness.contentBlocks, wellness.hierarchy])
  );

  for (const previewSpec of specs.values()) {
    const hierarchyBlocks = [
      previewSpec.hierarchy.primary,
      ...previewSpec.hierarchy.secondary,
      ...previewSpec.hierarchy.supporting
    ].sort();
    assert.deepEqual(hierarchyBlocks, [...previewSpec.contentBlocks].sort());
    assert.equal(new Set(hierarchyBlocks).size, hierarchyBlocks.length);
  }
});
