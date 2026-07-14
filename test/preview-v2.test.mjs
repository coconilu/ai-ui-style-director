import assert from "node:assert/strict";
import { test } from "node:test";
import { loadCatalogV2 } from "../src/catalog-v2.mjs";
import { renderDirectionPreviewSvg } from "../src/preview.mjs";

const catalog = loadCatalogV2();

function defaultSelection(directionId) {
  const direction = catalog.directionById.get(directionId);
  const link = catalog.linksByDirectionId
    .get(directionId)
    .find((candidate) => candidate.isDefault);
  return {
    direction,
    theme: catalog.themeById.get(link.themeId),
    previewSpec: catalog.previewSpecByDirectionId.get(directionId)
  };
}

function structuralFingerprint(svg, themes) {
  let normalized = svg.replace(/data-theme-id="[^"]+"/u, 'data-theme-id="$THEME"');
  for (const theme of themes) {
    for (const token of Object.values(theme.tokens)) {
      normalized = normalized.replaceAll(token, "$COLOR");
    }
  }
  return normalized;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function expectedRole(previewSpec, block) {
  if (previewSpec.hierarchy.primary === block) return "primary";
  if (previewSpec.hierarchy.secondary.includes(block)) return "secondary";
  if (previewSpec.hierarchy.supporting.includes(block)) return "supporting";
  throw new Error(`Block ${block} is not present in the PreviewSpec hierarchy.`);
}

function visibleModuleBoxes(svg) {
  return [...svg.matchAll(
    /<g data-block="[^"]+" data-role="[^"]+" data-module-kind="[^"]+" transform="translate\(([^)]+)\)"><rect x="0" y="0" width="([^"]+)" height="([^"]+)"/gu
  )].map((match) => {
    const [x, y] = match[1].trim().split(/\s+/u).map(Number);
    return { x, y, width: Number(match[2]), height: Number(match[3]) };
  });
}

function visibleModuleGeometry(svg) {
  return visibleModuleBoxes(svg)
    .map(({ x, y, width, height }) => `${x} ${y}:${width}:${height}`);
}

test("renders countdown campaign and wellness ritual with distinct content-driven structures", () => {
  const campaign = defaultSelection("launch-community-countdown-campaign");
  const wellness = defaultSelection("consumer-wellness-companion-soft");
  const campaignSvg = renderDirectionPreviewSvg(campaign);
  const wellnessSvg = renderDirectionPreviewSvg(wellness);

  assert.match(campaignSvg, /data-layout-signature="countdown-rail"/u);
  assert.match(campaignSvg, />08 : 24 : 16</u);
  assert.match(wellnessSvg, /data-layout-signature="ritual-journal"/u);
  assert.match(wellnessSvg, />72%<\/text>/u);
  assert.notEqual(campaignSvg, wellnessSvg);

  for (const block of campaign.previewSpec.contentBlocks) {
    assert.match(campaignSvg, new RegExp(`data-block="${block}"`, "u"));
  }
  for (const block of wellness.previewSpec.contentBlocks) {
    assert.match(wellnessSvg, new RegExp(`data-block="${block}"`, "u"));
  }
});

test("renders every live PreviewSpec block once in its hierarchy role as visible content", () => {
  const moduleKinds = new Set();

  for (const direction of catalog.directions) {
    const selection = defaultSelection(direction.id);
    const svg = renderDirectionPreviewSvg(selection);

    for (const block of selection.previewSpec.contentBlocks) {
      const role = expectedRole(selection.previewSpec, block);
      const blockPattern = new RegExp(`data-block="${escapeRegExp(block)}"`, "gu");
      const visiblePattern = new RegExp(
        `<g data-block="${escapeRegExp(block)}" data-role="${role}"[^>]*>(?:<rect|<circle|<path|<line)`,
        "u"
      );
      assert.equal([...svg.matchAll(blockPattern)].length, 1, `${direction.id}: ${block}`);
      assert.match(svg, visiblePattern, `${direction.id}: ${block} must render visible geometry`);
    }

    for (const match of svg.matchAll(/data-module-kind="([^"]+)"/gu)) {
      moduleKinds.add(match[1]);
    }

    if (/data-layout-signature="semantic-/u.test(svg)) {
      const boxes = visibleModuleBoxes(svg);
      assert.equal(boxes.length, selection.previewSpec.contentBlocks.length);
      for (const box of boxes) {
        assert.equal(Object.values(box).every(Number.isFinite), true, `${direction.id}: finite geometry`);
        assert.equal(box.x >= 0 && box.y >= 0, true, `${direction.id}: non-negative origin`);
        assert.equal(box.width > 0 && box.height > 0, true, `${direction.id}: positive size`);
        assert.equal(box.x + box.width <= 1120, true, `${direction.id}: horizontal bounds`);
        assert.equal(box.y + box.height <= 520, true, `${direction.id}: vertical bounds`);
      }
    }
  }

  assert.deepEqual(
    [...moduleKinds].sort(),
    ["action", "code", "data", "evidence", "media", "metric", "navigation", "text"]
  );
});

test("contentPattern creates multiple visible geometries within one layoutArchetype", () => {
  const selection = defaultSelection("dashboard-incident-response-wallboard");
  const contentPatterns = [
    "dashboard-incident-response-wallboard",
    "data-dashboard-command-center",
    "metrics-and-workflows"
  ];
  const geometries = contentPatterns.map((contentPattern) => {
    const svg = renderDirectionPreviewSvg({
      ...selection,
      previewSpec: { ...selection.previewSpec, contentPattern }
    });
    const geometry = visibleModuleGeometry(svg);
    assert.equal(geometry.length, selection.previewSpec.contentBlocks.length);
    return geometry.join("|");
  });

  assert.equal(new Set(geometries).size, 3);
});

test("uses hierarchy roles to place content blocks", () => {
  const campaign = defaultSelection("launch-community-countdown-campaign");
  const previewSpec = {
    ...campaign.previewSpec,
    hierarchy: {
      primary: "countdown",
      secondary: ["campaign-message", "community-proof"],
      supporting: ["reminder-action"]
    }
  };
  const svg = renderDirectionPreviewSvg({ ...campaign, previewSpec });

  assert.ok(svg.indexOf('data-block="countdown"') < svg.indexOf('data-block="campaign-message"'));
  assert.match(svg, />COUNTDOWN<\/text>/u);
});

test("keeps a semantic Direction structure stable across all of its linked Themes", () => {
  const directionId = "developer-dashboard-grid-data";
  const direction = catalog.directionById.get(directionId);
  const previewSpec = catalog.previewSpecByDirectionId.get(directionId);
  const themes = catalog.linksByDirectionId
    .get(directionId)
    .map((link) => catalog.themeById.get(link.themeId));
  const fingerprints = themes.map((theme) => structuralFingerprint(
    renderDirectionPreviewSvg({ direction, theme, previewSpec }),
    themes
  ));

  assert.equal(themes.length > 1, true);
  assert.equal(new Set(fingerprints).size, 1);
});

test("resolves renderers by contentPattern, then layoutArchetype, then legacyVariant", () => {
  const selection = defaultSelection("launch-community-countdown-campaign");
  const contentPatternSvg = renderDirectionPreviewSvg({
    ...selection,
    previewSpec: {
      ...selection.previewSpec,
      layoutArchetype: "dashboard-grid",
      legacyVariant: "fintech"
    }
  });
  assert.match(contentPatternSvg, /data-layout-signature="countdown-rail"/u);
  assert.doesNotMatch(contentPatternSvg, />PERFORMANCE<\/text>/u);

  const layoutSvg = renderDirectionPreviewSvg({
    ...selection,
    previewSpec: {
      ...selection.previewSpec,
      contentPattern: "unmapped-pattern",
      layoutArchetype: "dashboard-grid",
      legacyVariant: "brand"
    }
  });
  assert.match(layoutSvg, /data-layout-signature="semantic-dashboard-grid"/u);
  assert.match(layoutSvg, /data-block="campaign-message" data-role="primary"/u);
  assert.doesNotMatch(layoutSvg, />A human story<\/text>/u);

  const legacySvg = renderDirectionPreviewSvg({
    ...selection,
    previewSpec: {
      ...selection.previewSpec,
      contentPattern: "unmapped-pattern",
      layoutArchetype: "unmapped-layout",
      legacyVariant: "brand"
    }
  });
  assert.match(legacySvg, />A human story<\/text>/u);

  const prototypeNameSvg = renderDirectionPreviewSvg({
    ...selection,
    previewSpec: {
      ...selection.previewSpec,
      contentPattern: "constructor",
      layoutArchetype: "dashboard-grid",
      legacyVariant: "brand"
    }
  });
  assert.match(prototypeNameSvg, /data-layout-signature="semantic-dashboard-grid"/u);
});

test("rejects incomplete, extra, or injectable Direction Theme tokens", () => {
  const selection = defaultSelection("launch-community-countdown-campaign");
  const missingTokenTheme = structuredClone(selection.theme);
  delete missingTokenTheme.tokens.border;
  assert.throws(
    () => renderDirectionPreviewSvg({ ...selection, theme: missingTokenTheme }),
    /must provide exactly these tokens/u
  );

  const extraTokenTheme = structuredClone(selection.theme);
  extraTokenTheme.tokens.shadow = "#000000";
  assert.throws(
    () => renderDirectionPreviewSvg({ ...selection, theme: extraTokenTheme }),
    /must provide exactly these tokens/u
  );

  const injectableTheme = structuredClone(selection.theme);
  injectableTheme.tokens.accent = `#000000\"/><script>alert(1)<\/script>`;
  assert.throws(
    () => renderDirectionPreviewSvg({ ...selection, theme: injectableTheme }),
    /invalid accent color token/u
  );
});
