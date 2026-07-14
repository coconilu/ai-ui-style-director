#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalogV2 } from "../src/catalog-v2.mjs";
import { renderDirectionPreviewSvg, renderStylePreviewSvg } from "../src/preview.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const profiles = JSON.parse(readFileSync(join(rootDir, "catalog", "style-profiles.json"), "utf8"));
const visuals = JSON.parse(readFileSync(join(rootDir, "catalog", "style-visuals.json"), "utf8"));
const visualMap = new Map(visuals.map((visual) => [visual.styleId, visual]));
const outputDir = join(rootDir, "catalog", "previews");
const checkOnly = process.argv.includes("--check");
const failures = [];
let directionThemePreviewCount = 0;

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

try {
  const catalogV2 = loadCatalogV2({ catalogDir: join(rootDir, "catalog") });
  for (const direction of catalogV2.directions) {
    const previewSpec = catalogV2.previewSpecByDirectionId.get(direction.id);
    const links = catalogV2.linksByDirectionId.get(direction.id) || [];

    for (const link of links) {
      const theme = catalogV2.themeById.get(link.themeId);
      try {
        const selection = { direction, theme, previewSpec };
        const firstRender = renderDirectionPreviewSvg(selection);
        const secondRender = renderDirectionPreviewSvg(selection);

        if (firstRender !== secondRender) {
          failures.push(`Non-deterministic v2 preview for ${direction.id} + ${theme.id}`);
        }
        if (
          !firstRender.startsWith("<svg ")
          || !firstRender.includes(`data-direction-id="${direction.id}"`)
          || !firstRender.includes(`data-theme-id="${theme.id}"`)
          || !firstRender.endsWith("</svg>\n")
        ) {
          failures.push(`Incomplete v2 preview for ${direction.id} + ${theme.id}`);
        }
      } catch (error) {
        failures.push(`Could not render v2 preview for ${direction.id} + ${theme?.id}: ${error.message}`);
      }
      directionThemePreviewCount += 1;
    }
  }

  if (directionThemePreviewCount !== catalogV2.links.length) {
    failures.push(
      `Rendered ${directionThemePreviewCount} v2 previews for ${catalogV2.links.length} direction/theme links.`
    );
  }
} catch (error) {
  failures.push(`Could not render catalog v2 previews: ${error.message}`);
}

if (failures.length > 0) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exit(1);
}

if (checkOnly) {
  process.stdout.write(
    `Verified ${profiles.length} generated legacy style previews and `
    + `${directionThemePreviewCount} in-memory direction/theme previews.\n`
  );
}
