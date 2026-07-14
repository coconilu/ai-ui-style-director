import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deterministicDirectionId,
  deterministicThemeId,
  directionStructureSimilarity,
  planCatalogV2Promotion
} from "../src/curation-catalog-v2.mjs";

const HASH = `sha256:${"a".repeat(64)}`;
const REVISION = "b".repeat(40);

function profile(overrides = {}) {
  return {
    family: "developer",
    experienceType: "admin-console",
    pageTypes: ["dashboard", "internal-tool"],
    audiences: ["developers", "operators"],
    goals: ["daily-operation", "monitoring"],
    density: "high",
    tones: ["technical", "precise"],
    keywords: ["terminal", "metrics"],
    componentKits: ["shadcn-ui"],
    composition: "app-shell",
    emphasis: "workflow",
    typographyStyle: "compact-ui",
    spacing: "compact",
    motion: "restrained",
    ...overrides
  };
}

function tokens(overrides = {}) {
  return {
    canvas: "#090B10",
    surface: "#111722",
    surfaceAlt: "#1A2432",
    text: "#F4F7FA",
    muted: "#8B98A8",
    accent: "#36C275",
    border: "#2A394B",
    ...overrides
  };
}

function candidate({ candidateProfile = profile(), theme = tokens() } = {}) {
  return {
    decision: "promote",
    rationale: "Reusable governed source.",
    profile: candidateProfile,
    visual: {
      variant: "developer",
      theme,
      references: []
    }
  };
}

function direction(id = "developer-operations-shell") {
  return {
    id,
    name: "Developer Operations Shell",
    family: "developer",
    experienceType: "admin-console",
    pageTypes: ["dashboard", "internal-tool"],
    audiences: ["developers", "operators"],
    goals: ["daily-operation", "monitoring"],
    density: "high",
    tones: ["technical", "precise"],
    keywords: ["terminal", "metrics"],
    componentKits: ["shadcn-ui"]
  };
}

function canonicalTheme(themeTokens = tokens()) {
  return {
    id: deterministicThemeId(themeTokens),
    tokens: themeTokens
  };
}

function context({
  directions = [direction()],
  themes = [],
  links = [],
  previewSpecs = [{
    directionId: "developer-operations-shell",
    layoutArchetype: "app-shell",
    emphasis: "workflow"
  }]
} = {}) {
  const source = {
    providerId: "example-styles",
    path: "styles/new/DESIGN.md",
    sourceType: "design-md",
    contentHash: HASH
  };
  return {
    source,
    sourceDocument: { candidateTheme: null },
    catalog: { directions, themes, links, previewSpecs, aliases: [] },
    styleSources: { sources: [source] },
    inventory: { providers: [{ id: "example-styles", revision: REVISION }] },
    providers: [{ id: "example-styles", adapter: "generic-design-md", repo: "example/styles" }],
    directionThreshold: 0.85,
    themeThreshold: 0.04
  };
}

test("Direction structural similarity ignores palette/tones and gives layout plus emphasis high weight", () => {
  const left = profile();
  const sameStructure = {
    ...direction(),
    composition: "app-shell",
    emphasis: "workflow",
    tones: ["playful"],
    palette: ["unrelated color"]
  };
  const differentLayout = {
    ...sameStructure,
    composition: "centered-hero",
    emphasis: "story"
  };
  const differentExperienceType = {
    ...sameStructure,
    experienceType: "consumer-app"
  };
  assert.equal(directionStructureSimilarity(left, sameStructure), 1);
  assert.equal(directionStructureSimilarity(left, differentExperienceType) < 1, true);
  assert.equal(directionStructureSimilarity(left, differentExperienceType) >= 0.85, true);
  assert.equal(directionStructureSimilarity(left, differentLayout) < 0.85, true);
});

test("Direction IDs exclude experienceType to preserve prompt-v1 temporal compatibility", () => {
  assert.equal(
    deterministicDirectionId(profile({ experienceType: "admin-console" })),
    deterministicDirectionId(profile({ experienceType: "consumer-app" }))
  );
});

test("Theme-only source adds a new Theme to an allowed existing Direction", () => {
  const base = context();
  const plan = planCatalogV2Promotion({
    ...base,
    candidate: candidate({
      candidateProfile: profile({ experienceType: "consumer-app" }),
      theme: tokens({ accent: "#F97316" })
    }),
    capabilities: { createDirection: false, createTheme: true },
    allowedDirectionIds: ["developer-operations-shell"]
  });
  assert.deepEqual(plan.result, {
    action: "added-theme-to-direction",
    directionId: "developer-operations-shell",
    themeId: deterministicThemeId(tokens({ accent: "#F97316" }))
  });
  assert.equal(plan.additions.directions.length, 0);
  assert.equal(plan.additions.themes.length, 1);
  assert.equal(plan.additions.links.length, 1);
  assert.equal(base.catalog.directions[0].experienceType, "admin-console");
});

test("Theme duplicate detection is scoped to the selected Direction", () => {
  const theme = canonicalTheme();
  const base = context({
    themes: [theme],
    links: [{ directionId: "developer-operations-shell", themeId: theme.id, isDefault: true }]
  });
  const plan = planCatalogV2Promotion({
    ...base,
    candidate: candidate(),
    capabilities: { createDirection: false, createTheme: true },
    allowedDirectionIds: ["developer-operations-shell"]
  });
  assert.equal(plan.decision, "duplicate");
  assert.deepEqual(plan.result, {
    action: "duplicate-theme",
    directionId: "developer-operations-shell",
    themeId: theme.id
  });
  assert.deepEqual(plan.additions, { directions: [], themes: [], links: [], previewSpecs: [] });
});

test("structurally novel Theme-only source cannot create a Direction", () => {
  const base = context();
  const plan = planCatalogV2Promotion({
    ...base,
    candidate: candidate({
      candidateProfile: profile({
        family: "marketing",
        pageTypes: ["landing"],
        audiences: ["consumers"],
        goals: ["conversion"],
        density: "low",
        keywords: ["campaign"],
        composition: "centered-hero",
        emphasis: "story"
      })
    }),
    capabilities: { createDirection: false, createTheme: true },
    allowedDirectionIds: ["developer-operations-shell"]
  });
  assert.equal(plan.decision, "invalid");
  assert.deepEqual(plan.result, { action: "invalid", directionId: null, themeId: null });
  assert.equal(plan.additions.directions.length, 0);
});

test("generic source creates deterministic canonical Direction, Theme, link, and PreviewSpec", () => {
  const base = context({ directions: [], previewSpecs: [] });
  const input = {
    ...base,
    candidate: candidate(),
    capabilities: { createDirection: true, createTheme: true },
    allowedDirectionIds: []
  };
  const first = planCatalogV2Promotion(input);
  const second = planCatalogV2Promotion(input);
  assert.deepEqual(first, second);
  assert.equal(first.result.action, "created-direction-and-theme");
  assert.deepEqual(
    Object.fromEntries(Object.entries(first.additions).map(([key, values]) => [key, values.length])),
    { directions: 1, themes: 1, links: 1, previewSpecs: 1 }
  );
  assert.deepEqual(first.additions.directions[0].legacyReferences, []);
  assert.equal(first.additions.directions[0].experienceType, "admin-console");
  assert.deepEqual(first.additions.themes[0].legacyReferences, []);
  assert.equal("legacyVariant" in first.additions.previewSpecs[0], false);
  assert.deepEqual(first.additions.themes[0].sources[0], {
    kind: "source-pinned",
    provider: "example-styles",
    slug: "source-aaaaaaaa",
    path: "styles/new/DESIGN.md",
    repo: "example/styles",
    revision: REVISION,
    contentHash: HASH,
    sourceUrl: `https://github.com/example/styles/blob/${REVISION}/styles/new/DESIGN.md`
  });
});

test("generic repeat Direction adds only a Theme; historical state keeps its Direction anchor", () => {
  const base = context();
  const newTheme = tokens({ accent: "#F97316" });
  const repeated = planCatalogV2Promotion({
    ...base,
    candidate: candidate({ theme: newTheme }),
    capabilities: { createDirection: true, createTheme: true },
    allowedDirectionIds: ["developer-operations-shell"]
  });
  assert.equal(repeated.result.action, "added-theme-to-direction");
  assert.equal(repeated.additions.directions.length, 0);
  assert.equal(repeated.additions.previewSpecs.length, 0);

  const changed = planCatalogV2Promotion({
    ...base,
    candidate: candidate({
      candidateProfile: profile({ composition: "centered-hero", emphasis: "story" }),
      theme: newTheme
    }),
    capabilities: { createDirection: false, createTheme: true },
    allowedDirectionIds: [],
    previousStateEntry: { directionIds: ["developer-operations-shell"], themeIds: [], styleIds: [] }
  });
  assert.equal(changed.result.directionId, "developer-operations-shell");
  assert.equal(changed.checks.direction.basis, "state-alias");
});

test("matching an existing Direction never overwrites its experienceType", () => {
  const existing = direction();
  const base = context({ directions: [existing] });
  const plan = planCatalogV2Promotion({
    ...base,
    candidate: candidate({
      candidateProfile: profile({ experienceType: "consumer-app" }),
      theme: tokens({ accent: "#F97316" })
    }),
    capabilities: { createDirection: true, createTheme: true },
    allowedDirectionIds: [existing.id]
  });
  assert.equal(plan.result.action, "added-theme-to-direction");
  assert.equal(plan.result.directionId, existing.id);
  assert.deepEqual(plan.additions.directions, []);
  assert.equal(existing.experienceType, "admin-console");
});

test("new Direction reusing a global Theme has an explicit auditable action", () => {
  const theme = canonicalTheme();
  const base = context({ directions: [], themes: [theme], previewSpecs: [] });
  const plan = planCatalogV2Promotion({
    ...base,
    candidate: candidate(),
    capabilities: { createDirection: true, createTheme: true },
    allowedDirectionIds: []
  });
  assert.equal(plan.result.action, "created-direction-with-existing-theme");
  assert.equal(plan.additions.directions.length, 1);
  assert.equal(plan.additions.themes.length, 0);
  assert.equal(plan.additions.links.length, 1);
  assert.equal(plan.additions.previewSpecs.length, 1);
});
