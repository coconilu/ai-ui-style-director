#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderStylePreviewSvg } from "../src/preview.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const profiles = JSON.parse(readFileSync(join(rootDir, "catalog", "style-profiles.json"), "utf8"));
const visuals = JSON.parse(readFileSync(join(rootDir, "catalog", "style-visuals.json"), "utf8"));
const visualMap = new Map(visuals.map((visual) => [visual.styleId, visual]));
const outputDir = join(rootDir, "catalog", "previews");
const checkOnly = process.argv.includes("--check");
const failures = [];

function normalizeLineEndings(value) {
  return value.replace(/\r\n?/g, "\n");
}

mkdirSync(outputDir, { recursive: true });

for (const style of profiles) {
  const visual = visualMap.get(style.id);
  if (!visual) {
    failures.push(`Missing visual configuration for ${style.id}`);
    continue;
  }

  const outputPath = join(outputDir, `${style.id}.svg`);
  const expected = renderStylePreviewSvg({ style, visual });
  if (checkOnly) {
    if (!existsSync(outputPath)) failures.push(`Missing generated preview ${outputPath}`);
    else if (normalizeLineEndings(readFileSync(outputPath, "utf8")) !== normalizeLineEndings(expected)) {
      failures.push(`Stale generated preview ${outputPath}`);
    }
  } else {
    writeFileSync(outputPath, expected, "utf8");
    process.stdout.write(`Generated ${outputPath}\n`);
  }
}

for (const visual of visuals) {
  if (!profiles.some((style) => style.id === visual.styleId)) {
    failures.push(`Visual configuration has no matching style: ${visual.styleId}`);
  }
}

if (failures.length > 0) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exit(1);
}

if (checkOnly) process.stdout.write(`Verified ${profiles.length} generated style previews.\n`);
