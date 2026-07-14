#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CATALOG_V2_SCHEMA_VERSION,
  validateCatalogV2
} from "../src/catalog-v2.mjs";
import {
  EXPERIENCE_TYPE_IDS,
  countExperienceTypes,
  isExperienceType
} from "../src/experience-types.mjs";
import { resolveLegacyDirectionId } from "./migrate-direction-theme-catalog.mjs";
import {
  isSafeRelativePath,
  pinnedProviderSourceUrl,
  visualReferenceSource
} from "../src/provider-adapters.mjs";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CATALOG_DIR = join(ROOT_DIR, "catalog");

const DIRECTION_STRING_FIELDS = Object.freeze([
  "id",
  "name",
  "family",
  "density",
  "firstViewport",
  "typography"
]);
const DIRECTION_ARRAY_FIELDS = Object.freeze([
  "legacyStyleIds",
  "pageTypes",
  "audiences",
  "goals",
  "tones",
  "keywords",
  "bestFor",
  "avoidFor",
  "layoutRules",
  "componentKits",
  "risks",
  "legacyReferences"
]);
const DIRECTION_UNION_FIELDS = Object.freeze([
  "pageTypes",
  "audiences",
  "goals",
  "tones",
  "keywords",
  "bestFor",
  "avoidFor",
  "componentKits",
  "risks"
]);
const DIRECTION_TAXONOMY_FIELDS = new Set([
  "pageTypes",
  "audiences",
  "goals",
  "tones",
  "componentKits"
]);
const FORBIDDEN_DIRECTION_FIELDS = Object.freeze([
  "palette",
  "sourceProvider",
  "sourceSlug",
  "sourcePath",
  "sourceRepo",
  "sourceRevision",
  "sourceContentHash",
  "sourceUrl",
  "theme",
  "themeIds",
  "previewSpec"
]);
const THEME_TOKEN_FIELDS = Object.freeze([
  "canvas",
  "surface",
  "surfaceAlt",
  "text",
  "muted",
  "accent",
  "border"
]);
const THEME_APPEARANCES = new Set(["light", "dark", "mixed"]);
const ALLOWED_LEGACY_VARIANTS = new Set([
  "app-shell",
  "brand",
  "commerce",
  "dashboard",
  "developer",
  "docs",
  "enterprise",
  "fintech",
  "launch",
  "learning",
  "portfolio",
  "research"
]);
const PINNED_SOURCE_FIELDS = Object.freeze([
  "kind",
  "provider",
  "slug",
  "path",
  "repo",
  "revision",
  "contentHash",
  "sourceUrl"
]);
const LEGACY_SOURCE_FIELDS = Object.freeze(["kind", "provider", "slug"]);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isTaxonomyToken(value) {
  return isNonEmptyString(value) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value);
}

function isSourceSlug(value) {
  return isNonEmptyString(value) && /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/u.test(value);
}

function isRepo(value) {
  return typeof value === "string" && /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/iu.test(value);
}

function isContentHash(value) {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/u.test(value);
}

function isHexColor(value) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/iu.test(value);
}

function duplicates(values) {
  const seen = new Set();
  const repeated = new Set();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated].sort();
}

function pairKey(directionId, themeId) {
  return `${directionId}\u0000${themeId}`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function expectedThemeId(tokens) {
  const signature = JSON.stringify(
    THEME_TOKEN_FIELDS.map((field) => [field, String(tokens?.[field]).toUpperCase()])
  );
  return `theme-${sha256(signature).slice(0, 12)}`;
}

function relativeLuminance(hexColor) {
  if (!isHexColor(hexColor)) return Number.NaN;
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hexColor.slice(offset, offset + 2), 16) / 255);
  const linear = channels.map((channel) => (
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  ));
  return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
}

function expectedAppearance(tokens) {
  const surface = relativeLuminance(tokens?.surface);
  const canvas = relativeLuminance(tokens?.canvas);
  if (surface <= 0.25 && canvas <= 0.25) return "dark";
  if (surface >= 0.6 && canvas >= 0.6) return "light";
  return "mixed";
}

function sortedObject(value) {
  if (Array.isArray(value)) return value.map(sortedObject);
  if (!isObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, sortedObject(value[key])])
  );
}

function stableSignature(value) {
  return JSON.stringify(sortedObject(value));
}

function sameStringSet(left, right) {
  return left.length === right.length && left.every((value) => right.includes(value));
}

function stableUnion(items, field) {
  return [...new Set(items.flatMap((item) => Array.isArray(item?.[field]) ? item[field] : []))];
}

function exactKeys(value, keys) {
  if (!isObject(value)) return false;
  return sameStringSet(Object.keys(value), [...keys]);
}

function sourceMatchesProfile(source, profile) {
  if (!isObject(source) || !isObject(profile)) return false;
  if (isNonEmptyString(profile.sourcePath)) {
    return source.kind === "source-pinned"
      && source.provider === profile.sourceProvider
      && source.slug === profile.sourceSlug
      && source.path === profile.sourcePath
      && source.repo === profile.sourceRepo
      && source.revision === profile.sourceRevision
      && source.contentHash === profile.sourceContentHash
      && source.sourceUrl === profile.sourceUrl;
  }
  return source.kind === "legacy-curated"
    && source.provider === profile.sourceProvider
    && source.slug === profile.sourceSlug;
}

function referenceIsPreserved(references, reference) {
  const signature = stableSignature(reference);
  return references.some((candidate) => stableSignature(candidate) === signature);
}

function validateReference(expect, reference, label) {
  expect(isObject(reference), `${label} must be an object`);
  if (!isObject(reference)) return;
  for (const field of ["provider", "label", "role"]) {
    expect(isNonEmptyString(reference[field]), `${label}.${field} must be a non-empty string`);
  }
  expect(isTaxonomyToken(reference.provider), `${label}.provider must be a lowercase kebab-case token`);
  if (reference.slug !== undefined) {
    expect(isSourceSlug(reference.slug), `${label}.slug must be a lowercase source slug`);
  }
  if (reference.path !== undefined) {
    expect(isSafeRelativePath(reference.path), `${label}.path must be a safe POSIX-relative path`);
    expect(isRepo(reference.repo), `${label}.repo must be an owner/repository pair`);
    expect(/^[0-9a-f]{40}$/u.test(reference.revision || ""), `${label}.revision must be a 40-character Git SHA`);
    expect(isContentHash(reference.contentHash), `${label}.contentHash must be SHA-256`);
    expect(
      reference.sourceUrl === pinnedProviderSourceUrl(reference),
      `${label}.sourceUrl must match its pinned repository revision and path`
    );
  }
  const source = visualReferenceSource(reference);
  expect(source !== null, `${label} must resolve to an indexed provider source`);
}

export function validateDirectionThemeCatalog({
  directionsPath = join(CATALOG_DIR, "style-directions.json"),
  themesPath = join(CATALOG_DIR, "style-themes.json"),
  directionThemesPath = join(CATALOG_DIR, "style-direction-themes.json"),
  previewSpecsPath = join(CATALOG_DIR, "style-preview-specs.json"),
  aliasesPath = join(CATALOG_DIR, "style-aliases.json"),
  legacyProfilesPath = join(CATALOG_DIR, "style-profiles.json"),
  legacyVisualsPath = join(CATALOG_DIR, "style-visuals.json"),
  styleSourcesPath = join(CATALOG_DIR, "generated", "style-sources.json")
} = {}) {
  const documents = {
    directions: readJson(directionsPath),
    themes: readJson(themesPath),
    directionThemes: readJson(directionThemesPath),
    previewSpecs: readJson(previewSpecsPath),
    aliases: readJson(aliasesPath)
  };
  const catalog = validateCatalogV2(documents);
  const legacyProfilesDocument = readJson(legacyProfilesPath);
  const legacyVisualsDocument = readJson(legacyVisualsPath);
  const styleSourcesDocument = readJson(styleSourcesPath);
  const errors = [];
  const expect = (condition, message) => {
    if (!condition) errors.push(message);
  };

  expect(Array.isArray(legacyProfilesDocument), "style-profiles.json root must be an array");
  expect(Array.isArray(legacyVisualsDocument), "style-visuals.json root must be an array");
  expect(Array.isArray(styleSourcesDocument?.sources), "style-sources.json sources must be an array");

  const legacyProfiles = Array.isArray(legacyProfilesDocument) ? legacyProfilesDocument : [];
  const legacyVisuals = Array.isArray(legacyVisualsDocument) ? legacyVisualsDocument : [];
  const legacyProfilesById = new Map(legacyProfiles.map((profile) => [profile?.id, profile]));
  const legacyVisualsById = new Map(legacyVisuals.map((visual) => [visual?.styleId, visual]));
  const legacyProfileIds = legacyProfiles.map((profile) => profile?.id).filter(isNonEmptyString);
  const legacyVisualIds = legacyVisuals.map((visual) => visual?.styleId).filter(isNonEmptyString);
  const legacyIdSet = new Set(legacyProfileIds);
  for (const id of duplicates(legacyProfileIds)) errors.push(`duplicate legacy profile id: ${id}`);
  for (const id of duplicates(legacyVisualIds)) errors.push(`duplicate legacy visual styleId: ${id}`);
  for (const id of legacyIdSet) {
    expect(legacyVisualsById.has(id), `${id}: legacy profile has no matching visual`);
  }
  for (const id of new Set(legacyVisualIds)) {
    expect(legacyIdSet.has(id), `${id}: legacy visual has no matching profile`);
  }

  const aliasLegacyIds = catalog.aliases.map((alias) => alias.legacyStyleId);
  for (const legacyStyleId of legacyIdSet) {
    expect(
      catalog.aliasByLegacyStyleId.has(legacyStyleId),
      `${legacyStyleId}: legacy style has no v2 alias`
    );
  }
  for (const legacyStyleId of aliasLegacyIds) {
    expect(legacyIdSet.has(legacyStyleId), `${legacyStyleId}: alias does not reference a legacy style`);
  }

  const aliasesByDirection = new Map();
  const aliasesByTheme = new Map();
  for (const alias of catalog.aliases) {
    const directionAliases = aliasesByDirection.get(alias.directionId) || [];
    directionAliases.push(alias);
    aliasesByDirection.set(alias.directionId, directionAliases);
    const themeAliases = aliasesByTheme.get(alias.themeId) || [];
    themeAliases.push(alias);
    aliasesByTheme.set(alias.themeId, themeAliases);
  }

  const referencedThemeIds = new Set();
  for (const [index, link] of catalog.links.entries()) {
    const label = `links[${index}]`;
    expect(isTaxonomyToken(link.directionId), `${label}.directionId must be a lowercase kebab-case token`);
    expect(/^theme-[0-9a-f]{12}$/u.test(link.themeId || ""), `${label}.themeId must match theme-<12hex>`);
    referencedThemeIds.add(link.themeId);
  }

  for (const [index, direction] of catalog.directions.entries()) {
    const label = isNonEmptyString(direction?.id) ? direction.id : `directions[${index}]`;
    expect(isObject(direction), `${label}: direction must be an object`);
    if (!isObject(direction)) continue;
    const directionAliases = aliasesByDirection.get(direction.id) || [];
    const hasLegacyDirection = directionAliases.length > 0;
    for (const field of DIRECTION_STRING_FIELDS) {
      expect(isNonEmptyString(direction[field]), `${label}: ${field} must be a non-empty string`);
    }
    expect(isTaxonomyToken(direction.id), `${label}: id must be a lowercase kebab-case token`);
    expect(isTaxonomyToken(direction.family), `${label}: family must be a lowercase kebab-case token`);
    expect(isTaxonomyToken(direction.density), `${label}: density must be a lowercase kebab-case token`);
    expect(
      isExperienceType(direction.experienceType),
      `${label}: experienceType must be one of ${EXPERIENCE_TYPE_IDS.join(", ")}`
    );
    for (const field of DIRECTION_ARRAY_FIELDS) {
      const values = direction[field];
      const isLegacyField = field === "legacyStyleIds" || field === "legacyReferences";
      expect(
        isLegacyField
          ? (hasLegacyDirection ? Array.isArray(values) && values.length > 0 : values === undefined || (Array.isArray(values) && values.length === 0))
          : Array.isArray(values) && values.length > 0,
        `${label}: ${field} must ${isLegacyField && !hasLegacyDirection ? "be absent or an empty array for a canonical-only Direction" : "be a non-empty array"}`
      );
      if (!Array.isArray(values)) continue;
      if (field !== "legacyReferences") {
        expect(values.every(isNonEmptyString), `${label}: ${field} must contain only non-empty strings`);
      }
      expect(
        new Set(values.map((value) => field === "legacyReferences" ? stableSignature(value) : value)).size === values.length,
        `${label}: ${field} must not contain duplicates`
      );
      if (DIRECTION_TAXONOMY_FIELDS.has(field)) {
        expect(values.every(isTaxonomyToken), `${label}: ${field} must contain lowercase kebab-case tokens`);
      }
    }
    for (const field of FORBIDDEN_DIRECTION_FIELDS) {
      expect(!(field in direction), `${label}: Direction must not contain Theme/source field ${field}`);
    }

    const aliasedLegacyIds = directionAliases.map((alias) => alias.legacyStyleId).sort();
    const declaredLegacyIds = Array.isArray(direction.legacyStyleIds)
      ? [...direction.legacyStyleIds].sort()
      : [];
    expect(
      sameStringSet(declaredLegacyIds, aliasedLegacyIds),
      `${label}: legacyStyleIds must exactly match aliases targeting this Direction`
    );
    const legacyProfilesForDirection = aliasedLegacyIds
      .map((id) => legacyProfilesById.get(id))
      .filter(Boolean);
    if (legacyProfilesForDirection.length > 0) {
      expect(
        legacyProfilesForDirection.every((profile) => resolveLegacyDirectionId(profile.id) === direction.id),
        `${label}: id must be the deterministic projection of every legacy profile id`
      );
      expect(
        legacyProfilesForDirection.every((profile) => profile.family === direction.family),
        `${label}: family must match every legacy profile`
      );
      for (const field of DIRECTION_UNION_FIELDS) {
        const expectedValues = stableUnion(legacyProfilesForDirection, field);
        const actualValues = Array.isArray(direction[field]) ? direction[field] : [];
        expect(
          sameStringSet(actualValues, expectedValues),
          `${label}: ${field} must preserve the exact legacy union`
        );
      }
      for (const field of ["density", "firstViewport", "typography"]) {
        expect(
          legacyProfilesForDirection.some((profile) => profile[field] === direction[field]),
          `${label}: ${field} must use a deterministic legacy representative`
        );
      }
      expect(
        legacyProfilesForDirection.some(
          (profile) => stableSignature(profile.layoutRules) === stableSignature(direction.layoutRules)
        ),
        `${label}: layoutRules must use a deterministic legacy representative`
      );
    }
    const references = Array.isArray(direction.legacyReferences) ? direction.legacyReferences : [];
    references.forEach((reference, referenceIndex) => {
      validateReference(expect, reference, `${label}: legacyReferences[${referenceIndex}]`);
    });
    for (const legacyStyleId of aliasedLegacyIds) {
      const visual = legacyVisualsById.get(legacyStyleId);
      for (const reference of Array.isArray(visual?.references) ? visual.references : []) {
        expect(
          referenceIsPreserved(references, reference),
          `${label}: legacyReferences must preserve ${legacyStyleId} visual references`
        );
      }
    }
  }

  const tokenSignatures = new Map();
  for (const [index, theme] of catalog.themes.entries()) {
    const label = isNonEmptyString(theme?.id) ? theme.id : `themes[${index}]`;
    expect(isObject(theme), `${label}: theme must be an object`);
    if (!isObject(theme)) continue;
    const themeAliases = aliasesByTheme.get(theme.id) || [];
    const hasLegacyTheme = themeAliases.length > 0;
    expect(/^theme-[0-9a-f]{12}$/u.test(theme.id || ""), `${label}: id must match theme-<12hex>`);
    expect(isNonEmptyString(theme.name), `${label}: name must be a non-empty string`);
    expect(
      hasLegacyTheme
        ? Array.isArray(theme.legacyStyleIds) && theme.legacyStyleIds.length > 0
        : theme.legacyStyleIds === undefined || (Array.isArray(theme.legacyStyleIds) && theme.legacyStyleIds.length === 0),
      `${label}: legacyStyleIds must ${hasLegacyTheme ? "be a non-empty array" : "be absent or an empty array for a canonical-only Theme"}`
    );
    if (Array.isArray(theme.legacyStyleIds)) {
      expect(theme.legacyStyleIds.every(isTaxonomyToken), `${label}: legacyStyleIds must contain style tokens`);
      expect(new Set(theme.legacyStyleIds).size === theme.legacyStyleIds.length, `${label}: legacyStyleIds must not contain duplicates`);
    }
    expect(exactKeys(theme.tokens, THEME_TOKEN_FIELDS), `${label}: tokens must contain exactly ${THEME_TOKEN_FIELDS.join(", ")}`);
    for (const field of THEME_TOKEN_FIELDS) {
      expect(isHexColor(theme.tokens?.[field]), `${label}: tokens.${field} must be a six-digit hex color`);
    }
    if (isObject(theme.tokens)) {
      const tokenSignature = THEME_TOKEN_FIELDS.map((field) => String(theme.tokens[field]).toUpperCase()).join("\u0000");
      const previousThemeId = tokenSignatures.get(tokenSignature);
      expect(!previousThemeId, `${label}: duplicates the exact tokens of ${previousThemeId}`);
      if (!previousThemeId) tokenSignatures.set(tokenSignature, theme.id);
      expect(theme.id === expectedThemeId(theme.tokens), `${label}: id must be derived from its token signature`);
    }
    expect(Array.isArray(theme.palette) && theme.palette.length > 0, `${label}: palette must be a non-empty array`);
    if (Array.isArray(theme.palette)) {
      expect(theme.palette.every(isNonEmptyString), `${label}: palette must contain non-empty strings`);
      expect(new Set(theme.palette).size === theme.palette.length, `${label}: palette must not contain duplicates`);
    }
    expect(THEME_APPEARANCES.has(theme.appearance), `${label}: appearance must be light, dark, or mixed`);
    expect(theme.appearance === expectedAppearance(theme.tokens), `${label}: appearance must be derived from canvas and surface`);
    expect(Array.isArray(theme.tones) && theme.tones.length > 0, `${label}: tones must be a non-empty array`);
    if (Array.isArray(theme.tones)) {
      expect(theme.tones.every(isTaxonomyToken), `${label}: tones must contain lowercase kebab-case tokens`);
      expect(new Set(theme.tones).size === theme.tones.length, `${label}: tones must not contain duplicates`);
    }
    expect(Array.isArray(theme.sources) && theme.sources.length > 0, `${label}: sources must be a non-empty array`);
    if (Array.isArray(theme.sources)) {
      expect(
        new Set(theme.sources.map(stableSignature)).size === theme.sources.length,
        `${label}: sources must not contain duplicates`
      );
      for (const [sourceIndex, source] of theme.sources.entries()) {
        const sourceLabel = `${label}: sources[${sourceIndex}]`;
        expect(isObject(source), `${sourceLabel} must be an object`);
        if (!isObject(source)) continue;
        expect(isTaxonomyToken(source.provider), `${sourceLabel}.provider must be a lowercase kebab-case token`);
        expect(isSourceSlug(source.slug), `${sourceLabel}.slug must be a lowercase source slug`);
        if (source.kind === "source-pinned") {
          expect(exactKeys(source, PINNED_SOURCE_FIELDS), `${sourceLabel} must contain exactly the source-pinned fields`);
          expect(isSafeRelativePath(source.path), `${sourceLabel}.path must be a safe POSIX-relative path`);
          expect(isRepo(source.repo), `${sourceLabel}.repo must be an owner/repository pair`);
          expect(/^[0-9a-f]{40}$/u.test(source.revision || ""), `${sourceLabel}.revision must be a 40-character Git SHA`);
          expect(isContentHash(source.contentHash), `${sourceLabel}.contentHash must be SHA-256`);
          expect(source.sourceUrl === pinnedProviderSourceUrl(source), `${sourceLabel}.sourceUrl must be revision-pinned`);
        } else if (source.kind === "legacy-curated") {
          expect(exactKeys(source, LEGACY_SOURCE_FIELDS), `${sourceLabel} must contain only real legacy-curated fields`);
          expect(hasLegacyTheme, `${sourceLabel}: canonical-only Theme provenance must be source-pinned`);
        } else {
          expect(false, `${sourceLabel}.kind must be source-pinned or legacy-curated`);
        }
      }
    }

    const aliasedLegacyIds = themeAliases.map((alias) => alias.legacyStyleId).sort();
    const declaredLegacyIds = Array.isArray(theme.legacyStyleIds)
      ? [...theme.legacyStyleIds].sort()
      : [];
    expect(
      sameStringSet(declaredLegacyIds, aliasedLegacyIds),
      `${label}: legacyStyleIds must exactly match aliases targeting this Theme`
    );
    const profilesForTheme = aliasedLegacyIds.map((id) => legacyProfilesById.get(id)).filter(Boolean);
    const visualsForTheme = aliasedLegacyIds.map((id) => legacyVisualsById.get(id)).filter(Boolean);
    for (const visual of visualsForTheme) {
      expect(
        THEME_TOKEN_FIELDS.every((field) => visual.theme?.[field]?.toUpperCase() === theme.tokens?.[field]?.toUpperCase()),
        `${label}: tokens must preserve ${visual.styleId} legacy theme`
      );
    }
    for (const profile of profilesForTheme) {
      expect(
        Array.isArray(theme.sources) && theme.sources.some((source) => sourceMatchesProfile(source, profile)),
        `${label}: sources must preserve ${profile.id} provenance`
      );
    }
    const expectedTones = stableUnion(profilesForTheme, "tones");
    if (expectedTones.length > 0) {
      expect(sameStringSet(theme.tones || [], expectedTones), `${label}: tones must preserve the exact legacy union`);
    }
    const references = Array.isArray(theme.legacyReferences) ? theme.legacyReferences : [];
    expect(
      hasLegacyTheme
        ? Array.isArray(theme.legacyReferences) && references.length > 0
        : theme.legacyReferences === undefined || (Array.isArray(theme.legacyReferences) && references.length === 0),
      `${label}: legacyReferences must ${hasLegacyTheme ? "be a non-empty array" : "be absent or an empty array for a canonical-only Theme"}`
    );
    expect(new Set(references.map(stableSignature)).size === references.length, `${label}: legacyReferences must not contain duplicates`);
    references.forEach((reference, referenceIndex) => {
      validateReference(expect, reference, `${label}: legacyReferences[${referenceIndex}]`);
    });
    for (const visual of visualsForTheme) {
      for (const reference of Array.isArray(visual?.references) ? visual.references : []) {
        expect(
          referenceIsPreserved(references, reference),
          `${label}: legacyReferences must preserve ${visual.styleId} visual references`
        );
      }
    }
  }

  for (const [index, previewSpec] of catalog.previewSpecs.entries()) {
    const label = `previewSpecs[${index}]`;
    expect(isTaxonomyToken(previewSpec.directionId), `${label}.directionId must be a lowercase kebab-case token`);
    const aliases = aliasesByDirection.get(previewSpec.directionId) || [];
    if (aliases.length > 0) {
      expect(ALLOWED_LEGACY_VARIANTS.has(previewSpec.legacyVariant), `${label}.legacyVariant is not supported`);
    } else {
      expect(
        previewSpec.legacyVariant === undefined || previewSpec.legacyVariant === null || previewSpec.legacyVariant === "",
        `${label}.legacyVariant must be absent or empty for a canonical-only Direction`
      );
    }
    for (const field of ["layoutArchetype", "contentPattern", "emphasis"]) {
      expect(isTaxonomyToken(previewSpec[field]), `${label}.${field} must be a lowercase kebab-case token`);
    }
    expect(
      Array.isArray(previewSpec.contentBlocks) && previewSpec.contentBlocks.length > 0,
      `${label}.contentBlocks must be a non-empty array`
    );
    if (Array.isArray(previewSpec.contentBlocks)) {
      expect(
        previewSpec.contentBlocks.every(isTaxonomyToken),
        `${label}.contentBlocks must contain lowercase kebab-case tokens`
      );
      expect(
        new Set(previewSpec.contentBlocks).size === previewSpec.contentBlocks.length,
        `${label}.contentBlocks must not contain duplicates`
      );
    }
    expect(
      exactKeys(previewSpec.hierarchy, ["primary", "secondary", "supporting"]),
      `${label}.hierarchy must contain exactly primary, secondary, and supporting`
    );
    const hierarchy = isObject(previewSpec.hierarchy) ? previewSpec.hierarchy : {};
    expect(isTaxonomyToken(hierarchy.primary), `${label}.hierarchy.primary must be a lowercase kebab-case token`);
    for (const field of ["secondary", "supporting"]) {
      expect(Array.isArray(hierarchy[field]), `${label}.hierarchy.${field} must be an array`);
      if (Array.isArray(hierarchy[field])) {
        expect(
          hierarchy[field].every(isTaxonomyToken),
          `${label}.hierarchy.${field} must contain lowercase kebab-case tokens`
        );
        expect(
          new Set(hierarchy[field]).size === hierarchy[field].length,
          `${label}.hierarchy.${field} must not contain duplicates`
        );
      }
    }
    const hierarchyBlocks = [
      hierarchy.primary,
      ...(Array.isArray(hierarchy.secondary) ? hierarchy.secondary : []),
      ...(Array.isArray(hierarchy.supporting) ? hierarchy.supporting : [])
    ].filter(isNonEmptyString);
    expect(
      new Set(hierarchyBlocks).size === hierarchyBlocks.length,
      `${label}.hierarchy levels must not repeat content blocks`
    );
    expect(
      Array.isArray(previewSpec.contentBlocks)
        && sameStringSet(hierarchyBlocks, previewSpec.contentBlocks),
      `${label}.hierarchy must be a complete partition of contentBlocks`
    );
    const legacyVariants = new Set(
      aliases.map((alias) => legacyVisualsById.get(alias.legacyStyleId)?.variant).filter(Boolean)
    );
    if (legacyVariants.size > 0) {
      expect(
        legacyVariants.has(previewSpec.legacyVariant),
        `${label}.legacyVariant must come from the Direction's legacy visuals`
      );
    }
  }

  for (const themeId of catalog.themeById.keys()) {
    expect(referencedThemeIds.has(themeId), `${themeId}: Theme has no Direction link`);
  }
  for (const direction of catalog.directions) {
    if (!Array.isArray(direction.legacyStyleIds) || direction.legacyStyleIds.length === 0) continue;
    const defaultLink = catalog.linksByDirectionId.get(direction.id)?.find((link) => link.isDefault);
    const firstLegacyStyleId = [...direction.legacyStyleIds].sort()[0];
    const defaultAlias = catalog.aliasByLegacyStyleId.get(firstLegacyStyleId);
    expect(
      defaultLink?.themeId === defaultAlias?.themeId,
      `${direction.id}: default Theme must come from the first stable legacy style id`
    );
  }
  for (const alias of catalog.aliases) {
    expect(
      catalog.linkByKey.has(JSON.stringify([alias.directionId, alias.themeId])),
      `${alias.legacyStyleId}: alias pair has no Direction/Theme link`
    );
    expect(
      catalog.directionById.get(alias.directionId)?.legacyStyleIds?.includes(alias.legacyStyleId),
      `${alias.legacyStyleId}: alias is missing from Direction legacyStyleIds`
    );
    expect(
      catalog.themeById.get(alias.themeId)?.legacyStyleIds?.includes(alias.legacyStyleId),
      `${alias.legacyStyleId}: alias is missing from Theme legacyStyleIds`
    );
  }

  if (errors.length > 0) {
    throw new Error(`Direction/Theme catalog validation failed:\n- ${errors.join("\n- ")}`);
  }

  const experienceTypeCounts = countExperienceTypes(catalog.directions);

  return {
    schemaVersion: CATALOG_V2_SCHEMA_VERSION,
    directionCount: catalog.directions.length,
    themeCount: catalog.themes.length,
    linkCount: catalog.links.length,
    previewSpecCount: catalog.previewSpecs.length,
    aliasCount: catalog.aliases.length,
    legacyStyleCount: legacyIdSet.size,
    pinnedSourceCount: catalog.themes.flatMap((theme) => theme.sources || [])
      .filter((source) => source.kind === "source-pinned").length,
    legacySourceCount: catalog.themes.flatMap((theme) => theme.sources || [])
      .filter((source) => source.kind === "legacy-curated").length,
    experienceTypeCounts
  };
}

function main() {
  try {
    const result = validateDirectionThemeCatalog();
    process.stdout.write(
      `Validated Direction/Theme catalog v${result.schemaVersion}: `
      + `${result.directionCount} directions, ${result.themeCount} themes, `
      + `${result.linkCount} links, ${result.previewSpecCount} preview specs, `
      + `${result.aliasCount}/${result.legacyStyleCount} legacy aliases; `
      + `${result.pinnedSourceCount} pinned and ${result.legacySourceCount} legacy provenance entries; `
      + `experience coverage: ${EXPERIENCE_TYPE_IDS.map(
        (id) => `${id}=${result.experienceTypeCounts[id]}`
      ).join(", ")}.\n`
    );
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
