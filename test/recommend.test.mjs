import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { validateCuratedCatalog } from "../scripts/validate-curated-catalog.mjs";
import { validateGeneratedCatalog } from "../scripts/validate-generated-catalog.mjs";
import {
  applyStyle,
  diversifyScoredProfiles,
  isBriefInsufficient,
  loadStyleProfiles,
  loadStyleVisuals,
  openRecommendationGallery,
  openPreviewUrl,
  previewOpenCommand,
  previewUrlOpenCommand,
  recommendStyles,
  renderRecommendationGalleryHtml,
  renderRecommendations,
  scoreProfile,
  startRecommendationPreviewServer,
  updateCatalog
} from "../src/core.mjs";

const binPath = fileURLToPath(new URL("../bin/ai-ui-style-director.mjs", import.meta.url));
const rootDir = join(dirname(binPath), "..");
const curatedValidatorPath = fileURLToPath(new URL("../scripts/validate-curated-catalog.mjs", import.meta.url));
const wrapperPath = fileURLToPath(
  new URL("../skills/web-style-director/scripts/style-director.mjs", import.meta.url)
);
const recommendationBenchmarks = JSON.parse(
  readFileSync(join(rootDir, "catalog", "recommendation-benchmarks.json"), "utf8")
);

function writeCuratedCatalogFixture({ mutate } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "style-director-curated-catalog-"));
  const profiles = JSON.parse(readFileSync(join(rootDir, "catalog", "style-profiles.json"), "utf8"));
  const visuals = JSON.parse(readFileSync(join(rootDir, "catalog", "style-visuals.json"), "utf8"));
  const styleSources = JSON.parse(
    readFileSync(join(rootDir, "catalog", "generated", "style-sources.json"), "utf8")
  );
  const previewsDir = join(dir, "previews");
  mkdirSync(previewsDir, { recursive: true });

  mutate?.({ profiles, visuals, styleSources });
  writeFileSync(join(dir, "style-profiles.json"), `${JSON.stringify(profiles, null, 2)}\n`, "utf8");
  writeFileSync(join(dir, "style-visuals.json"), `${JSON.stringify(visuals, null, 2)}\n`, "utf8");
  writeFileSync(join(dir, "style-sources.json"), `${JSON.stringify(styleSources, null, 2)}\n`, "utf8");
  for (const profile of profiles) {
    if (typeof profile?.id === "string") {
      writeFileSync(join(previewsDir, `${profile.id}.svg`), "<svg xmlns=\"http://www.w3.org/2000/svg\"/>\n", "utf8");
    }
  }

  return {
    profilesPath: join(dir, "style-profiles.json"),
    visualsPath: join(dir, "style-visuals.json"),
    styleSourcesPath: join(dir, "style-sources.json"),
    previewsDir
  };
}

function writeFakeRepository(repositoryDir, marker) {
  const fakeBin = join(repositoryDir, "bin", "ai-ui-style-director.mjs");
  mkdirSync(dirname(fakeBin), { recursive: true });
  writeFileSync(
    fakeBin,
    `process.stdout.write(JSON.stringify({ marker: ${JSON.stringify(marker)}, args: process.argv.slice(2) }));\n`,
    "utf8"
  );
}

function runInstalledWrapper({
  homeDir,
  skillDir,
  repositoryDir,
  claudeConfigDir,
  marker,
  commandArgs = ["recommend", "--brief", "test"],
  additionalRepositories = []
}) {
  const installedWrapper = join(skillDir, "scripts", "style-director.mjs");
  mkdirSync(dirname(installedWrapper), { recursive: true });
  copyFileSync(wrapperPath, installedWrapper);
  writeFakeRepository(repositoryDir, marker);
  for (const repository of additionalRepositories) {
    writeFakeRepository(repository.path, repository.marker);
  }

  const env = {
    ...process.env,
    HOME: homeDir,
    USERPROFILE: homeDir,
    AI_UI_STYLE_DIRECTOR_HOME: "",
    CLAUDE_CONFIG_DIR: claudeConfigDir || ""
  };
  const result = spawnSync(process.execPath, [installedWrapper, ...commandArgs], {
    encoding: "utf8",
    env
  });

  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("detects missing scenario context", () => {
  assert.equal(isBriefInsufficient("make a website"), true);
  assert.equal(isBriefInsufficient("make a paid website"), true);
  assert.equal(isBriefInsufficient("AI developer tool website"), false);

  const expandedCatalog = [
    {
      pageTypes: ["patient-portal"],
      audiences: ["clinicians"],
      goals: ["care-coordination"],
      keywords: ["healthcare"],
      bestFor: ["medical teams"]
    }
  ];
  assert.equal(isBriefInsufficient("make a website", expandedCatalog), true);
  assert.equal(isBriefInsufficient("healthcare patient portal for clinicians", expandedCatalog), false);

  const familyOnlyProfiles = [
    { id: "healthcare-family", name: "Healthcare", family: "healthcare" },
    { id: "hospitality-family", name: "Hospitality", family: "hospitality" }
  ];
  assert.equal(isBriefInsufficient("healthcare website", familyOnlyProfiles), false);
  const familyRanking = diversifyScoredProfiles(
    familyOnlyProfiles.map((profile) => ({ profile, score: scoreProfile(profile, "healthcare website") })),
    2
  );
  assert.equal(familyRanking[0].profile.id, "healthcare-family");
});

test("diversification keeps relevance ahead of family coverage and is deterministic", () => {
  const scored = [
    { profile: { id: "unrelated-family", name: "Unrelated", family: "unrelated" }, score: 14 },
    { profile: { id: "relevant-two", name: "Relevant Two", family: "relevant" }, score: 90 },
    { profile: { id: "zero-score", name: "Zero", family: "zero" }, score: 0 },
    { profile: { id: "relevant-one", name: "Relevant One", family: "relevant" }, score: 100 }
  ];

  const first = diversifyScoredProfiles(scored, 5);
  const second = diversifyScoredProfiles(scored.toReversed(), 5);
  assert.deepEqual(first.map((item) => item.profile.id), ["relevant-one", "relevant-two"]);
  assert.deepEqual(
    first.map((item) => [item.profile.id, item.score]),
    second.map((item) => [item.profile.id, item.score])
  );
});

test("diversification promotes only near-score alternatives from a new family", () => {
  const scored = [
    { profile: { id: "same-one", name: "Same One", family: "same" }, score: 100 },
    { profile: { id: "same-two", name: "Same Two", family: "same" }, score: 95 },
    { profile: { id: "close-diverse", name: "Close Diverse", family: "diverse" }, score: 80 },
    { profile: { id: "weak-diverse", name: "Weak Diverse", family: "weak" }, score: 20 }
  ];

  assert.deepEqual(
    diversifyScoredProfiles(scored, 4).map((item) => item.profile.id),
    ["same-one", "close-diverse", "same-two", "weak-diverse"]
  );
});

test("recommendation benchmarks preserve intent coverage and deterministic ranking", () => {
  assert.equal(recommendationBenchmarks.schemaVersion, 1);
  assert.equal(Array.isArray(recommendationBenchmarks.cases), true);
  assert.equal(recommendationBenchmarks.cases.length > 0, true);

  for (const benchmark of recommendationBenchmarks.cases) {
    const dir = mkdtempSync(join(tmpdir(), `style-director-benchmark-${benchmark.id}-`));
    const first = recommendStyles({
      brief: benchmark.brief,
      count: 5,
      sessionPath: join(dir, "first-session.json")
    });
    const second = recommendStyles({
      brief: benchmark.brief,
      count: 5,
      sessionPath: join(dir, "second-session.json")
    });
    const topFamilies = first.recommendations.map((item) => item.family);

    assert.equal(first.needsContext, false, `${benchmark.id}: brief unexpectedly needs context`);
    assert.equal(
      benchmark.expectedTopFamilies.includes(topFamilies[0]),
      true,
      `${benchmark.id}: unexpected top family ${topFamilies[0]}`
    );
    for (const family of benchmark.requiredFamiliesInTop5) {
      assert.equal(topFamilies.includes(family), true, `${benchmark.id}: missing required Top 5 family ${family}`);
    }
    for (let index = 1; index < first.recommendations.length; index += 1) {
      const previous = first.recommendations[index - 1];
      const current = first.recommendations[index];
      assert.equal(
        previous.score >= current.score * 0.8,
        true,
        `${benchmark.id}: diversity promoted ${previous.id} too far above ${current.id}`
      );
    }
    assert.deepEqual(
      first.recommendations.map((item) => [item.id, item.score]),
      second.recommendations.map((item) => [item.id, item.score]),
      `${benchmark.id}: ranking is not deterministic`
    );
  }
});

test("recommends five styles for an AI developer product", () => {
  const dir = mkdtempSync(join(tmpdir(), "style-director-"));
  const result = recommendStyles({
    brief: "AI developer tool website for an SDK and docs",
    sessionPath: join(dir, "session.json")
  });

  assert.equal(result.needsContext, false);
  assert.equal(result.recommendations.length, 5);
  assert.equal(result.recommendations[0].id, "developer-product-minimal");
  assert.equal(existsSync(result.recommendations[0].visual.previewCardPath), true);
  assert.equal(result.recommendations[0].visual.references.length, 3);
  assert.match(result.recommendations[0].visual.references[0].lightPreviewUrl, /getdesign\.md/);
  assert.equal(existsSync(result.galleryPath), true);
  assert.match(result.galleryUrl, /^file:\/\//);
});

test("recommendation gallery is a self-contained offline HTML preview", () => {
  const dir = mkdtempSync(join(tmpdir(), "style-director-gallery-"));
  const result = recommendStyles({
    brief: "面向运营团队的内部管理后台 dashboard",
    count: 2,
    sessionPath: join(dir, "session.json")
  });
  const gallery = readFileSync(result.galleryPath, "utf8");

  assert.equal(renderRecommendationGalleryHtml(result), gallery);
  assert.match(gallery, /<html lang="zh-CN">/);
  assert.match(gallery, /data:image\/svg\+xml;base64,/);
  assert.match(gallery, /<link rel="icon" href="data:,">/);
  assert.match(gallery, /选择一个 UI 方向/);
  assert.doesNotMatch(gallery, /catalog\/previews\//);
});

test("every style has a generated preview and three real visual references", () => {
  const profiles = loadStyleProfiles();
  const visuals = loadStyleVisuals();
  const visualMap = new Map(visuals.map((visual) => [visual.styleId, visual]));
  const generatedSources = JSON.parse(
    readFileSync(join(rootDir, "catalog", "generated", "style-sources.json"), "utf8")
  ).sources;
  const upstreamSlugs = new Set(
    generatedSources
      .filter((source) => source.providerId === "awesome-design-md")
      .map((source) => source.path.match(/^design-md\/([^/]+)\/DESIGN\.md$/)?.[1])
      .filter(Boolean)
  );

  assert.equal(visuals.length, profiles.length);
  for (const profile of profiles) {
    const visual = visualMap.get(profile.id);
    assert.ok(visual, `Missing visual configuration for ${profile.id}`);
    assert.equal(visual.references.length, 3);
    assert.equal(existsSync(join(rootDir, "catalog", "previews", `${profile.id}.svg`)), true);
    for (const reference of visual.references) {
      assert.equal(upstreamSlugs.has(reference.slug), true, `Unknown upstream slug: ${reference.slug}`);
    }
  }
});

test("curated catalog validator accepts the current catalog and runs as a CLI", () => {
  const profiles = loadStyleProfiles();
  const visuals = loadStyleVisuals();
  const result = validateCuratedCatalog();

  assert.equal(result.profileCount, profiles.length);
  assert.equal(result.visualCount, visuals.length);
  assert.equal(result.requiredFamilyCount, 12);
  assert.equal(result.minimumProfilesPerFamily, 4);
  assert.equal(result.minimumVisualVariantsPerFamily, 3);
  assert.equal(
    result.referenceCount,
    visuals.reduce((total, visual) => total + visual.references.length, 0)
  );

  const cli = spawnSync(process.execPath, [curatedValidatorPath], { encoding: "utf8" });
  assert.equal(cli.status, 0, cli.stderr);
  assert.match(cli.stdout, new RegExp(`${profiles.length} profiles, ${visuals.length} visuals`));
});

test("curated catalog policy protects baseline family depth and visual diversity", () => {
  const fixture = writeCuratedCatalogFixture({
    mutate({ profiles, visuals }) {
      const removedIds = new Set(
        profiles.filter((profile) => profile.family === "developer").slice(1).map((profile) => profile.id)
      );
      profiles.splice(0, profiles.length, ...profiles.filter((profile) => !removedIds.has(profile.id)));
      visuals.splice(0, visuals.length, ...visuals.filter((visual) => !removedIds.has(visual.styleId)));
    }
  });

  assert.throws(
    () => validateCuratedCatalog(fixture),
    (error) => {
      assert.match(error.message, /developer: requires at least 4 curated profiles/u);
      assert.match(error.message, /developer: requires at least 3 distinct visual variants/u);
      return true;
    }
  );
});

test("curated catalog validator reports structural, provenance, and pairing failures", () => {
  const fixture = writeCuratedCatalogFixture({
    mutate({ profiles, visuals }) {
      profiles.push(structuredClone(profiles[0]));
      profiles[0].family = "Invalid Family";
      profiles[0].density = "";
      profiles[0].pageTypes = ["invalid page type"];
      profiles[0].tones = [];
      profiles[0].keywords = [""];
      visuals[0].variant = "unsupported-variant";
      visuals[0].theme.accent = "not-a-color";
      visuals[0].references[0].slug = "not-in-style-sources";
      visuals[0].references.pop();
      visuals[1].styleId = "orphan-visual";
    }
  });

  assert.throws(
    () => validateCuratedCatalog(fixture),
    (error) => {
      assert.match(error.message, /duplicate profile id/u);
      assert.match(error.message, /family must be a lowercase kebab-case token/u);
      assert.match(error.message, /density must be a non-empty string/u);
      assert.match(error.message, /pageTypes must contain lowercase kebab-case tokens/u);
      assert.match(error.message, /tones must be a non-empty array/u);
      assert.match(error.message, /keywords must contain only non-empty strings/u);
      assert.match(error.message, /variant must be one of/u);
      assert.match(error.message, /theme\.accent must be a valid hex color/u);
      assert.match(error.message, /references must contain exactly 3 entries/u);
      assert.match(error.message, /not-in-style-sources is missing from style-sources\.json/u);
      assert.match(error.message, /profile has no matching visual/u);
      assert.match(error.message, /visual has no matching profile/u);
      assert.match(error.message, /preview file is missing/u);
      return true;
    }
  );
});

test("rendered recommendations expose the local card and live previews", () => {
  const dir = mkdtempSync(join(tmpdir(), "style-director-render-preview-"));
  const result = recommendStyles({
    brief: "AI developer tool website for an SDK and docs",
    count: 1,
    sessionPath: join(dir, "session.json")
  });
  const rendered = renderRecommendations(result);

  assert.match(rendered, /Preview card: .*developer-product-minimal\.svg/);
  assert.match(rendered, /Live preview: Vercel/);
  assert.match(rendered, /preview-dark\.html/);
  assert.match(rendered, /Preview gallery: file:\/\//);
  assert.match(rendered, /preview --open --path/);
});

test("preview command reports the generated gallery for terminal clients", () => {
  const dir = mkdtempSync(join(tmpdir(), "style-director-cli-preview-"));
  const recommendation = recommendStyles({
    brief: "B2B operations dashboard for internal teams",
    sessionPath: join(dir, "session.json")
  });
  const result = spawnSync(process.execPath, [
    binPath,
    "preview",
    "--path",
    recommendation.galleryPath,
    "--json"
  ], { encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.galleryPath, recommendation.galleryPath);
  assert.equal(output.galleryUrl, recommendation.galleryUrl);
  assert.equal(output.opened, false);
});

test("preview opener uses shell-free platform commands", () => {
  const path = join(tmpdir(), "recommendations.html");
  assert.equal(previewOpenCommand(path, "win32").command, "rundll32.exe");
  assert.equal(previewOpenCommand(path, "darwin").command, "open");
  assert.equal(previewOpenCommand(path, "linux").command, "xdg-open");

  const dir = mkdtempSync(join(tmpdir(), "style-director-open-preview-"));
  const recommendation = recommendStyles({
    brief: "Analytics dashboard for a finance operations team",
    sessionPath: join(dir, "session.json")
  });
  let invocation;
  const opened = openRecommendationGallery(recommendation.galleryPath, {
    platform: "linux",
    run(command, args, options) {
      invocation = { command, args, options };
      return { status: 0, stderr: "" };
    }
  });

  assert.equal(invocation.command, "xdg-open");
  assert.deepEqual(invocation.args, [recommendation.galleryPath]);
  assert.equal(invocation.options.windowsHide, true);
  assert.equal(opened.opened, true);
});

test("preview server serves only the generated gallery on loopback", async () => {
  const dir = mkdtempSync(join(tmpdir(), "style-director-preview-server-"));
  const recommendation = recommendStyles({
    brief: "B2B operations dashboard for internal teams",
    sessionPath: join(dir, "session.json")
  });
  const served = await startRecommendationPreviewServer(recommendation.galleryPath);

  try {
    assert.equal(served.host, "127.0.0.1");
    assert.equal(served.port > 0, true);
    assert.equal(served.previewUrl, `http://127.0.0.1:${served.port}/`);

    const response = await fetch(served.previewUrl);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /^text\/html/);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.match(response.headers.get("content-security-policy"), /default-src 'none'/);
    assert.match(await response.text(), /选择一个 UI 方向|Choose a UI direction/);

    const head = await fetch(`${served.previewUrl}recommendations.html`, { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), "");

    const missing = await fetch(`${served.previewUrl}missing`);
    assert.equal(missing.status, 404);

    const rejected = await fetch(served.previewUrl, { method: "POST" });
    assert.equal(rejected.status, 405);
    assert.equal(rejected.headers.get("allow"), "GET, HEAD");
  } finally {
    await served.close();
  }
});

test("preview server validates ports and opens URLs without a shell", async () => {
  const dir = mkdtempSync(join(tmpdir(), "style-director-preview-server-port-"));
  const recommendation = recommendStyles({
    brief: "Analytics dashboard for a finance operations team",
    sessionPath: join(dir, "session.json")
  });

  await assert.rejects(
    startRecommendationPreviewServer(recommendation.galleryPath, { port: true }),
    /Invalid preview server port/
  );
  await assert.rejects(
    startRecommendationPreviewServer(recommendation.galleryPath, { port: 70000 }),
    /Invalid preview server port/
  );

  const previewUrl = "http://127.0.0.1:4173/";
  assert.equal(previewUrlOpenCommand(previewUrl, "win32").command, "rundll32.exe");
  assert.equal(previewUrlOpenCommand(previewUrl, "darwin").command, "open");
  assert.equal(previewUrlOpenCommand(previewUrl, "linux").command, "xdg-open");

  let invocation;
  const opened = openPreviewUrl(previewUrl, {
    platform: "linux",
    run(command, args, options) {
      invocation = { command, args, options };
      return { status: 0, stderr: "" };
    }
  });
  assert.equal(invocation.command, "xdg-open");
  assert.deepEqual(invocation.args, [previewUrl]);
  assert.equal(invocation.options.windowsHide, true);
  assert.deepEqual(opened, { opened: true, previewUrl });
});

test("again excludes styles shown in the same session", () => {
  const dir = mkdtempSync(join(tmpdir(), "style-director-"));
  const sessionPath = join(dir, "session.json");
  const first = recommendStyles({
    brief: "AI developer tool website for an SDK and docs",
    sessionPath
  });
  const second = recommendStyles({
    brief: "AI developer tool website for an SDK and docs",
    sessionPath,
    again: true
  });

  const firstIds = new Set(first.recommendations.map((item) => item.id));
  for (const item of second.recommendations) {
    assert.equal(firstIds.has(item.id), false);
  }
});

test("apply writes a DESIGN.md and style state", () => {
  const dir = mkdtempSync(join(tmpdir(), "style-director-project-"));
  const result = applyStyle({
    styleId: "operational-saas-console",
    projectDir: dir,
    brief: "B2B SaaS workflow dashboard"
  });

  const design = readFileSync(result.designPath, "utf8");
  const selected = readFileSync(join(dir, ".ui-style-director", "selected-style.json"), "utf8");
  const draft = readFileSync(result.draftPath, "utf8");
  const attribution = JSON.parse(readFileSync(join(dir, ".ui-style-director", "source-attribution.json"), "utf8"));

  assert.match(design, /# DESIGN.md/);
  assert.match(design, /Operational SaaS Console/);
  assert.match(design, /## Visual References/);
  assert.match(design, /linear\.app\/preview\.html/);
  assert.match(selected, /operational-saas-console/);
  assert.match(draft, /project first-viewport draft/);
  assert.equal(attribution.visualReferences.length, 3);
});

test("catalog refresh writes generated provider indexes without cloning", () => {
  const dir = mkdtempSync(join(tmpdir(), "style-director-update-"));
  const cacheDir = join(dir, "cache", "providers");
  const providerDir = join(cacheDir, "shadcn-ui");
  mkdirSync(join(providerDir, "registry"), { recursive: true });
  writeFileSync(join(providerDir, "DESIGN.md"), "# Test design source\n", "utf8");
  for (let index = 200; index >= 0; index -= 1) {
    const name = `component-${String(index).padStart(3, "0")}.ts`;
    writeFileSync(join(providerDir, "registry", name), "export const component = {};\n", "utf8");
  }

  const result = updateCatalog({
    cacheDir,
    generatedDir: join(dir, "generated"),
    clone: false
  });

  assert.equal(result.generatedFiles.length, 3);
  for (const file of result.generatedFiles) {
    assert.equal(existsSync(file), true);
  }
  assert.equal(result.providers.length > 0, true);

  const [inventoryPath, styleSourcesPath, componentSourcesPath] = result.generatedFiles;
  const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
  const styleSources = JSON.parse(readFileSync(styleSourcesPath, "utf8"));
  const componentSources = JSON.parse(readFileSync(componentSourcesPath, "utf8"));

  assert.deepEqual(Object.keys(inventory), ["schemaVersion", "providers"]);
  assert.equal(inventory.schemaVersion, 2);
  assert.equal("generatedAt" in inventory, false);
  assert.equal("cacheDir" in inventory, false);
  assert.equal("syncLockPath" in inventory, false);
  assert.deepEqual(styleSources, {
    schemaVersion: 2,
    sources: [{ providerId: "shadcn-ui", path: "DESIGN.md", sourceType: "design-md" }]
  });
  assert.equal(componentSources.schemaVersion, 2);
  assert.equal(componentSources.sources.length, 200);
  assert.deepEqual(componentSources.sources[0], {
    providerId: "shadcn-ui",
    path: "registry/component-000.ts",
    sourceType: "registry"
  });
  assert.deepEqual(componentSources.sources.at(-1), {
    providerId: "shadcn-ui",
    path: "registry/component-199.ts",
    sourceType: "registry"
  });
  assert.equal(componentSources.sources.some((source) => source.path.endsWith("component-200.ts")), false);
  assert.equal(componentSources.sources.some((source) => "revision" in source || "repo" in source), false);

  const firstGeneration = result.generatedFiles.map((file) => readFileSync(file, "utf8"));
  updateCatalog({ cacheDir, generatedDir: join(dir, "generated"), clone: false });
  assert.deepEqual(
    result.generatedFiles.map((file) => readFileSync(file, "utf8")),
    firstGeneration
  );
});

test("generated catalog validation rejects denormalized source provenance", () => {
  const dir = mkdtempSync(join(tmpdir(), "style-director-catalog-validation-"));
  const generatedDir = join(dir, "generated");
  mkdirSync(generatedDir, { recursive: true });
  for (const file of ["provider-inventory.json", "style-sources.json", "component-sources.json"]) {
    copyFileSync(join(rootDir, "catalog", "generated", file), join(generatedDir, file));
  }

  const valid = validateGeneratedCatalog({ generatedDir });
  const currentProviders = JSON.parse(readFileSync(join(rootDir, "catalog", "providers.json"), "utf8"));
  const currentStyles = JSON.parse(readFileSync(join(generatedDir, "style-sources.json"), "utf8"));
  const currentComponents = JSON.parse(readFileSync(join(generatedDir, "component-sources.json"), "utf8"));
  assert.equal(valid.providerCount, currentProviders.length);
  assert.equal(valid.styleSourceCount, currentStyles.sources.length);
  assert.equal(valid.componentSourceCount, currentComponents.sources.length);

  const componentPath = join(generatedDir, "component-sources.json");
  const components = JSON.parse(readFileSync(componentPath, "utf8"));
  components.sources[0].revision = "deadbeef";
  writeFileSync(componentPath, `${JSON.stringify(components, null, 2)}\n`, "utf8");
  assert.throws(
    () => validateGeneratedCatalog({ generatedDir }),
    /component-sources\.json sources must exactly match normalized provider inventory paths/u
  );
});

test("refresh-catalog is the documented CLI command", () => {
  const dir = mkdtempSync(join(tmpdir(), "style-director-cli-refresh-"));
  const result = spawnSync(process.execPath, [
    binPath,
    "refresh-catalog",
    "--cache-dir",
    join(dir, "cache", "providers"),
    "--generated-dir",
    join(dir, "generated"),
    "--json"
  ], { encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.generatedFiles.length, 3);
});

test("update remains a compatibility alias for refresh-catalog", () => {
  const dir = mkdtempSync(join(tmpdir(), "style-director-cli-update-"));
  const result = spawnSync(process.execPath, [
    binPath,
    "update",
    "--cache-dir",
    join(dir, "cache", "providers"),
    "--generated-dir",
    join(dir, "generated"),
    "--json"
  ], { encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.generatedFiles.length, 3);
});

test("installed wrapper finds the Codex repository from an .agents skill", () => {
  const homeDir = mkdtempSync(join(tmpdir(), "style-director-codex-home-"));
  const output = runInstalledWrapper({
    homeDir,
    skillDir: join(homeDir, ".agents", "skills", "web-style-director"),
    repositoryDir: join(homeDir, ".codex", "tools", "ai-ui-style-director"),
    marker: "codex"
  });

  assert.equal(output.marker, "codex");
  assert.deepEqual(output.args, ["recommend", "--brief", "test"]);
});

test("installed wrapper forwards the serve command and options unchanged", () => {
  const homeDir = mkdtempSync(join(tmpdir(), "style-director-codex-serve-home-"));
  const output = runInstalledWrapper({
    homeDir,
    skillDir: join(homeDir, ".agents", "skills", "web-style-director"),
    repositoryDir: join(homeDir, ".codex", "tools", "ai-ui-style-director"),
    marker: "codex-serve",
    commandArgs: ["serve", "--port", "4173", "--json"]
  });

  assert.equal(output.marker, "codex-serve");
  assert.deepEqual(output.args, ["serve", "--port", "4173", "--json"]);
});

test("installed wrapper keeps the legacy .codex skill layout working", () => {
  const homeDir = mkdtempSync(join(tmpdir(), "style-director-legacy-codex-home-"));
  const output = runInstalledWrapper({
    homeDir,
    skillDir: join(homeDir, ".codex", "skills", "web-style-director"),
    repositoryDir: join(homeDir, ".codex", "tools", "ai-ui-style-director"),
    marker: "legacy-codex"
  });

  assert.equal(output.marker, "legacy-codex");
  assert.deepEqual(output.args, ["recommend", "--brief", "test"]);
});

test("installed wrapper honors CLAUDE_CONFIG_DIR for Claude Code", () => {
  const homeDir = mkdtempSync(join(tmpdir(), "style-director-claude-home-"));
  const claudeConfigDir = join(homeDir, "custom-claude-config");
  const output = runInstalledWrapper({
    homeDir,
    claudeConfigDir,
    skillDir: join(claudeConfigDir, "skills", "web-style-director"),
    repositoryDir: join(claudeConfigDir, "tools", "ai-ui-style-director"),
    marker: "claude-code"
  });

  assert.equal(output.marker, "claude-code");
  assert.deepEqual(output.args, ["recommend", "--brief", "test"]);
});

test("installed wrapper finds the default Claude Code repository", () => {
  const homeDir = mkdtempSync(join(tmpdir(), "style-director-default-claude-home-"));
  const output = runInstalledWrapper({
    homeDir,
    skillDir: join(homeDir, ".claude", "skills", "web-style-director"),
    repositoryDir: join(homeDir, ".claude", "tools", "ai-ui-style-director"),
    marker: "default-claude-code"
  });

  assert.equal(output.marker, "default-claude-code");
  assert.deepEqual(output.args, ["recommend", "--brief", "test"]);
});

test("Claude Code skill prefers its repository when Codex is also installed", () => {
  const homeDir = mkdtempSync(join(tmpdir(), "style-director-dual-agent-home-"));
  const output = runInstalledWrapper({
    homeDir,
    skillDir: join(homeDir, ".claude", "skills", "web-style-director"),
    repositoryDir: join(homeDir, ".claude", "tools", "ai-ui-style-director"),
    marker: "claude-code",
    additionalRepositories: [
      {
        path: join(homeDir, ".codex", "tools", "ai-ui-style-director"),
        marker: "codex"
      }
    ]
  });

  assert.equal(output.marker, "claude-code");
});

test("Codex skill prefers its repository when Claude Code is also installed", () => {
  const homeDir = mkdtempSync(join(tmpdir(), "style-director-dual-agent-codex-home-"));
  const output = runInstalledWrapper({
    homeDir,
    skillDir: join(homeDir, ".agents", "skills", "web-style-director"),
    repositoryDir: join(homeDir, ".codex", "tools", "ai-ui-style-director"),
    marker: "codex",
    additionalRepositories: [
      {
        path: join(homeDir, ".claude", "tools", "ai-ui-style-director"),
        marker: "claude-code"
      }
    ]
  });

  assert.equal(output.marker, "codex");
});
