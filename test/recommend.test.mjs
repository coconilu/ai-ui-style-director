import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  applyStyle,
  isBriefInsufficient,
  loadStyleProfiles,
  loadStyleVisuals,
  recommendStyles,
  renderRecommendations,
  updateCatalog
} from "../src/core.mjs";

const binPath = fileURLToPath(new URL("../bin/ai-ui-style-director.mjs", import.meta.url));
const rootDir = join(dirname(binPath), "..");
const wrapperPath = fileURLToPath(
  new URL("../skills/web-style-director/scripts/style-director.mjs", import.meta.url)
);

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
  const result = spawnSync(process.execPath, [installedWrapper, "recommend", "--brief", "test"], {
    encoding: "utf8",
    env
  });

  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("detects missing scenario context", () => {
  assert.equal(isBriefInsufficient("make a website"), true);
  assert.equal(isBriefInsufficient("AI developer tool website"), false);
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
  const result = updateCatalog({
    cacheDir: join(dir, "cache", "providers"),
    generatedDir: join(dir, "generated"),
    clone: false
  });

  assert.equal(result.generatedFiles.length, 3);
  for (const file of result.generatedFiles) {
    assert.equal(existsSync(file), true);
  }
  assert.equal(result.providers.length > 0, true);
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
