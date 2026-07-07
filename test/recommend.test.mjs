import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { applyStyle, isBriefInsufficient, recommendStyles, updateCatalog } from "../src/core.mjs";

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

test("update writes generated provider indexes without cloning", () => {
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
