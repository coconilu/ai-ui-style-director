import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  LEGACY_STYLE_DIRECTION_OVERRIDES,
  buildCatalogV2Projection,
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
