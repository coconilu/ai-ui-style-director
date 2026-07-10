import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expandVisualReferences, renderProjectDraftSvg } from "./preview.mjs";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const CHINESE_HINTS = [
  ["官网", "website landing product-site company-site"],
  ["落地页", "landing launch signup"],
  ["新建", "new create"],
  ["重构", "redesign existing"],
  ["改版", "redesign existing"],
  ["后台", "dashboard admin internal-tool"],
  ["仪表盘", "dashboard analytics metrics"],
  ["看板", "dashboard analytics monitor"],
  ["电商", "ecommerce shop catalog purchase"],
  ["作品集", "portfolio agency studio work"],
  ["文档", "docs documentation developer"],
  ["开发者", "developer api sdk docs"],
  ["工具", "tool product platform"],
  ["企业", "enterprise b2b trust sales"],
  ["消费", "consumer brand"],
  ["金融", "finance fintech market risk"],
  ["学习", "education learning course study"],
  ["教育", "education learning student teacher"],
  ["研究", "research lab paper benchmark"],
  ["动效", "motion animation launch"],
  ["营销", "marketing launch landing"],
  ["AI", "ai agent model"],
  ["ai", "ai agent model"],
  ["SaaS", "saas workflow product"],
  ["saas", "saas workflow product"]
];

export function repoRoot() {
  return ROOT_DIR;
}

export function readCatalog(name) {
  const path = join(ROOT_DIR, "catalog", name);
  return JSON.parse(readFileSync(path, "utf8"));
}

export function loadStyleProfiles() {
  return readCatalog("style-profiles.json");
}

export function loadStyleVisuals() {
  return readCatalog("style-visuals.json");
}

export function loadComponentKits() {
  return readCatalog("component-kits.json");
}

export function loadScenarioQuestions() {
  return readCatalog("scenario-questions.json");
}

export function loadProviders() {
  return readCatalog("providers.json");
}

function resolveStyleVisual(styleId, visualMap = new Map(loadStyleVisuals().map((item) => [item.styleId, item]))) {
  const visual = visualMap.get(styleId);
  if (!visual) throw new Error(`Missing visual configuration for style: ${styleId}`);
  const previewCardPath = join(ROOT_DIR, "catalog", "previews", `${styleId}.svg`);
  return {
    ...visual,
    previewCardPath,
    previewCardMarkdownPath: previewCardPath.replaceAll("\\", "/"),
    references: expandVisualReferences(visual.references)
  };
}

function normalizeBrief(brief) {
  let text = String(brief || "");
  for (const [needle, expansion] of CHINESE_HINTS) {
    if (text.includes(needle)) text += ` ${expansion}`;
  }
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizedTerms(values) {
  return values.flatMap((value) => normalizeBrief(value).split(" ").filter(Boolean));
}

function countMatches(haystack, terms) {
  let score = 0;
  const seen = new Set();
  for (const term of terms) {
    if (term.length < 2 || seen.has(term)) continue;
    seen.add(term);
    if (haystack.includes(term)) score += term.length > 5 ? 2 : 1;
  }
  return score;
}

export function isBriefInsufficient(brief) {
  const normalized = normalizeBrief(brief);
  if (!normalized) return true;
  const terms = new Set(normalized.split(" ").filter(Boolean));
  const specificTerms = [
    "dashboard",
    "docs",
    "portfolio",
    "ecommerce",
    "developer",
    "enterprise",
    "consumer",
    "finance",
    "education",
    "research",
    "saas",
    "ai",
    "tool"
  ];
  return specificTerms.every((term) => !terms.has(term));
}

export function scoreProfile(profile, brief) {
  const normalized = normalizeBrief(brief);
  const highWeight = normalizedTerms([
    ...profile.keywords,
    ...profile.pageTypes,
    ...profile.audiences,
    ...profile.goals
  ]);
  const mediumWeight = normalizedTerms([...profile.tones, profile.density, ...profile.bestFor]);
  const lowWeight = normalizedTerms(profile.layoutRules);

  let score = 0;
  score += countMatches(normalized, highWeight) * 4;
  score += countMatches(normalized, mediumWeight) * 2;
  score += countMatches(normalized, lowWeight);

  if (normalized.includes("redesign") && profile.pageTypes.includes("app-redesign")) score += 8;
  if (normalized.includes("new") && profile.pageTypes.includes("landing")) score += 2;
  if (normalized.includes("ai") && profile.keywords.includes("ai")) score += 6;
  if (normalized.includes("dashboard") && profile.pageTypes.includes("dashboard")) score += 7;
  if (normalized.includes("developer") && profile.audiences.includes("developers")) score += 6;
  if (normalized.includes("enterprise") && profile.audiences.includes("enterprise-buyers")) score += 6;
  if (normalized.includes("consumer") && profile.audiences.includes("consumers")) score += 5;

  return score;
}

function diversify(scored, count) {
  const selected = [];
  const families = new Set();

  for (const item of scored) {
    if (selected.length >= count) break;
    if (!families.has(item.profile.family)) {
      selected.push(item);
      families.add(item.profile.family);
    }
  }

  for (const item of scored) {
    if (selected.length >= count) break;
    if (!selected.some((candidate) => candidate.profile.id === item.profile.id)) {
      selected.push(item);
    }
  }

  return selected;
}

function readSession(sessionPath) {
  if (!sessionPath || !existsSync(sessionPath)) return { shownStyleIds: [] };
  try {
    return JSON.parse(readFileSync(sessionPath, "utf8"));
  } catch {
    return { shownStyleIds: [] };
  }
}

function writeSession(sessionPath, session) {
  if (!sessionPath) return;
  mkdirSync(dirname(sessionPath), { recursive: true });
  writeFileSync(sessionPath, `${JSON.stringify(session, null, 2)}\n`, "utf8");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isChineseBrief(brief) {
  return /[\u3400-\u9fff]/u.test(String(brief || ""));
}

function galleryCopy(brief) {
  if (isChineseBrief(brief)) {
    return {
      lang: "zh-CN",
      eyebrow: "Web Style Director · 推荐结果",
      title: "选择一个 UI 方向",
      subtitle: "比较布局、密度、视觉层级与组件模型，然后回到终端回复编号或风格 ID。",
      brief: "项目需求",
      fit: "适用场景",
      viewport: "首屏结构",
      components: "组件建议",
      risk: "主要风险",
      references: "视觉参考",
      light: "浅色",
      dark: "深色",
      choose: "回到终端选择 1–5、输入风格 ID，或要求换一批。",
      notice: "卡片是无品牌线框草图；上游预览仅作为灵感参考，不应复制其中的品牌资产或精确布局。"
    };
  }
  return {
    lang: "en",
    eyebrow: "Web Style Director · Recommendations",
    title: "Choose a UI direction",
    subtitle: "Compare layout, density, visual hierarchy, and component models, then return to the terminal with a number or style id.",
    brief: "Project brief",
    fit: "Best for",
    viewport: "First viewport",
    components: "Component kits",
    risk: "Main risk",
    references: "Visual reference",
    light: "Light",
    dark: "Dark",
    choose: "Return to the terminal and choose 1–5, enter a style id, or ask for another batch.",
    notice: "Cards are brand-neutral wireframes. Upstream previews are inspiration references; do not copy their brand assets or exact layouts."
  };
}

function svgDataUri(path) {
  const svg = readFileSync(path, "utf8");
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

export function renderRecommendationGalleryHtml(result) {
  if (result.needsContext) throw new Error("Cannot render a recommendation gallery before the brief has enough context.");
  const copy = galleryCopy(result.brief);
  const cards = result.recommendations.map((item) => {
    const primaryReference = item.visual.references[0];
    const fit = item.bestFor.slice(0, 3).join(" · ");
    const risk = item.risks[0] || "—";
    return `
      <article class="style-card">
        <div class="preview">
          <img src="${svgDataUri(item.visual.previewCardPath)}" alt="${escapeHtml(item.name)} preview">
          <span class="rank">${item.rank}</span>
        </div>
        <div class="card-body">
          <div class="title-row">
            <h2>${escapeHtml(item.name)}</h2>
            <code>${escapeHtml(item.id)}</code>
          </div>
          <dl>
            <div><dt>${copy.fit}</dt><dd>${escapeHtml(fit)}</dd></div>
            <div><dt>${copy.viewport}</dt><dd>${escapeHtml(item.firstViewport)}</dd></div>
            <div><dt>${copy.components}</dt><dd>${escapeHtml(item.componentKits.join(" · "))}</dd></div>
            <div><dt>${copy.risk}</dt><dd>${escapeHtml(risk)}</dd></div>
          </dl>
          <div class="reference-row">
            <span>${copy.references}: ${escapeHtml(primaryReference.label)}</span>
            <a href="${escapeHtml(primaryReference.lightPreviewUrl)}" target="_blank" rel="noreferrer noopener">${copy.light}</a>
            <a href="${escapeHtml(primaryReference.darkPreviewUrl)}" target="_blank" rel="noreferrer noopener">${copy.dark}</a>
          </div>
        </div>
      </article>`;
  }).join("");

  return `<!doctype html>
<html lang="${copy.lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" href="data:,">
  <title>${escapeHtml(copy.title)} · Web Style Director</title>
  <style>
    :root { color-scheme: light dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #20231f; background: #eff0ec; }
    .shell { width: min(1440px, calc(100% - 40px)); margin: 34px auto; }
    header { padding: 28px 30px; border: 1px solid #d9dbd5; border-radius: 20px; background: #fbfbf9; box-shadow: 0 18px 50px rgba(32,35,31,.07); }
    .eyebrow { margin: 0 0 10px; color: #70756d; font-size: 12px; font-weight: 750; letter-spacing: .08em; text-transform: uppercase; }
    h1 { margin: 0; font-size: clamp(30px, 5vw, 54px); line-height: 1; letter-spacing: -.045em; }
    .subtitle { max-width: 780px; margin: 14px 0 22px; color: #666b63; font-size: 15px; line-height: 1.55; }
    .brief { margin: 0; padding: 13px 15px; border: 1px solid #e0e1dc; border-radius: 11px; color: #3e423c; background: #f3f4f0; font-size: 13px; line-height: 1.55; }
    .brief strong { margin-right: 8px; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; margin-top: 18px; }
    .style-card { overflow: hidden; border: 1px solid #d9dbd5; border-radius: 18px; background: #fff; box-shadow: 0 8px 28px rgba(32,35,31,.055); }
    .preview { position: relative; aspect-ratio: 5 / 3; overflow: hidden; background: #eceee9; }
    .preview img { width: 100%; height: 100%; display: block; object-fit: cover; }
    .rank { position: absolute; top: 14px; left: 14px; width: 34px; height: 34px; display: grid; place-items: center; border: 1px solid rgba(255,255,255,.25); border-radius: 10px; color: #fff; background: rgba(23,26,23,.86); font-size: 13px; font-weight: 800; backdrop-filter: blur(8px); }
    .card-body { padding: 18px; }
    .title-row { display: flex; align-items: baseline; justify-content: space-between; gap: 14px; }
    h2 { margin: 0; font-size: 20px; letter-spacing: -.025em; }
    code { color: #858a82; font-size: 11px; }
    dl { display: grid; gap: 10px; margin: 18px 0; }
    dl div { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 12px; }
    dt { color: #747970; font-size: 11px; font-weight: 720; text-transform: uppercase; letter-spacing: .04em; }
    dd { margin: 0; color: #40443e; font-size: 12px; line-height: 1.45; }
    .reference-row { display: flex; align-items: center; gap: 9px; padding-top: 13px; border-top: 1px solid #ecece8; color: #747970; font-size: 11px; }
    .reference-row a { padding: 5px 8px; border: 1px solid #dadcd6; border-radius: 7px; color: #343832; background: #f7f7f5; text-decoration: none; font-weight: 700; }
    .selection { display: flex; justify-content: space-between; gap: 24px; margin: 18px 0 0; padding: 18px 20px; border: 1px solid #282e28; border-radius: 14px; color: #fff; background: #242a24; }
    .selection strong { font-size: 14px; }
    .selection span { color: #c4c9c1; font-size: 11px; line-height: 1.5; text-align: right; }
    @media (max-width: 820px) { .shell { width: min(100% - 22px, 720px); margin: 12px auto; } header { padding: 22px; } .grid { grid-template-columns: 1fr; } .title-row, .selection { align-items: flex-start; flex-direction: column; } .selection span { text-align: left; } }
    @media (prefers-color-scheme: dark) {
      body { color: #f0f2ed; background: #111411; }
      header, .style-card { border-color: #313630; background: #1b1f1b; }
      .brief { border-color: #343934; color: #d9ddd7; background: #242824; }
      .subtitle, .eyebrow, dt, code, .reference-row { color: #9da49b; }
      dd { color: #d5dad3; }
      .reference-row { border-color: #303530; }
      .reference-row a { border-color: #3a403a; color: #e8ebe6; background: #242924; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <header>
      <p class="eyebrow">${escapeHtml(copy.eyebrow)}</p>
      <h1>${escapeHtml(copy.title)}</h1>
      <p class="subtitle">${escapeHtml(copy.subtitle)}</p>
      <p class="brief"><strong>${escapeHtml(copy.brief)}:</strong>${escapeHtml(result.brief)}</p>
    </header>
    <section class="grid" aria-label="UI style recommendations">${cards}
    </section>
    <footer class="selection"><strong>${escapeHtml(copy.choose)}</strong><span>${escapeHtml(copy.notice)}</span></footer>
  </main>
</body>
</html>\n`;
}

export function writeRecommendationGallery(result, galleryPath = resolve(dirname(result.sessionPath), "recommendations.html")) {
  const resolvedPath = resolve(galleryPath);
  mkdirSync(dirname(resolvedPath), { recursive: true });
  writeFileSync(resolvedPath, renderRecommendationGalleryHtml(result), "utf8");
  return {
    galleryPath: resolvedPath,
    galleryUrl: pathToFileURL(resolvedPath).href
  };
}

export function recommendationGalleryInfo(galleryPath = resolve(".ui-style-director", "recommendations.html")) {
  const resolvedPath = resolve(galleryPath);
  if (!existsSync(resolvedPath)) {
    throw new Error(`No recommendation gallery found at ${resolvedPath}. Run recommend first.`);
  }
  return {
    galleryPath: resolvedPath,
    galleryUrl: pathToFileURL(resolvedPath).href
  };
}

export function previewOpenCommand(galleryPath, platform = process.platform) {
  const resolvedPath = resolve(galleryPath);
  if (platform === "win32") {
    return {
      command: "rundll32.exe",
      args: ["url.dll,FileProtocolHandler", pathToFileURL(resolvedPath).href]
    };
  }
  if (platform === "darwin") return { command: "open", args: [resolvedPath] };
  return { command: "xdg-open", args: [resolvedPath] };
}

export function openRecommendationGallery(galleryPath, { platform = process.platform, run = spawnSync } = {}) {
  const info = recommendationGalleryInfo(galleryPath);
  const opener = previewOpenCommand(info.galleryPath, platform);
  const result = run(opener.command, opener.args, { encoding: "utf8", windowsHide: true });
  if (result.error || result.status !== 0) {
    const detail = result.error?.message || result.stderr?.trim() || `exit code ${result.status}`;
    throw new Error(`Could not open the recommendation gallery automatically (${detail}). Open ${info.galleryUrl} manually.`);
  }
  return { ...info, opened: true };
}

export function recommendStyles({
  brief,
  count = 5,
  again = false,
  sessionPath = resolve(".ui-style-director", "session.json")
} = {}) {
  if (isBriefInsufficient(brief)) {
    return {
      needsContext: true,
      questions: loadScenarioQuestions(),
      recommendations: [],
      sessionPath
    };
  }

  const profiles = loadStyleProfiles();
  const visualMap = new Map(loadStyleVisuals().map((item) => [item.styleId, item]));
  const session = readSession(sessionPath);
  const excluded = new Set(again ? session.shownStyleIds || [] : []);
  const scored = profiles
    .map((profile) => ({ profile, score: scoreProfile(profile, brief) }))
    .filter((item) => !excluded.has(item.profile.id))
    .sort((a, b) => b.score - a.score || a.profile.name.localeCompare(b.profile.name));

  const selected = diversify(scored, count);
  const exhausted = selected.length < count;
  const shownStyleIds = Array.from(new Set([...(session.shownStyleIds || []), ...selected.map((item) => item.profile.id)]));

  writeSession(sessionPath, {
    brief,
    updatedAt: new Date().toISOString(),
    shownStyleIds,
    lastRecommendationIds: selected.map((item) => item.profile.id)
  });

  const result = {
    needsContext: false,
    brief,
    sessionPath,
    exhausted,
    recommendations: selected.map((item, index) => ({
      rank: index + 1,
      score: item.score,
      ...item.profile,
      visual: resolveStyleVisual(item.profile.id, visualMap)
    }))
  };
  return { ...result, ...writeRecommendationGallery(result) };
}

export function renderContextQuestions(result) {
  const lines = [
    "I need a little more context before recommending UI directions.",
    "",
    "Please answer the minimum useful items:"
  ];
  for (const question of result.questions) {
    lines.push(`- ${question.question}`);
  }
  return `${lines.join("\n")}\n`;
}

export function renderRecommendations(result) {
  if (result.needsContext) return renderContextQuestions(result);
  const lines = [
    "Recommended UI style directions:",
    ""
  ];

  for (const item of result.recommendations) {
    const primaryReference = item.visual?.references?.[0];
    lines.push(`${item.rank}. ${item.name} (${item.id})`);
    lines.push(`   Fit score: ${item.score}`);
    lines.push(`   Best for: ${item.bestFor.join("; ")}`);
    lines.push(`   First viewport: ${item.firstViewport}`);
    if (item.visual) lines.push(`   Preview card: ${item.visual.previewCardMarkdownPath}`);
    if (primaryReference) {
      lines.push(`   Live preview: ${primaryReference.label} (${primaryReference.lightPreviewUrl})`);
      lines.push(`   Dark preview: ${primaryReference.darkPreviewUrl}`);
      const secondary = item.visual.references.slice(1).map((reference) => reference.label);
      if (secondary.length > 0) lines.push(`   More references: ${secondary.join(", ")}`);
    }
    lines.push(`   Component kits: ${item.componentKits.join(", ")}`);
    lines.push(`   Risk: ${item.risks.join("; ")}`);
    lines.push("");
  }

  if (result.exhausted) {
    lines.push("Fewer than the requested number of unseen styles remain for this session.");
    lines.push("");
  }
  lines.push(`Preview gallery: ${result.galleryUrl}`);
  lines.push(`Open gallery: ai-ui-style-director preview --open --path "${result.galleryPath}"`);
  lines.push(`Session: ${result.sessionPath}`);
  return `${lines.join("\n")}\n`;
}

function findStyle(styleId) {
  return loadStyleProfiles().find((profile) => profile.id === styleId);
}

function componentKitMap() {
  return new Map(loadComponentKits().map((kit) => [kit.id, kit]));
}

function generateDesignMd({ style, visual, brief }) {
  const kits = componentKitMap();
  const componentGuidance = style.componentKits
    .map((id) => kits.get(id))
    .filter(Boolean)
    .map((kit) => `- ${kit.name}: ${kit.useWhen}`)
    .join("\n");
  const visualReferences = visual.references
    .map(
      (reference) =>
        `- ${reference.label} (${reference.role}): [overview](${reference.pageUrl}) · ` +
        `[light preview](${reference.lightPreviewUrl}) · [dark preview](${reference.darkPreviewUrl})`
    )
    .join("\n");

  return `# DESIGN.md

## Source Intent

This file is generated by ai-ui-style-director from the selected style profile:

- Style: ${style.name}
- Style id: ${style.id}
- Catalog provider: ${style.sourceProvider}
- Catalog source key: ${style.sourceSlug}

Use the source as design inspiration and a structure guide. Do not copy protected brand names, logos, screenshots, exact layouts, or proprietary assets.

## Visual References

Use these references to compare visual language only. The project must remain original and use project-owned or generated assets.

${visualReferences}

Project-specific first-viewport draft: \`.ui-style-director/first-viewport-draft.svg\`

## Project Brief

${brief || "No brief was supplied. Ask the user for the missing project context before implementation."}

## Visual Direction

${style.name} is a ${style.tones.join(", ")} direction for ${style.bestFor.join(", ")}.

## First Viewport

${style.firstViewport}

## Layout Rules

${style.layoutRules.map((rule) => `- ${rule}`).join("\n")}

## Color Roles

${style.palette.map((token) => `- ${token}`).join("\n")}

## Typography

${style.typography}

## Recommended Component Kits

${componentGuidance}

## Fit

Best for:
${style.bestFor.map((item) => `- ${item}`).join("\n")}

Avoid for:
${style.avoidFor.map((item) => `- ${item}`).join("\n")}

## Risks

${style.risks.map((risk) => `- ${risk}`).join("\n")}

## Implementation Contract

- Review the first-viewport draft with the user before writing UI code.
- Build from this DESIGN.md only after the user confirms the draft or requested adjustments are recorded.
- Preserve the chosen style's density, component model, typography, color roles, and first-viewport architecture.
- Use generated or project-owned imagery; do not ship copied upstream assets.
- Keep visible copy and UI controls code-native unless the text belongs inside an image asset.
- If the user rejects the visual direction, rerun recommendation instead of modifying this direction ad hoc.
- After implementation, verify browser screenshots against this file and record any intentional deviations.
`;
}

export function applyStyle({
  styleId,
  projectDir = process.cwd(),
  brief = "",
  force = false
} = {}) {
  if (!styleId) throw new Error("Missing required style id.");
  const style = findStyle(styleId);
  if (!style) throw new Error(`Unknown style id: ${styleId}`);

  const target = resolve(projectDir);
  const designPath = join(target, "DESIGN.md");
  if (existsSync(designPath) && !force) {
    throw new Error(`DESIGN.md already exists at ${designPath}. Pass --force to overwrite it.`);
  }

  const visual = resolveStyleVisual(style.id);
  const stateDir = join(target, ".ui-style-director");
  const draftPath = join(stateDir, "first-viewport-draft.svg");
  mkdirSync(stateDir, { recursive: true });

  writeFileSync(draftPath, renderProjectDraftSvg({ style, visual, brief }), "utf8");
  const designMd = generateDesignMd({ style, visual, brief });
  writeFileSync(designPath, designMd, "utf8");
  writeFileSync(
    join(stateDir, "selected-style.json"),
    `${JSON.stringify({ selectedAt: new Date().toISOString(), brief, style, visual }, null, 2)}\n`,
    "utf8"
  );
  writeFileSync(
    join(stateDir, "recommended-components.json"),
    `${JSON.stringify(style.componentKits.map((id) => componentKitMap().get(id)).filter(Boolean), null, 2)}\n`,
    "utf8"
  );
  writeFileSync(
    join(stateDir, "source-attribution.json"),
    `${JSON.stringify({
      generatedBy: "ai-ui-style-director",
      sourceProvider: style.sourceProvider,
      sourceSlug: style.sourceSlug,
      visualReferences: visual.references,
      brandSafety: "Use as inspiration only; do not copy proprietary brand assets or exact layouts."
    }, null, 2)}\n`,
    "utf8"
  );

  return {
    projectDir: target,
    designPath,
    stateDir,
    draftPath,
    draftMarkdownPath: draftPath.replaceAll("\\", "/"),
    style,
    visual
  };
}

export function syncProviders({
  cacheDir = resolve(".ui-style-director", "cache", "providers"),
  clone = false
} = {}) {
  const providers = loadProviders();
  mkdirSync(cacheDir, { recursive: true });
  const results = [];

  for (const provider of providers) {
    const providerDir = join(cacheDir, provider.id);
    let status = "configured";

    if (clone) {
      if (existsSync(providerDir)) {
        const pull = spawnSync("git", ["-C", providerDir, "pull", "--ff-only"], { encoding: "utf8" });
        status = pull.status === 0 ? "updated" : "update-failed";
      } else {
        const cloneResult = spawnSync("git", ["clone", "--depth", "1", `https://github.com/${provider.repo}.git`, providerDir], {
          encoding: "utf8"
        });
        status = cloneResult.status === 0 ? "cloned" : "clone-failed";
      }
    }

    results.push({
      ...provider,
      cacheDir: providerDir,
      status
    });
  }

  const lockPath = join(dirname(cacheDir), "providers-lock.json");
  writeFileSync(lockPath, `${JSON.stringify({ syncedAt: new Date().toISOString(), providers: results }, null, 2)}\n`, "utf8");
  return { lockPath, providers: results };
}

const IGNORED_SCAN_DIRS = new Set([
  ".git",
  "node_modules",
  ".next",
  "dist",
  "build",
  "coverage",
  ".turbo",
  ".cache"
]);

function posixPath(path) {
  return path.split("\\").join("/");
}

function safeGit(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

function findProviderFiles(rootDir, matcher, { limit = 200 } = {}) {
  const matches = [];
  const stack = [rootDir];

  while (stack.length > 0 && matches.length < limit) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_SCAN_DIRS.has(entry.name)) stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const relativePath = posixPath(relative(rootDir, fullPath));
      if (matcher(relativePath, entry.name)) matches.push(relativePath);
      if (matches.length >= limit) break;
    }
  }

  return matches.sort();
}

function providerSnapshot(provider, providerDir) {
  const exists = existsSync(providerDir);
  const revision = exists ? safeGit(["rev-parse", "HEAD"], providerDir) : null;
  const branch = exists ? safeGit(["branch", "--show-current"], providerDir) : null;

  const designMdFiles = exists
    ? findProviderFiles(providerDir, (_relativePath, name) => basename(name).toLowerCase() === "design.md")
    : [];
  const registryFiles = exists
    ? findProviderFiles(providerDir, (relativePath, name) => {
        const ext = extname(name).toLowerCase();
        return relativePath.toLowerCase().includes("registry") && [".json", ".jsonl", ".ts", ".tsx", ".md", ".mdx"].includes(ext);
      })
    : [];
  const docsFiles = exists
    ? findProviderFiles(
        providerDir,
        (relativePath, name) => {
          const ext = extname(name).toLowerCase();
          return relativePath.toLowerCase().includes("docs/") && [".md", ".mdx"].includes(ext);
        },
        { limit: 100 }
      )
    : [];

  return {
    id: provider.id,
    repo: provider.repo,
    url: provider.url,
    role: provider.role,
    type: provider.type,
    license: provider.license,
    cachePresent: exists,
    branch,
    revision,
    counts: {
      designMdFiles: designMdFiles.length,
      registryFiles: registryFiles.length,
      docsFiles: docsFiles.length
    },
    designMdFiles,
    registryFiles,
    docsFiles
  };
}

export function updateCatalog({
  cacheDir = resolve(".ui-style-director", "cache", "providers"),
  generatedDir = join(ROOT_DIR, "catalog", "generated"),
  clone = false
} = {}) {
  const syncResult = syncProviders({ cacheDir, clone });
  mkdirSync(generatedDir, { recursive: true });

  const providers = loadProviders();
  const snapshots = providers.map((provider) => providerSnapshot(provider, join(cacheDir, provider.id)));
  const styleSources = snapshots.flatMap((snapshot) =>
    snapshot.designMdFiles.map((path) => ({
      providerId: snapshot.id,
      repo: snapshot.repo,
      revision: snapshot.revision,
      path,
      sourceType: "design-md"
    }))
  );
  const componentSources = snapshots.flatMap((snapshot) =>
    snapshot.registryFiles.map((path) => ({
      providerId: snapshot.id,
      repo: snapshot.repo,
      revision: snapshot.revision,
      path,
      sourceType: "registry"
    }))
  );

  const inventoryPath = join(generatedDir, "provider-inventory.json");
  const styleSourcesPath = join(generatedDir, "style-sources.json");
  const componentSourcesPath = join(generatedDir, "component-sources.json");

  const generatedAt = new Date().toISOString();
  writeFileSync(
    inventoryPath,
    `${JSON.stringify({ generatedAt, cacheDir: resolve(cacheDir), syncLockPath: syncResult.lockPath, providers: snapshots }, null, 2)}\n`,
    "utf8"
  );
  writeFileSync(styleSourcesPath, `${JSON.stringify({ generatedAt, sources: styleSources }, null, 2)}\n`, "utf8");
  writeFileSync(componentSourcesPath, `${JSON.stringify({ generatedAt, sources: componentSources }, null, 2)}\n`, "utf8");

  return {
    generatedAt,
    syncLockPath: syncResult.lockPath,
    generatedFiles: [inventoryPath, styleSourcesPath, componentSourcesPath],
    providers: snapshots,
    styleSourceCount: styleSources.length,
    componentSourceCount: componentSources.length
  };
}
