import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EXPERIENCE_TYPE_IDS,
  isExperienceType
} from "./experience-types.mjs";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const CATALOG_V2_SCHEMA_VERSION = 2;

export const CATALOG_V2_FILES = Object.freeze({
  directions: "style-directions.json",
  themes: "style-themes.json",
  directionThemes: "style-direction-themes.json",
  previewSpecs: "style-preview-specs.json",
  aliases: "style-aliases.json"
});

export class CatalogV2Error extends Error {
  constructor(message, { code = "catalog_v2_error", cause } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "CatalogV2Error";
    this.code = code;
  }
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function pairKey(directionId, themeId) {
  return JSON.stringify([directionId, themeId]);
}

function assertCatalogV2Index(catalog) {
  if (
    !catalog?.aliasByLegacyStyleId
    || !catalog?.directionById
    || !catalog?.themeById
    || !catalog?.linkByKey
    || !catalog?.linksByDirectionId
    || !catalog?.previewSpecByDirectionId
    || !Array.isArray(catalog.aliases)
  ) {
    throw new TypeError("catalog must be a validated catalog v2 index.");
  }
}

function readDocument(path, fileName) {
  if (!existsSync(path)) {
    throw new CatalogV2Error(
      `Catalog v2 file is missing: ${fileName} (${path}).`,
      { code: "missing_catalog_v2_file" }
    );
  }

  let content;
  try {
    content = readFileSync(path, "utf8");
  } catch (cause) {
    throw new CatalogV2Error(
      `Catalog v2 file could not be read: ${fileName} (${path}).`,
      { code: "unreadable_catalog_v2_file", cause }
    );
  }

  try {
    return JSON.parse(content);
  } catch (cause) {
    throw new CatalogV2Error(
      `Catalog v2 file contains invalid JSON: ${fileName} (${path}).`,
      { code: "invalid_catalog_v2_json", cause }
    );
  }
}

function validateDocument(errors, document, {
  label,
  collectionName
}) {
  if (!isObject(document)) {
    errors.push(`${label} must contain a JSON object.`);
    return [];
  }
  if (document.schemaVersion !== CATALOG_V2_SCHEMA_VERSION) {
    errors.push(`${label}.schemaVersion must be ${CATALOG_V2_SCHEMA_VERSION}.`);
  }
  if (!Array.isArray(document[collectionName])) {
    errors.push(`${label}.${collectionName} must be an array.`);
    return [];
  }
  return document[collectionName];
}

function indexEntities(errors, values, {
  label,
  idField = "id"
}) {
  const index = new Map();
  values.forEach((value, position) => {
    const path = `${label}[${position}]`;
    if (!isObject(value)) {
      errors.push(`${path} must be an object.`);
      return;
    }
    const id = value[idField];
    if (!isNonEmptyString(id)) {
      errors.push(`${path}.${idField} must be a non-empty string.`);
      return;
    }
    if (index.has(id)) {
      errors.push(`${label} contains duplicate ${idField}: ${id}.`);
      return;
    }
    index.set(id, value);
  });
  return index;
}

/**
 * Validate already-parsed catalog v2 documents and build lookup indexes.
 * This function performs no filesystem access, which keeps migrations and tests
 * deterministic.
 */
export function validateCatalogV2({
  directions: directionsDocument,
  themes: themesDocument,
  directionThemes: directionThemesDocument,
  previewSpecs: previewSpecsDocument,
  aliases: aliasesDocument
} = {}) {
  const errors = [];
  const directions = validateDocument(errors, directionsDocument, {
    label: CATALOG_V2_FILES.directions,
    collectionName: "directions"
  });
  const themes = validateDocument(errors, themesDocument, {
    label: CATALOG_V2_FILES.themes,
    collectionName: "themes"
  });
  const links = validateDocument(errors, directionThemesDocument, {
    label: CATALOG_V2_FILES.directionThemes,
    collectionName: "links"
  });
  const previewSpecs = validateDocument(errors, previewSpecsDocument, {
    label: CATALOG_V2_FILES.previewSpecs,
    collectionName: "previewSpecs"
  });
  const aliases = validateDocument(errors, aliasesDocument, {
    label: CATALOG_V2_FILES.aliases,
    collectionName: "aliases"
  });

  const directionById = indexEntities(errors, directions, { label: "directions" });
  const themeById = indexEntities(errors, themes, { label: "themes" });
  const previewSpecByDirectionId = indexEntities(errors, previewSpecs, {
    label: "previewSpecs",
    idField: "directionId"
  });
  const aliasByLegacyStyleId = indexEntities(errors, aliases, {
    label: "aliases",
    idField: "legacyStyleId"
  });
  const linkByKey = new Map();
  const linksByDirectionId = new Map();

  directions.forEach((direction, position) => {
    if (!isObject(direction)) return;
    if (!isExperienceType(direction.experienceType)) {
      errors.push(
        `directions[${position}].experienceType must be one of: ${EXPERIENCE_TYPE_IDS.join(", ")}.`
      );
    }
  });

  links.forEach((link, position) => {
    const path = `links[${position}]`;
    if (!isObject(link)) {
      errors.push(`${path} must be an object.`);
      return;
    }
    if (!isNonEmptyString(link.directionId)) {
      errors.push(`${path}.directionId must be a non-empty string.`);
    }
    if (!isNonEmptyString(link.themeId)) {
      errors.push(`${path}.themeId must be a non-empty string.`);
    }
    if (typeof link.isDefault !== "boolean") {
      errors.push(`${path}.isDefault must be a boolean.`);
    }
    if (!isNonEmptyString(link.directionId) || !isNonEmptyString(link.themeId)) return;

    const key = pairKey(link.directionId, link.themeId);
    if (linkByKey.has(key)) {
      errors.push(`links contains duplicate direction/theme pair: ${link.directionId} + ${link.themeId}.`);
      return;
    }
    linkByKey.set(key, link);
    const directionLinks = linksByDirectionId.get(link.directionId) || [];
    directionLinks.push(link);
    linksByDirectionId.set(link.directionId, directionLinks);

    if (!directionById.has(link.directionId)) {
      errors.push(`${path}.directionId references unknown direction: ${link.directionId}.`);
    }
    if (!themeById.has(link.themeId)) {
      errors.push(`${path}.themeId references unknown theme: ${link.themeId}.`);
    }
  });

  for (const directionId of directionById.keys()) {
    const directionLinks = linksByDirectionId.get(directionId) || [];
    if (directionLinks.length === 0) {
      errors.push(`Direction ${directionId} must have at least one theme link.`);
      continue;
    }
    const defaultLinks = directionLinks.filter((link) => link.isDefault === true);
    if (defaultLinks.length !== 1) {
      errors.push(`Direction ${directionId} must have exactly one default theme link; found ${defaultLinks.length}.`);
    }
    if (!previewSpecByDirectionId.has(directionId)) {
      errors.push(`Direction ${directionId} must have exactly one preview spec; found 0.`);
    }
  }

  for (const directionId of previewSpecByDirectionId.keys()) {
    if (!directionById.has(directionId)) {
      errors.push(`Preview spec references unknown direction: ${directionId}.`);
    }
  }

  aliases.forEach((alias, position) => {
    const path = `aliases[${position}]`;
    if (!isObject(alias)) return;
    if (!isNonEmptyString(alias.directionId)) {
      errors.push(`${path}.directionId must be a non-empty string.`);
    }
    if (!isNonEmptyString(alias.themeId)) {
      errors.push(`${path}.themeId must be a non-empty string.`);
    }
    if (!isNonEmptyString(alias.directionId) || !isNonEmptyString(alias.themeId)) return;
    if (!linkByKey.has(pairKey(alias.directionId, alias.themeId))) {
      errors.push(
        `${path} references a direction/theme pair that is not linked: ${alias.directionId} + ${alias.themeId}.`
      );
    }
  });

  if (errors.length > 0) {
    throw new CatalogV2Error(
      `Catalog v2 validation failed:\n- ${errors.join("\n- ")}`,
      { code: "invalid_catalog_v2" }
    );
  }

  return {
    schemaVersion: CATALOG_V2_SCHEMA_VERSION,
    directions,
    themes,
    links,
    previewSpecs,
    aliases,
    directionById,
    themeById,
    linkByKey,
    linksByDirectionId,
    previewSpecByDirectionId,
    aliasByLegacyStyleId
  };
}

/**
 * Load the complete v2 catalog from a directory. All five files are mandatory so
 * callers never receive a partially initialized compatibility index.
 */
export function loadCatalogV2({ catalogDir = join(ROOT_DIR, "catalog") } = {}) {
  if (!isNonEmptyString(catalogDir)) {
    throw new TypeError("catalogDir must be a non-empty string.");
  }
  const root = resolve(catalogDir);
  const documents = Object.fromEntries(
    Object.entries(CATALOG_V2_FILES).map(([key, fileName]) => [
      key,
      readDocument(join(root, fileName), fileName)
    ])
  );
  return validateCatalogV2(documents);
}

/**
 * Resolve a historical style id into the canonical direction/theme selection.
 */
export function resolveLegacyStyleId(catalog, legacyStyleId) {
  assertCatalogV2Index(catalog);
  if (!isNonEmptyString(legacyStyleId)) {
    throw new TypeError("legacyStyleId must be a non-empty string.");
  }

  const alias = catalog.aliasByLegacyStyleId.get(legacyStyleId);
  if (!alias) {
    throw new CatalogV2Error(
      `Unknown legacy style id: ${legacyStyleId}.`,
      { code: "unknown_legacy_style_id" }
    );
  }
  const direction = catalog.directionById.get(alias.directionId);
  const theme = catalog.themeById.get(alias.themeId);
  const link = catalog.linkByKey.get(pairKey(alias.directionId, alias.themeId));
  const previewSpec = catalog.previewSpecByDirectionId.get(alias.directionId);
  return { direction, theme, link, previewSpec, alias };
}

/**
 * Return every historical alias for a Direction in stable legacy-style-id
 * order. A fresh array is returned so callers cannot mutate the catalog.
 */
export function legacyAliasesForDirection(catalog, directionId) {
  assertCatalogV2Index(catalog);
  if (!isNonEmptyString(directionId)) {
    throw new TypeError("directionId must be a non-empty string.");
  }

  return catalog.aliases
    .filter((alias) => alias.directionId === directionId)
    .slice()
    .sort((left, right) => left.legacyStyleId.localeCompare(right.legacyStyleId));
}

/**
 * Return the stable historical alias for an exact Direction/Theme selection,
 * or null when the selection has no legacy representation.
 */
export function legacyAliasForSelection(catalog, directionId, themeId) {
  assertCatalogV2Index(catalog);
  if (!isNonEmptyString(directionId)) {
    throw new TypeError("directionId must be a non-empty string.");
  }
  if (!isNonEmptyString(themeId)) {
    throw new TypeError("themeId must be a non-empty string.");
  }

  return legacyAliasesForDirection(catalog, directionId)
    .find((alias) => alias.themeId === themeId) || null;
}

/**
 * Resolve a canonical Direction/Theme selection while preserving historical
 * style-id behavior. Without an explicit Theme, aliases intentionally win over
 * same-named Directions. With an explicit Theme, the input is interpreted as a
 * Direction whenever possible; an alias-only input may still identify its
 * canonical Direction.
 */
export function resolveCatalogSelection(catalog, { inputId, themeId } = {}) {
  assertCatalogV2Index(catalog);
  if (!isNonEmptyString(inputId)) {
    throw new TypeError("inputId must be a non-empty string.");
  }

  const inputAlias = catalog.aliasByLegacyStyleId.get(inputId) || null;
  const directDirection = catalog.directionById.get(inputId) || null;
  const hasExplicitTheme = themeId !== undefined;

  if (!hasExplicitTheme && inputAlias) {
    const resolved = resolveLegacyStyleId(catalog, inputId);
    return {
      inputKind: "legacy-style",
      legacyStyleId: inputId,
      ...resolved
    };
  }

  const direction = directDirection
    || (hasExplicitTheme && inputAlias
      ? catalog.directionById.get(inputAlias.directionId)
      : null);
  if (!direction) {
    throw new CatalogV2Error(
      `Unknown catalog selection id: ${inputId}.`,
      { code: "unknown_catalog_selection_id" }
    );
  }

  const inputKind = directDirection ? "direction" : "legacy-style";
  const legacyStyleId = inputKind === "legacy-style" ? inputId : null;
  let link;

  if (hasExplicitTheme) {
    if (!isNonEmptyString(themeId)) {
      throw new TypeError("themeId must be a non-empty string when provided.");
    }
    if (!catalog.themeById.has(themeId)) {
      throw new CatalogV2Error(
        `Unknown theme id: ${themeId}.`,
        { code: "unknown_theme_id" }
      );
    }
    link = catalog.linkByKey.get(pairKey(direction.id, themeId));
    if (!link) {
      throw new CatalogV2Error(
        `Theme ${themeId} is not linked to direction ${direction.id}.`,
        { code: "theme_not_linked_to_direction" }
      );
    }
  } else {
    link = (catalog.linksByDirectionId.get(direction.id) || [])
      .find((candidate) => candidate.isDefault === true);
    if (!link) {
      throw new CatalogV2Error(
        `Direction ${direction.id} has no default theme link.`,
        { code: "missing_default_theme" }
      );
    }
  }

  const theme = catalog.themeById.get(link.themeId);
  const previewSpec = catalog.previewSpecByDirectionId.get(direction.id);
  const alias = legacyAliasForSelection(catalog, direction.id, theme.id);
  return {
    inputKind,
    legacyStyleId,
    direction,
    theme,
    link,
    previewSpec,
    alias
  };
}
