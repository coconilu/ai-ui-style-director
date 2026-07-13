import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CATALOG_PAGE_SIZE,
  DEFAULT_HOSTED_CATALOG_URL,
  buildStyleCatalog,
  buildStyleCatalogStaticAssets,
  computeCatalogRevision,
  filterCatalogEntries,
  hostedCatalogInfo,
  renderCatalogBrowserPage,
  searchCatalogEntries,
  startStyleCatalogServer
} from "../src/catalog-browser.mjs";
import { loadStyleProfiles, loadStyleVisuals } from "../src/core.mjs";
import { writeCatalogSite } from "../scripts/build-catalog-site.mjs";

const binPath = fileURLToPath(new URL("../bin/ai-ui-style-director.mjs", import.meta.url));

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

test("buildStyleCatalog exposes every curated style with preview URLs and a serializable search index", () => {
  const catalog = buildStyleCatalog();
  const profileCount = loadStyleProfiles().length;

  assert.equal(catalog.schemaVersion, 3);
  assert.match(catalog.catalogRevision, /^[a-f0-9]{16}$/);
  assert.equal(catalog.styleCount, profileCount);
  assert.equal(catalog.entries.length, profileCount);
  assert.equal(new Set(catalog.entries.map((entry) => entry.id)).size, profileCount);
  assert.equal(Number.isInteger(catalog.sourceCount), true);
  assert.equal(catalog.sourceCount >= catalog.styleCount, true);
  assert.equal(catalog.pageSize, CATALOG_PAGE_SIZE);

  for (const entry of catalog.entries) {
    assert.equal(typeof entry.id, "string");
    assert.notEqual(entry.id, "");
    assert.equal(typeof entry.name, "string");
    assert.notEqual(entry.name, "");
    assert.equal(typeof entry.searchText, "string");
    assert.notEqual(entry.searchText.trim(), "");
    assert.equal(entry.searchText, entry.searchText.toLowerCase());

    assert.equal(Object.hasOwn(entry, "previewDataUri"), false);
    assert.equal(entry.previewUrl, `previews/${entry.id}.svg?v=${catalog.catalogRevision}`);

    assert.equal(typeof entry.tags, "object");
    for (const group of ["family", "pageTypes", "density", "tones", "componentKits"]) {
      const values = valuesForTag(entry, group);
      assert.equal(values.length > 0, true, `${entry.id} must expose ${group} tags`);
      assert.equal(values.every((value) => typeof value === "string" && value.length > 0), true);
    }

    assert.equal(Array.isArray(entry.references), true);
    assert.equal(entry.references.length, 3);
    for (const reference of entry.references) {
      assert.equal(typeof reference.label, "string");
      const referenceUrls = [reference.lightPreviewUrl, reference.darkPreviewUrl, reference.pageUrl]
        .filter(Boolean);
      assert.equal(referenceUrls.length > 0, true, `${entry.id} references must expose a consumer URL`);
      assert.equal(referenceUrls.every((url) => /^https:\/\//u.test(url)), true);
    }
  }

  assert.equal(typeof catalog.facets, "object");
  for (const group of ["family", "pageTypes", "density", "tones", "componentKits"]) {
    assert.equal(Array.isArray(catalog.facets[group]), true, `Missing ${group} facet group`);
    assert.equal(catalog.facets[group].length > 0, true);
    assert.deepEqual(catalog.facets[group], [...new Set(catalog.facets[group])]);

    const entryValues = new Set(catalog.entries.flatMap((entry) => valuesForTag(entry, group)));
    assert.equal([...entryValues].every((value) => catalog.facets[group].includes(value)), true);
  }

  assert.equal(catalog.searchIndexMeta.documentCount, profileCount);
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
    assert.equal(indexes.every((index) => Number.isInteger(index) && index >= 0 && index < profileCount), true);
  }

  const serialized = JSON.stringify(catalog);
  assert.doesNotMatch(serialized, /data:image\/svg\+xml/i);
  assert.deepEqual(JSON.parse(serialized), catalog);
});

test("catalog revision and hosted URL are deterministic and detect catalog changes", () => {
  const profiles = loadStyleProfiles();
  const visuals = loadStyleVisuals();
  const revision = computeCatalogRevision({ profiles, visuals });
  const repeated = computeCatalogRevision({ profiles: structuredClone(profiles), visuals: structuredClone(visuals) });
  const changedProfiles = structuredClone(profiles);
  changedProfiles[0].name = `${changedProfiles[0].name} changed`;

  assert.equal(repeated, revision);
  assert.notEqual(computeCatalogRevision({ profiles: changedProfiles, visuals }), revision);

  const catalog = buildStyleCatalog();
  const info = hostedCatalogInfo({ catalog, baseUrl: "https://example.test/catalog/" });
  const url = new URL(info.catalogUrl);
  assert.equal(url.origin, "https://example.test");
  assert.equal(url.pathname, "/catalog/");
  assert.equal(url.searchParams.get("expectedRevision"), catalog.catalogRevision);
  assert.equal(info.hosted, true);
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
  const payload = JSON.parse(String(assets.get("catalog.json").body));

  assert.equal(assets.size, catalog.entries.length + 6);
  for (const assetPath of ["index.html", "catalog.json", "app.js", "styles.css", "favicon.svg", ".nojekyll"]) {
    assert.equal(assets.has(assetPath), true, `Missing static asset: ${assetPath}`);
  }
  for (const entry of catalog.entries) {
    assert.equal(entry.previewUrl.startsWith("/"), false);
    assert.equal(assets.has(entry.previewUrl.split("?", 1)[0]), true, `Missing preview asset: ${entry.id}`);
  }

  assert.doesNotMatch(html, /\b(?:href|src)="\//i);
  assert.doesNotMatch(appScript, /fetch\("\//);
  assert.match(html, new RegExp(`catalog-revision" content="${catalog.catalogRevision}`));
  assert.match(html, new RegExp(`styles\\.css\\?v=${catalog.catalogRevision}`));
  assert.match(appScript, /expectedRevision/);
  assert.match(appScript, /catalog\.json/);
  assert.equal(payload.catalogRevision, catalog.catalogRevision);
});

test("static catalog build writes a deterministic Pages artifact", () => {
  const profileCount = loadStyleProfiles().length;
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

  assert.equal(first.fileCount, profileCount + 6);
  assert.equal(first.styleCount, profileCount);
  assert.equal(first.catalogRevision, second.catalogRevision);
  assert.deepEqual(secondSnapshot, firstSnapshot);
  assert.equal(firstSnapshot[".nojekyll"], "");
  assert.equal(
    Object.keys(firstSnapshot).filter((path) => path.startsWith("previews/")).length,
    profileCount
  );
});

test("filterCatalogEntries supports English queries, Chinese aliases, and case folding", () => {
  const catalog = buildStyleCatalog();
  const dashboard = filterCatalogEntries(catalog, { query: "dashboard" });
  const uppercase = filterCatalogEntries(catalog, { query: "  DASHBOARD  " });
  const chineseAlias = filterCatalogEntries(catalog, { query: "后台" });
  const prefixFallback = searchCatalogEntries(catalog, "dashbo");
  const indexedIntersection = searchCatalogEntries(catalog, "dashboard high");

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
  const profileCount = loadStyleProfiles().length;
  const served = await startStyleCatalogServer({ port: 0, basePath: "/ai-ui-style-director/" });

  try {
    assert.equal(served.host, "127.0.0.1");
    assert.equal(served.port > 0, true);
    assert.equal(served.url, `http://127.0.0.1:${served.port}/`);
    assert.equal(served.catalogUrl, `${served.url}ai-ui-style-director/`);
    assert.equal(served.basePath, "/ai-ui-style-director/");
    assert.equal(served.server.address().address, "127.0.0.1");
    assert.equal(served.styleCount, profileCount);
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
    assert.equal(payload.styleCount, profileCount);
    assert.equal(payload.entries.length, profileCount);
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

    const allPreviewHeads = await Promise.all(payload.entries.map((entry) => (
      fetch(new URL(entry.previewUrl, served.catalogUrl), { method: "HEAD" })
    )));
    for (const response of allPreviewHeads) {
      assertCatalogResponseHeaders(response, /^image\/svg\+xml\b/);
      assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
    }

    const appResponse = await fetch(new URL("app.js", served.catalogUrl));
    const appScript = await appResponse.text();
    assert.match(appScript, new RegExp(`DEFAULT_PAGE_SIZE = ${CATALOG_PAGE_SIZE}`));
    assert.match(appScript, /entries\.slice\(0, state\.visibleCount\)/);
    assert.match(appScript, /loadMore\.addEventListener\("click"/);
    assert.match(appScript, /status\.textContent = entries\.length/);
    assert.match(appScript, /renderRevisionWarning/);

    const uncuratedPreview = await fetch(new URL("previews/not-a-curated-style.svg", served.catalogUrl));
    assert.equal(uncuratedPreview.status, 404);

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
  const unsafeCatalog = structuredClone(catalog);
  unsafeCatalog.entries[0].id = "../package";
  unsafeCatalog.entries[0].previewUrl = "previews/../package.svg";

  await assert.rejects(
    async () => startStyleCatalogServer({ catalog: unsafeCatalog }),
    /Invalid style id for preview route/
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
  assert.equal(browseOutput.hosted, true);
  assert.equal(browseOutput.opened, false);
  assert.equal(browseOutput.styleCount, loadStyleProfiles().length);
  assert.equal(new URL(browseOutput.catalogUrl).pathname, "/catalog/");
  assert.equal(
    new URL(browseOutput.catalogUrl).searchParams.get("expectedRevision"),
    browseOutput.catalogRevision
  );

  const serve = spawnSync(process.execPath, [binPath, "serve", "--json"], { encoding: "utf8", env });
  assert.equal(serve.status, 0, serve.stderr);
  assert.match(serve.stderr, /compatibility alias for browse/);
  assert.deepEqual(JSON.parse(serve.stdout), browseOutput);

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
