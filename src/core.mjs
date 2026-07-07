import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

export function loadComponentKits() {
  return readCatalog("component-kits.json");
}

export function loadScenarioQuestions() {
  return readCatalog("scenario-questions.json");
}

export function loadProviders() {
  return readCatalog("providers.json");
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

  return {
    needsContext: false,
    brief,
    sessionPath,
    exhausted,
    recommendations: selected.map((item, index) => ({
      rank: index + 1,
      score: item.score,
      ...item.profile
    }))
  };
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
    lines.push(`${item.rank}. ${item.name} (${item.id})`);
    lines.push(`   Fit score: ${item.score}`);
    lines.push(`   Best for: ${item.bestFor.join("; ")}`);
    lines.push(`   First viewport: ${item.firstViewport}`);
    lines.push(`   Component kits: ${item.componentKits.join(", ")}`);
    lines.push(`   Risk: ${item.risks.join("; ")}`);
    lines.push("");
  }

  if (result.exhausted) {
    lines.push("Fewer than the requested number of unseen styles remain for this session.");
    lines.push("");
  }
  lines.push(`Session: ${result.sessionPath}`);
  return `${lines.join("\n")}\n`;
}

function findStyle(styleId) {
  return loadStyleProfiles().find((profile) => profile.id === styleId);
}

function componentKitMap() {
  return new Map(loadComponentKits().map((kit) => [kit.id, kit]));
}

function generateDesignMd({ style, brief }) {
  const kits = componentKitMap();
  const componentGuidance = style.componentKits
    .map((id) => kits.get(id))
    .filter(Boolean)
    .map((kit) => `- ${kit.name}: ${kit.useWhen}`)
    .join("\n");

  return `# DESIGN.md

## Source Intent

This file is generated by ai-ui-style-director from the selected style profile:

- Style: ${style.name}
- Style id: ${style.id}
- Source provider: ${style.sourceProvider}
- Source slug: ${style.sourceSlug}

Use the source as design inspiration and a structure guide. Do not copy protected brand names, logos, screenshots, exact layouts, or proprietary assets.

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

- Build from this DESIGN.md before writing UI code.
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

  const stateDir = join(target, ".ui-style-director");
  mkdirSync(stateDir, { recursive: true });

  const designMd = generateDesignMd({ style, brief });
  writeFileSync(designPath, designMd, "utf8");
  writeFileSync(
    join(stateDir, "selected-style.json"),
    `${JSON.stringify({ selectedAt: new Date().toISOString(), brief, style }, null, 2)}\n`,
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
      brandSafety: "Use as inspiration only; do not copy proprietary brand assets or exact layouts."
    }, null, 2)}\n`,
    "utf8"
  );

  return {
    projectDir: target,
    designPath,
    stateDir,
    style
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
