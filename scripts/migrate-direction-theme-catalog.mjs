#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CATALOG_DIR = join(ROOT_DIR, "catalog");
const CHECK_ONLY = process.argv.includes("--check");

const INPUT_PATHS = Object.freeze({
  profiles: join(CATALOG_DIR, "style-profiles.json"),
  visuals: join(CATALOG_DIR, "style-visuals.json")
});

const OUTPUT_PATHS = Object.freeze({
  directions: join(CATALOG_DIR, "style-directions.json"),
  themes: join(CATALOG_DIR, "style-themes.json"),
  directionThemes: join(CATALOG_DIR, "style-direction-themes.json"),
  aliases: join(CATALOG_DIR, "style-aliases.json"),
  previewSpecs: join(CATALOG_DIR, "style-preview-specs.json")
});

const SCHEMA_VERSION = 2;
const THEME_TOKEN_FIELDS = Object.freeze([
  "canvas",
  "surface",
  "surfaceAlt",
  "text",
  "muted",
  "accent",
  "border"
]);

export const LEGACY_STYLE_DIRECTION_OVERRIDES = Object.freeze({
  "consumer-centered-hero-community-4ab63e7f": "consumer-centered-hero-community",
  "consumer-centered-hero-community-4c776093": "consumer-centered-hero-community",
  "consumer-centered-hero-community-72832e30": "consumer-centered-hero-community",
  "consumer-centered-hero-community-a251fa4c": "consumer-centered-hero-community",
  "consumer-centered-hero-story-2f0b340c": "consumer-centered-hero-story",
  "consumer-centered-hero-trust-1884cccb": "consumer-centered-hero-trust",
  "consumer-centered-hero-trust-bdad6a9a": "consumer-centered-hero-trust",
  "developer-dashboard-grid-data-184a9fda": "developer-dashboard-grid-data",
  "developer-dashboard-grid-data-29261d80": "developer-dashboard-grid-data",
  "developer-dashboard-grid-data-41fb4cb8": "developer-dashboard-grid-data",
  "developer-dashboard-grid-data-6be14a36": "developer-dashboard-grid-data",
  "developer-dashboard-grid-data-6ced1427": "developer-dashboard-grid-data",
  "developer-dashboard-grid-data-8137dc5b": "developer-dashboard-grid-data",
  "developer-dashboard-grid-data-98d119d6": "developer-dashboard-grid-data",
  "developer-dashboard-grid-data-a98dce44": "developer-dashboard-grid-data",
  "developer-dashboard-grid-data-b0deb9dd": "developer-dashboard-grid-data",
  "developer-dashboard-grid-data-ccf39d86": "developer-dashboard-grid-data",
  "developer-dashboard-grid-data-fa0a21e2": "developer-dashboard-grid-data",
  "developer-editorial-stack-content-0b8eb8d8": "developer-editorial-stack-content",
  "developer-editorial-stack-content-0beed9d3": "developer-editorial-stack-content",
  "developer-editorial-stack-content-30765d74": "developer-editorial-stack-content",
  "developer-editorial-stack-content-3862b164": "developer-editorial-stack-content",
  "developer-editorial-stack-content-4ab099d9": "developer-editorial-stack-content",
  "developer-editorial-stack-content-7a607af2": "developer-editorial-stack-content",
  "enterprise-dashboard-grid-data-7e324226": "enterprise-dashboard-grid-data",
  "enterprise-dashboard-grid-data-817068c8": "enterprise-dashboard-grid-data",
  "launch-centered-hero-story-cff58e59": "launch-centered-hero-story",
  "launch-centered-hero-trust-dc16f9c6": "launch-centered-hero-trust",
  "portfolio-centered-hero-story-d5726f45": "portfolio-centered-hero-story"
});

const UNION_FIELDS = Object.freeze([
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

const VARIANT_PREVIEW_DEFAULTS = Object.freeze({
  "app-shell": {
    layoutArchetype: "app-shell",
    contentPattern: "workflow-navigation",
    emphasis: "workflow"
  },
  brand: {
    layoutArchetype: "narrative-landing",
    contentPattern: "brand-story",
    emphasis: "story"
  },
  commerce: {
    layoutArchetype: "catalog-grid",
    contentPattern: "product-discovery",
    emphasis: "conversion"
  },
  dashboard: {
    layoutArchetype: "dashboard-grid",
    contentPattern: "metrics-and-workflows",
    emphasis: "data"
  },
  developer: {
    layoutArchetype: "developer-workbench",
    contentPattern: "technical-proof",
    emphasis: "capability"
  },
  docs: {
    layoutArchetype: "editorial-stack",
    contentPattern: "reading-hierarchy",
    emphasis: "content"
  },
  enterprise: {
    layoutArchetype: "evidence-grid",
    contentPattern: "trust-evidence",
    emphasis: "trust"
  },
  fintech: {
    layoutArchetype: "finance-dashboard",
    contentPattern: "financial-decision",
    emphasis: "data"
  },
  launch: {
    layoutArchetype: "centered-hero",
    contentPattern: "launch-story",
    emphasis: "story"
  },
  learning: {
    layoutArchetype: "learning-workspace",
    contentPattern: "learning-progress",
    emphasis: "progress"
  },
  portfolio: {
    layoutArchetype: "portfolio-grid",
    contentPattern: "case-study",
    emphasis: "work"
  },
  research: {
    layoutArchetype: "research-workbench",
    contentPattern: "evidence-analysis",
    emphasis: "evidence"
  }
});

const VARIANT_CONTENT_STRUCTURES = Object.freeze({
  "app-shell": {
    contentBlocks: ["navigation", "work-queue", "detail-panel", "primary-action"],
    hierarchy: { primary: "work-queue", secondary: ["navigation", "detail-panel"], supporting: ["primary-action"] }
  },
  brand: {
    contentBlocks: ["hero-message", "story-proof", "brand-moment", "primary-action"],
    hierarchy: { primary: "hero-message", secondary: ["story-proof", "brand-moment"], supporting: ["primary-action"] }
  },
  commerce: {
    contentBlocks: ["product-discovery", "product-detail", "trust-signal", "purchase-action"],
    hierarchy: { primary: "product-discovery", secondary: ["product-detail", "trust-signal"], supporting: ["purchase-action"] }
  },
  dashboard: {
    contentBlocks: ["metric-summary", "data-grid", "status-panel", "workflow-action"],
    hierarchy: { primary: "data-grid", secondary: ["metric-summary", "status-panel"], supporting: ["workflow-action"] }
  },
  developer: {
    contentBlocks: ["technical-claim", "code-sample", "capability-proof", "docs-action"],
    hierarchy: { primary: "technical-claim", secondary: ["code-sample", "capability-proof"], supporting: ["docs-action"] }
  },
  docs: {
    contentBlocks: ["navigation-tree", "article-content", "code-example", "next-step"],
    hierarchy: { primary: "article-content", secondary: ["navigation-tree", "code-example"], supporting: ["next-step"] }
  },
  enterprise: {
    contentBlocks: ["solution-claim", "evidence", "governance", "sales-action"],
    hierarchy: { primary: "solution-claim", secondary: ["evidence", "governance"], supporting: ["sales-action"] }
  },
  fintech: {
    contentBlocks: ["account-summary", "financial-data", "risk-context", "decision-action"],
    hierarchy: { primary: "financial-data", secondary: ["account-summary", "risk-context"], supporting: ["decision-action"] }
  },
  launch: {
    contentBlocks: ["launch-claim", "product-proof", "release-milestone", "signup-action"],
    hierarchy: { primary: "launch-claim", secondary: ["product-proof", "release-milestone"], supporting: ["signup-action"] }
  },
  learning: {
    contentBlocks: ["lesson-content", "progress", "practice", "continue-action"],
    hierarchy: { primary: "lesson-content", secondary: ["progress", "practice"], supporting: ["continue-action"] }
  },
  portfolio: {
    contentBlocks: ["selected-work", "case-study", "creator-story", "contact-action"],
    hierarchy: { primary: "selected-work", secondary: ["case-study", "creator-story"], supporting: ["contact-action"] }
  },
  research: {
    contentBlocks: ["research-question", "evidence", "benchmark", "methodology"],
    hierarchy: { primary: "research-question", secondary: ["evidence", "benchmark"], supporting: ["methodology"] }
  }
});

const DIRECTION_PREVIEW_OVERRIDES = Object.freeze({
  "launch-community-countdown-campaign": {
    contentPattern: "community-countdown-campaign",
    contentBlocks: ["campaign-message", "countdown", "community-proof", "reminder-action"],
    hierarchy: {
      primary: "campaign-message",
      secondary: ["countdown", "community-proof"],
      supporting: ["reminder-action"]
    }
  },
  "consumer-wellness-companion-soft": {
    contentPattern: "wellness-daily-ritual",
    contentBlocks: ["daily-ritual", "human-moment", "progress", "membership-action"],
    hierarchy: {
      primary: "daily-ritual",
      secondary: ["human-moment", "progress"],
      supporting: ["membership-action"]
    }
  }
});

const EMPHASIS_CONTENT_PATTERNS = Object.freeze({
  capability: "technical-proof",
  community: "participation-proof",
  content: "reading-hierarchy",
  conversion: "product-discovery",
  data: "metrics-and-workflows",
  evidence: "evidence-analysis",
  progress: "learning-progress",
  story: "narrative-proof",
  trust: "trust-evidence",
  work: "case-study"
});

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function titleCase(value) {
  return String(value)
    .split(/[-_.\s]+/u)
    .filter(Boolean)
    .map((part) => `${part[0].toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableUnique(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function mode(values) {
  if (values.length === 0) return undefined;
  const counts = new Map();
  for (const value of values) {
    const key = JSON.stringify(value);
    const current = counts.get(key) ?? { count: 0, value };
    current.count += 1;
    counts.set(key, current);
  }

  return [...counts.entries()]
    .sort(([leftKey, left], [rightKey, right]) => {
      if (left.count !== right.count) return right.count - left.count;
      return leftKey.localeCompare(rightKey);
    })[0][1].value;
}

export function resolveLegacyDirectionId(legacyStyleId) {
  if (typeof legacyStyleId !== "string" || legacyStyleId.trim().length === 0) {
    throw new TypeError("legacyStyleId must be a non-empty string");
  }
  return Object.hasOwn(LEGACY_STYLE_DIRECTION_OVERRIDES, legacyStyleId)
    ? LEGACY_STYLE_DIRECTION_OVERRIDES[legacyStyleId]
    : legacyStyleId;
}

function normalizeThemeTokens(theme, styleId) {
  assert(theme && typeof theme === "object" && !Array.isArray(theme), `Missing theme tokens for ${styleId}`);
  const tokens = {};
  for (const field of THEME_TOKEN_FIELDS) {
    assert(typeof theme[field] === "string" && theme[field].length > 0, `Missing theme.${field} for ${styleId}`);
    tokens[field] = theme[field].toUpperCase();
  }
  return tokens;
}

function themeSignature(tokens) {
  return JSON.stringify(THEME_TOKEN_FIELDS.map((field) => [field, tokens[field]]));
}

function sourceForProfile(profile) {
  const hasPinnedSource = [
    profile.sourcePath,
    profile.sourceRepo,
    profile.sourceRevision,
    profile.sourceContentHash,
    profile.sourceUrl
  ].every((value) => typeof value === "string" && value.length > 0);

  if (!hasPinnedSource) {
    return {
      kind: "legacy-curated",
      provider: profile.sourceProvider,
      slug: profile.sourceSlug
    };
  }

  return {
    kind: "source-pinned",
    provider: profile.sourceProvider,
    slug: profile.sourceSlug,
    path: profile.sourcePath,
    repo: profile.sourceRepo,
    revision: profile.sourceRevision,
    contentHash: profile.sourceContentHash,
    sourceUrl: profile.sourceUrl
  };
}

function sourceSortKey(source) {
  return [
    source.kind,
    source.provider,
    source.slug,
    source.path ?? "",
    source.revision ?? "",
    source.contentHash ?? ""
  ].join("\u0000");
}

function uniqueSources(profiles) {
  const sources = new Map();
  for (const profile of profiles) {
    const source = sourceForProfile(profile);
    sources.set(sourceSortKey(source), source);
  }
  return [...sources.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, source]) => source);
}

function uniqueLegacyReferences(profiles, visualsByStyleId) {
  const references = new Map();
  for (const profile of profiles) {
    const visual = visualsByStyleId.get(profile.id);
    for (const reference of visual.references ?? []) {
      const key = JSON.stringify(reference);
      if (!references.has(key)) references.set(key, reference);
    }
  }
  return [...references.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, reference]) => reference);
}

function createDirection(directionId, profiles, visualsByStyleId) {
  const legacyStyleIds = profiles.map((profile) => profile.id).sort((left, right) => left.localeCompare(right));
  const direction = {
    id: directionId,
    name: mode(profiles.map((profile) => profile.name)),
    legacyStyleIds,
    family: mode(profiles.map((profile) => profile.family))
  };

  for (const field of UNION_FIELDS) {
    direction[field] = stableUnique(profiles.flatMap((profile) => profile[field] ?? []));
  }

  direction.density = mode(profiles.map((profile) => profile.density));
  direction.firstViewport = mode(profiles.map((profile) => profile.firstViewport));
  direction.layoutRules = mode(profiles.map((profile) => profile.layoutRules));
  direction.typography = mode(profiles.map((profile) => profile.typography));
  direction.legacyReferences = uniqueLegacyReferences(profiles, visualsByStyleId);

  return direction;
}

function relativeLuminance(hexColor) {
  const normalized = hexColor.slice(1);
  const channels = [0, 2, 4].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16) / 255);
  const linear = channels.map((channel) => (
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  ));
  return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
}

function themeAppearance(tokens) {
  const surfaceLuminance = relativeLuminance(tokens.surface);
  const canvasLuminance = relativeLuminance(tokens.canvas);
  if (surfaceLuminance <= 0.25 && canvasLuminance <= 0.25) return "dark";
  if (surfaceLuminance >= 0.6 && canvasLuminance >= 0.6) return "light";
  return "mixed";
}

function parsedGeneratedPreview(styleId) {
  const withoutHash = styleId.replace(/-[0-9a-f]{8}$/u, "");
  const layouts = ["centered-hero", "dashboard-grid", "editorial-stack"];
  for (const layoutArchetype of layouts) {
    const marker = `-${layoutArchetype}-`;
    const markerIndex = withoutHash.indexOf(marker);
    if (markerIndex === -1) continue;
    const emphasis = withoutHash.slice(markerIndex + marker.length);
    if (!emphasis) continue;
    return {
      layoutArchetype,
      contentPattern: EMPHASIS_CONTENT_PATTERNS[emphasis] ?? `${emphasis}-content`,
      emphasis
    };
  }
  return null;
}

function createPreviewSpec(directionId, profiles, visualsByStyleId) {
  const legacyVariant = mode(profiles.map((profile) => visualsByStyleId.get(profile.id).variant));
  const parsed = mode(
    profiles.map((profile) => parsedGeneratedPreview(profile.id)).filter(Boolean)
  );
  const fallback = VARIANT_PREVIEW_DEFAULTS[legacyVariant];
  const override = DIRECTION_PREVIEW_OVERRIDES[directionId];
  const structure = override ?? VARIANT_CONTENT_STRUCTURES[legacyVariant];
  assert(fallback, `No preview defaults for legacy variant ${legacyVariant} (${directionId})`);
  assert(structure, `No preview content structure for legacy variant ${legacyVariant} (${directionId})`);

  const contentBlocks = [...structure.contentBlocks];
  const hierarchy = {
    primary: structure.hierarchy.primary,
    secondary: [...structure.hierarchy.secondary],
    supporting: [...structure.hierarchy.supporting]
  };
  const hierarchyBlocks = [hierarchy.primary, ...hierarchy.secondary, ...hierarchy.supporting];
  assert(
    stableUnique(contentBlocks).length === contentBlocks.length,
    `Preview contentBlocks must be unique for ${directionId}`
  );
  assert(
    stableUnique(hierarchyBlocks).length === hierarchyBlocks.length
      && stableUnique(hierarchyBlocks).join("\u0000") === stableUnique(contentBlocks).join("\u0000"),
    `Preview hierarchy must partition contentBlocks for ${directionId}`
  );

  return {
    directionId,
    legacyVariant,
    layoutArchetype: parsed?.layoutArchetype ?? fallback.layoutArchetype,
    contentPattern: override?.contentPattern ?? parsed?.contentPattern ?? directionId,
    emphasis: parsed?.emphasis ?? fallback.emphasis,
    contentBlocks,
    hierarchy
  };
}

export function buildCatalogV2Projection(profiles, visuals) {
  assert(Array.isArray(profiles), "catalog/style-profiles.json must contain an array");
  assert(Array.isArray(visuals), "catalog/style-visuals.json must contain an array");

  const profilesById = new Map();
  for (const profile of profiles) {
    assert(typeof profile?.id === "string" && profile.id.length > 0, "Every legacy profile must have an id");
    assert(!profilesById.has(profile.id), `Duplicate legacy profile id: ${profile.id}`);
    profilesById.set(profile.id, profile);
  }

  const visualsByStyleId = new Map();
  for (const visual of visuals) {
    assert(typeof visual?.styleId === "string" && visual.styleId.length > 0, "Every legacy visual must have a styleId");
    assert(!visualsByStyleId.has(visual.styleId), `Duplicate legacy visual styleId: ${visual.styleId}`);
    assert(profilesById.has(visual.styleId), `Legacy visual has no profile: ${visual.styleId}`);
    visualsByStyleId.set(visual.styleId, visual);
  }
  for (const profile of profiles) {
    assert(visualsByStyleId.has(profile.id), `Legacy profile has no visual: ${profile.id}`);
  }

  const directionGroups = new Map();
  for (const profile of profiles) {
    const directionId = resolveLegacyDirectionId(profile.id);
    const group = directionGroups.get(directionId) ?? [];
    group.push(profile);
    directionGroups.set(directionId, group);
  }

  const directions = [];
  const previewSpecs = [];
  for (const [directionId, group] of [...directionGroups.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const sortedGroup = [...group].sort((left, right) => left.id.localeCompare(right.id));
    directions.push(createDirection(directionId, sortedGroup, visualsByStyleId));
    previewSpecs.push(createPreviewSpec(directionId, sortedGroup, visualsByStyleId));
  }

  const themeGroups = new Map();
  for (const profile of profiles) {
    const visual = visualsByStyleId.get(profile.id);
    const tokens = normalizeThemeTokens(visual.theme, profile.id);
    const signature = themeSignature(tokens);
    const group = themeGroups.get(signature) ?? { tokens, profiles: [] };
    group.profiles.push(profile);
    themeGroups.set(signature, group);
  }

  const themes = [];
  const themeIdByLegacyStyleId = new Map();
  const sortedThemeGroups = [...themeGroups.entries()].sort(([left], [right]) => left.localeCompare(right));
  for (const [signature, group] of sortedThemeGroups) {
    const sortedProfiles = [...group.profiles].sort((left, right) => left.id.localeCompare(right.id));
    const sources = uniqueSources(sortedProfiles);
    const primaryProfile = sortedProfiles[0];
    const tokenHash = sha256(signature).slice(0, 12);
    const themeId = `theme-${tokenHash}`;
    const name = primaryProfile.sourceProvider === "daisyui-themes"
      ? `${titleCase(primaryProfile.sourceSlug)} Theme`
      : `${primaryProfile.name} Theme`;
    const legacyStyleIds = sortedProfiles.map((profile) => profile.id);

    themes.push({
      id: themeId,
      name,
      legacyStyleIds,
      tokens: group.tokens,
      palette: THEME_TOKEN_FIELDS.map((field) => `${field} ${group.tokens[field]}`),
      appearance: themeAppearance(group.tokens),
      tones: stableUnique(sortedProfiles.flatMap((profile) => profile.tones ?? [])),
      sources,
      legacyReferences: uniqueLegacyReferences(sortedProfiles, visualsByStyleId)
    });
    for (const legacyStyleId of legacyStyleIds) themeIdByLegacyStyleId.set(legacyStyleId, themeId);
  }
  themes.sort((left, right) => left.id.localeCompare(right.id));

  const linksByPair = new Map();
  const aliases = [];
  const defaultLegacyStyleIdByDirection = new Map(
    directions.map((direction) => [direction.id, direction.legacyStyleIds[0]])
  );

  for (const profile of [...profiles].sort((left, right) => left.id.localeCompare(right.id))) {
    const directionId = resolveLegacyDirectionId(profile.id);
    const themeId = themeIdByLegacyStyleId.get(profile.id);
    const isDefault = defaultLegacyStyleIdByDirection.get(directionId) === profile.id;
    const pairKey = `${directionId}\u0000${themeId}`;
    const existingLink = linksByPair.get(pairKey);
    linksByPair.set(pairKey, {
      directionId,
      themeId,
      isDefault: isDefault || existingLink?.isDefault === true
    });
    aliases.push({ legacyStyleId: profile.id, directionId, themeId });
  }
  const links = [...linksByPair.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, link]) => link);

  validateProjection({
    profiles,
    directions,
    themes,
    links,
    aliases,
    previewSpecs
  });

  return {
    directions: { schemaVersion: SCHEMA_VERSION, directions },
    themes: { schemaVersion: SCHEMA_VERSION, themes },
    directionThemes: { schemaVersion: SCHEMA_VERSION, links },
    aliases: { schemaVersion: SCHEMA_VERSION, aliases },
    previewSpecs: { schemaVersion: SCHEMA_VERSION, previewSpecs }
  };
}

function validateProjection({ profiles, directions, themes, links, aliases, previewSpecs }) {
  assert(aliases.length === profiles.length, `Expected ${profiles.length} aliases, received ${aliases.length}`);
  assert(previewSpecs.length === directions.length, "Every direction must have exactly one preview spec");

  const directionIds = new Set(directions.map((direction) => direction.id));
  const themeIds = new Set(themes.map((theme) => theme.id));
  assert(directionIds.size === directions.length, "Direction ids must be unique");
  assert(themeIds.size === themes.length, "Theme ids must be unique");

  const aliasesByLegacyId = new Map();
  for (const alias of aliases) {
    assert(!aliasesByLegacyId.has(alias.legacyStyleId), `Duplicate alias for ${alias.legacyStyleId}`);
    assert(directionIds.has(alias.directionId), `Alias references missing direction: ${alias.directionId}`);
    assert(themeIds.has(alias.themeId), `Alias references missing theme: ${alias.themeId}`);
    aliasesByLegacyId.set(alias.legacyStyleId, alias);
  }
  for (const profile of profiles) assert(aliasesByLegacyId.has(profile.id), `Missing alias for ${profile.id}`);

  const defaultCounts = new Map();
  const linkPairs = new Set();
  for (const link of links) {
    assert(directionIds.has(link.directionId), `Link references missing direction: ${link.directionId}`);
    assert(themeIds.has(link.themeId), `Link references missing theme: ${link.themeId}`);
    const pairKey = `${link.directionId}\u0000${link.themeId}`;
    assert(!linkPairs.has(pairKey), `Duplicate direction-theme link: ${link.directionId} / ${link.themeId}`);
    linkPairs.add(pairKey);
    if (link.isDefault) defaultCounts.set(link.directionId, (defaultCounts.get(link.directionId) ?? 0) + 1);
  }
  for (const alias of aliases) {
    assert(linkPairs.has(`${alias.directionId}\u0000${alias.themeId}`), `Alias has no matching direction-theme link: ${alias.legacyStyleId}`);
  }
  for (const directionId of directionIds) {
    assert(defaultCounts.get(directionId) === 1, `Direction ${directionId} must have exactly one default theme`);
  }

  const previewDirectionIds = new Set(previewSpecs.map((previewSpec) => previewSpec.directionId));
  assert(previewDirectionIds.size === previewSpecs.length, "Preview specs must have unique direction ids");
  for (const directionId of directionIds) {
    assert(previewDirectionIds.has(directionId), `Missing preview spec for ${directionId}`);
  }

}

function serialized(document) {
  return `${JSON.stringify(document, null, 2)}\n`;
}

function writeOrCheck(path, document) {
  const expected = serialized(document);
  if (CHECK_ONLY) {
    assert(existsSync(path), `Missing generated catalog projection: ${path}`);
    assert(readFileSync(path, "utf8").replace(/\r\n?/gu, "\n") === expected, `Stale generated catalog projection: ${path}`);
    return "verified";
  }

  const current = existsSync(path) ? readFileSync(path, "utf8").replace(/\r\n?/gu, "\n") : null;
  if (current === expected) return "unchanged";
  writeFileSync(path, expected, "utf8");
  return "written";
}

function main() {
  const profiles = readJson(INPUT_PATHS.profiles);
  const visuals = readJson(INPUT_PATHS.visuals);
  const projection = buildCatalogV2Projection(profiles, visuals);
  const results = [];

  for (const [key, path] of Object.entries(OUTPUT_PATHS)) {
    results.push(`${writeOrCheck(path, projection[key])}: ${path}`);
  }

  const counts = {
    legacyStyles: profiles.length,
    directions: projection.directions.directions.length,
    themes: projection.themes.themes.length,
    directionThemes: projection.directionThemes.links.length,
    aliases: projection.aliases.aliases.length,
    previewSpecs: projection.previewSpecs.previewSpecs.length
  };
  process.stdout.write(`${results.join("\n")}\n${JSON.stringify(counts)}\n`);
}

const IS_ENTRYPOINT = typeof process.argv[1] === "string"
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_ENTRYPOINT) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
