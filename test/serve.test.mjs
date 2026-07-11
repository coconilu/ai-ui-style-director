import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildStyleCatalog,
  filterCatalogEntries,
  renderCatalogBrowserPage,
  startStyleCatalogServer
} from "../src/catalog-browser.mjs";

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

function assertCatalogResponseHeaders(response, expectedContentType) {
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", expectedContentType);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const policy = response.headers.get("content-security-policy") || "";
  assert.match(policy, /default-src 'none'/);
  assert.match(policy, /script-src 'self'/);
  assert.match(policy, /style-src 'self'/);
  assert.match(policy, /img-src data:/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
}

test("buildStyleCatalog exposes the twelve curated styles as browser-safe entries", () => {
  const catalog = buildStyleCatalog();

  assert.equal(catalog.schemaVersion, 1);
  assert.equal(catalog.styleCount, 12);
  assert.equal(catalog.entries.length, 12);
  assert.equal(new Set(catalog.entries.map((entry) => entry.id)).size, 12);
  assert.equal(Number.isInteger(catalog.sourceCount), true);
  assert.equal(catalog.sourceCount >= catalog.styleCount, true);

  for (const entry of catalog.entries) {
    assert.equal(typeof entry.id, "string");
    assert.notEqual(entry.id, "");
    assert.equal(typeof entry.name, "string");
    assert.notEqual(entry.name, "");
    assert.equal(typeof entry.searchText, "string");
    assert.notEqual(entry.searchText.trim(), "");
    assert.equal(entry.searchText, entry.searchText.toLowerCase());

    assert.match(entry.previewDataUri, /^data:image\/svg\+xml;base64,/);
    const previewSvg = Buffer.from(entry.previewDataUri.split(",", 2)[1], "base64").toString("utf8");
    assert.match(previewSvg, /<svg\b/);
    assert.match(previewSvg, /<title\b/);

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
      assert.match(reference.lightPreviewUrl, /^https:\/\//);
      assert.match(reference.darkPreviewUrl, /^https:\/\//);
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
});

test("filterCatalogEntries supports English queries, Chinese aliases, and case folding", () => {
  const { entries } = buildStyleCatalog();
  const dashboard = filterCatalogEntries(entries, { query: "dashboard" });
  const uppercase = filterCatalogEntries(entries, { query: "  DASHBOARD  " });
  const chineseAlias = filterCatalogEntries(entries, { query: "后台" });

  assert.equal(dashboard.length > 0, true);
  assert.deepEqual(sortedIds(uppercase), sortedIds(dashboard));
  assert.equal(dashboard.some((entry) => entry.id === "data-dashboard-command-center"), true);
  assert.equal(chineseAlias.some((entry) => entry.id === "data-dashboard-command-center"), true);
  assert.equal(chineseAlias.some((entry) => entry.id === "operational-saas-console"), true);
});

test("filterCatalogEntries uses OR within a facet group and AND between groups", () => {
  const { entries } = buildStyleCatalog();
  const filters = {
    family: ["finance", "research"],
    density: ["medium-high"]
  };
  const filtered = filterCatalogEntries(entries, { filters });
  const expected = entries.filter((entry) =>
    valuesForTag(entry, "family").some((value) => filters.family.includes(value))
    && valuesForTag(entry, "density").some((value) => filters.density.includes(value))
  );

  assert.deepEqual(sortedIds(filtered), sortedIds(expected));
  assert.deepEqual(sortedIds(filtered), ["ai-lab-research-notebook", "fintech-precision-trust"]);

  const combinedWithQuery = filterCatalogEntries(entries, {
    query: "dashboard",
    filters: { density: ["high"] }
  });
  assert.equal(combinedWithQuery.length > 0, true);
  assert.equal(
    combinedWithQuery.every((entry) => valuesForTag(entry, "density").includes("high")),
    true
  );
  assert.deepEqual(filterCatalogEntries(entries, { query: "", filters: {} }), entries);
});

test("renderCatalogBrowserPage references served assets and exposes an accessible search UI", () => {
  const html = renderCatalogBrowserPage(buildStyleCatalog());

  assert.match(html, /<!doctype html>/i);
  assert.match(html, /<html\b[^>]*\blang="zh-CN"/i);
  assert.match(html, /<link\b[^>]*\brel="stylesheet"[^>]*\bhref="\/styles\.css"/i);
  assert.match(html, /<script\b[^>]*\bsrc="\/app\.js"[^>]*><\/script>/i);
  assert.match(html, /<main\b/i);
  assert.match(html, /\baria-live="polite"/i);

  const searchInput = html.match(/<input\b[^>]*\btype="search"[^>]*>/i)?.[0];
  assert.ok(searchInput, "The catalog page must include a search input");
  const searchId = searchInput.match(/\bid="([^"]+)"/i)?.[1];
  assert.ok(searchId, "The search input must have an id for its accessible label");
  assert.match(html, new RegExp(`<label\\b[^>]*\\bfor="${escapeRegExp(searchId)}"`, "i"));
});

test("style catalog server binds to loopback and serves GET and HEAD routes securely", { timeout: 10_000 }, async () => {
  const served = await startStyleCatalogServer({ port: 0 });

  try {
    assert.equal(served.host, "127.0.0.1");
    assert.equal(served.port > 0, true);
    assert.equal(served.url, `http://127.0.0.1:${served.port}/`);
    assert.equal(served.catalogUrl, served.url);
    assert.equal(served.server.address().address, "127.0.0.1");
    assert.equal(served.styleCount, 12);
    assert.equal(served.sourceCount >= served.styleCount, true);

    const routes = [
      { path: "/", contentType: /^text\/html\b/ },
      { path: "/catalog.json", contentType: /^application\/json\b/ },
      { path: "/app.js", contentType: /javascript/ },
      { path: "/styles.css", contentType: /^text\/css\b/ }
    ];

    for (const route of routes) {
      const response = await fetch(new URL(route.path, served.url));
      assertCatalogResponseHeaders(response, route.contentType);
      assert.equal((await response.text()).length > 0, true);

      const head = await fetch(new URL(route.path, served.url), { method: "HEAD" });
      assertCatalogResponseHeaders(head, route.contentType);
      assert.equal(await head.text(), "");
    }

    const catalogResponse = await fetch(new URL("/catalog.json", served.url));
    const payload = await catalogResponse.json();
    assert.equal(payload.styleCount, 12);
    assert.equal(payload.entries.length, 12);

    const missing = await fetch(new URL("/missing", served.url));
    assert.equal(missing.status, 404);
    assert.equal(missing.headers.get("cache-control"), "no-store");

    const rejected = await fetch(new URL("/", served.url), { method: "POST" });
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

test("serve is exposed by the CLI and dispatches validation errors", () => {
  const help = spawnSync(process.execPath, [binPath, "help"], { encoding: "utf8" });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /serve \[--open\] \[--port <number>\] \[--json\]/);

  const invalid = spawnSync(process.execPath, [binPath, "serve", "--port", "not-a-port"], {
    encoding: "utf8"
  });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /Invalid style catalog server port/);
});
