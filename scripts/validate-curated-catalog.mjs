import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const PROFILE_STRING_FIELDS = [
  "id",
  "name",
  "sourceProvider",
  "sourceSlug",
  "family",
  "density",
  "firstViewport",
  "typography"
];

const PROFILE_ARRAY_FIELDS = [
  "pageTypes",
  "audiences",
  "goals",
  "tones",
  "keywords",
  "bestFor",
  "avoidFor",
  "layoutRules",
  "palette",
  "componentKits",
  "risks"
];

const TAXONOMY_ARRAY_FIELDS = ["pageTypes", "audiences", "goals", "tones", "componentKits"];
const THEME_COLOR_FIELDS = ["canvas", "surface", "surfaceAlt", "text", "muted", "accent", "border"];

export const ALLOWED_VISUAL_VARIANTS = Object.freeze([
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

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
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

function isHexColor(value) {
  return typeof value === "string" && /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/iu.test(value);
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

function sourceKey(providerId, slug) {
  return `${providerId}\u0000${slug}`;
}

function sourceSlugs(styleSources) {
  const keys = new Set();
  for (const source of Array.isArray(styleSources?.sources) ? styleSources.sources : []) {
    const match = source?.path?.match(/^design-md\/([^/]+)\/DESIGN\.md$/u);
    if (isNonEmptyString(source?.providerId) && match) {
      keys.add(sourceKey(source.providerId, match[1]));
    }
  }
  return keys;
}

export function validateCuratedCatalog({
  profilesPath = join(ROOT_DIR, "catalog", "style-profiles.json"),
  visualsPath = join(ROOT_DIR, "catalog", "style-visuals.json"),
  styleSourcesPath = join(ROOT_DIR, "catalog", "generated", "style-sources.json"),
  previewsDir = join(ROOT_DIR, "catalog", "previews"),
  policyPath = join(ROOT_DIR, "catalog", "curation-policy.json")
} = {}) {
  const errors = [];
  const expect = (condition, message) => {
    if (!condition) errors.push(message);
  };

  const profilesDocument = readJson(profilesPath);
  const visualsDocument = readJson(visualsPath);
  const styleSources = readJson(styleSourcesPath);
  const policy = readJson(policyPath);
  const profiles = Array.isArray(profilesDocument) ? profilesDocument : [];
  const visuals = Array.isArray(visualsDocument) ? visualsDocument : [];

  expect(Array.isArray(profilesDocument), "style-profiles.json root must be an array");
  expect(Array.isArray(visualsDocument), "style-visuals.json root must be an array");
  expect(Array.isArray(styleSources?.sources), "style-sources.json sources must be an array");
  expect(policy && typeof policy === "object" && !Array.isArray(policy), "curation-policy.json root must be an object");
  expect(policy?.schemaVersion === 1, "curation-policy.json schemaVersion must be 1");
  expect(
    Array.isArray(policy?.requiredFamilies) && policy.requiredFamilies.length > 0,
    "curation-policy.json requiredFamilies must be a non-empty array"
  );
  expect(
    Array.isArray(policy?.requiredFamilies) && policy.requiredFamilies.every(isTaxonomyToken),
    "curation-policy.json requiredFamilies must contain lowercase kebab-case tokens"
  );
  expect(
    Array.isArray(policy?.requiredFamilies) && new Set(policy.requiredFamilies).size === policy.requiredFamilies.length,
    "curation-policy.json requiredFamilies must not contain duplicates"
  );
  expect(
    Number.isInteger(policy?.minimumProfilesPerFamily) && policy.minimumProfilesPerFamily > 0,
    "curation-policy.json minimumProfilesPerFamily must be a positive integer"
  );
  expect(
    Number.isInteger(policy?.minimumVisualVariantsPerFamily) && policy.minimumVisualVariantsPerFamily > 0,
    "curation-policy.json minimumVisualVariantsPerFamily must be a positive integer"
  );
  expect(profiles.length > 0, "style-profiles.json must contain at least one profile");
  expect(visuals.length > 0, "style-visuals.json must contain at least one visual");

  const requiredFamilies = Array.isArray(policy?.requiredFamilies) ? policy.requiredFamilies : [];
  const minimumProfilesPerFamily = Number.isInteger(policy?.minimumProfilesPerFamily)
    ? policy.minimumProfilesPerFamily
    : 1;
  const minimumVisualVariantsPerFamily = Number.isInteger(policy?.minimumVisualVariantsPerFamily)
    ? policy.minimumVisualVariantsPerFamily
    : 1;

  const profileIds = profiles.map((profile) => profile?.id).filter(isNonEmptyString);
  const visualIds = visuals.map((visual) => visual?.styleId).filter(isNonEmptyString);
  for (const id of duplicates(profileIds)) errors.push(`duplicate profile id: ${id}`);
  for (const id of duplicates(visualIds)) errors.push(`duplicate visual styleId: ${id}`);

  const availableSources = sourceSlugs(styleSources);
  const familyCounts = new Map();
  const profileFamilyById = new Map();

  for (const [index, profile] of profiles.entries()) {
    const label = isNonEmptyString(profile?.id) ? profile.id : `profile[${index}]`;
    expect(profile && typeof profile === "object" && !Array.isArray(profile), `${label}: profile must be an object`);
    if (!profile || typeof profile !== "object" || Array.isArray(profile)) continue;

    for (const field of PROFILE_STRING_FIELDS) {
      expect(isNonEmptyString(profile[field]), `${label}: ${field} must be a non-empty string`);
    }
    expect(isTaxonomyToken(profile.id), `${label}: id must be a lowercase kebab-case token`);
    expect(isTaxonomyToken(profile.sourceProvider), `${label}: sourceProvider must be a lowercase kebab-case token`);
    expect(isSourceSlug(profile.sourceSlug), `${label}: sourceSlug must be a lowercase source slug`);
    expect(isTaxonomyToken(profile.family), `${label}: family must be a lowercase kebab-case token`);
    expect(isTaxonomyToken(profile.density), `${label}: density must be a lowercase kebab-case token`);

    for (const field of PROFILE_ARRAY_FIELDS) {
      const values = profile[field];
      expect(Array.isArray(values) && values.length > 0, `${label}: ${field} must be a non-empty array`);
      if (!Array.isArray(values)) continue;
      expect(values.every(isNonEmptyString), `${label}: ${field} must contain only non-empty strings`);
      expect(new Set(values).size === values.length, `${label}: ${field} must not contain duplicates`);
    }

    for (const field of TAXONOMY_ARRAY_FIELDS) {
      if (!Array.isArray(profile[field])) continue;
      expect(
        profile[field].every(isTaxonomyToken),
        `${label}: ${field} must contain lowercase kebab-case tokens`
      );
    }

    if (isTaxonomyToken(profile.family)) {
      familyCounts.set(profile.family, (familyCounts.get(profile.family) || 0) + 1);
    }
    if (isTaxonomyToken(profile.id) && isTaxonomyToken(profile.family)) {
      profileFamilyById.set(profile.id, profile.family);
    }

  }

  for (const family of requiredFamilies) {
    expect(
      (familyCounts.get(family) || 0) >= minimumProfilesPerFamily,
      `${family}: requires at least ${minimumProfilesPerFamily} curated profiles`
    );
  }

  const allowedVariants = new Set(ALLOWED_VISUAL_VARIANTS);
  const visualVariantsByFamily = new Map();
  let referenceCount = 0;
  for (const [index, visual] of visuals.entries()) {
    const label = isNonEmptyString(visual?.styleId) ? visual.styleId : `visual[${index}]`;
    expect(visual && typeof visual === "object" && !Array.isArray(visual), `${label}: visual must be an object`);
    if (!visual || typeof visual !== "object" || Array.isArray(visual)) continue;

    expect(isTaxonomyToken(visual.styleId), `${label}: styleId must be a lowercase kebab-case token`);
    expect(allowedVariants.has(visual.variant), `${label}: variant must be one of ${ALLOWED_VISUAL_VARIANTS.join(", ")}`);
    const family = profileFamilyById.get(visual.styleId);
    if (family && allowedVariants.has(visual.variant)) {
      if (!visualVariantsByFamily.has(family)) visualVariantsByFamily.set(family, new Set());
      visualVariantsByFamily.get(family).add(visual.variant);
    }
    expect(visual.theme && typeof visual.theme === "object" && !Array.isArray(visual.theme), `${label}: theme must be an object`);
    for (const field of THEME_COLOR_FIELDS) {
      expect(isHexColor(visual.theme?.[field]), `${label}: theme.${field} must be a valid hex color`);
    }

    expect(Array.isArray(visual.references) && visual.references.length === 3, `${label}: references must contain exactly 3 entries`);
    if (Array.isArray(visual.references)) {
      referenceCount += visual.references.length;
      const referenceKeys = [];
      for (const [referenceIndex, reference] of visual.references.entries()) {
        const referenceLabel = `${label}: reference[${referenceIndex}]`;
        expect(reference && typeof reference === "object" && !Array.isArray(reference), `${referenceLabel} must be an object`);
        if (!reference || typeof reference !== "object" || Array.isArray(reference)) continue;
        for (const field of ["provider", "slug", "label", "role"]) {
          expect(isNonEmptyString(reference[field]), `${referenceLabel}.${field} must be a non-empty string`);
        }
        expect(isTaxonomyToken(reference.provider), `${referenceLabel}.provider must be a lowercase kebab-case token`);
        expect(isSourceSlug(reference.slug), `${referenceLabel}.slug must be a lowercase source slug`);
        if (isNonEmptyString(reference.provider) && isNonEmptyString(reference.slug)) {
          const key = sourceKey(reference.provider, reference.slug);
          referenceKeys.push(key);
          expect(
            availableSources.has(key),
            `${referenceLabel} source ${reference.provider}/${reference.slug} is missing from style-sources.json`
          );
        }
      }
      expect(new Set(referenceKeys).size === referenceKeys.length, `${label}: references must be unique`);
    }

    if (isNonEmptyString(visual.styleId)) {
      expect(existsSync(join(previewsDir, `${visual.styleId}.svg`)), `${label}: preview file is missing`);
    }
  }

  const profileIdSet = new Set(profileIds);
  const visualIdSet = new Set(visualIds);
  for (const id of profileIdSet) {
    expect(visualIdSet.has(id), `${id}: profile has no matching visual`);
  }
  for (const id of visualIdSet) {
    expect(profileIdSet.has(id), `${id}: visual has no matching profile`);
  }

  for (const family of requiredFamilies) {
    expect(
      (visualVariantsByFamily.get(family)?.size || 0) >= minimumVisualVariantsPerFamily,
      `${family}: requires at least ${minimumVisualVariantsPerFamily} distinct visual variants`
    );
  }

  if (errors.length > 0) {
    throw new Error(`Curated catalog validation failed:\n- ${errors.join("\n- ")}`);
  }

  return {
    profileCount: profiles.length,
    visualCount: visuals.length,
    referenceCount,
    variantCount: new Set(visuals.map((visual) => visual.variant)).size,
    requiredFamilyCount: requiredFamilies.length,
    minimumProfilesPerFamily,
    minimumVisualVariantsPerFamily
  };
}

function main() {
  try {
    const result = validateCuratedCatalog();
    process.stdout.write(
      `Validated curated catalog: ${result.profileCount} profiles, ${result.visualCount} visuals, ` +
        `${result.referenceCount} references across ${result.variantCount} visual variants; ` +
        `${result.requiredFamilyCount} required families with at least ` +
        `${result.minimumProfilesPerFamily} profiles and ${result.minimumVisualVariantsPerFamily} variants each.\n`
    );
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
