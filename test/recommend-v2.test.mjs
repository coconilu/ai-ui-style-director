import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  applyStyle,
  loadStyleProfiles,
  loadStyleVisuals,
  recommendStyles,
  renderRecommendationGalleryHtml,
  renderRecommendations,
  scoreProfile,
  scoreTheme,
  selectThemeForDirection
} from "../src/core.mjs";
import {
  legacyAliasesForDirection,
  loadCatalogV2
} from "../src/catalog-v2.mjs";
import { expandVisualReferences } from "../src/preview.mjs";

const catalog = loadCatalogV2();
const developerBrief = "AI developer tool website for an SDK and API documentation";
const binPath = fileURLToPath(new URL("../bin/ai-ui-style-director.mjs", import.meta.url));

function temporaryDirectory(label) {
  return mkdtempSync(join(tmpdir(), `${label}-`));
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function multiAppearanceDirection() {
  return catalog.directions.find((direction) => {
    const appearances = new Set((catalog.linksByDirectionId.get(direction.id) || [])
      .map((link) => catalog.themeById.get(link.themeId)?.appearance));
    return appearances.has("light") && appearances.has("dark");
  });
}

function nonDefaultLegacyAlias() {
  return catalog.aliases.find((alias) => {
    const links = catalog.linksByDirectionId.get(alias.directionId) || [];
    return links.some((link) => link.themeId === alias.themeId && link.isDefault === false);
  });
}

test("Theme scoring and selection support appearance, tones, and bilingual brand colors", () => {
  const light = {
    id: "theme-light",
    name: "Calm Light Theme",
    appearance: "light",
    tones: ["calm"],
    tokens: { accent: "#EF4444" }
  };
  const dark = {
    id: "theme-dark",
    name: "Focused Dark Theme",
    appearance: "dark",
    tones: ["focused"],
    tokens: { accent: "#3B82F6" }
  };
  assert.equal(scoreTheme(light, "浅色 calm") > scoreTheme(dark, "浅色 calm"), true);
  assert.equal(scoreTheme(dark, "深色 focused") > scoreTheme(light, "深色 focused"), true);
  assert.equal(scoreTheme(light, "light interface") > scoreTheme(dark, "light interface"), true);
  assert.equal(scoreTheme(dark, "dark interface") > scoreTheme(light, "dark interface"), true);
  assert.equal(scoreTheme(light, "red") > scoreTheme(dark, "red"), true);
  assert.equal(scoreTheme(light, "红色") > scoreTheme(dark, "红色"), true);
  assert.equal(scoreTheme(light, "#EF4444") > scoreTheme(dark, "#EF4444"), true);
  assert.equal(scoreTheme(dark, "blue") > scoreTheme(light, "blue"), true);
  assert.equal(scoreTheme(dark, "蓝色") > scoreTheme(light, "蓝色"), true);

  const redOnly = {
    id: "theme-red-only",
    name: "Theme",
    appearance: "mixed",
    tones: [],
    tokens: { accent: "#EF4444" }
  };
  const pinkOnly = {
    id: "theme-pink-only",
    name: "Theme",
    appearance: "mixed",
    tones: [],
    tokens: { accent: "#EC4899" }
  };
  const blueOnly = {
    id: "theme-blue-only",
    name: "Theme",
    appearance: "mixed",
    tones: [],
    tokens: { accent: "#3B82F6" }
  };
  assert.equal(scoreTheme(redOnly, "网红社区"), scoreTheme(blueOnly, "网红社区"));
  assert.equal(scoreTheme(pinkOnly, "粉丝社区"), scoreTheme(blueOnly, "粉丝社区"));

  const direction = multiAppearanceDirection();
  assert.ok(direction, "Catalog needs at least one Direction with light and dark Themes");
  const links = catalog.linksByDirectionId.get(direction.id);
  const defaultLink = links.find((link) => link.isDefault);
  assert.equal(selectThemeForDirection(catalog, direction, "").theme.id, defaultLink.themeId);
  assert.equal(selectThemeForDirection(catalog, direction, "浅色").theme.appearance, "light");
  assert.equal(selectThemeForDirection(catalog, direction.id, "深色").theme.appearance, "dark");

  const colorSelectableDirection = catalog.directions.find((candidate) => {
    const candidateThemes = (catalog.linksByDirectionId.get(candidate.id) || [])
      .map((link) => catalog.themeById.get(link.themeId))
      .filter((theme) => /^#[0-9a-f]{6}$/iu.test(theme?.tokens?.accent || ""));
    const accentCounts = new Map();
    for (const theme of candidateThemes) {
      const accent = theme.tokens.accent.toUpperCase();
      accentCounts.set(accent, (accentCounts.get(accent) || 0) + 1);
    }
    return candidateThemes.length > 1 && [...accentCounts.values()].some((count) => count === 1);
  });
  assert.ok(colorSelectableDirection, "Catalog needs a Direction with distinct Theme accents");
  const selectableThemes = (catalog.linksByDirectionId.get(colorSelectableDirection.id) || [])
    .map((link) => catalog.themeById.get(link.themeId));
  const accentCounts = new Map();
  for (const theme of selectableThemes) {
    const accent = theme.tokens.accent.toUpperCase();
    accentCounts.set(accent, (accentCounts.get(accent) || 0) + 1);
  }
  const targetTheme = selectableThemes.find((theme) => accentCounts.get(theme.tokens.accent.toUpperCase()) === 1);
  assert.equal(
    selectThemeForDirection(catalog, colorSelectableDirection, targetTheme.tokens.accent).theme.id,
    targetTheme.id
  );
});

test("recommendation ranks unique Directions before selecting Themes and writes v2 previews", () => {
  const lightDir = temporaryDirectory("style-director-v2-light");
  const darkDir = temporaryDirectory("style-director-v2-dark");
  const light = recommendStyles({
    brief: `${developerBrief} light`,
    count: 5,
    sessionPath: join(lightDir, "session.json")
  });
  const dark = recommendStyles({
    brief: `${developerBrief} dark`,
    count: 5,
    sessionPath: join(darkDir, "session.json")
  });
  const redDir = temporaryDirectory("style-director-v2-red");
  const blueDir = temporaryDirectory("style-director-v2-blue");
  const red = recommendStyles({
    brief: `${developerBrief} red`,
    count: 5,
    sessionPath: join(redDir, "session.json")
  });
  const blue = recommendStyles({
    brief: `${developerBrief} blue`,
    count: 5,
    sessionPath: join(blueDir, "session.json")
  });

  const lightDirectionIds = light.recommendations.map((item) => item.directionId);
  assert.equal(new Set(lightDirectionIds).size, lightDirectionIds.length);
  assert.deepEqual(
    light.recommendations.map((item) => [item.directionId, item.score]),
    dark.recommendations.map((item) => [item.directionId, item.score]),
    "light/dark Theme preferences must not reorder Directions"
  );
  assert.deepEqual(
    red.recommendations.map((item) => [item.directionId, item.score]),
    blue.recommendations.map((item) => [item.directionId, item.score]),
    "brand-color Theme preferences must not reorder Directions"
  );

  for (const item of light.recommendations) {
    assert.deepEqual(item.selection.directionId, item.directionId);
    assert.deepEqual(item.selection.themeId, item.themeId);
    assert.equal(item.theme.id, item.themeId);
    assert.equal(item.previewSpec.directionId, item.directionId);
    assert.equal(
      basename(item.visual.previewCardPath),
      `${item.directionId}--${item.themeId}.svg`
    );
    assert.equal(basename(dirname(item.visual.previewCardPath)), "recommendation-previews");
    assert.equal(existsSync(item.visual.previewCardPath), true);
    assert.equal(item.visual.references.some((reference) => reference.referenceKinds?.includes("direction")), true);
    assert.equal(item.visual.references.some((reference) => reference.referenceKinds?.includes("theme")), true);
  }

  const session = readJson(join(lightDir, "session.json"));
  assert.equal(session.schemaVersion, 2);
  assert.deepEqual(session.shownDirectionIds, lightDirectionIds);
  assert.deepEqual(
    session.lastRecommendations,
    light.recommendations.map(({ directionId, themeId }) => ({ directionId, themeId }))
  );

  const terminal = renderRecommendations(light);
  const gallery = renderRecommendationGalleryHtml(light);
  const first = light.recommendations[0];
  assert.match(terminal, new RegExp(`Direction ID: ${first.directionId}`, "u"));
  assert.match(terminal, new RegExp(`Appearance: ${first.theme.appearance}`, "u"));
  assert.doesNotMatch(terminal, /legacy name:/iu);
  assert.match(gallery, /Direction ID:/u);
  assert.match(gallery, new RegExp(`· ${first.theme.appearance} · <code>${first.themeId}</code>`, "u"));
});

test("every live Theme tone is isolated from Direction ids, scores, and order", () => {
  const dir = temporaryDirectory("style-director-v2-tone-isolation");
  const baseline = recommendStyles({
    brief: developerBrief,
    count: 5,
    sessionPath: join(dir, "baseline.json")
  }).recommendations.map(({ directionId, score }) => ({ directionId, score }));
  const themeTones = [...new Set(catalog.themes.flatMap((theme) => theme.tones || []))].sort();
  assert.equal(themeTones.length > 0, true);

  for (const [index, tone] of themeTones.entries()) {
    const ranked = recommendStyles({
      brief: `${developerBrief} ${tone}`,
      count: 5,
      sessionPath: join(dir, `tone-${index}.json`)
    }).recommendations.map(({ directionId, score }) => ({ directionId, score }));
    assert.deepEqual(ranked, baseline, `Theme tone must not affect Direction ranking: ${tone}`);
  }
});

test("v1 sessions expand aliases while v2 shownDirectionIds remain authoritative", () => {
  const dir = temporaryDirectory("style-director-v2-session");
  const sessionPath = join(dir, "session.json");
  const first = recommendStyles({ brief: developerBrief, count: 1, sessionPath });
  const shownDirectionId = first.recommendations[0].directionId;
  const aliases = legacyAliasesForDirection(catalog, shownDirectionId);
  assert.equal(aliases.length > 0, true);

  const unknownLegacyId = "legacy-style-not-in-this-catalog";
  writeFileSync(sessionPath, `${JSON.stringify({
    brief: developerBrief,
    shownStyleIds: [aliases[0].legacyStyleId, unknownLegacyId]
  }, null, 2)}\n`, "utf8");
  const next = recommendStyles({ brief: developerBrief, count: 1, again: true, sessionPath });
  assert.equal(next.recommendations.some((item) => item.directionId === shownDirectionId), false);

  const migrated = readJson(sessionPath);
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.shownDirectionIds.includes(shownDirectionId), true);
  assert.equal(aliases.every((alias) => migrated.shownStyleIds.includes(alias.legacyStyleId)), true);
  assert.equal(migrated.shownStyleIds.includes(unknownLegacyId), true);

  const zeroScoreDirection = catalog.directions.find((direction) => (
    direction.id !== shownDirectionId
    && scoreProfile(direction, developerBrief) === 0
    && legacyAliasesForDirection(catalog, direction.id).length > 0
  ));
  assert.ok(zeroScoreDirection);
  const ignoredLegacyAlias = legacyAliasesForDirection(catalog, zeroScoreDirection.id)[0].legacyStyleId;
  writeFileSync(sessionPath, `${JSON.stringify({
    schemaVersion: 2,
    shownDirectionIds: [shownDirectionId],
    shownStyleIds: [ignoredLegacyAlias, unknownLegacyId]
  }, null, 2)}\n`, "utf8");
  recommendStyles({ brief: developerBrief, count: 1, again: true, sessionPath });
  const authoritative = readJson(sessionPath);
  assert.equal(authoritative.shownDirectionIds.includes(zeroScoreDirection.id), false);
  assert.equal(authoritative.shownStyleIds.includes(ignoredLegacyAlias), false);
  assert.equal(authoritative.shownStyleIds.includes(unknownLegacyId), true);
});

test("Apply restores alias Themes, supports explicit Themes, and writes v2 provenance", () => {
  const alias = nonDefaultLegacyAlias();
  assert.ok(alias, "Catalog needs a non-default historical Theme alias");
  const projectDir = temporaryDirectory("style-director-v2-apply-alias");
  const result = applyStyle({
    styleId: alias.legacyStyleId,
    projectDir,
    brief: "Developer operations dashboard"
  });

  assert.deepEqual(result.selection, {
    directionId: alias.directionId,
    themeId: alias.themeId
  });
  const selected = readJson(join(projectDir, ".ui-style-director", "selected-style.json"));
  const attribution = readJson(join(projectDir, ".ui-style-director", "source-attribution.json"));
  const design = readFileSync(result.designPath, "utf8");
  const draft = readFileSync(result.draftPath, "utf8");
  assert.equal(selected.schemaVersion, 2);
  assert.equal(selected.inputKind, "legacy-style");
  assert.equal(selected.legacyStyleId, alias.legacyStyleId);
  assert.deepEqual(selected.selection, result.selection);
  const legacyStyle = loadStyleProfiles().find((profile) => profile.id === alias.legacyStyleId);
  const rawLegacyVisual = loadStyleVisuals().find((visual) => visual.styleId === alias.legacyStyleId);
  const legacyPreviewPath = join(
    dirname(fileURLToPath(new URL("../src/core.mjs", import.meta.url))),
    "..",
    "catalog",
    "previews",
    `${alias.legacyStyleId}.svg`
  );
  const legacyVisual = {
    ...rawLegacyVisual,
    previewCardPath: legacyPreviewPath,
    previewCardMarkdownPath: legacyPreviewPath.replaceAll("\\", "/"),
    references: expandVisualReferences(rawLegacyVisual.references)
  };
  assert.deepEqual(selected.style, legacyStyle);
  assert.deepEqual(selected.visual, legacyVisual);
  assert.deepEqual(result.style, legacyStyle);
  assert.deepEqual(result.visual, legacyVisual);
  assert.equal(selected.style.sourceProvider, legacyStyle.sourceProvider);
  assert.deepEqual(selected.style.palette, legacyStyle.palette);
  assert.equal(selected.visual.references.length, legacyVisual.references.length);
  assert.equal(selected.visualSelection.styleId, alias.directionId);
  assert.deepEqual(result.visualSelection, selected.visualSelection);
  assert.equal(attribution.schemaVersion, 2);
  assert.equal(Array.isArray(attribution.directionReferences), true);
  assert.equal(Array.isArray(attribution.themeSources), true);
  assert.equal(attribution.sourceProvider, legacyStyle.sourceProvider);
  assert.equal(attribution.sourceSlug, legacyStyle.sourceSlug);
  assert.deepEqual(attribution.visualReferences, legacyVisual.references);
  assert.match(design, new RegExp(`Direction id: ${alias.directionId}`, "u"));
  assert.match(design, new RegExp(`Theme id: ${alias.themeId}`, "u"));
  assert.match(draft, new RegExp(`data-direction-id="${alias.directionId}"`, "u"));
  assert.match(draft, new RegExp(`data-theme-id="${alias.themeId}"`, "u"));

  const linkedThemes = catalog.linksByDirectionId.get(alias.directionId);
  const explicitLink = linkedThemes.find((link) => link.themeId !== alias.themeId) || linkedThemes[0];
  const explicitDir = temporaryDirectory("style-director-v2-apply-explicit");
  const explicit = applyStyle({
    styleId: alias.directionId,
    themeId: explicitLink.themeId,
    projectDir: explicitDir
  });
  assert.deepEqual(explicit.selection, {
    directionId: alias.directionId,
    themeId: explicitLink.themeId
  });
  assert.equal(readJson(join(explicitDir, ".ui-style-director", "selected-style.json")).inputKind, "direction");
});

test("Apply stages and replaces all five artifacts transactionally while preserving unrelated state", () => {
  const alias = catalog.aliases[0];
  const forceDir = temporaryDirectory("style-director-v2-force-transaction");
  applyStyle({ styleId: alias.legacyStyleId, projectDir: forceDir, brief: "Initial developer product" });
  const unrelatedPath = join(forceDir, ".ui-style-director", "keep-me.txt");
  writeFileSync(unrelatedPath, "preserve unrelated project state\n", "utf8");

  const replaced = applyStyle({
    styleId: alias.legacyStyleId,
    projectDir: forceDir,
    brief: "Replacement developer product",
    force: true
  });
  assert.match(readFileSync(replaced.designPath, "utf8"), /Replacement developer product/u);
  assert.equal(readFileSync(unrelatedPath, "utf8"), "preserve unrelated project state\n");
  assert.equal(existsSync(join(forceDir, ".ui-style-director", "first-viewport-draft.svg")), true);
  assert.equal(existsSync(join(forceDir, ".ui-style-director", "selected-style.json")), true);
  assert.equal(existsSync(join(forceDir, ".ui-style-director", "recommended-components.json")), true);
  assert.equal(existsSync(join(forceDir, ".ui-style-director", "source-attribution.json")), true);
  assert.equal(
    readdirSync(dirname(forceDir)).some((name) => (
      name.startsWith(`.${basename(forceDir)}.ai-ui-style-director-staging-`)
      || name.startsWith(`.${basename(forceDir)}.ai-ui-style-director-backup-`)
    )),
    false
  );
});

test("Apply supports a project beneath a directory junction", () => {
  const root = temporaryDirectory("style-director-v2-junction-parent");
  const realParent = join(root, "real-parent");
  const linkedParent = join(root, "linked-parent");
  mkdirSync(realParent);
  symlinkSync(realParent, linkedParent, process.platform === "win32" ? "junction" : "dir");

  const alias = catalog.aliases[0];
  const projectDir = join(linkedParent, "project");
  const result = applyStyle({
    styleId: alias.legacyStyleId,
    projectDir,
    brief: "Developer product below a linked workspace parent"
  });

  assert.equal(existsSync(result.designPath), true);
  assert.equal(existsSync(join(realParent, "project", "DESIGN.md")), true);
  assert.equal(existsSync(join(realParent, "project", ".ui-style-director", "selected-style.json")), true);
  assert.equal(
    readdirSync(realParent).some((name) => name.includes("ai-ui-style-director-staging")),
    false
  );
});

test("Apply rejects unknown or unlinked selections before writing any artifact", () => {
  const direction = multiAppearanceDirection();
  assert.ok(direction);
  const linked = new Set((catalog.linksByDirectionId.get(direction.id) || []).map((link) => link.themeId));
  const unlinkedTheme = catalog.themes.find((theme) => !linked.has(theme.id));
  assert.ok(unlinkedTheme);

  const unlinkedDir = temporaryDirectory("style-director-v2-unlinked");
  assert.throws(
    () => applyStyle({ styleId: direction.id, themeId: unlinkedTheme.id, projectDir: unlinkedDir }),
    /not linked to direction/u
  );
  assert.deepEqual(readdirSync(unlinkedDir), []);

  const unknownDir = temporaryDirectory("style-director-v2-unknown");
  assert.throws(
    () => applyStyle({ styleId: "not-a-catalog-selection", projectDir: unknownDir }),
    /Unknown catalog selection id/u
  );
  assert.deepEqual(readdirSync(unknownDir), []);

  const existingDir = temporaryDirectory("style-director-v2-existing-design");
  const designPath = join(existingDir, "DESIGN.md");
  writeFileSync(designPath, "keep this file exactly\n", "utf8");
  const validAlias = catalog.aliases[0];
  assert.throws(
    () => applyStyle({ styleId: validAlias.legacyStyleId, projectDir: existingDir }),
    /DESIGN\.md already exists/u
  );
  assert.equal(readFileSync(designPath, "utf8"), "keep this file exactly\n");
  assert.deepEqual(readdirSync(existingDir), ["DESIGN.md"]);

  const directoryDesignDir = temporaryDirectory("style-director-v2-directory-design");
  const directoryDesignPath = join(directoryDesignDir, "DESIGN.md");
  mkdirSync(directoryDesignPath);
  writeFileSync(join(directoryDesignPath, "keep.txt"), "keep directory content\n", "utf8");
  assert.throws(
    () => applyStyle({
      styleId: validAlias.legacyStyleId,
      projectDir: directoryDesignDir,
      force: true
    }),
    /must be a regular file/u
  );
  assert.equal(readFileSync(join(directoryDesignPath, "keep.txt"), "utf8"), "keep directory content\n");
  assert.deepEqual(readdirSync(directoryDesignDir), ["DESIGN.md"]);
  assert.equal(existsSync(join(directoryDesignDir, ".ui-style-director")), false);
  assert.equal(
    readdirSync(dirname(directoryDesignDir)).some((name) => (
      name.startsWith(`.${basename(directoryDesignDir)}.ai-ui-style-director-staging-`)
      || name.startsWith(`.${basename(directoryDesignDir)}.ai-ui-style-director-backup-`)
    )),
    false
  );
});

test("CLI documents and forwards an explicit Direction and Theme selection", () => {
  const help = spawnSync(process.execPath, [binPath, "help"], { encoding: "utf8" });
  assert.equal(help.status, 0, help.stderr);
  assert.match(
    help.stdout,
    /apply --style <direction-or-legacy-id> \[--theme <theme-id>\]/u
  );

  const direction = catalog.directions[0];
  const link = catalog.linksByDirectionId.get(direction.id)[0];
  const jsonDir = temporaryDirectory("style-director-v2-cli-json");
  const jsonResult = spawnSync(process.execPath, [
    binPath,
    "apply",
    "--style",
    direction.id,
    "--theme",
    link.themeId,
    "--project",
    jsonDir,
    "--brief",
    "Developer dashboard with a focused first viewport",
    "--json"
  ], { encoding: "utf8" });
  assert.equal(jsonResult.status, 0, jsonResult.stderr);
  const output = JSON.parse(jsonResult.stdout);
  assert.deepEqual(output.selection, {
    directionId: direction.id,
    themeId: link.themeId
  });
  assert.deepEqual(
    readJson(join(jsonDir, ".ui-style-director", "selected-style.json")).selection,
    output.selection
  );

  const textDir = temporaryDirectory("style-director-v2-cli-text");
  const textResult = spawnSync(process.execPath, [
    binPath,
    "apply",
    "--style",
    direction.id,
    "--theme",
    link.themeId,
    "--project",
    textDir
  ], { encoding: "utf8" });
  assert.equal(textResult.status, 0, textResult.stderr);
  assert.match(textResult.stdout, new RegExp(`Selected direction: .*\\(${direction.id}\\)`, "u"));
  assert.match(textResult.stdout, new RegExp(`Selected theme: .*\\(${link.themeId}\\)`, "u"));
});
