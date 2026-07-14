import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { validateCuratedCatalog } from "../scripts/validate-curated-catalog.mjs";
import { renderRecommendationGalleryHtml, renderRecommendations } from "../src/core.mjs";
import {
  buildStyleSourceRecords,
  declaredProviderCapabilities,
  expandProviderReference,
  hashStyleSourceContent,
  isSafeRelativePath,
  loadStyleSourceDocument,
  resolveProviderAdapter,
  resolveProviderCapabilities,
  visualReferenceSource
} from "../src/provider-adapters.mjs";
import { expandVisualReferences } from "../src/preview.mjs";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");

const DAISYUI_RETRO_THEME = `color-scheme: light;
--color-base-100: oklch(91.637% 0.034 90.515);
--color-base-200: oklch(88.272% 0.049 91.774);
--color-base-300: oklch(84.133% 0.065 90.856);
--color-base-content: oklch(41% 0.112 45.904);
--color-primary: oklch(80% 0.114 19.571);
--color-primary-content: oklch(39% 0.141 25.723);
--color-secondary: oklch(92% 0.084 155.995);
--color-secondary-content: oklch(44% 0.119 151.328);
--color-accent: oklch(68% 0.162 75.834);
--color-accent-content: oklch(41% 0.112 45.904);
--color-neutral: oklch(44% 0.011 73.639);
--color-neutral-content: oklch(86% 0.005 56.366);
--color-info: oklch(58% 0.158 241.966);
--color-info-content: oklch(96% 0.059 95.617);
--color-success: oklch(51% 0.096 186.391);
--color-success-content: oklch(96% 0.059 95.617);
--color-warning: oklch(64% 0.222 41.116);
--color-warning-content: oklch(96% 0.059 95.617);
--color-error: oklch(70% 0.191 22.216);
--color-error-content: oklch(40% 0.123 38.172);
--radius-selector: 0.25rem;
--radius-field: 0.25rem;
--radius-box: 0.5rem;
--size-selector: 0.25rem;
--size-field: 0.25rem;
--border: 1px;
--depth: 0;
--noise: 0;
`;

function daisyuiFixture(content = DAISYUI_RETRO_THEME) {
  const dir = mkdtempSync(join(tmpdir(), "style-director-daisyui-adapter-"));
  const path = "packages/daisyui/src/themes/retro.css";
  const sourcePath = join(dir, ...path.split("/"));
  mkdirSync(dirname(sourcePath), { recursive: true });
  writeFileSync(sourcePath, content, "utf8");
  return {
    dir,
    path,
    sourcePath,
    provider: { id: "daisyui", adapter: "daisyui-theme-css" }
  };
}

test("generic design-md adapter builds stable content-hashed source records", () => {
  const dir = mkdtempSync(join(tmpdir(), "style-director-provider-adapter-"));
  const sourcePath = join(dir, "styles", "calm", "DESIGN.md");
  mkdirSync(dirname(sourcePath), { recursive: true });
  writeFileSync(sourcePath, "# Calm\r\n\r\nA quiet interface.\r\n", "utf8");
  const windowsHash = hashStyleSourceContent(sourcePath);
  writeFileSync(sourcePath, "# Calm\n\nA quiet interface.\n", "utf8");
  assert.equal(hashStyleSourceContent(sourcePath), windowsHash);

  const records = buildStyleSourceRecords({
    provider: { id: "example-styles", adapter: "generic-design-md" },
    providerDir: dir,
    paths: ["styles/calm/DESIGN.md"]
  });
  assert.deepEqual(records, [
    {
      providerId: "example-styles",
      path: "styles/calm/DESIGN.md",
      sourceType: "design-md",
      contentHash: windowsHash
    }
  ]);
  assert.equal(resolveProviderAdapter({ id: "another-provider" }).id, "generic-design-md");
  assert.throws(
    () => resolveProviderAdapter({ id: "bad-provider", adapter: "not-real" }),
    /Unknown provider adapter/u
  );
});

test("curation capabilities are the intersection of provider declaration and adapter maximum", () => {
  assert.deepEqual(
    resolveProviderCapabilities({ id: "generic", adapter: "generic-design-md" }),
    { createDirection: true, createTheme: true }
  );
  assert.deepEqual(
    resolveProviderCapabilities({ id: "awesome-design-md", adapter: "awesome-design-md" }),
    { createDirection: true, createTheme: true }
  );
  assert.deepEqual(
    resolveProviderCapabilities({ id: "daisyui", adapter: "daisyui-theme-css" }),
    { createDirection: false, createTheme: true }
  );
  assert.deepEqual(
    resolveProviderCapabilities({
      id: "generic-theme-only",
      adapter: "generic-design-md",
      capabilities: { createDirection: false, createTheme: true }
    }),
    { createDirection: false, createTheme: true }
  );
  assert.deepEqual(
    resolveProviderCapabilities({
      id: "daisyui",
      adapter: "daisyui-theme-css",
      capabilities: { createDirection: true, createTheme: true }
    }),
    { createDirection: false, createTheme: true }
  );
  assert.deepEqual(declaredProviderCapabilities(["theme"]), {
    createDirection: false,
    createTheme: true
  });
  assert.throws(
    () => declaredProviderCapabilities(["theme", "theme"]),
    /unique direction\/theme tokens/u
  );
  assert.throws(
    () => declaredProviderCapabilities(["theme", "unknown"]),
    /unique direction\/theme tokens/u
  );
  assert.throws(
    () => declaredProviderCapabilities({ createDirection: true }),
    /boolean createDirection and createTheme/u
  );
  assert.throws(
    () => declaredProviderCapabilities({ createDirection: true, createTheme: true, extra: false }),
    /boolean createDirection and createTheme/u
  );
});

test("daisyUI adapter matches only exact theme CSS paths", () => {
  const adapter = resolveProviderAdapter({ id: "daisyui", adapter: "daisyui-theme-css" });
  assert.equal(adapter.id, "daisyui-theme-css");
  assert.equal(adapter.sourceType, "theme-css");
  assert.equal(adapter.matchesStyleSource("packages/daisyui/src/themes/retro.css", "retro.css"), true);
  assert.equal(adapter.sourceSlug("packages/daisyui/src/themes/retro.css"), "retro");
  assert.equal(adapter.sourceSlug("packages/daisyui/src/themes/nested/retro.css"), null);
  assert.equal(adapter.matchesStyleSource("packages/daisyui/src/themes/new-theme.css", "new-theme.css"), true);
  assert.equal(adapter.matchesStyleSource("packages/daisyui/src/themes/nested/retro.css", "retro.css"), false);
  assert.equal(adapter.matchesStyleSource("packages/daisyui/src/themes/RETRO.css", "RETRO.css"), false);
  assert.equal(adapter.matchesStyleSource("packages/daisyui/src/themes/retro.css.js", "retro.css.js"), false);
  assert.equal(adapter.matchesStyleSource("themes/retro.css", "retro.css"), false);
});

test("provider source paths reject traversal and absolute path forms", () => {
  assert.equal(isSafeRelativePath("packages/daisyui/src/themes/retro.css"), true);
  assert.equal(isSafeRelativePath("../etc/passwd"), false);
  assert.equal(isSafeRelativePath("/absolute"), false);
  assert.equal(isSafeRelativePath("C:\\absolute"), false);
  assert.equal(isSafeRelativePath("C:/absolute"), false);
});

test("daisyUI theme CSS normalizes to stable canonical JSON and a governed candidate theme", () => {
  const fixture = daisyuiFixture();
  const document = loadStyleSourceDocument({
    provider: fixture.provider,
    providerDir: fixture.dir,
    path: fixture.path
  });
  const canonical = JSON.parse(document.content);

  assert.equal(document.sourceType, "theme-css");
  assert.equal(document.adapterId, "daisyui-theme-css");
  assert.equal(document.normalizerVersion, 1);
  assert.equal(document.contentHash, "sha256:3df3c0698659c53891c55b4e03bd7bea2ed146af05d80862a2905b1cb6355234");
  assert.equal(canonical.schemaVersion, 1);
  assert.equal(canonical.adapter, "daisyui-theme-css");
  assert.equal(canonical.sourceType, "theme-css");
  assert.equal(canonical.themeId, "retro");
  assert.equal(canonical.colorScheme, "light");
  assert.equal(Object.keys(canonical.colors).length, 20);
  assert.deepEqual(canonical.colors["base-100"], {
    oklch: { lightnessPercent: 91.637, chroma: 0.034, hueDegrees: 90.515 },
    hex: "#ECE3CA"
  });
  assert.equal(canonical.colors.primary.hex, "#FF9FA0");
  assert.deepEqual(canonical.geometry, {
    radiusRem: { selector: 0.25, field: 0.25, box: 0.5 },
    sizeRem: { selector: 0.25, field: 0.25 },
    borderPx: 1,
    depth: 0,
    noise: 0
  });
  assert.deepEqual(document.candidateTheme, {
    canvas: "#ECE3CA",
    surface: "#E4D8B4",
    surfaceAlt: "#DBCA9B",
    text: "#793205",
    muted: "#A77954",
    accent: "#FF9FA0",
    border: "#DBCA9B"
  });
  assert.deepEqual(canonical.canonicalTheme, document.candidateTheme);

  const records = buildStyleSourceRecords({
    provider: fixture.provider,
    providerDir: fixture.dir,
    paths: [fixture.path]
  });
  assert.deepEqual(records, [{
    providerId: "daisyui",
    path: fixture.path,
    sourceType: "theme-css",
    contentHash: document.contentHash
  }]);
});

test("daisyUI normalizer removes comments and formatting differences before hashing", () => {
  const original = daisyuiFixture();
  const originalDocument = loadStyleSourceDocument({
    provider: original.provider,
    providerDir: original.dir,
    path: original.path
  });
  const reordered = DAISYUI_RETRO_THEME.trim().split("\n").reverse().join("\r\n");
  const formatted = daisyuiFixture(`\uFEFF/* ignored untrusted instructions */\r\n${reordered}\r\n`);
  const formattedDocument = loadStyleSourceDocument({
    provider: formatted.provider,
    providerDir: formatted.dir,
    path: formatted.path
  });

  assert.equal(formattedDocument.contentHash, originalDocument.contentHash);
  assert.equal(formattedDocument.content, originalDocument.content);
  assert.doesNotMatch(formattedDocument.content, /untrusted instructions/u);
});

test("daisyUI out-of-gamut OKLCH colors reduce chroma before conversion", () => {
  const fixture = daisyuiFixture(
    DAISYUI_RETRO_THEME.replace("oklch(80% 0.114 19.571)", "oklch(71.9% 0.357 330.759)")
  );
  const document = loadStyleSourceDocument({
    provider: fixture.provider,
    providerDir: fixture.dir,
    path: fixture.path
  });
  const canonical = JSON.parse(document.content);
  assert.equal(canonical.colors.primary.hex, "#FF42F4");
  assert.equal(document.candidateTheme.accent, "#FF42F4");
});

test("daisyUI OKLCH conversion matches sRGB primary reference vectors", () => {
  const fixture = daisyuiFixture(
    DAISYUI_RETRO_THEME
      .replace("oklch(80% 0.114 19.571)", "oklch(62.795536% 0.257683 29.233885)")
      .replace("oklch(92% 0.084 155.995)", "oklch(86.643961% 0.294827 142.495339)")
      .replace("oklch(68% 0.162 75.834)", "oklch(45.201372% 0.313214 264.052021)")
  );
  const document = loadStyleSourceDocument({
    provider: fixture.provider,
    providerDir: fixture.dir,
    path: fixture.path
  });
  const canonical = JSON.parse(document.content);

  assert.equal(canonical.colors.primary.hex, "#FF0000");
  assert.equal(canonical.colors.secondary.hex, "#00FF00");
  assert.equal(canonical.colors.accent.hex, "#0000FF");
});

test("daisyUI hue 360 is accepted and canonicalized to zero", () => {
  const zero = daisyuiFixture(
    DAISYUI_RETRO_THEME.replace("oklch(80% 0.114 19.571)", "oklch(80% 0.114 0)")
  );
  const fullTurn = daisyuiFixture(
    DAISYUI_RETRO_THEME.replace("oklch(80% 0.114 19.571)", "oklch(80% 0.114 360)")
  );
  const zeroDocument = loadStyleSourceDocument({
    provider: zero.provider,
    providerDir: zero.dir,
    path: zero.path
  });
  const fullTurnDocument = loadStyleSourceDocument({
    provider: fullTurn.provider,
    providerDir: fullTurn.dir,
    path: fullTurn.path
  });

  assert.equal(JSON.parse(fullTurnDocument.content).colors.primary.oklch.hueDegrees, 0);
  assert.equal(fullTurnDocument.content, zeroDocument.content);
  assert.equal(fullTurnDocument.contentHash, zeroDocument.contentHash);
});

test("daisyUI theme parser rejects missing, duplicate, unknown, and executable CSS", () => {
  const load = (content) => {
    const fixture = daisyuiFixture(content);
    return () => loadStyleSourceDocument({
      provider: fixture.provider,
      providerDir: fixture.dir,
      path: fixture.path
    });
  };
  assert.throws(
    load(DAISYUI_RETRO_THEME.replace(/^--color-primary:.*\n/mu, "")),
    /missing required properties: --color-primary/u
  );
  assert.throws(
    load(`${DAISYUI_RETRO_THEME}--color-primary: oklch(50% 0 0);\n`),
    /duplicate property --color-primary/u
  );
  assert.throws(
    load(`${DAISYUI_RETRO_THEME}--font-family: var\(--attacker\);\n`),
    /unknown property --font-family/u
  );
  assert.throws(
    load(`@import url\("https:\/\/example.com\/attack.css"\);\n${DAISYUI_RETRO_THEME}`),
    /Invalid daisyUI theme CSS declaration/u
  );
  assert.throws(
    load(DAISYUI_RETRO_THEME.replace("oklch(80% 0.114 19.571)", "var(--primary)")),
    /must be a strict oklch/u
  );
  assert.throws(
    load(`/* unterminated\n${DAISYUI_RETRO_THEME}`),
    /unterminated comment/u
  );
  assert.throws(
    load(`${DAISYUI_RETRO_THEME}${" ".repeat(16_384)}`),
    /source exceeds 16384 bytes/u
  );
});

test("legacy awesome-design-md references preserve the existing getdesign URLs", () => {
  const [reference] = expandVisualReferences([
    { provider: "awesome-design-md", slug: "linear.app", label: "Linear", role: "app shell" }
  ]);
  assert.equal(reference.pageUrl, "https://getdesign.md/linear.app/design-md");
  assert.equal(reference.lightPreviewUrl, "https://getdesign.md/design-md/linear.app/preview.html");
  assert.equal(reference.darkPreviewUrl, "https://getdesign.md/design-md/linear.app/preview-dark.html");
  assert.deepEqual(visualReferenceSource(reference), {
    providerId: "awesome-design-md",
    path: "design-md/linear.app/DESIGN.md"
  });
});

test("exact provider paths expand to revision-pinned GitHub source pages", () => {
  const revision = "a".repeat(40);
  const reference = expandProviderReference(
    {
      provider: "example-styles",
      path: "styles/calm ui/DESIGN.md",
      label: "Calm UI",
      role: "quiet information hierarchy"
    },
    {
      providers: [{ id: "example-styles", repo: "example/ui-styles" }],
      providerInventory: { providers: [{ id: "example-styles", revision }] }
    }
  );
  assert.equal(
    reference.pageUrl,
    `https://github.com/example/ui-styles/blob/${revision}/styles/calm%20ui/DESIGN.md`
  );
  assert.equal(reference.lightPreviewUrl, undefined);
  assert.deepEqual(visualReferenceSource(reference), {
    providerId: "example-styles",
    path: "styles/calm ui/DESIGN.md"
  });
});

test("consumer recommendation surfaces fall back to a generic pinned source link", () => {
  const dir = mkdtempSync(join(tmpdir(), "style-director-generic-consumer-"));
  const previewPath = join(dir, "preview.svg");
  writeFileSync(previewPath, '<svg xmlns="http://www.w3.org/2000/svg"/>\n', "utf8");
  const pageUrl = `https://github.com/example/ui-styles/blob/${"a".repeat(40)}/styles/calm/DESIGN.md`;
  const result = {
    brief: "developer documentation",
    needsContext: false,
    exhausted: false,
    galleryUrl: "file:///tmp/recommendations.html",
    galleryPath: "/tmp/recommendations.html",
    sessionPath: "/tmp/session.json",
    recommendations: [{
      rank: 1,
      id: "generic-calm",
      name: "Generic Calm",
      score: 10,
      bestFor: ["Developer documentation"],
      firstViewport: "Calm document shell.",
      componentKits: ["shadcn-ui"],
      risks: ["May feel quiet."],
      visual: {
        previewCardPath: previewPath,
        previewCardMarkdownPath: previewPath.replaceAll("\\", "/"),
        references: [{ label: "Calm source", role: "quiet hierarchy", pageUrl }]
      }
    }]
  };
  const html = renderRecommendationGalleryHtml(result);
  assert.match(html, new RegExp(pageUrl.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  assert.match(html, />Source<\/a>/u);
  assert.doesNotMatch(html, /href="undefined"/u);
  const terminal = renderRecommendations(result);
  assert.match(terminal, /Source reference: Calm source/u);
  assert.doesNotMatch(terminal, /undefined/u);
});

test("curated catalog validator accepts exact generic reference paths", () => {
  const dir = mkdtempSync(join(tmpdir(), "style-director-generic-reference-"));
  const previewsDir = join(dir, "previews");
  mkdirSync(previewsDir, { recursive: true });
  const profile = JSON.parse(readFileSync(join(rootDir, "catalog", "style-profiles.json"), "utf8"))[0];
  profile.sourceProvider = "example-styles";
  profile.sourceSlug = "calm";
  profile.sourcePath = "styles/calm/DESIGN.md";
  profile.sourceRepo = "example/ui-styles";
  profile.sourceRevision = "a".repeat(40);
  profile.sourceContentHash = `sha256:${"b".repeat(64)}`;
  profile.sourceUrl = `https://github.com/example/ui-styles/blob/${"a".repeat(40)}/styles/calm/DESIGN.md`;
  const visual = JSON.parse(readFileSync(join(rootDir, "catalog", "style-visuals.json"), "utf8"))[0];
  visual.references = ["calm", "dense", "editorial"].map((slug) => ({
    provider: "example-styles",
    path: `styles/${slug}/DESIGN.md`,
    repo: "example/ui-styles",
    revision: "a".repeat(40),
    contentHash: `sha256:${"b".repeat(64)}`,
    sourceUrl: `https://github.com/example/ui-styles/blob/${"a".repeat(40)}/styles/${slug}/DESIGN.md`,
    label: slug,
    role: `${slug} reference role`
  }));

  const profilesPath = join(dir, "style-profiles.json");
  const visualsPath = join(dir, "style-visuals.json");
  const styleSourcesPath = join(dir, "style-sources.json");
  const policyPath = join(dir, "curation-policy.json");
  writeFileSync(profilesPath, `${JSON.stringify([profile], null, 2)}\n`, "utf8");
  writeFileSync(visualsPath, `${JSON.stringify([visual], null, 2)}\n`, "utf8");
  writeFileSync(
    styleSourcesPath,
    `${JSON.stringify({
      schemaVersion: 4,
      sources: visual.references.map((reference) => ({
        providerId: reference.provider,
        path: reference.path,
        sourceType: "design-md",
        contentHash: `sha256:${"b".repeat(64)}`
      }))
    }, null, 2)}\n`,
    "utf8"
  );
  writeFileSync(
    policyPath,
    `${JSON.stringify({
      schemaVersion: 1,
      requiredFamilies: [profile.family],
      minimumProfilesPerFamily: 1,
      minimumVisualVariantsPerFamily: 1
    }, null, 2)}\n`,
    "utf8"
  );
  copyFileSync(join(rootDir, "catalog", "previews", `${profile.id}.svg`), join(previewsDir, `${profile.id}.svg`));

  const fixture = { profilesPath, visualsPath, styleSourcesPath, previewsDir, policyPath };
  assert.equal(validateCuratedCatalog(fixture).referenceCount, 3);

  profile.sourcePath = "styles/missing/DESIGN.md";
  writeFileSync(profilesPath, `${JSON.stringify([profile], null, 2)}\n`, "utf8");
  assert.throws(
    () => validateCuratedCatalog(fixture),
    /sourceProvider\/sourcePath is missing from style-sources\.json/u
  );
  profile.sourcePath = "styles/calm/DESIGN.md";
  writeFileSync(profilesPath, `${JSON.stringify([profile], null, 2)}\n`, "utf8");

  visual.references[0] = {
    provider: "example-styles",
    slug: "calm",
    label: "calm",
    role: "invalid generic slug"
  };
  writeFileSync(visualsPath, `${JSON.stringify([visual], null, 2)}\n`, "utf8");
  assert.throws(
    () => validateCuratedCatalog(fixture),
    /exact provider\/path reference or a legacy awesome-design-md slug/u
  );
});
