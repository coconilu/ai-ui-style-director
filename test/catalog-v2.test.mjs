import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  CATALOG_V2_FILES,
  CatalogV2Error,
  legacyAliasForSelection,
  legacyAliasesForDirection,
  loadCatalogV2,
  resolveCatalogSelection,
  resolveLegacyStyleId,
  validateCatalogV2
} from "../src/catalog-v2.mjs";
import {
  EXPERIENCE_TYPE_DEFINITIONS,
  EXPERIENCE_TYPE_IDS,
  EXPERIENCE_TYPE_ORDER,
  countExperienceTypes,
  isExperienceType
} from "../src/experience-types.mjs";

function documents() {
  return {
    directions: {
      schemaVersion: 2,
      directions: [
        {
          id: "direction-dashboard",
          name: "Operational dashboard",
          experienceType: "admin-console"
        },
        {
          id: "direction-story",
          name: "Narrative story",
          experienceType: "marketing-site"
        }
      ]
    },
    themes: {
      schemaVersion: 2,
      themes: [
        { id: "theme-light", name: "Light" },
        { id: "theme-dark", name: "Dark" }
      ]
    },
    directionThemes: {
      schemaVersion: 2,
      links: [
        { directionId: "direction-dashboard", themeId: "theme-light", isDefault: true },
        { directionId: "direction-dashboard", themeId: "theme-dark", isDefault: false },
        { directionId: "direction-story", themeId: "theme-light", isDefault: true }
      ]
    },
    previewSpecs: {
      schemaVersion: 2,
      previewSpecs: [
        { directionId: "direction-dashboard", layoutArchetype: "dashboard-grid", contentPattern: "metrics" },
        { directionId: "direction-story", layoutArchetype: "centered-hero", contentPattern: "story" }
      ]
    },
    aliases: {
      schemaVersion: 2,
      aliases: [
        {
          legacyStyleId: "developer-dashboard-light-abc123",
          directionId: "direction-dashboard",
          themeId: "theme-light"
        },
        {
          legacyStyleId: "developer-dashboard-dark-def456",
          directionId: "direction-dashboard",
          themeId: "theme-dark"
        },
        {
          legacyStyleId: "direction-dashboard",
          directionId: "direction-dashboard",
          themeId: "theme-dark"
        }
      ]
    }
  };
}

function writeDocuments(dir, value = documents()) {
  for (const [key, fileName] of Object.entries(CATALOG_V2_FILES)) {
    writeFileSync(join(dir, fileName), `${JSON.stringify(value[key], null, 2)}\n`, "utf8");
  }
}

test("experience type taxonomy exposes one frozen stable ordering and bilingual aliases", () => {
  assert.deepEqual(EXPERIENCE_TYPE_IDS, [
    "consumer-app",
    "marketing-site",
    "commerce",
    "content-docs",
    "business-app",
    "admin-console"
  ]);
  assert.deepEqual(EXPERIENCE_TYPE_ORDER, {
    "consumer-app": 0,
    "marketing-site": 1,
    commerce: 2,
    "content-docs": 3,
    "business-app": 4,
    "admin-console": 5
  });
  assert.ok(Object.isFrozen(EXPERIENCE_TYPE_DEFINITIONS));
  assert.ok(Object.isFrozen(EXPERIENCE_TYPE_IDS));
  assert.ok(Object.isFrozen(EXPERIENCE_TYPE_ORDER));
  assert.equal(EXPERIENCE_TYPE_DEFINITIONS.length, EXPERIENCE_TYPE_IDS.length);
  for (const [index, definition] of EXPERIENCE_TYPE_DEFINITIONS.entries()) {
    assert.deepEqual(Object.keys(definition), ["id", "label", "labelZh", "aliases"]);
    assert.equal(definition.id, EXPERIENCE_TYPE_IDS[index]);
    assert.ok(Object.isFrozen(definition));
    assert.ok(Object.isFrozen(definition.aliases));
    assert.ok(definition.label.length > 0);
    assert.ok(definition.labelZh.length > 0);
    assert.ok(definition.aliases.some((alias) => /^[\x00-\x7F]+$/u.test(alias)));
    assert.ok(definition.aliases.some((alias) => /[^\x00-\x7F]/u.test(alias)));
    assert.equal(new Set(definition.aliases).size, definition.aliases.length);
    assert.equal(isExperienceType(definition.id), true);
  }
  assert.equal(isExperienceType("developer-tool"), false);
  assert.deepEqual(
    countExperienceTypes([
      { experienceType: "marketing-site" },
      "consumer-app",
      { experienceType: "marketing-site" },
      { experienceType: "not-controlled" }
    ]),
    {
      "consumer-app": 1,
      "marketing-site": 2,
      commerce: 0,
      "content-docs": 0,
      "business-app": 0,
      "admin-console": 0
    }
  );
});

test("validates and resolves a legacy style id without changing the source entities", () => {
  const raw = documents();
  const catalog = validateCatalogV2(raw);
  const resolved = resolveLegacyStyleId(catalog, "developer-dashboard-dark-def456");

  assert.equal(catalog.schemaVersion, 2);
  assert.equal(catalog.directions, raw.directions.directions);
  assert.equal(catalog.themes, raw.themes.themes);
  assert.equal(resolved.direction.id, "direction-dashboard");
  assert.equal(resolved.theme.id, "theme-dark");
  assert.equal(resolved.link.isDefault, false);
  assert.equal(resolved.previewSpec.contentPattern, "metrics");
  assert.equal(resolved.alias.legacyStyleId, "developer-dashboard-dark-def456");
});

test("loads all versioned catalog files from an explicit directory", () => {
  const dir = mkdtempSync(join(tmpdir(), "style-director-catalog-v2-"));
  writeDocuments(dir);

  const catalog = loadCatalogV2({ catalogDir: dir });

  assert.equal(catalog.directionById.size, 2);
  assert.equal(catalog.themeById.size, 2);
  assert.equal(catalog.aliasByLegacyStyleId.size, 3);
});

test("reports the exact missing catalog v2 file", () => {
  const dir = mkdtempSync(join(tmpdir(), "style-director-catalog-v2-missing-"));

  assert.throws(
    () => loadCatalogV2({ catalogDir: dir }),
    (error) => {
      assert.ok(error instanceof CatalogV2Error);
      assert.equal(error.code, "missing_catalog_v2_file");
      assert.match(error.message, /style-directions\.json/u);
      return true;
    }
  );
});

test("reports invalid JSON with the source file name", () => {
  const dir = mkdtempSync(join(tmpdir(), "style-director-catalog-v2-json-"));
  writeDocuments(dir);
  writeFileSync(join(dir, CATALOG_V2_FILES.themes), "{not json", "utf8");

  assert.throws(
    () => loadCatalogV2({ catalogDir: dir }),
    (error) => {
      assert.equal(error.code, "invalid_catalog_v2_json");
      assert.match(error.message, /style-themes\.json/u);
      return true;
    }
  );
});

test("rejects duplicate ids, dangling references, and incomplete defaults", () => {
  const raw = documents();
  raw.directions.directions.push({
    id: "direction-dashboard",
    name: "Duplicate",
    experienceType: "admin-console"
  });
  raw.directionThemes.links[0].isDefault = false;
  raw.directionThemes.links.push({
    directionId: "direction-missing",
    themeId: "theme-missing",
    isDefault: true
  });

  assert.throws(
    () => validateCatalogV2(raw),
    (error) => {
      assert.equal(error.code, "invalid_catalog_v2");
      assert.match(error.message, /duplicate id: direction-dashboard/u);
      assert.match(error.message, /exactly one default theme link; found 0/u);
      assert.match(error.message, /unknown direction: direction-missing/u);
      assert.match(error.message, /unknown theme: theme-missing/u);
      return true;
    }
  );
});

test("requires every Direction to declare a controlled experienceType", () => {
  const missing = documents();
  delete missing.directions.directions[0].experienceType;
  assert.throws(
    () => validateCatalogV2(missing),
    /directions\[0\]\.experienceType must be one of: consumer-app, marketing-site, commerce, content-docs, business-app, admin-console/u
  );

  const invalid = documents();
  invalid.directions.directions[1].experienceType = "developer-tool";
  assert.throws(
    () => validateCatalogV2(invalid),
    /directions\[1\]\.experienceType must be one of/u
  );
});

test("requires exactly one preview spec per direction", () => {
  const missing = documents();
  missing.previewSpecs.previewSpecs.pop();
  assert.throws(
    () => validateCatalogV2(missing),
    /Direction direction-story must have exactly one preview spec; found 0/u
  );

  const duplicate = documents();
  duplicate.previewSpecs.previewSpecs.push({
    directionId: "direction-story",
    layoutArchetype: "duplicate"
  });
  assert.throws(
    () => validateCatalogV2(duplicate),
    /previewSpecs contains duplicate directionId: direction-story/u
  );
});

test("requires aliases to target an existing direction/theme link", () => {
  const raw = documents();
  raw.aliases.aliases[0].themeId = "theme-dark";
  raw.directionThemes.links = raw.directionThemes.links.filter(
    (link) => !(link.directionId === "direction-dashboard" && link.themeId === "theme-dark")
  );

  assert.throws(
    () => validateCatalogV2(raw),
    /references a direction\/theme pair that is not linked/u
  );
});

test("reports an unknown legacy style id separately from catalog validation", () => {
  const catalog = validateCatalogV2(documents());

  assert.throws(
    () => resolveLegacyStyleId(catalog, "legacy-style-missing"),
    (error) => {
      assert.equal(error.code, "unknown_legacy_style_id");
      assert.match(error.message, /legacy-style-missing/u);
      return true;
    }
  );
});

test("resolves a same-named legacy style before its Direction when Theme is omitted", () => {
  const catalog = validateCatalogV2(documents());
  const resolved = resolveCatalogSelection(catalog, { inputId: "direction-dashboard" });

  assert.equal(resolved.inputKind, "legacy-style");
  assert.equal(resolved.legacyStyleId, "direction-dashboard");
  assert.equal(resolved.direction.id, "direction-dashboard");
  assert.equal(resolved.theme.id, "theme-dark");
  assert.equal(resolved.link.isDefault, false);
  assert.equal(resolved.alias.legacyStyleId, "direction-dashboard");
});

test("uses explicit Theme with Direction semantics even when the id is also a legacy alias", () => {
  const catalog = validateCatalogV2(documents());
  const resolved = resolveCatalogSelection(catalog, {
    inputId: "direction-dashboard",
    themeId: "theme-light"
  });

  assert.equal(resolved.inputKind, "direction");
  assert.equal(resolved.legacyStyleId, null);
  assert.equal(resolved.direction.id, "direction-dashboard");
  assert.equal(resolved.theme.id, "theme-light");
  assert.equal(resolved.link.isDefault, true);
  assert.equal(resolved.alias.legacyStyleId, "developer-dashboard-light-abc123");
});

test("maps an alias-only input to its Direction before applying an explicit Theme", () => {
  const catalog = validateCatalogV2(documents());
  const resolved = resolveCatalogSelection(catalog, {
    inputId: "developer-dashboard-light-abc123",
    themeId: "theme-dark"
  });

  assert.equal(resolved.inputKind, "legacy-style");
  assert.equal(resolved.legacyStyleId, "developer-dashboard-light-abc123");
  assert.equal(resolved.direction.id, "direction-dashboard");
  assert.equal(resolved.theme.id, "theme-dark");
  assert.equal(resolved.alias.legacyStyleId, "developer-dashboard-dark-def456");
});

test("uses the unique default Theme for a Direction without a same-named alias", () => {
  const catalog = validateCatalogV2(documents());
  const resolved = resolveCatalogSelection(catalog, { inputId: "direction-story" });

  assert.equal(resolved.inputKind, "direction");
  assert.equal(resolved.legacyStyleId, null);
  assert.equal(resolved.theme.id, "theme-light");
  assert.equal(resolved.link.isDefault, true);
  assert.equal(resolved.alias, null);
  assert.equal(resolved.previewSpec.contentPattern, "story");
});

test("returns stable Direction aliases and the exact selection alias", () => {
  const catalog = validateCatalogV2(documents());
  const aliases = legacyAliasesForDirection(catalog, "direction-dashboard");

  assert.deepEqual(
    aliases.map((alias) => alias.legacyStyleId),
    [
      "developer-dashboard-dark-def456",
      "developer-dashboard-light-abc123",
      "direction-dashboard"
    ]
  );
  assert.equal(
    legacyAliasForSelection(catalog, "direction-dashboard", "theme-light").legacyStyleId,
    "developer-dashboard-light-abc123"
  );
  assert.equal(legacyAliasForSelection(catalog, "direction-story", "theme-light"), null);
  assert.deepEqual(legacyAliasesForDirection(catalog, "direction-missing"), []);
});

test("reports unknown selection, unknown Theme, and unlinked Theme separately", () => {
  const catalog = validateCatalogV2(documents());

  assert.throws(
    () => resolveCatalogSelection(catalog, { inputId: "missing-selection" }),
    (error) => {
      assert.equal(error.code, "unknown_catalog_selection_id");
      assert.match(error.message, /missing-selection/u);
      return true;
    }
  );
  assert.throws(
    () => resolveCatalogSelection(catalog, {
      inputId: "direction-dashboard",
      themeId: "theme-missing"
    }),
    (error) => {
      assert.equal(error.code, "unknown_theme_id");
      assert.match(error.message, /theme-missing/u);
      return true;
    }
  );
  assert.throws(
    () => resolveCatalogSelection(catalog, {
      inputId: "direction-story",
      themeId: "theme-dark"
    }),
    (error) => {
      assert.equal(error.code, "theme_not_linked_to_direction");
      assert.match(error.message, /theme-dark.*direction-story/u);
      return true;
    }
  );
});

test("real catalog preserves same-id aliases and aggregated compatibility selections", () => {
  const catalog = loadCatalogV2();
  const overlappingAliases = catalog.aliases.filter((alias) => (
    alias.legacyStyleId === alias.directionId
  ));
  const aggregatedAlias = catalog.aliases.find((alias) => (
    alias.legacyStyleId !== alias.directionId
  ));

  assert.equal(overlappingAliases.length, 48);
  for (const alias of overlappingAliases) {
    const resolved = resolveCatalogSelection(catalog, { inputId: alias.legacyStyleId });
    assert.equal(resolved.inputKind, "legacy-style");
    assert.equal(resolved.direction.id, alias.directionId);
    assert.equal(resolved.theme.id, alias.themeId);
  }

  assert.ok(aggregatedAlias);
  const aggregated = resolveCatalogSelection(catalog, {
    inputId: aggregatedAlias.legacyStyleId
  });
  assert.equal(aggregated.direction.id, aggregatedAlias.directionId);
  assert.equal(aggregated.theme.id, aggregatedAlias.themeId);

  const defaultLink = catalog.linksByDirectionId
    .get(aggregatedAlias.directionId)
    .find((link) => link.isDefault);
  const canonical = resolveCatalogSelection(catalog, {
    inputId: aggregatedAlias.directionId
  });
  assert.equal(canonical.inputKind, "direction");
  assert.equal(canonical.theme.id, defaultLink.themeId);

  const alternateLink = catalog.linksByDirectionId
    .get(aggregatedAlias.directionId)
    .find((link) => link.themeId !== defaultLink.themeId);
  assert.ok(alternateLink);
  const explicit = resolveCatalogSelection(catalog, {
    inputId: aggregatedAlias.directionId,
    themeId: alternateLink.themeId
  });
  assert.equal(explicit.inputKind, "direction");
  assert.equal(explicit.theme.id, alternateLink.themeId);
  assert.equal(explicit.link, alternateLink);
});
