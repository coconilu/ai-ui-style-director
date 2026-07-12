import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  loadStyleProfiles,
  loadStyleVisuals,
  readCatalog,
  repoRoot
} from "./core.mjs";
import { startLoopbackServer } from "./loopback-server.mjs";
import { expandVisualReferences } from "./preview.mjs";

const FACET_GROUPS = ["family", "pageTypes", "density", "tones", "componentKits"];
const DENSITY_ORDER = ["low", "low-medium", "medium", "medium-high", "high"];
export const CATALOG_PAGE_SIZE = 24;
export const DEFAULT_HOSTED_CATALOG_URL = "https://coconilu.github.io/ai-ui-style-director/";
const STYLE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CATALOG_SHARED_CONTENT_SECURITY_POLICY = "default-src 'none'; img-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'";
// GitHub Pages can enforce the shared policy only through HTML meta. The local
// development server adds frame-ancestors, which browsers ignore in meta CSP.
const CATALOG_META_CONTENT_SECURITY_POLICY = CATALOG_SHARED_CONTENT_SECURITY_POLICY;
const CATALOG_CONTENT_SECURITY_POLICY = `${CATALOG_SHARED_CONTENT_SECURITY_POLICY}; frame-ancestors 'none'`;
const SEARCH_ALIASES = new Map([
  ["developer", ["开发者", "开发工具", "技术产品"]],
  ["saas", ["软件服务", "工作流", "管理台"]],
  ["enterprise", ["企业", "企业服务", "可信"]],
  ["dashboard", ["后台", "仪表盘", "看板", "数据大屏"]],
  ["docs", ["文档", "技术文档", "知识库"]],
  ["launch", ["发布", "发布页", "产品发布"]],
  ["consumer", ["消费", "消费品牌", "品牌故事"]],
  ["portfolio", ["作品集", "个人主页", "工作室"]],
  ["commerce", ["电商", "商城", "商品目录"]],
  ["research", ["研究", "实验室", "论文"]],
  ["finance", ["金融", "金融科技", "行情"]],
  ["education", ["教育", "学习", "课程"]],
  ["landing", ["落地页", "官网", "营销页"]],
  ["product-site", ["产品官网", "产品网站"]],
  ["api-platform", ["接口平台", "开发平台"]],
  ["internal-tool", ["后台", "内部工具", "管理后台"]],
  ["analytics", ["分析", "数据分析"]],
  ["monitoring", ["监控", "监测"]],
  ["ecommerce", ["电商", "在线商店"]],
  ["technical-blog", ["技术博客", "博客"]],
  ["low", ["低密度", "留白"]],
  ["low-medium", ["中低密度"]],
  ["medium", ["中等密度"]],
  ["medium-high", ["中高密度"]],
  ["high", ["高密度", "信息密集"]],
  ["shadcn-ui", ["组件库", "shadcn"]],
  ["origin-ui", ["组件库", "origin"]],
  ["magic-ui", ["动效组件", "magic ui"]],
  ["tremor", ["图表组件", "数据图表"]]
]);

function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function assertSafeStyleId(styleId) {
  if (!STYLE_ID_PATTERN.test(styleId)) {
    throw new Error(`Invalid style id for preview route: ${styleId}`);
  }
  return styleId;
}

function previewPath(styleId) {
  return join(repoRoot(), "catalog", "previews", `${assertSafeStyleId(styleId)}.svg`);
}

function previewAssetPath(styleId) {
  return `previews/${assertSafeStyleId(styleId)}.svg`;
}

function previewUrl(styleId, catalogRevision) {
  return `${previewAssetPath(styleId)}?v=${encodeURIComponent(catalogRevision)}`;
}

function aliasesFor(values) {
  const aliases = [];
  for (const value of values) {
    aliases.push(...(SEARCH_ALIASES.get(String(value).toLowerCase()) || []));
  }
  return aliases;
}

function uniqueSorted(values, group) {
  const unique = [...new Set(values.filter(Boolean))];
  if (group === "density") {
    return unique.sort((left, right) => {
      const leftIndex = DENSITY_ORDER.indexOf(left);
      const rightIndex = DENSITY_ORDER.indexOf(right);
      if (leftIndex === -1 || rightIndex === -1) return left.localeCompare(right);
      return leftIndex - rightIndex;
    });
  }
  return unique.sort((left, right) => left.localeCompare(right));
}

function buildSearchIndex(entries) {
  const postings = new Map();
  for (const [entryIndex, entry] of entries.entries()) {
    for (const token of new Set(entry.searchText.split(" ").filter(Boolean))) {
      if (!postings.has(token)) postings.set(token, []);
      postings.get(token).push(entryIndex);
    }
  }
  return Object.fromEntries([...postings.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

export function computeCatalogRevision({ profiles, visuals }) {
  if (!Array.isArray(profiles) || !Array.isArray(visuals)) {
    throw new Error("Catalog revision requires profile and visual arrays.");
  }
  return createHash("sha256")
    .update(JSON.stringify({ profiles, visuals }))
    .digest("hex")
    .slice(0, 16);
}

export function buildStyleCatalog() {
  const profiles = loadStyleProfiles();
  const visuals = loadStyleVisuals();
  const catalogRevision = computeCatalogRevision({ profiles, visuals });
  const visualMap = new Map(visuals.map((visual) => [visual.styleId, visual]));
  const sourceIndex = readCatalog("generated/style-sources.json");

  const entries = profiles.map((profile) => {
    const visual = visualMap.get(profile.id);
    if (!visual) throw new Error(`Missing visual configuration for style: ${profile.id}`);

    const tags = {
      family: [profile.family],
      pageTypes: [...profile.pageTypes],
      density: [profile.density],
      tones: [...profile.tones],
      componentKits: [...profile.componentKits]
    };
    const searchableValues = [
      profile.id,
      profile.name,
      profile.family,
      ...profile.pageTypes,
      ...profile.audiences,
      ...profile.goals,
      profile.density,
      ...profile.tones,
      ...profile.keywords,
      ...profile.bestFor,
      profile.firstViewport,
      ...profile.layoutRules,
      ...profile.componentKits
    ];

    return {
      id: profile.id,
      name: profile.name,
      family: profile.family,
      pageTypes: [...profile.pageTypes],
      audiences: [...profile.audiences],
      goals: [...profile.goals],
      density: profile.density,
      tones: [...profile.tones],
      bestFor: [...profile.bestFor],
      avoidFor: [...profile.avoidFor],
      firstViewport: profile.firstViewport,
      componentKits: [...profile.componentKits],
      risks: [...profile.risks],
      tags,
      searchText: normalizeSearchText([
        ...searchableValues,
        ...aliasesFor(searchableValues)
      ].join(" ")),
      previewUrl: previewUrl(profile.id, catalogRevision),
      references: expandVisualReferences(visual.references)
    };
  });

  const facets = Object.fromEntries(FACET_GROUPS.map((group) => [
    group,
    uniqueSorted(entries.flatMap((entry) => entry.tags[group]), group)
  ]));

  const searchIndex = buildSearchIndex(entries);

  return {
    schemaVersion: 3,
    catalogRevision,
    styleCount: entries.length,
    sourceCount: Array.isArray(sourceIndex.sources) ? sourceIndex.sources.length : 0,
    pageSize: CATALOG_PAGE_SIZE,
    facets,
    entryIndex: Object.fromEntries(entries.map((entry, index) => [entry.id, index])),
    searchIndex,
    searchIndexMeta: {
      documentCount: entries.length,
      tokenCount: Object.keys(searchIndex).length,
      normalization: "nfkc-lower-alphanumeric",
      strategy: "exact-token-postings-with-substring-fallback",
      postingValue: "entry-index"
    },
    entries
  };
}

export function hostedCatalogInfo({
  catalog = buildStyleCatalog(),
  baseUrl = process.env.AI_UI_STYLE_DIRECTOR_CATALOG_URL || DEFAULT_HOSTED_CATALOG_URL
} = {}) {
  let catalogUrl;
  try {
    catalogUrl = new URL(baseUrl);
  } catch {
    throw new Error(`Invalid hosted catalog URL: ${baseUrl}`);
  }
  if (!["http:", "https:"].includes(catalogUrl.protocol) || catalogUrl.username || catalogUrl.password) {
    throw new Error(`Invalid hosted catalog URL: ${baseUrl}`);
  }
  if (!catalogUrl.pathname.endsWith("/")) catalogUrl.pathname += "/";
  catalogUrl.searchParams.set("expectedRevision", catalog.catalogRevision);
  return {
    catalogUrl: catalogUrl.href,
    hosted: true,
    catalogRevision: catalog.catalogRevision,
    styleCount: catalog.styleCount,
    sourceCount: catalog.sourceCount
  };
}

export function searchCatalogEntries(catalog, query = "") {
  const entries = Array.isArray(catalog?.entries) ? catalog.entries : [];
  const queryTerms = normalizeSearchText(query).split(" ").filter(Boolean);
  if (queryTerms.length === 0) return entries;

  let candidateIndexes = null;
  for (const term of queryTerms) {
    const indexedEntries = catalog.searchIndex?.[term];
    const termIndexes = new Set(Array.isArray(indexedEntries)
      ? indexedEntries
      : entries
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => entry.searchText.includes(term))
        .map(({ index }) => index));

    candidateIndexes = candidateIndexes === null
      ? termIndexes
      : new Set([...candidateIndexes].filter((index) => termIndexes.has(index)));
    if (candidateIndexes.size === 0) break;
  }

  return [...candidateIndexes].map((index) => entries[index]).filter(Boolean);
}

export function filterCatalogEntries(entriesOrCatalog, { query = "", filters = {} } = {}) {
  const catalog = Array.isArray(entriesOrCatalog) ? null : entriesOrCatalog;
  const entries = catalog?.entries || entriesOrCatalog;
  const queryTerms = normalizeSearchText(query).split(" ").filter(Boolean);
  const activeFilters = Object.entries(filters)
    .map(([group, values]) => [group, Array.isArray(values) ? values : [values]])
    .map(([group, values]) => [group, values.map(normalizeSearchText).filter(Boolean)])
    .filter(([, values]) => values.length > 0);

  if (queryTerms.length === 0 && activeFilters.length === 0) return entries;

  const candidates = catalog
    ? searchCatalogEntries(catalog, query)
    : entries.filter((entry) => queryTerms.every((term) => entry.searchText.includes(term)));

  return candidates.filter((entry) => {
    return activeFilters.every(([group, selectedValues]) => {
      const entryValues = (entry.tags[group] || []).map(normalizeSearchText);
      return selectedValues.some((selected) => entryValues.includes(selected));
    });
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderCatalogBrowserPage(catalog = buildStyleCatalog()) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta http-equiv="Content-Security-Policy" content="${escapeHtml(CATALOG_META_CONTENT_SECURITY_POLICY)}">
  <meta name="catalog-revision" content="${escapeHtml(catalog.catalogRevision)}">
  <link rel="icon" href="favicon.svg?v=${escapeHtml(catalog.catalogRevision)}" type="image/svg+xml">
  <link rel="stylesheet" href="styles.css?v=${escapeHtml(catalog.catalogRevision)}">
  <title>UI 风格目录 · Web Style Director</title>
</head>
<body>
  <main class="page-shell">
    <header class="hero">
      <div class="hero-copy">
        <p class="eyebrow">WEB STYLE DIRECTOR · CATALOG</p>
        <h1 id="page-title">浏览 UI 风格目录</h1>
        <p id="page-subtitle" class="subtitle">搜索 ${escapeHtml(catalog.styleCount)} 个已策展方向，并按页面类型、密度、调性和组件库过滤。</p>
      </div>
      <div class="catalog-stat" aria-label="Catalog coverage">
        <strong>${escapeHtml(catalog.styleCount)}</strong>
        <span id="curated-label">个已策展风格</span>
        <small>${escapeHtml(catalog.sourceCount)} source records</small>
      </div>
    </header>

    <section id="revision-warning" class="revision-warning" role="status" aria-live="polite" hidden>
      <strong id="revision-warning-title">目录版本不一致</strong>
      <span id="revision-warning-message">在线目录与本地工具版本不同，请先更新 Web Style Director。</span>
    </section>

    <section class="catalog-toolbar" aria-labelledby="search-label">
      <div class="search-wrap">
        <label id="search-label" for="catalog-search">搜索风格</label>
        <input id="catalog-search" type="search" autocomplete="off" placeholder="例如：dashboard、后台、developer…">
        <kbd>⌘ / Ctrl + K</kbd>
      </div>
      <button id="clear-filters" class="clear-button" type="button">清空条件</button>
    </section>

    <div class="catalog-layout">
      <aside class="filters-panel" aria-label="风格标签过滤">
        <div class="panel-heading">
          <strong id="filter-title">标签过滤</strong>
          <span id="active-filter-count">0</span>
        </div>
        <div id="facet-groups"></div>
      </aside>

      <section class="results" aria-labelledby="result-status">
        <div class="results-heading">
          <p id="result-status" aria-live="polite">正在载入风格目录…</p>
          <p id="filter-hint">组内任选，组间叠加</p>
        </div>
        <div id="style-grid" class="style-grid"></div>
        <div class="load-more-wrap">
          <button id="load-more" class="load-more-button" type="button" aria-controls="style-grid" hidden>加载更多</button>
        </div>
        <div id="empty-state" class="empty-state" hidden>
          <strong>没有匹配的风格</strong>
          <span>尝试缩短搜索词或清空部分标签。</span>
        </div>
      </section>
    </div>
  </main>
  <noscript>此页面需要 JavaScript 才能进行搜索和标签过滤。</noscript>
  <script src="app.js?v=${escapeHtml(catalog.catalogRevision)}"></script>
</body>
</html>\n`;
}

const CATALOG_STYLES_CSS = String.raw`
:root {
  color-scheme: light dark;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-synthesis: none;
  --canvas: #eff0ec;
  --panel: #fbfbf9;
  --card: #ffffff;
  --ink: #20231f;
  --muted: #6d736b;
  --faint: #8e948c;
  --line: #d8dbd4;
  --line-soft: #e9eae5;
  --accent: #252c26;
  --accent-ink: #ffffff;
  --tag: #f0f2ed;
  --tag-active: #dce8d8;
  --tag-active-ink: #223c25;
  --shadow: 0 18px 54px rgba(31, 36, 31, .08);
}

* { box-sizing: border-box; }
html { min-width: 320px; scroll-behavior: smooth; }
body { margin: 0; color: var(--ink); background: var(--canvas); }
button, input { font: inherit; }
button { color: inherit; }
a { color: inherit; }
.page-shell { width: min(1540px, calc(100% - 40px)); margin: 34px auto 64px; }
.hero { display: flex; justify-content: space-between; gap: 34px; padding: 32px; border: 1px solid var(--line); border-radius: 22px; background: var(--panel); box-shadow: var(--shadow); }
.hero-copy { max-width: 820px; }
.revision-warning { display: flex; align-items: baseline; gap: 12px; margin: 18px 0 0; padding: 13px 16px; border: 1px solid #d7a640; border-radius: 14px; color: #5c4108; background: #fff4d5; }
.revision-warning[hidden] { display: none; }
.revision-warning strong { flex: 0 0 auto; font-size: 13px; }
.revision-warning span { font-size: 12px; line-height: 1.55; }
.eyebrow { margin: 0 0 12px; color: var(--muted); font-size: 12px; font-weight: 780; letter-spacing: .12em; }
h1 { margin: 0; font-size: clamp(36px, 5vw, 64px); line-height: .98; letter-spacing: -.055em; }
.subtitle { max-width: 760px; margin: 17px 0 0; color: var(--muted); font-size: 15px; line-height: 1.65; }
.catalog-stat { min-width: 170px; align-self: stretch; display: grid; align-content: center; justify-items: end; padding-left: 30px; border-left: 1px solid var(--line); }
.catalog-stat strong { font-size: 52px; line-height: 1; letter-spacing: -.06em; }
.catalog-stat span { margin-top: 8px; color: var(--muted); font-size: 13px; }
.catalog-stat small { margin-top: 15px; color: var(--faint); font-size: 10px; letter-spacing: .04em; text-transform: uppercase; }
.catalog-toolbar { position: sticky; top: 0; z-index: 10; display: flex; align-items: end; gap: 14px; margin: 18px 0; padding: 14px; border: 1px solid var(--line); border-radius: 16px; background: color-mix(in srgb, var(--panel) 90%, transparent); backdrop-filter: blur(16px); box-shadow: 0 10px 34px rgba(31, 36, 31, .06); }
.search-wrap { position: relative; flex: 1; }
.search-wrap label { display: block; margin: 0 0 7px 3px; color: var(--muted); font-size: 11px; font-weight: 740; letter-spacing: .05em; text-transform: uppercase; }
.search-wrap input { width: 100%; height: 48px; padding: 0 132px 0 15px; border: 1px solid var(--line); border-radius: 11px; outline: none; color: var(--ink); background: var(--card); }
.search-wrap input:focus { border-color: #7b8c7b; box-shadow: 0 0 0 3px rgba(90, 117, 90, .13); }
.search-wrap kbd { position: absolute; right: 12px; bottom: 12px; padding: 4px 8px; border: 1px solid var(--line); border-radius: 6px; color: var(--faint); background: var(--tag); font: 10px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace; }
.clear-button { height: 48px; padding: 0 18px; border: 1px solid var(--line); border-radius: 11px; cursor: pointer; color: var(--muted); background: var(--card); font-size: 12px; font-weight: 720; }
.clear-button:hover { border-color: #9ca39a; color: var(--ink); }
.catalog-layout { display: grid; grid-template-columns: 270px minmax(0, 1fr); gap: 18px; align-items: start; }
.filters-panel { position: sticky; top: 100px; max-height: calc(100vh - 118px); overflow: auto; padding: 18px; border: 1px solid var(--line); border-radius: 17px; background: var(--panel); }
.panel-heading { display: flex; align-items: center; justify-content: space-between; padding-bottom: 13px; border-bottom: 1px solid var(--line-soft); }
.panel-heading strong { font-size: 13px; }
.panel-heading span { min-width: 24px; height: 24px; display: grid; place-items: center; border-radius: 8px; color: var(--accent-ink); background: var(--accent); font-size: 10px; font-weight: 800; }
.facet-group { border-bottom: 1px solid var(--line-soft); }
.facet-group:last-child { border-bottom: 0; }
.facet-group summary { display: flex; justify-content: space-between; gap: 10px; padding: 14px 0; cursor: pointer; list-style: none; color: var(--muted); font-size: 11px; font-weight: 760; letter-spacing: .04em; text-transform: uppercase; }
.facet-group summary::-webkit-details-marker { display: none; }
.facet-group summary::after { content: "+"; color: var(--faint); font-size: 15px; }
.facet-group[open] summary::after { content: "−"; }
.facet-options { display: flex; flex-wrap: wrap; gap: 7px; padding: 0 0 14px; }
.filter-chip { max-width: 100%; padding: 7px 9px; border: 1px solid var(--line); border-radius: 8px; cursor: pointer; color: var(--muted); background: var(--tag); font-size: 10px; line-height: 1.2; overflow-wrap: anywhere; }
.filter-chip:hover { border-color: #9fa79d; color: var(--ink); }
.filter-chip[aria-pressed="true"] { border-color: #9db49b; color: var(--tag-active-ink); background: var(--tag-active); font-weight: 760; }
.results { min-width: 0; }
.results-heading { display: flex; align-items: center; justify-content: space-between; min-height: 42px; padding: 0 4px; }
.results-heading p { margin: 0; color: var(--muted); font-size: 12px; }
.results-heading #result-status { color: var(--ink); font-weight: 730; }
.style-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
.style-card { overflow: hidden; border: 1px solid var(--line); border-radius: 18px; background: var(--card); box-shadow: 0 10px 34px rgba(31, 36, 31, .055); }
.preview { position: relative; aspect-ratio: 5 / 3; overflow: hidden; background: #e4e6e0; }
.preview img { width: 100%; height: 100%; display: block; object-fit: cover; transition: transform .35s ease; }
.style-card:hover .preview img { transform: scale(1.012); }
.preview-family { position: absolute; top: 13px; left: 13px; padding: 6px 9px; border: 1px solid rgba(255,255,255,.22); border-radius: 8px; color: #fff; background: rgba(16, 19, 17, .78); backdrop-filter: blur(8px); font-size: 10px; font-weight: 780; letter-spacing: .04em; text-transform: uppercase; }
.card-body { padding: 19px; }
.card-title-row { display: flex; align-items: start; justify-content: space-between; gap: 16px; }
.card-title-row h2 { margin: 0; font-size: 21px; line-height: 1.15; letter-spacing: -.025em; }
.card-title-row code { flex: none; color: var(--faint); font-size: 9px; }
.tag-row { display: flex; flex-wrap: wrap; gap: 6px; margin: 13px 0 16px; }
.style-tag { padding: 5px 7px; border: 1px solid var(--line-soft); border-radius: 7px; color: var(--muted); background: var(--tag); font-size: 9px; }
.card-details { display: grid; gap: 11px; margin: 0; }
.card-details div { display: grid; grid-template-columns: 92px minmax(0, 1fr); gap: 11px; }
.card-details dt { color: var(--faint); font-size: 9px; font-weight: 780; letter-spacing: .06em; text-transform: uppercase; }
.card-details dd { margin: 0; color: var(--muted); font-size: 11px; line-height: 1.55; }
.references { margin-top: 16px; padding-top: 13px; border-top: 1px solid var(--line-soft); }
.references summary { cursor: pointer; color: var(--muted); font-size: 10px; font-weight: 730; }
.reference-list { display: grid; gap: 8px; margin-top: 10px; }
.reference-item { display: flex; align-items: center; gap: 7px; color: var(--faint); font-size: 10px; }
.reference-item span { margin-right: auto; }
.reference-item a { padding: 4px 7px; border: 1px solid var(--line); border-radius: 6px; text-decoration: none; color: var(--ink); background: var(--tag); font-weight: 700; }
.load-more-wrap { display: flex; justify-content: center; padding: 22px 0 4px; }
.load-more-button { min-width: 150px; min-height: 44px; padding: 10px 18px; border: 1px solid var(--line); border-radius: 11px; cursor: pointer; color: var(--ink); background: var(--card); font-size: 12px; font-weight: 740; }
.load-more-button:hover { border-color: #9ca39a; }
.load-more-button:focus-visible { outline: 3px solid rgba(90, 117, 90, .2); outline-offset: 2px; }
.empty-state { padding: 74px 24px; border: 1px dashed var(--line); border-radius: 18px; text-align: center; background: var(--panel); }
.empty-state strong, .empty-state span { display: block; }
.empty-state span { margin-top: 9px; color: var(--muted); font-size: 12px; }
noscript { display: block; padding: 20px; text-align: center; }

@media (max-width: 1080px) {
  .catalog-layout { grid-template-columns: 230px minmax(0, 1fr); }
  .style-grid { grid-template-columns: 1fr; }
}

@media (max-width: 760px) {
  .page-shell { width: min(100% - 22px, 720px); margin: 12px auto 36px; }
  .hero { flex-direction: column; padding: 23px; }
  .revision-warning { align-items: flex-start; flex-direction: column; gap: 4px; }
  .catalog-stat { justify-items: start; padding: 18px 0 0; border-top: 1px solid var(--line); border-left: 0; }
  .catalog-stat strong { font-size: 42px; }
  .catalog-toolbar { position: static; align-items: stretch; flex-direction: column; }
  .search-wrap input { padding-right: 15px; }
  .search-wrap kbd { display: none; }
  .catalog-layout { display: block; }
  .filters-panel { position: static; max-height: none; margin-bottom: 18px; }
  .results-heading { align-items: flex-start; flex-direction: column; gap: 6px; margin-bottom: 10px; }
  .card-title-row { flex-direction: column; gap: 7px; }
  .card-details div { grid-template-columns: 1fr; gap: 4px; }
}

@media (prefers-color-scheme: dark) {
  :root {
    --canvas: #101310;
    --panel: #191d19;
    --card: #1d211d;
    --ink: #eff2ed;
    --muted: #a4aaa1;
    --faint: #81887f;
    --line: #333933;
    --line-soft: #2d322d;
    --accent: #dfe7dc;
    --accent-ink: #1a211a;
    --tag: #252a25;
    --tag-active: #304432;
    --tag-active-ink: #d9f0da;
    --shadow: 0 18px 54px rgba(0, 0, 0, .18);
  }
  .catalog-toolbar { background: color-mix(in srgb, var(--panel) 92%, transparent); }
  .revision-warning { color: #f4d88b; border-color: #70581f; background: #2b2517; }
}
`;

const CATALOG_APP_JS = String.raw`
(function () {
  "use strict";

  var FACET_ORDER = ["family", "pageTypes", "density", "tones", "componentKits"];
  var DEFAULT_PAGE_SIZE = ${CATALOG_PAGE_SIZE};
  var COPY = {
    zh: {
      result: "个匹配风格",
      bestFor: "适用场景",
      viewport: "首屏结构",
      components: "组件建议",
      references: "视觉参考",
      light: "浅色",
      dark: "深色",
      loadMore: "加载更多",
      loadMoreLabel: "再显示 {count} 个风格",
      revisionTitle: "目录版本不一致",
      revisionMismatch: "在线目录版本为 {online}，当前工具期望 {expected}。页面仍可浏览；应用风格前请刷新页面，并确认 Pages 已部署或 Web Style Director 已更新。",
      pageRevisionMismatch: "页面资源与目录数据版本不一致，请强制刷新页面后重试。",
      facet: { family: "风格家族", pageTypes: "页面类型", density: "信息密度", tones: "视觉调性", componentKits: "组件库" },
      loadError: "目录载入失败，请刷新页面或检查 Pages 部署状态。"
    },
    en: {
      result: "matching styles",
      bestFor: "Best for",
      viewport: "First viewport",
      components: "Component kits",
      references: "Visual references",
      light: "Light",
      dark: "Dark",
      loadMore: "Load more",
      loadMoreLabel: "Show {count} more styles",
      revisionTitle: "Catalog version mismatch",
      revisionMismatch: "The hosted catalog is {online}, while the current tool expects {expected}. Browsing remains available; before applying a style, refresh the page and confirm Pages has deployed or Web Style Director is updated.",
      pageRevisionMismatch: "The page assets and catalog data use different revisions. Force-refresh the page and try again.",
      facet: { family: "Family", pageTypes: "Page type", density: "Density", tones: "Tone", componentKits: "Component kits" },
      loadError: "Could not load the catalog. Refresh the page or check the Pages deployment."
    }
  };
  var locale = (navigator.language || "").toLowerCase().indexOf("zh") === 0 ? "zh" : "en";
  var copy = COPY[locale];
  var state = { catalog: null, query: "", filters: {}, visibleCount: DEFAULT_PAGE_SIZE };
  var search = document.getElementById("catalog-search");
  var clearButton = document.getElementById("clear-filters");
  var facetGroups = document.getElementById("facet-groups");
  var grid = document.getElementById("style-grid");
  var status = document.getElementById("result-status");
  var activeCount = document.getElementById("active-filter-count");
  var emptyState = document.getElementById("empty-state");
  var loadMore = document.getElementById("load-more");
  var revisionWarning = document.getElementById("revision-warning");
  var revisionWarningTitle = document.getElementById("revision-warning-title");
  var revisionWarningMessage = document.getElementById("revision-warning-message");
  var pageRevision = document.querySelector('meta[name="catalog-revision"]')?.content || "";

  document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";

  function normalize(value) {
    return String(value || "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
  }

  function readUrlState() {
    var params = new URLSearchParams(window.location.search);
    state.query = params.get("q") || "";
    state.filters = {};
    params.getAll("tag").forEach(function (tag) {
      var separator = tag.indexOf(":");
      if (separator < 1) return;
      var group = tag.slice(0, separator);
      var value = tag.slice(separator + 1);
      if (!FACET_ORDER.includes(group) || !value) return;
      if (!state.filters[group]) state.filters[group] = [];
      state.filters[group].push(value);
    });
    search.value = state.query;
  }

  function interpolate(template, values) {
    return Object.keys(values).reduce(function (result, key) {
      return result.replaceAll("{" + key + "}", values[key]);
    }, template);
  }

  function renderRevisionWarning(catalog) {
    var expectedRevision = new URLSearchParams(window.location.search).get("expectedRevision") || "";
    var onlineRevision = catalog.catalogRevision || "unknown";
    var message = "";
    if (pageRevision && pageRevision !== onlineRevision) {
      message = copy.pageRevisionMismatch;
    } else if (expectedRevision && expectedRevision !== onlineRevision) {
      message = interpolate(copy.revisionMismatch, {
        online: onlineRevision,
        expected: expectedRevision
      });
    }
    revisionWarning.hidden = !message;
    revisionWarningTitle.textContent = copy.revisionTitle;
    revisionWarningMessage.textContent = message;
  }

  function writeUrlState() {
    var url = new URL(window.location.href);
    url.searchParams.delete("q");
    url.searchParams.delete("tag");
    if (state.query.trim()) url.searchParams.set("q", state.query.trim());
    FACET_ORDER.forEach(function (group) {
      (state.filters[group] || []).slice().sort().forEach(function (value) {
        url.searchParams.append("tag", group + ":" + value);
      });
    });
    history.replaceState({}, "", url);
  }

  function pageSize() {
    var configured = Number(state.catalog && state.catalog.pageSize);
    return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_PAGE_SIZE;
  }

  function resetPagination() {
    state.visibleCount = pageSize();
  }

  function searchCandidates() {
    var terms = normalize(state.query).split(" ").filter(Boolean);
    if (terms.length === 0) return state.catalog.entries;

    var candidateIndexes = null;
    terms.forEach(function (term) {
      if (candidateIndexes && candidateIndexes.size === 0) return;
      var indexedEntries = state.catalog.searchIndex && state.catalog.searchIndex[term];
      var termIndexes = new Set(Array.isArray(indexedEntries)
        ? indexedEntries
        : state.catalog.entries
          .map(function (entry, index) { return { entry: entry, index: index }; })
          .filter(function (candidate) { return candidate.entry.searchText.indexOf(term) !== -1; })
          .map(function (candidate) { return candidate.index; }));
      candidateIndexes = candidateIndexes === null
        ? termIndexes
        : new Set(Array.from(candidateIndexes).filter(function (index) { return termIndexes.has(index); }));
    });

    return Array.from(candidateIndexes).map(function (index) {
      return state.catalog.entries[index];
    }).filter(Boolean);
  }

  function matchesFilters(entry) {
    return FACET_ORDER.every(function (group) {
      var selected = state.filters[group] || [];
      if (selected.length === 0) return true;
      var values = entry.tags[group] || [];
      return selected.some(function (value) { return values.includes(value); });
    });
  }

  function element(tagName, className, text) {
    var node = document.createElement(tagName);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function createDetail(label, value) {
    var wrapper = document.createElement("div");
    wrapper.append(element("dt", "", label));
    wrapper.append(element("dd", "", value));
    return wrapper;
  }

  function createCard(entry) {
    var article = element("article", "style-card");
    article.dataset.styleId = entry.id;
    var preview = element("div", "preview");
    var image = document.createElement("img");
    image.src = entry.previewUrl;
    image.alt = entry.name + " style preview";
    image.loading = "lazy";
    preview.append(image, element("span", "preview-family", entry.family));

    var body = element("div", "card-body");
    var titleRow = element("div", "card-title-row");
    titleRow.append(element("h2", "", entry.name), element("code", "", entry.id));

    var tags = element("div", "tag-row");
    [entry.density].concat(entry.pageTypes.slice(0, 3), entry.tones.slice(0, 2)).forEach(function (value) {
      tags.append(element("span", "style-tag", value));
    });

    var details = element("dl", "card-details");
    details.append(
      createDetail(copy.bestFor, entry.bestFor.slice(0, 3).join(" · ")),
      createDetail(copy.viewport, entry.firstViewport),
      createDetail(copy.components, entry.componentKits.join(" · "))
    );

    var references = element("details", "references");
    references.append(element("summary", "", copy.references));
    var referenceList = element("div", "reference-list");
    entry.references.forEach(function (reference) {
      var row = element("div", "reference-item");
      row.append(element("span", "", reference.label));
      var light = element("a", "", copy.light);
      light.href = reference.lightPreviewUrl;
      light.target = "_blank";
      light.rel = "noreferrer noopener";
      var dark = element("a", "", copy.dark);
      dark.href = reference.darkPreviewUrl;
      dark.target = "_blank";
      dark.rel = "noreferrer noopener";
      row.append(light, dark);
      referenceList.append(row);
    });
    references.append(referenceList);
    body.append(titleRow, tags, details, references);
    article.append(preview, body);
    return article;
  }

  function selectedCount() {
    return FACET_ORDER.reduce(function (count, group) {
      return count + (state.filters[group] || []).length;
    }, 0);
  }

  function renderFacets() {
    facetGroups.replaceChildren();
    FACET_ORDER.forEach(function (group, index) {
      var details = element("details", "facet-group");
      var selected = (state.filters[group] || []).length;
      var desktop = window.matchMedia("(min-width: 761px)").matches;
      if ((desktop && index < 3) || selected > 0) details.open = true;
      details.append(element("summary", "", copy.facet[group] + (selected ? " · " + selected : "")));
      var options = element("div", "facet-options");
      state.catalog.facets[group].forEach(function (value) {
        var button = element("button", "filter-chip", value);
        button.type = "button";
        button.dataset.group = group;
        button.dataset.value = value;
        button.setAttribute("aria-pressed", String((state.filters[group] || []).includes(value)));
        button.addEventListener("click", function () {
          var values = state.filters[group] || [];
          state.filters[group] = values.includes(value)
            ? values.filter(function (item) { return item !== value; })
            : values.concat(value);
          writeUrlState();
          resetPagination();
          render();
        });
        options.append(button);
      });
      details.append(options);
      facetGroups.append(details);
    });
  }

  function render() {
    var entries = searchCandidates().filter(matchesFilters);
    var visibleEntries = entries.slice(0, state.visibleCount);
    status.textContent = entries.length + " " + copy.result;
    activeCount.textContent = String(selectedCount());
    grid.replaceChildren();
    visibleEntries.forEach(function (entry) { grid.append(createCard(entry)); });
    emptyState.hidden = entries.length !== 0;
    var remaining = entries.length - visibleEntries.length;
    loadMore.hidden = remaining <= 0;
    if (remaining > 0) {
      var nextCount = Math.min(pageSize(), remaining);
      loadMore.textContent = copy.loadMore + " · " + nextCount;
      loadMore.setAttribute("aria-label", copy.loadMoreLabel.replace("{count}", String(nextCount)));
    }
    renderFacets();
  }

  search.addEventListener("input", function () {
    state.query = search.value;
    writeUrlState();
    resetPagination();
    render();
  });
  clearButton.addEventListener("click", function () {
    state.query = "";
    state.filters = {};
    search.value = "";
    writeUrlState();
    resetPagination();
    render();
    search.focus();
  });
  loadMore.addEventListener("click", function () {
    state.visibleCount += pageSize();
    render();
  });
  window.addEventListener("keydown", function (event) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      search.focus();
    }
  });

  readUrlState();
  var catalogRequestUrl = "catalog.json" + (pageRevision ? "?v=" + encodeURIComponent(pageRevision) : "");
  fetch(catalogRequestUrl, { cache: "no-store" })
    .then(function (response) {
      if (!response.ok) throw new Error("HTTP " + response.status);
      return response.json();
    })
    .then(function (catalog) {
      state.catalog = catalog;
      renderRevisionWarning(catalog);
      resetPagination();
      render();
    })
    .catch(function () {
      status.textContent = copy.loadError;
      emptyState.hidden = false;
    });
}());
`;

const CATALOG_FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Web Style Director">
  <rect width="64" height="64" rx="16" fill="#202820"/>
  <path d="M15 18h8l5 24h-7zm13 0h8l-5 24h-7zm13 0h8l-5 24h-7z" fill="#eff4ea"/>
</svg>\n`;

export function buildStyleCatalogStaticAssets({ catalog = buildStyleCatalog() } = {}) {
  const assets = new Map([
    ["index.html", { body: renderCatalogBrowserPage(catalog), contentType: "text/html; charset=utf-8" }],
    ["catalog.json", { body: `${JSON.stringify(catalog)}\n`, contentType: "application/json; charset=utf-8" }],
    ["app.js", { body: CATALOG_APP_JS, contentType: "text/javascript; charset=utf-8" }],
    ["styles.css", { body: CATALOG_STYLES_CSS, contentType: "text/css; charset=utf-8" }],
    ["favicon.svg", { body: CATALOG_FAVICON_SVG, contentType: "image/svg+xml; charset=utf-8" }],
    [".nojekyll", { body: "", contentType: "application/octet-stream" }]
  ]);

  for (const entry of catalog.entries) {
    const assetPath = previewAssetPath(entry.id);
    const expectedUrl = previewUrl(entry.id, catalog.catalogRevision);
    if (entry.previewUrl !== expectedUrl) {
      throw new Error(`Unexpected preview URL for style ${entry.id}: ${entry.previewUrl}`);
    }
    assets.set(assetPath, {
      body: readFileSync(previewPath(entry.id), "utf8"),
      contentType: "image/svg+xml; charset=utf-8",
      headers: { "Cross-Origin-Resource-Policy": "same-origin" }
    });
  }

  return { catalog, assets };
}

function normalizeCatalogBasePath(basePath = "/") {
  const trimmed = String(basePath || "/").trim();
  const normalized = trimmed === "/"
    ? "/"
    : `/${trimmed.replace(/^\/+|\/+$/g, "")}/`;
  if (!/^\/(?:[a-z0-9._~-]+\/)*$/iu.test(normalized) || normalized.includes("../")) {
    throw new Error(`Invalid style catalog base path: ${basePath}`);
  }
  return normalized;
}

export async function startStyleCatalogServer({
  port = 0,
  catalog = buildStyleCatalog(),
  basePath = "/"
} = {}) {
  const normalizedBasePath = normalizeCatalogBasePath(basePath);
  const { assets } = buildStyleCatalogStaticAssets({ catalog });
  const routes = {};
  for (const [assetPath, asset] of assets) {
    const routePath = assetPath === "index.html"
      ? normalizedBasePath
      : `${normalizedBasePath}${assetPath}`;
    routes[routePath] = asset;
  }

  const served = await startLoopbackServer({
    port,
    serverName: "style catalog development server",
    routes,
    contentSecurityPolicy: CATALOG_CONTENT_SECURITY_POLICY
  });
  const catalogUrl = new URL(normalizedBasePath.slice(1), served.url).href;

  return {
    ...served,
    catalogUrl,
    basePath: normalizedBasePath,
    catalogRevision: catalog.catalogRevision,
    styleCount: catalog.styleCount,
    sourceCount: catalog.sourceCount
  };
}
