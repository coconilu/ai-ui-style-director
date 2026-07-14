import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CATALOG_BROWSER_SCHEMA_VERSION,
  CATALOG_PAGE_SIZE,
  DEFAULT_CATALOG_ORDER_STRATEGY,
  DEFAULT_HOSTED_CATALOG_URL,
  buildBalancedCatalogEntryOrder,
  buildStyleCatalog,
  buildStyleCatalogStaticAssets,
  computeCatalogRevision,
  filterCatalogEntries,
  hostedCatalogInfo,
  renderCatalogBrowserPage,
  searchCatalogEntries,
  startStyleCatalogServer
} from "../src/catalog-browser.mjs";
import { loadCatalogV2 } from "../src/catalog-v2.mjs";
import {
  EXPERIENCE_TYPE_DEFINITIONS,
  EXPERIENCE_TYPE_IDS
} from "../src/experience-types.mjs";
import { writeCatalogSite } from "../scripts/build-catalog-site.mjs";

const binPath = fileURLToPath(new URL("../bin/ai-ui-style-director.mjs", import.meta.url));
const FACET_GROUPS = ["experienceType", "family", "pageTypes", "density", "tones", "componentKits"];

function valuesForTag(entry, group) {
  const value = entry.tags[group];
  return Array.isArray(value) ? value : [value];
}

function sortedIds(entries) {
  return entries.map((entry) => entry.id).sort();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readDirectorySnapshot(rootDir, relativeDir = "") {
  const snapshot = {};
  const absoluteDir = join(rootDir, relativeDir);
  for (const entry of readdirSync(absoluteDir, { withFileTypes: true })) {
    const relativePath = join(relativeDir, entry.name);
    if (entry.isDirectory()) Object.assign(snapshot, readDirectorySnapshot(rootDir, relativePath));
    else snapshot[relativePath.replaceAll("\\", "/")] = readFileSync(join(rootDir, relativePath), "utf8");
  }
  return snapshot;
}

function assertCatalogResponseHeaders(response, expectedContentType) {
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", expectedContentType);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const policy = response.headers.get("content-security-policy") || "";
  assert.match(policy, /default-src 'none'/);
  assert.match(policy, /script-src 'self'/);
  assert.match(policy, /style-src 'self'/);
  assert.match(policy, /img-src 'self'/);
  assert.doesNotMatch(policy, /img-src[^;]*data:/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
}

test("buildStyleCatalog exposes one card per direction with searchable theme choices", () => {
  const catalog = buildStyleCatalog();
  const canonical = loadCatalogV2();
  const directionCount = canonical.directions.length;

  assert.equal(catalog.schemaVersion, CATALOG_BROWSER_SCHEMA_VERSION);
  assert.match(catalog.catalogRevision, /^[a-f0-9]{16}$/);
  assert.equal(catalog.directionCount, directionCount);
  assert.equal(catalog.themeCount, canonical.themes.length);
  assert.equal(catalog.linkCount, canonical.links.length);
  assert.equal(catalog.styleCount, directionCount);
  assert.equal(catalog.entries.length, directionCount);
  assert.equal(new Set(catalog.entries.map((entry) => entry.id)).size, directionCount);
  assert.equal(catalog.links.length, canonical.links.length);
  assert.equal(catalog.aliases.length, canonical.aliases.length);
  assert.equal(Number.isInteger(catalog.sourceCount), true);
  assert.equal(catalog.sourceCount >= catalog.directionCount, true);
  assert.equal(catalog.pageSize, CATALOG_PAGE_SIZE);

  for (const entry of catalog.entries) {
    assert.equal(typeof entry.id, "string");
    assert.notEqual(entry.id, "");
    assert.equal(typeof entry.name, "string");
    assert.notEqual(entry.name, "");
    assert.equal(EXPERIENCE_TYPE_IDS.includes(entry.experienceType), true);
    assert.equal(typeof entry.searchText, "string");
    assert.notEqual(entry.searchText.trim(), "");
    assert.equal(entry.searchText, entry.searchText.toLowerCase());

    assert.equal(Object.hasOwn(entry, "previewDataUri"), false);
    assert.equal(entry.themeCount, entry.themes.length);
    assert.equal(entry.themeCount > 0, true);
    assert.equal(entry.previewSpec.directionId, entry.id);
    assert.equal(typeof entry.previewSpec.contentPattern, "string");
    const defaultTheme = entry.themes.find((theme) => theme.id === entry.defaultThemeId);
    assert.ok(defaultTheme, `${entry.id} must expose its default theme`);
    assert.equal(defaultTheme.isDefault, true);
    assert.equal(entry.previewUrl, defaultTheme.previewUrl);

    const canonicalLinks = canonical.links.filter((link) => link.directionId === entry.id);
    assert.equal(entry.themes.length, canonicalLinks.length);
    for (const theme of entry.themes) {
      assert.equal(
        theme.previewUrl,
        `previews/v2/${entry.id}/${theme.id}.svg?v=${catalog.catalogRevision}`
      );
      assert.equal(typeof theme.name, "string");
      assert.equal(typeof theme.tokens, "object");
      assert.equal(Array.isArray(theme.sources), true);
      assert.equal(theme.sources.length > 0, true);
      assert.equal(theme.sources.every((source) => (
        typeof source.label === "string"
        && (source.sourceUrl === null || /^https:\/\//u.test(source.sourceUrl))
      )), true, `${theme.id} must expose a visible theme source`);
      assert.equal(searchCatalogEntries(catalog, theme.id).some((candidate) => candidate.id === entry.id), true);
    }

    assert.equal(typeof entry.tags, "object");
    for (const group of FACET_GROUPS) {
      const values = valuesForTag(entry, group);
      assert.equal(values.length > 0, true, `${entry.id} must expose ${group} tags`);
      assert.equal(values.every((value) => typeof value === "string" && value.length > 0), true);
    }

    assert.equal(Array.isArray(entry.references), true);
    assert.equal(entry.references.length >= 3, true);
    for (const reference of entry.references) {
      assert.equal(typeof reference.label, "string");
      const referenceUrls = [
        reference.lightPreviewUrl,
        reference.darkPreviewUrl,
        reference.pageUrl,
        reference.sourceUrl
      ]
        .filter(Boolean);
      assert.equal(referenceUrls.length > 0, true, `${entry.id} references must expose a consumer URL`);
      assert.equal(referenceUrls.every((url) => /^https:\/\//u.test(url)), true);
    }
  }

  assert.equal(typeof catalog.facets, "object");
  for (const group of FACET_GROUPS) {
    assert.equal(Array.isArray(catalog.facets[group]), true, `Missing ${group} facet group`);
    assert.equal(catalog.facets[group].length > 0, true);
    assert.deepEqual(catalog.facets[group], [...new Set(catalog.facets[group])]);

    const entryValues = new Set(catalog.entries.flatMap((entry) => valuesForTag(entry, group)));
    assert.equal([...entryValues].every((value) => catalog.facets[group].includes(value)), true);
  }
  assert.deepEqual(catalog.facets.experienceType, EXPERIENCE_TYPE_IDS);
  assert.deepEqual(catalog.experienceTypes.map((definition) => definition.id), EXPERIENCE_TYPE_IDS);
  assert.deepEqual(Object.keys(catalog.facetLabels.experienceType), EXPERIENCE_TYPE_IDS);
  for (const experienceType of EXPERIENCE_TYPE_IDS) {
    assert.equal(typeof catalog.facetLabels.experienceType[experienceType].zh, "string");
    assert.equal(typeof catalog.facetLabels.experienceType[experienceType].en, "string");
  }

  assert.equal(catalog.searchIndexMeta.documentCount, directionCount);
  assert.equal(catalog.searchIndexMeta.tokenCount, Object.keys(catalog.searchIndex).length);
  assert.equal(catalog.searchIndexMeta.strategy, "exact-token-postings-with-substring-fallback");
  assert.equal(catalog.searchIndexMeta.postingValue, "entry-index");
  for (const [index, entry] of catalog.entries.entries()) {
    assert.equal(catalog.entryIndex[entry.id], index);
    for (const token of new Set(entry.searchText.split(" ").filter(Boolean))) {
      assert.equal(catalog.searchIndex[token].includes(index), true, `${token} must index ${entry.id}`);
    }
  }
  for (const indexes of Object.values(catalog.searchIndex)) {
    assert.equal(Array.isArray(indexes), true);
    assert.equal(new Set(indexes).size, indexes.length);
    assert.equal(indexes.every((index) => Number.isInteger(index) && index >= 0 && index < directionCount), true);
  }

  const serialized = JSON.stringify(catalog);
  assert.doesNotMatch(serialized, /data:image\/svg\+xml/i);
  assert.deepEqual(JSON.parse(serialized), catalog);
});

test("default browsing round-robins experience types without changing canonical search order", () => {
  const catalog = buildStyleCatalog();
  const defaultEntries = catalog.defaultEntryOrder.map((index) => catalog.entries[index]);
  const firstPage = defaultEntries.slice(0, CATALOG_PAGE_SIZE);
  const firstPageCounts = Object.fromEntries(EXPERIENCE_TYPE_IDS.map((experienceType) => [
    experienceType,
    firstPage.filter((entry) => entry.experienceType === experienceType).length
  ]));

  assert.deepEqual(catalog.defaultOrderMeta, {
    strategy: DEFAULT_CATALOG_ORDER_STRATEGY,
    field: "experienceType"
  });
  assert.equal(catalog.defaultEntryOrder.length, catalog.entries.length);
  assert.equal(new Set(catalog.defaultEntryOrder).size, catalog.entries.length);
  assert.deepEqual(sortedIds(defaultEntries), sortedIds(catalog.entries));
  assert.deepEqual(firstPageCounts, Object.fromEntries(
    EXPERIENCE_TYPE_IDS.map((experienceType) => [experienceType, 4])
  ));
  assert.equal(
    firstPage.every((entry, index) => index === 0 || entry.experienceType !== firstPage[index - 1].experienceType),
    true
  );

  for (const experienceType of EXPERIENCE_TYPE_IDS) {
    assert.deepEqual(
      defaultEntries.filter((entry) => entry.experienceType === experienceType).map((entry) => entry.id),
      catalog.entries.filter((entry) => entry.experienceType === experienceType).map((entry) => entry.id)
    );
  }

  const canonicalAdminOrder = catalog.entries
    .filter((entry) => entry.experienceType === "admin-console")
    .map((entry) => entry.id);
  assert.deepEqual(
    filterCatalogEntries(catalog, {
      filters: { experienceType: ["admin-console"] }
    }).map((entry) => entry.id),
    canonicalAdminOrder
  );
  assert.throws(
    () => buildBalancedCatalogEntryOrder([{ id: "uncontrolled", experienceType: "desktop-game" }]),
    /uncontrolled experienceType/u
  );

  const sparseEntries = [
    { id: "marketing-a", experienceType: "marketing-site" },
    { id: "admin-a", experienceType: "admin-console" },
    { id: "marketing-b", experienceType: "marketing-site" },
    { id: "consumer-a", experienceType: "consumer-app" },
    { id: "admin-b", experienceType: "admin-console" },
    { id: "marketing-c", experienceType: "marketing-site" },
    { id: "admin-c", experienceType: "admin-console" },
    { id: "marketing-d", experienceType: "marketing-site" }
  ];
  const originalSparseEntries = structuredClone(sparseEntries);
  const sparseOrder = buildBalancedCatalogEntryOrder(sparseEntries);
  assert.deepEqual(sparseOrder, [3, 0, 1, 2, 4, 5, 6, 7]);
  assert.deepEqual(sparseEntries, originalSparseEntries);
  assert.deepEqual(
    sparseOrder.map((index) => sparseEntries[index].id).sort(),
    sparseEntries.map((entry) => entry.id).sort()
  );
});

test("catalog revision and hosted URL are deterministic and detect catalog changes", () => {
  const canonical = loadCatalogV2();
  const revisionInput = {
    directions: canonical.directions,
    themes: canonical.themes,
    links: canonical.links,
    previewSpecs: canonical.previewSpecs,
    aliases: canonical.aliases
  };
  const revision = computeCatalogRevision(revisionInput);
  const repeated = computeCatalogRevision(structuredClone(revisionInput));
  const changed = structuredClone(revisionInput);
  changed.directions[0].name = `${changed.directions[0].name} changed`;

  assert.equal(repeated, revision);
  assert.notEqual(computeCatalogRevision(changed), revision);

  const catalog = buildStyleCatalog();
  const info = hostedCatalogInfo({ catalog, baseUrl: "https://example.test/catalog/" });
  const url = new URL(info.catalogUrl);
  assert.equal(url.origin, "https://example.test");
  assert.equal(url.pathname, "/catalog/");
  assert.equal(url.searchParams.get("expectedRevision"), catalog.catalogRevision);
  assert.equal(info.hosted, true);
  assert.equal(info.directionCount, catalog.directionCount);
  assert.equal(info.themeCount, catalog.themeCount);
  assert.equal(info.linkCount, catalog.linkCount);
  assert.equal(info.styleCount, catalog.styleCount);
  const normalizedUrl = new URL(hostedCatalogInfo({
    catalog,
    baseUrl: "https://example.test/catalog?from=test"
  }).catalogUrl);
  assert.equal(normalizedUrl.pathname, "/catalog/");
  assert.equal(normalizedUrl.searchParams.get("from"), "test");
  assert.equal(normalizedUrl.searchParams.get("expectedRevision"), catalog.catalogRevision);
  assert.equal(DEFAULT_HOSTED_CATALOG_URL, "https://coconilu.github.io/ai-ui-style-director/");
  assert.throws(() => hostedCatalogInfo({ catalog, baseUrl: "not a URL" }), /Invalid hosted catalog URL/);
  assert.throws(() => hostedCatalogInfo({ catalog, baseUrl: "file:///tmp/catalog/" }), /Invalid hosted catalog URL/);
  assert.throws(() => hostedCatalogInfo({ catalog, baseUrl: "https://user:secret@example.test/" }), /Invalid hosted catalog URL/);
});

test("static catalog assets are project-subpath safe and complete", () => {
  const catalog = buildStyleCatalog();
  const { assets } = buildStyleCatalogStaticAssets({ catalog });
  const html = String(assets.get("index.html").body);
  const appScript = String(assets.get("app.js").body);
  const styles = String(assets.get("styles.css").body);
  const payload = JSON.parse(String(assets.get("catalog.json").body));
  const v2PreviewPaths = new Set(catalog.entries.flatMap((entry) => (
    entry.themes.map((theme) => theme.previewUrl.split("?", 1)[0])
  )));
  const legacyPreviewPaths = new Set(catalog.aliases.map((alias) => `previews/${alias.legacyStyleId}.svg`));

  assert.equal(assets.size, v2PreviewPaths.size + legacyPreviewPaths.size + 6);
  for (const assetPath of ["index.html", "catalog.json", "app.js", "styles.css", "favicon.svg", ".nojekyll"]) {
    assert.equal(assets.has(assetPath), true, `Missing static asset: ${assetPath}`);
  }
  for (const entry of catalog.entries) {
    assert.equal(entry.previewUrl.startsWith("/"), false);
    for (const theme of entry.themes) {
      assert.equal(
        assets.has(theme.previewUrl.split("?", 1)[0]),
        true,
        `Missing preview asset: ${entry.id} + ${theme.id}`
      );
    }
  }
  for (const assetPath of legacyPreviewPaths) {
    assert.equal(assets.has(assetPath), true, `Missing legacy preview asset: ${assetPath}`);
  }

  assert.doesNotMatch(html, /\b(?:href|src)="\//i);
  assert.doesNotMatch(html, /\bstyle=/i);
  assert.doesNotMatch(appScript, /fetch\("\//);
  assert.doesNotMatch(appScript, /\.style\s*=/u);
  assert.match(html, new RegExp(`catalog-revision" content="${catalog.catalogRevision}`));
  assert.match(html, new RegExp(`styles\\.css\\?v=${catalog.catalogRevision}`));
  assert.match(appScript, /expectedRevision/);
  assert.match(appScript, /catalog\.json/);
  assert.match(appScript, /FACET_ORDER = \["experienceType"/u);
  assert.match(appScript, /defaultEntryOrder/u);
  assert.match(appScript, /group \+ ":" \+ value/u);
  assert.match(styles, new RegExp(`\\.theme-palette-${catalog.entries[0].themes[0].id}\\{`));
  assert.equal(payload.catalogRevision, catalog.catalogRevision);
});

test("static catalog build writes a deterministic Pages artifact", () => {
  const canonical = loadCatalogV2();
  const expectedPreviewCount = canonical.links.length + canonical.aliases.length;
  const tempDir = mkdtempSync(join(tmpdir(), "style-director-pages-"));
  const outputDir = join(tempDir, "site");
  assert.throws(
    () => writeCatalogSite({ outputDir }),
    /external output requires an explicit override/
  );
  const first = writeCatalogSite({ outputDir, allowExternalOutput: true });
  const firstSnapshot = readDirectorySnapshot(outputDir);
  const second = writeCatalogSite({ outputDir, allowExternalOutput: true });
  const secondSnapshot = readDirectorySnapshot(outputDir);

  assert.equal(first.fileCount, expectedPreviewCount + 6);
  assert.equal(first.directionCount, canonical.directions.length);
  assert.equal(first.themeCount, canonical.themes.length);
  assert.equal(first.linkCount, canonical.links.length);
  assert.equal(first.styleCount, canonical.directions.length);
  assert.equal(first.catalogRevision, second.catalogRevision);
  assert.deepEqual(secondSnapshot, firstSnapshot);
  assert.equal(firstSnapshot[".nojekyll"], "");
  assert.equal(
    Object.keys(firstSnapshot).filter((path) => path.startsWith("previews/")).length,
    expectedPreviewCount
  );
});

test("filterCatalogEntries supports English queries, Chinese aliases, and case folding", () => {
  const catalog = buildStyleCatalog();
  const dashboard = filterCatalogEntries(catalog, { query: "dashboard" });
  const uppercase = filterCatalogEntries(catalog, { query: "  DASHBOARD  " });
  const chineseAlias = filterCatalogEntries(catalog, { query: "后台" });
  const prefixFallback = searchCatalogEntries(catalog, "dashbo");
  const indexedIntersection = searchCatalogEntries(catalog, "dashboard high");
  const consumerApps = filterCatalogEntries(catalog, { query: "C端应用" });

  assert.equal(dashboard.length > 0, true);
  assert.deepEqual(sortedIds(uppercase), sortedIds(dashboard));
  assert.deepEqual(sortedIds(prefixFallback), sortedIds(dashboard));
  assert.equal(indexedIntersection.length > 0, true);
  assert.equal(indexedIntersection.every((entry) => (
    catalog.searchIndex.dashboard.includes(catalog.entryIndex[entry.id])
    && catalog.searchIndex.high.includes(catalog.entryIndex[entry.id])
  )), true);
  assert.equal(catalog.searchIndex["后台"].length > 0, true);
  assert.equal(dashboard.some((entry) => entry.id === "data-dashboard-command-center"), true);
  assert.equal(chineseAlias.some((entry) => entry.id === "data-dashboard-command-center"), true);
  assert.equal(chineseAlias.some((entry) => entry.id === "operational-saas-console"), true);
  assert.equal(consumerApps.length > 0, true);
  assert.equal(consumerApps.every((entry) => entry.experienceType === "consumer-app"), true);

  for (const definition of EXPERIENCE_TYPE_DEFINITIONS) {
    const expectedIds = new Set(catalog.entries
      .filter((entry) => entry.experienceType === definition.id)
      .map((entry) => entry.id));
    for (const term of [definition.id, definition.label, definition.labelZh, ...definition.aliases]) {
      const matchedIds = new Set(searchCatalogEntries(catalog, term).map((entry) => entry.id));
      assert.equal(
        [...expectedIds].every((id) => matchedIds.has(id)),
        true,
        `${term} must find every ${definition.id} Direction`
      );
    }
  }
});

test("legacy style ids search their canonical Direction without adding cards", () => {
  const catalog = buildStyleCatalog();
  const aggregatedAlias = catalog.aliases.find((alias) => alias.legacyStyleId !== alias.directionId);
  const unaggregatedAlias = catalog.aliases.find((alias) => alias.legacyStyleId === alias.directionId);

  assert.ok(aggregatedAlias, "The live catalog must expose at least one aggregated legacy alias");
  assert.ok(unaggregatedAlias, "The live catalog must expose at least one unaggregated legacy alias");

  for (const alias of [aggregatedAlias, unaggregatedAlias]) {
    const matches = searchCatalogEntries(catalog, alias.legacyStyleId);
    assert.equal(
      matches.some((entry) => entry.id === alias.directionId),
      true,
      `${alias.legacyStyleId} must search its canonical Direction ${alias.directionId}`
    );
    const direction = catalog.entries[catalog.entryIndex[alias.directionId]];
    assert.equal(direction.legacyStyleIds.includes(alias.legacyStyleId), true);
  }

  assert.equal(Object.hasOwn(catalog.entryIndex, aggregatedAlias.legacyStyleId), false);
  assert.equal(catalog.entries.length, catalog.directionCount);
});

test("filterCatalogEntries uses OR within a facet group and AND between groups", () => {
  const catalog = buildStyleCatalog();
  const { entries } = catalog;
  const filters = {
    family: ["finance", "research"],
    density: ["medium-high"]
  };
  const filtered = filterCatalogEntries(catalog, { filters });
  const expected = entries.filter((entry) =>
    valuesForTag(entry, "family").some((value) => filters.family.includes(value))
    && valuesForTag(entry, "density").some((value) => filters.density.includes(value))
  );

  assert.deepEqual(sortedIds(filtered), sortedIds(expected));
  assert.equal(filtered.length > 0, true);

  const combinedWithQuery = filterCatalogEntries(catalog, {
    query: "dashboard",
    filters: { density: ["high"] }
  });
  assert.equal(combinedWithQuery.length > 0, true);
  assert.equal(
    combinedWithQuery.every((entry) => valuesForTag(entry, "density").includes("high")),
    true
  );
  assert.deepEqual(filterCatalogEntries(catalog, { query: "", filters: {} }), entries);
  const consumerOrCommerce = filterCatalogEntries(catalog, {
    filters: { experienceType: ["consumer-app", "commerce"] }
  });
  assert.equal(consumerOrCommerce.length > 0, true);
  assert.equal(
    consumerOrCommerce.every((entry) => ["consumer-app", "commerce"].includes(entry.experienceType)),
    true
  );
});

test("renderCatalogBrowserPage exposes accessible search and batched-result controls", () => {
  const html = renderCatalogBrowserPage(buildStyleCatalog());

  assert.match(html, /<!doctype html>/i);
  assert.match(html, /<html\b[^>]*\blang="zh-CN"/i);
  assert.match(html, /<meta\b[^>]*\bname="catalog-revision"/i);
  assert.match(html, /<meta\b[^>]*http-equiv="Content-Security-Policy"/i);
  assert.match(html, /<link\b[^>]*\brel="stylesheet"[^>]*\bhref="styles\.css\?v=/i);
  assert.match(html, /<script\b[^>]*\bsrc="app\.js\?v=[^"]+"[^>]*><\/script>/i);
  assert.match(html, /\bid="revision-warning"[^>]*\bhidden/i);
  assert.match(html, /<main\b/i);
  assert.match(html, /\baria-live="polite"/i);
  assert.match(html, /体验类型/u);

  const searchInput = html.match(/<input\b[^>]*\btype="search"[^>]*>/i)?.[0];
  assert.ok(searchInput, "The catalog page must include a search input");
  const searchId = searchInput.match(/\bid="([^"]+)"/i)?.[1];
  assert.ok(searchId, "The search input must have an id for its accessible label");
  assert.match(html, new RegExp(`<label\\b[^>]*\\bfor="${escapeRegExp(searchId)}"`, "i"));

  const loadMoreButton = html.match(/<button\b[^>]*\bid="load-more"[^>]*>/i)?.[0];
  assert.ok(loadMoreButton, "The catalog page must include a load-more button");
  assert.match(loadMoreButton, /\btype="button"/i);
  assert.match(loadMoreButton, /\baria-controls="style-grid"/i);
  assert.match(loadMoreButton, /\bhidden\b/i);
});

test("catalog development server mirrors the Pages project subpath securely", { timeout: 10_000 }, async () => {
  const canonical = loadCatalogV2();
  const served = await startStyleCatalogServer({ port: 0, basePath: "/ai-ui-style-director/" });

  try {
    assert.equal(served.host, "127.0.0.1");
    assert.equal(served.port > 0, true);
    assert.equal(served.url, `http://127.0.0.1:${served.port}/`);
    assert.equal(served.catalogUrl, `${served.url}ai-ui-style-director/`);
    assert.equal(served.basePath, "/ai-ui-style-director/");
    assert.equal(served.server.address().address, "127.0.0.1");
    assert.equal(served.directionCount, canonical.directions.length);
    assert.equal(served.themeCount, canonical.themes.length);
    assert.equal(served.linkCount, canonical.links.length);
    assert.equal(served.styleCount, canonical.directions.length);
    assert.equal(served.sourceCount >= served.styleCount, true);
    assert.match(served.catalogRevision, /^[a-f0-9]{16}$/);

    const routes = [
      { path: "", contentType: /^text\/html\b/ },
      { path: "catalog.json", contentType: /^application\/json\b/ },
      { path: "app.js", contentType: /javascript/ },
      { path: "styles.css", contentType: /^text\/css\b/ },
      { path: "favicon.svg", contentType: /^image\/svg\+xml\b/ }
    ];

    for (const route of routes) {
      const response = await fetch(new URL(route.path, served.catalogUrl));
      assertCatalogResponseHeaders(response, route.contentType);
      assert.equal((await response.text()).length > 0, true);

      const head = await fetch(new URL(route.path, served.catalogUrl), { method: "HEAD" });
      assertCatalogResponseHeaders(head, route.contentType);
      assert.equal(await head.text(), "");
    }

    const catalogResponse = await fetch(new URL("catalog.json", served.catalogUrl));
    const catalogText = await catalogResponse.text();
    assert.doesNotMatch(catalogText, /data:image\/svg\+xml/i);
    const payload = JSON.parse(catalogText);
    assert.equal(payload.schemaVersion, CATALOG_BROWSER_SCHEMA_VERSION);
    assert.equal(payload.directionCount, canonical.directions.length);
    assert.equal(payload.themeCount, canonical.themes.length);
    assert.equal(payload.linkCount, canonical.links.length);
    assert.equal(payload.entries.length, canonical.directions.length);
    assert.equal(payload.pageSize, CATALOG_PAGE_SIZE);
    assert.equal(payload.catalogRevision, served.catalogRevision);

    const preview = await fetch(new URL(payload.entries[0].previewUrl, served.catalogUrl));
    assertCatalogResponseHeaders(preview, /^image\/svg\+xml\b/);
    assert.equal(preview.headers.get("cross-origin-resource-policy"), "same-origin");
    const previewSvg = await preview.text();
    assert.match(previewSvg, /<svg\b/);
    assert.match(previewSvg, /<title\b/);

    const previewHead = await fetch(new URL(payload.entries[0].previewUrl, served.catalogUrl), { method: "HEAD" });
    assertCatalogResponseHeaders(previewHead, /^image\/svg\+xml\b/);
    assert.equal(await previewHead.text(), "");

    const allPreviewHeads = await Promise.all(payload.entries.flatMap((entry) => (
      entry.themes.map((theme) => fetch(new URL(theme.previewUrl, served.catalogUrl), { method: "HEAD" }))
    )));
    for (const response of allPreviewHeads) {
      assertCatalogResponseHeaders(response, /^image\/svg\+xml\b/);
      assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
    }

    const legacyPreviewUrl = `previews/${payload.aliases[0].legacyStyleId}.svg`;
    const legacyPreview = await fetch(new URL(legacyPreviewUrl, served.catalogUrl));
    assertCatalogResponseHeaders(legacyPreview, /^image\/svg\+xml\b/);
    assert.match(await legacyPreview.text(), /<svg\b/);

    const appResponse = await fetch(new URL("app.js", served.catalogUrl));
    const appScript = await appResponse.text();
    assert.match(appScript, new RegExp(`DEFAULT_PAGE_SIZE = ${CATALOG_PAGE_SIZE}`));
    assert.match(appScript, /entries\.slice\(0, state\.visibleCount\)/);
    assert.match(appScript, /loadMore\.addEventListener\("click"/);
    assert.match(appScript, /status\.textContent = entries\.length/);
    assert.match(appScript, /renderRevisionWarning/);
    assert.match(appScript, /radio\.type = "radio"/);
    assert.match(appScript, /sessionStorage\.setItem/);
    assert.match(appScript, /state\.selectedThemeIds\[entry\.id\] = theme\.id/);
    assert.match(appScript, /image\.src = theme\.previewUrl/);

    const uncuratedPreview = await fetch(new URL("previews/not-a-curated-style.svg", served.catalogUrl));
    assert.equal(uncuratedPreview.status, 404);
    const uncuratedV2Preview = await fetch(new URL(
      "previews/v2/not-a-direction/not-a-theme.svg",
      served.catalogUrl
    ));
    assert.equal(uncuratedV2Preview.status, 404);

    const missing = await fetch(new URL("missing", served.catalogUrl));
    assert.equal(missing.status, 404);
    assert.equal(missing.headers.get("cache-control"), "no-store");

    const rejected = await fetch(served.catalogUrl, { method: "POST" });
    assert.equal(rejected.status, 405);
    assert.equal(rejected.headers.get("allow"), "GET, HEAD");
    assert.equal(rejected.headers.get("cache-control"), "no-store");
  } finally {
    await served.close();
  }
});

test("style catalog server validates requested ports before listening", async () => {
  for (const port of [true, -1, 65_536, 1.5, "not-a-port"]) {
    await assert.rejects(
      async () => startStyleCatalogServer({ port }),
      /Invalid .*port/i
    );
  }
});

test("style catalog server rejects unsafe project base paths", async () => {
  for (const basePath of ["../escape", "/valid/../escape/", "https://example.test/catalog/"]) {
    await assert.rejects(
      async () => startStyleCatalogServer({ basePath }),
      /Invalid style catalog base path/
    );
  }
});

test("style catalog server rejects preview ids that could escape the curated preview directory", async () => {
  const catalog = buildStyleCatalog();
  const unsafeDirectionCatalog = structuredClone(catalog);
  unsafeDirectionCatalog.entries[0].id = "../package";
  unsafeDirectionCatalog.entries[0].previewUrl = "previews/../package.svg";

  await assert.rejects(
    async () => startStyleCatalogServer({ catalog: unsafeDirectionCatalog }),
    /Invalid catalog id for preview route/
  );

  const unsafeThemeCatalog = structuredClone(catalog);
  unsafeThemeCatalog.entries[0].themes[0].id = "../package";
  unsafeThemeCatalog.entries[0].themes[0].previewUrl = "previews/v2/safe/../package.svg";

  await assert.rejects(
    async () => startStyleCatalogServer({ catalog: unsafeThemeCatalog }),
    /Invalid catalog id for preview route/
  );
});

test("browse opens the hosted catalog contract and serve remains a non-blocking alias", () => {
  const help = spawnSync(process.execPath, [binPath, "help"], { encoding: "utf8" });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /browse \[--open\] \[--json\]/);
  assert.match(help.stdout, /serve\s+Alias for browse/);

  const env = {
    ...process.env,
    AI_UI_STYLE_DIRECTOR_CATALOG_URL: "https://example.test/catalog/"
  };
  const browse = spawnSync(process.execPath, [binPath, "browse", "--json"], { encoding: "utf8", env });
  assert.equal(browse.status, 0, browse.stderr);
  assert.equal(browse.stderr, "");
  const browseOutput = JSON.parse(browse.stdout);
  const canonical = loadCatalogV2();
  assert.equal(browseOutput.hosted, true);
  assert.equal(browseOutput.opened, false);
  assert.equal(browseOutput.directionCount, canonical.directions.length);
  assert.equal(browseOutput.themeCount, canonical.themes.length);
  assert.equal(browseOutput.linkCount, canonical.links.length);
  assert.equal(browseOutput.styleCount, canonical.directions.length);
  assert.equal(new URL(browseOutput.catalogUrl).pathname, "/catalog/");
  assert.equal(
    new URL(browseOutput.catalogUrl).searchParams.get("expectedRevision"),
    browseOutput.catalogRevision
  );

  const serve = spawnSync(process.execPath, [binPath, "serve", "--json"], { encoding: "utf8", env });
  assert.equal(serve.status, 0, serve.stderr);
  assert.match(serve.stderr, /compatibility alias for browse/);
  assert.deepEqual(JSON.parse(serve.stdout), browseOutput);

  const textBrowse = spawnSync(process.execPath, [binPath, "browse"], { encoding: "utf8", env });
  assert.equal(textBrowse.status, 0, textBrowse.stderr);
  assert.match(textBrowse.stdout, new RegExp(`Curated directions: ${canonical.directions.length}`));
  assert.match(textBrowse.stdout, new RegExp(`themes: ${canonical.themes.length}`));

  for (const command of ["browse", "serve"]) {
    const invalid = spawnSync(process.execPath, [binPath, command, "--port", "4173"], {
      encoding: "utf8",
      env
    });
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /--port is no longer supported/);
    assert.match(invalid.stderr, /preview --serve --port/);
  }
});
