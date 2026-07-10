import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { applyStyle, isBriefInsufficient, recommendStyles, updateCatalog } from "../src/core.mjs";

const binPath = fileURLToPath(new URL("../bin/ai-ui-style-director.mjs", import.meta.url));

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

  assert.match(design, /# DESIGN.md/);
  assert.match(design, /Operational SaaS Console/);
  assert.match(selected, /operational-saas-console/);
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
