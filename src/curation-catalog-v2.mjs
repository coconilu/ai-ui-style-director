import { createHash } from "node:crypto";
import {
  pinnedProviderSourceUrl,
  resolveProviderAdapter
} from "./provider-adapters.mjs";

export const CURATION_THEME_FIELDS = Object.freeze([
  "canvas",
  "surface",
  "surfaceAlt",
  "text",
  "muted",
  "accent",
  "border"
]);

const REFERENCE_ROLES = Object.freeze({
  color: "color-system reference",
  "content-hierarchy": "content-hierarchy reference",
  density: "information-density reference",
  interaction: "interaction-pattern reference",
  layout: "layout-structure reference",
  navigation: "navigation-model reference",
  "product-proof": "product-proof reference",
  typography: "typography-system reference"
});

const PREVIEW_BLOCKS = Object.freeze({
  "app-shell": ["work-queue", "navigation", "detail-panel", "primary-action"],
  "catalog-grid": ["product-discovery", "product-detail", "trust-signal", "purchase-action"],
  "centered-hero": ["hero-message", "product-proof", "trust-signal", "primary-action"],
  "dashboard-grid": ["data-view", "metric-summary", "work-queue", "primary-action"],
  "editorial-stack": ["hero-message", "story-proof", "content-list", "primary-action"],
  "learning-path": ["learning-content", "progress-summary", "next-step", "supporting-resource"],
  "research-note": ["research-question", "evidence", "benchmark", "methodology"],
  "split-hero": ["hero-message", "product-proof", "feature-summary", "primary-action"],
  timeline: ["timeline-event", "progress-summary", "detail-panel", "primary-action"]
});

const STRUCTURE_FIELDS = Object.freeze([
  // Layout and emphasis define the reusable Direction. Palette and tones are
  // deliberately absent because they belong to the Theme decision.
  ["composition", 6],
  ["emphasis", 4],
  ["family", 3],
  ["pageTypes", 1.5],
  ["goals", 1.5],
  ["audiences", 1],
  ["density", 1],
  ["keywords", 0.5]
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function titleToken(value) {
  return String(value || "")
    .split(/[-_.\s]+/u)
    .filter(Boolean)
    .map((token) => `${token.charAt(0).toUpperCase()}${token.slice(1)}`)
    .join(" ");
}

function normalizedWords(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .trim()
    .split(/\s+/u)
    .filter((word) => word.length > 0);
}

function fieldTokens(profile, field) {
  const raw = field === "composition"
    ? (profile?.composition ?? profile?.layoutArchetype)
    : profile?.[field];
  const values = Array.isArray(raw) ? raw : [raw];
  return new Set(values.flatMap(normalizedWords));
}

export function directionStructureSimilarity(left, right) {
  let intersection = 0;
  let union = 0;
  for (const [field, weight] of STRUCTURE_FIELDS) {
    const leftTokens = fieldTokens(left, field);
    const rightTokens = fieldTokens(right, field);
    const tokens = new Set([...leftTokens, ...rightTokens]);
    for (const token of tokens) {
      const inLeft = leftTokens.has(token);
      const inRight = rightTokens.has(token);
      if (inLeft && inRight) intersection += weight;
      if (inLeft || inRight) union += weight;
    }
  }
  return union === 0 ? 0 : intersection / union;
}

export function findNearestDirection(profile, directions, previewSpecs = []) {
  const previewByDirection = new Map(
    (Array.isArray(previewSpecs) ? previewSpecs : []).map((previewSpec) => [previewSpec.directionId, previewSpec])
  );
  return (Array.isArray(directions) ? directions : [])
    .map((direction) => {
      const previewSpec = previewByDirection.get(direction.id);
      const structuralDirection = previewSpec
        ? {
            ...direction,
            composition: previewSpec.layoutArchetype,
            emphasis: previewSpec.emphasis
          }
        : direction;
      return {
        directionId: direction.id,
        score: directionStructureSimilarity(profile, structuralDirection)
      };
    })
    .sort((left, right) => (
      right.score - left.score
      || left.directionId.localeCompare(right.directionId, "en")
    ))[0] || { directionId: null, score: 0 };
}

function hexChannels(value) {
  if (!/^#[0-9a-f]{6}$/iu.test(value || "")) return null;
  return [1, 3, 5].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
}

export function themeTokenDistance(left, right) {
  if (!left || !right) return null;
  let total = 0;
  for (const field of CURATION_THEME_FIELDS) {
    const leftChannels = hexChannels(left[field]);
    const rightChannels = hexChannels(right[field]);
    if (!leftChannels || !rightChannels) return null;
    const squared = leftChannels.reduce(
      (sum, channel, index) => sum + (channel - rightChannels[index]) ** 2,
      0
    );
    total += Math.sqrt(squared) / (Math.sqrt(3) * 255);
  }
  return total / CURATION_THEME_FIELDS.length;
}

export function deterministicThemeId(tokens) {
  const signature = JSON.stringify(
    CURATION_THEME_FIELDS.map((field) => [field, String(tokens?.[field] || "").toUpperCase()])
  );
  return `theme-${sha256(signature).slice(0, 12)}`;
}

export function deterministicDirectionId(profile) {
  const signature = JSON.stringify({
    family: profile.family,
    pageTypes: [...profile.pageTypes].sort(),
    audiences: [...profile.audiences].sort(),
    goals: [...profile.goals].sort(),
    density: profile.density,
    keywords: [...profile.keywords].sort(),
    componentKits: [...profile.componentKits].sort(),
    composition: profile.composition,
    emphasis: profile.emphasis,
    typographyStyle: profile.typographyStyle,
    spacing: profile.spacing,
    motion: profile.motion
  });
  return `${profile.family}-${profile.composition}-${profile.emphasis}-${sha256(signature).slice(0, 12)}`;
}

function relativeLuminance(value) {
  const channels = hexChannels(value);
  if (!channels) return Number.NaN;
  const linear = channels.map((byte) => {
    const channel = byte / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
}

function themeAppearance(tokens) {
  const canvas = relativeLuminance(tokens.canvas);
  const surface = relativeLuminance(tokens.surface);
  if (canvas <= 0.25 && surface <= 0.25) return "dark";
  if (canvas >= 0.6 && surface >= 0.6) return "light";
  return "mixed";
}

function sourceKey(source) {
  return `${source.providerId}\u0000${source.path}`;
}

function sourceSlug(source, adapter) {
  const adapterSlug = typeof adapter.sourceSlug === "function" ? adapter.sourceSlug(source.path) : null;
  if (adapterSlug) return adapterSlug;
  const awesomeSlug = source.path.match(/^design-md\/([a-z0-9]+(?:[._-][a-z0-9]+)*)\/DESIGN\.md$/u)?.[1];
  return awesomeSlug || `source-${source.contentHash.slice("sha256:".length, "sha256:".length + 8)}`;
}

function pinnedMetadata(source, { inventory, providers }) {
  const provider = providers.find((candidate) => candidate.id === source.providerId);
  const snapshot = inventory.providers.find((candidate) => candidate.id === source.providerId);
  const adapter = resolveProviderAdapter(provider);
  const repo = provider?.repo;
  const revision = snapshot?.revision;
  const sourceUrl = pinnedProviderSourceUrl({ repo, revision, path: source.path });
  if (!provider || !sourceUrl || !/^sha256:[0-9a-f]{64}$/u.test(source.contentHash || "")) {
    throw new Error(`Cannot pin canonical provenance for ${source.providerId}/${source.path}.`);
  }
  return {
    slug: sourceSlug(source, adapter),
    repo,
    revision,
    contentHash: source.contentHash,
    sourceUrl
  };
}

function pinnedReference(reference, index, context) {
  const indexed = context.styleSources.sources.find((source) => sourceKey(source) === sourceKey(reference));
  if (!indexed) throw new Error(`Unknown canonical reference: ${reference.providerId}/${reference.path}`);
  const metadata = pinnedMetadata(indexed, context);
  return {
    provider: reference.providerId,
    slug: metadata.slug,
    path: reference.path,
    repo: metadata.repo,
    revision: metadata.revision,
    contentHash: metadata.contentHash,
    sourceUrl: metadata.sourceUrl,
    label: `${titleToken(reference.providerId)} reference ${index + 1}`,
    role: REFERENCE_ROLES[reference.role]
  };
}

function generatedRisks(profile) {
  if (profile.spacing === "compact") {
    return ["Compact spacing can reduce clarity when too many secondary states are shown."];
  }
  if (profile.motion === "expressive") {
    return ["Expressive motion can distract from product evidence when overused."];
  }
  return ["The direction still requires domain-specific content, evidence, and accessibility review."];
}

function canonicalDirection(candidate, directionId) {
  const profile = candidate.profile;
  return {
    id: directionId,
    name: `${titleToken(profile.family)} ${titleToken(profile.composition)} ${titleToken(profile.emphasis)}`,
    legacyStyleIds: [],
    family: profile.family,
    pageTypes: profile.pageTypes,
    audiences: profile.audiences,
    goals: profile.goals,
    tones: profile.tones,
    keywords: profile.keywords,
    bestFor: profile.pageTypes.slice(0, 4).map((value) => `${titleToken(value)} interfaces`),
    avoidFor: [
      "Projects that require a different information-density policy.",
      "Interfaces whose primary emphasis conflicts with this direction."
    ],
    componentKits: profile.componentKits,
    risks: generatedRisks(profile),
    density: profile.density,
    firstViewport: `Use a ${titleToken(profile.composition).toLowerCase()} composition with ${titleToken(profile.emphasis).toLowerCase()} as the dominant proof.`,
    layoutRules: [
      `Use the governed ${profile.composition} composition.`,
      `Keep ${profile.emphasis} visually dominant.`,
      `Use ${profile.spacing} spacing and ${profile.motion} motion.`
    ],
    typography: `Use the governed ${titleToken(profile.typographyStyle).toLowerCase()} typography system.`,
    legacyReferences: []
  };
}

function canonicalPreviewSpec(candidate, directionId) {
  const blocks = PREVIEW_BLOCKS[candidate.profile.composition] || PREVIEW_BLOCKS["split-hero"];
  return {
    directionId,
    layoutArchetype: candidate.profile.composition,
    contentPattern: directionId,
    emphasis: candidate.profile.emphasis,
    contentBlocks: blocks,
    hierarchy: {
      primary: blocks[0],
      secondary: blocks.slice(1, 3),
      supporting: blocks.slice(3)
    }
  };
}

function canonicalTheme(candidate, source, context) {
  const tokens = Object.fromEntries(
    CURATION_THEME_FIELDS.map((field) => [field, candidate.visual.theme[field].toUpperCase()])
  );
  const metadata = pinnedMetadata(source, context);
  return {
    id: deterministicThemeId(tokens),
    name: `${titleToken(metadata.slug)} Theme`,
    legacyStyleIds: [],
    tokens,
    palette: CURATION_THEME_FIELDS.map((field) => `${field} ${tokens[field]}`),
    appearance: themeAppearance(tokens),
    tones: candidate.profile.tones,
    sources: [{
      kind: "source-pinned",
      provider: source.providerId,
      slug: metadata.slug,
      path: source.path,
      repo: metadata.repo,
      revision: metadata.revision,
      contentHash: metadata.contentHash,
      sourceUrl: metadata.sourceUrl
    }],
    legacyReferences: []
  };
}

export function resolveHistoricalSelection({ previousStateEntry, directions, themes, aliases }) {
  const directionIds = new Set(previousStateEntry?.directionIds || []);
  const themeIds = new Set(previousStateEntry?.themeIds || []);
  const directionById = new Set(directions.map((direction) => direction.id));
  const themeById = new Set(themes.map((theme) => theme.id));
  const aliasByStyleId = new Map(aliases.map((alias) => [alias.legacyStyleId, alias]));
  for (const styleId of previousStateEntry?.styleIds || []) {
    const alias = aliasByStyleId.get(styleId);
    if (alias) {
      directionIds.add(alias.directionId);
      themeIds.add(alias.themeId);
    }
  }
  return {
    directionIds: [...directionIds].filter((id) => directionById.has(id)).sort(),
    themeIds: [...themeIds].filter((id) => themeById.has(id)).sort()
  };
}

function nearestLinkedTheme(directionId, tokens, { links, themes }) {
  const linkedThemeIds = new Set(
    links.filter((link) => link.directionId === directionId).map((link) => link.themeId)
  );
  return themes
    .filter((theme) => linkedThemeIds.has(theme.id))
    .map((theme) => ({ themeId: theme.id, distance: themeTokenDistance(tokens, theme.tokens) }))
    .filter((item) => item.distance !== null)
    .sort((left, right) => left.distance - right.distance || left.themeId.localeCompare(right.themeId, "en"))[0]
    || { themeId: null, distance: null };
}

function invalidPlan({ directionCheck, themeCheck, reason }) {
  return {
    decision: "invalid",
    result: {
      action: "invalid",
      directionId: null,
      themeId: null
    },
    promotion: null,
    additions: { directions: [], themes: [], links: [], previewSpecs: [] },
    checks: { direction: directionCheck, theme: themeCheck },
    reason
  };
}

export function planCatalogV2Promotion({
  candidate,
  source,
  sourceDocument,
  capabilities,
  catalog,
  allowedDirectionIds = [],
  previousStateEntry = null,
  styleSources,
  inventory,
  providers,
  directionThreshold,
  themeThreshold
}) {
  const context = { styleSources, inventory, providers };
  const historical = resolveHistoricalSelection({
    previousStateEntry,
    directions: catalog.directions,
    themes: catalog.themes,
    aliases: catalog.aliases
  });
  const isThemeOnly = !capabilities.createDirection;
  const allowed = new Set(allowedDirectionIds);
  const matchableDirections = isThemeOnly && historical.directionIds.length === 0
    ? catalog.directions.filter((direction) => allowed.has(direction.id))
    : catalog.directions;
  const nearest = findNearestDirection(candidate.profile, matchableDirections, catalog.previewSpecs);
  let directionId = null;
  let directionBasis = "nearest";
  let createDirection = false;

  if (historical.directionIds.length > 1) {
    return invalidPlan({
      directionCheck: {
        threshold: directionThreshold,
        basis: "state-alias",
        nearestDirectionId: nearest.directionId,
        score: Number(nearest.score.toFixed(6)),
        selectedDirectionId: null,
        passed: false
      },
      themeCheck: {
        threshold: themeThreshold,
        nearestThemeId: null,
        distance: null,
        duplicate: false,
        passed: false
      },
      reason: "Historical source state resolves to more than one Direction."
    });
  }
  if (historical.directionIds.length === 1) {
    directionId = historical.directionIds[0];
    directionBasis = "state-alias";
  } else if (nearest.directionId && nearest.score >= directionThreshold) {
    directionId = nearest.directionId;
  } else if (capabilities.createDirection && capabilities.createTheme) {
    directionId = deterministicDirectionId(candidate.profile);
    createDirection = !catalog.directions.some((direction) => direction.id === directionId);
    directionBasis = createDirection ? "created" : "nearest";
  }

  const directionCheck = {
    threshold: directionThreshold,
    basis: directionBasis,
    nearestDirectionId: nearest.directionId,
    score: Number(nearest.score.toFixed(6)),
    selectedDirectionId: directionId,
    passed: Boolean(directionId) && (!isThemeOnly || directionBasis === "state-alias" || allowed.has(directionId))
  };
  const emptyThemeCheck = {
    threshold: themeThreshold,
    nearestThemeId: null,
    distance: null,
    duplicate: false,
    passed: false
  };
  if (!directionCheck.passed) {
    return invalidPlan({
      directionCheck,
      themeCheck: emptyThemeCheck,
      reason: "Source capability requires a sufficiently similar existing Direction."
    });
  }
  if (!capabilities.createTheme) {
    return invalidPlan({
      directionCheck,
      themeCheck: emptyThemeCheck,
      reason: "Provider capability does not allow Theme creation or linking."
    });
  }

  const tokens = sourceDocument.candidateTheme || candidate.visual.theme;
  const nearestTheme = nearestLinkedTheme(directionId, tokens, catalog);
  const duplicate = nearestTheme.distance !== null && nearestTheme.distance <= themeThreshold;
  const themeCheck = {
    threshold: themeThreshold,
    nearestThemeId: nearestTheme.themeId,
    distance: nearestTheme.distance === null ? null : Number(nearestTheme.distance.toFixed(6)),
    duplicate,
    passed: !duplicate
  };
  if (duplicate) {
    return {
      decision: "duplicate",
      result: { action: "duplicate-theme", directionId, themeId: nearestTheme.themeId },
      promotion: null,
      additions: { directions: [], themes: [], links: [], previewSpecs: [] },
      checks: { direction: directionCheck, theme: themeCheck },
      reason: "Theme tokens duplicate an existing Theme linked to the selected Direction."
    };
  }

  const theme = canonicalTheme(candidate, source, context);
  const existingTheme = catalog.themes.find((candidateTheme) => candidateTheme.id === theme.id) || null;
  const additions = {
    directions: createDirection ? [canonicalDirection(candidate, directionId)] : [],
    themes: existingTheme ? [] : [theme],
    links: [{ directionId, themeId: theme.id, isDefault: createDirection }],
    previewSpecs: createDirection ? [canonicalPreviewSpec(candidate, directionId)] : []
  };
  const action = createDirection
    ? (existingTheme ? "created-direction-with-existing-theme" : "created-direction-and-theme")
    : (existingTheme ? "linked-existing-theme" : "added-theme-to-direction");
  return {
    decision: "promoted",
    result: { action, directionId, themeId: theme.id },
    promotion: { action, directionId, themeId: theme.id },
    additions,
    checks: { direction: directionCheck, theme: themeCheck },
    reason: createDirection
      ? (existingTheme
          ? "Created a canonical Direction and PreviewSpec, then linked an existing canonical Theme."
          : "Created a canonical Direction, Theme, link, and PreviewSpec.")
      : (existingTheme
          ? "Linked an existing canonical Theme to the selected canonical Direction."
          : "Added a non-duplicate Theme to the selected canonical Direction.")
  };
}
