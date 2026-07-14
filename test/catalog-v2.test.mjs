import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  CATALOG_V2_FILES,
  CatalogV2Error,
  loadCatalogV2,
  resolveLegacyStyleId,
  validateCatalogV2
} from "../src/catalog-v2.mjs";

function documents() {
  return {
    directions: {
      schemaVersion: 2,
      directions: [
        { id: "direction-dashboard", name: "Operational dashboard" },
        { id: "direction-story", name: "Narrative story" }
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
  assert.equal(catalog.aliasByLegacyStyleId.size, 2);
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
  raw.directions.directions.push({ id: "direction-dashboard", name: "Duplicate" });
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
