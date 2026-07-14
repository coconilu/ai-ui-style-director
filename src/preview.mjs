import { expandProviderReference } from "./provider-adapters.mjs";

const DIRECTION_THEME_TOKEN_NAMES = Object.freeze([
  "canvas",
  "surface",
  "surfaceAlt",
  "text",
  "muted",
  "accent",
  "border"
]);
const DIRECTION_THEME_COLOR_PATTERN = /^#[0-9a-f]{6}$/iu;

function escapeXml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function truncate(value, length) {
  const text = String(value || "").trim();
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

function rect(x, y, width, height, fill, stroke, radius = 14, extra = "") {
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" stroke="${stroke}" ${extra}/>`;
}

function line(x1, y1, x2, y2, stroke, width = 2, extra = "") {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${width}" ${extra}/>`;
}

function label(x, y, text, fill, size = 14, weight = 500, anchor = "start") {
  return `<text x="${x}" y="${y}" fill="${fill}" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${escapeXml(text)}</text>`;
}

function pill(x, y, width, text, theme) {
  return `${rect(x, y, width, 30, theme.surfaceAlt, theme.border, 15)}${label(x + width / 2, y + 20, text, theme.muted, 11, 650, "middle")}`;
}

function metricCard(x, y, width, title, value, theme) {
  return [
    rect(x, y, width, 92, theme.surfaceAlt, theme.border, 12),
    label(x + 18, y + 28, title, theme.muted, 11, 600),
    label(x + 18, y + 65, value, theme.text, 25, 720),
    `<circle cx="${x + width - 24}" cy="${y + 24}" r="5" fill="${theme.accent}"/>`
  ].join("");
}

function renderDeveloper(theme) {
  return [
    label(42, 62, "Build with a precise", theme.text, 29, 720),
    label(42, 98, "product contract.", theme.text, 29, 720),
    label(42, 132, "Direct action and visible product proof.", theme.muted, 13, 450),
    pill(42, 160, 124, "READ DOCS", theme),
    pill(176, 160, 132, "START BUILD", theme),
    rect(42, 230, 390, 210, theme.surfaceAlt, theme.border, 14),
    label(66, 266, "PRODUCT PROOF", theme.muted, 11, 650),
    line(66, 295, 380, 295, theme.border),
    ...[0, 1, 2, 3].map((i) => rect(66, 320 + i * 27, 235 - i * 18, 9, i === 0 ? theme.accent : theme.border, "none", 5)),
    rect(486, 40, 592, 400, "#070709", theme.border, 16),
    `<circle cx="516" cy="68" r="5" fill="#EF4444"/><circle cx="534" cy="68" r="5" fill="#F59E0B"/><circle cx="552" cy="68" r="5" fill="#22C55E"/>`,
    label(514, 115, "$ npm run build", theme.accent, 15, 600),
    label(514, 154, "✓ design contract loaded", theme.muted, 13, 450),
    label(514, 184, "✓ components mapped", theme.muted, 13, 450),
    label(514, 214, "✓ visual QA ready", theme.muted, 13, 450),
    rect(514, 260, 520, 118, theme.surface, theme.border, 10),
    line(538, 294, 850, 294, theme.border, 8, 'stroke-linecap="round"'),
    line(538, 327, 972, 327, theme.border, 8, 'stroke-linecap="round"')
  ].flat().join("");
}

function renderAppShell(theme) {
  const rows = ["Today", "In review", "Blocked", "Completed"];
  return [
    rect(0, 0, 210, 520, theme.surfaceAlt, theme.border, 0),
    label(26, 42, "WORKSPACE", theme.muted, 11, 700),
    ...rows.map((item, i) => `${rect(18, 68 + i * 48, 174, 36, i === 1 ? theme.surface : "transparent", i === 1 ? theme.border : "transparent", 8)}${label(36, 91 + i * 48, item, i === 1 ? theme.text : theme.muted, 13, i === 1 ? 650 : 500)}`),
    rect(240, 26, 850, 56, theme.surfaceAlt, theme.border, 12),
    label(266, 61, "Operations / Active work", theme.text, 16, 650),
    pill(930, 39, 134, "NEW TASK", theme),
    ...[0, 1, 2].map((i) => metricCard(240 + i * 280, 106, 258, ["Active", "Review", "SLA risk"][i], ["24", "08", "03"][i], theme)),
    rect(240, 220, 850, 266, theme.surface, theme.border, 14),
    label(266, 252, "TASK", theme.muted, 10, 700),
    label(730, 252, "STATUS", theme.muted, 10, 700),
    ...[0, 1, 2, 3, 4].map((i) => [
      line(258, 274 + i * 42, 1072, 274 + i * 42, theme.border, 1),
      `<circle cx="276" cy="${295 + i * 42}" r="6" fill="${i === 2 ? theme.accent : theme.border}"/>`,
      line(296, 295 + i * 42, 570 + i * 18, 295 + i * 42, theme.muted, 7, 'stroke-linecap="round" opacity="0.55"'),
      pill(710, 280 + i * 42, 104, i === 2 ? "BLOCKED" : "ACTIVE", theme)
    ].join("")).join("")
  ].flat().join("");
}

function renderEnterprise(theme) {
  return [
    label(40, 58, "Trusted operations,", theme.text, 29, 740),
    label(40, 94, "clearly explained.", theme.text, 29, 740),
    label(40, 128, "Proof and governance before decoration.", theme.muted, 13, 450),
    pill(40, 158, 138, "BOOK A DEMO", theme),
    rect(40, 232, 340, 178, theme.surfaceAlt, theme.border, 14),
    label(64, 266, "TRUST SIGNALS", theme.muted, 11, 700),
    ...[0, 1, 2].map((i) => `${rect(64 + i * 92, 300, 72, 72, theme.surface, theme.border, 12)}<circle cx="${100 + i * 92}" cy="336" r="12" fill="${i === 1 ? theme.accent : theme.border}"/>`),
    rect(430, 40, 648, 350, theme.surface, theme.border, 16),
    label(458, 76, "GOVERNED WORKFLOW", theme.muted, 11, 700),
    ...[0, 1, 2].map((i) => `${rect(470 + i * 190, 156, 148, 90, theme.surfaceAlt, theme.border, 12)}${label(544 + i * 190, 207, ["INPUT", "POLICY", "OUTPUT"][i], i === 1 ? theme.accent : theme.text, 12, 700, "middle")}${i < 2 ? line(618 + i * 190, 201, 660 + i * 190, 201, theme.accent, 3, 'marker-end="url(#arrow)"') : ""}`),
    ...[0, 1, 2].map((i) => rect(430 + i * 220, 418, 208, 68, theme.surfaceAlt, theme.border, 12)),
    ...[0, 1, 2].map((i) => label(450 + i * 220, 458, ["SECURITY", "AUDIT", "RELIABILITY"][i], theme.muted, 11, 700))
  ].flat().join("");
}

function renderDashboard(theme) {
  const bars = [76, 118, 92, 150, 128, 176, 142, 198];
  return [
    ...[0, 1, 2, 3].map((i) => metricCard(22 + i * 270, 22, 248, ["Revenue", "Latency", "Alerts", "Coverage"][i], ["$82.4K", "184ms", "07", "96.2%"][i], theme)),
    rect(22, 136, 660, 348, theme.surfaceAlt, theme.border, 14),
    label(48, 170, "PERFORMANCE", theme.muted, 11, 700),
    line(52, 428, 650, 428, theme.border),
    ...bars.map((height, i) => rect(66 + i * 68, 428 - height, 34, height, i === 7 ? theme.accent : theme.border, "none", 7)),
    rect(710, 136, 388, 348, theme.surface, theme.border, 14),
    label(736, 170, "LIVE EVENTS", theme.muted, 11, 700),
    ...[0, 1, 2, 3, 4].map((i) => `${line(730, 202 + i * 52, 1078, 202 + i * 52, theme.border)}<circle cx="748" cy="${228 + i * 52}" r="6" fill="${i < 2 ? theme.accent : theme.border}"/>${line(770, 228 + i * 52, 938 + (i % 2) * 50, 228 + i * 52, theme.muted, 7, 'stroke-linecap="round" opacity="0.55"')}`)
  ].flat().join("");
}

function renderDocs(theme) {
  return [
    rect(0, 0, 214, 520, theme.surfaceAlt, theme.border, 0),
    label(24, 42, "DOCUMENTATION", theme.text, 12, 700),
    ...[0, 1, 2, 3, 4, 5].map((i) => line(26, 82 + i * 38, 150 + (i % 3) * 14, 82 + i * 38, i === 2 ? theme.accent : theme.muted, i === 2 ? 8 : 6, 'stroke-linecap="round" opacity="0.65"')),
    label(250, 56, "Build a consistent interface", theme.text, 29, 740),
    label(250, 88, "A readable contract for components, tokens, and behavior.", theme.muted, 13, 450),
    ...[0, 1, 2, 3, 4].map((i) => line(252, 134 + i * 28, 640 + (i % 2) * 38, 134 + i * 28, theme.muted, 7, 'stroke-linecap="round" opacity="0.38"')),
    label(250, 306, "Principles", theme.text, 19, 700),
    ...[0, 1, 2].map((i) => `${rect(250, 332 + i * 48, 22, 22, i === 0 ? theme.accent : theme.surfaceAlt, theme.border, 6)}${line(292, 343 + i * 48, 628 + i * 12, 343 + i * 48, theme.muted, 7, 'stroke-linecap="round" opacity="0.48"')}`),
    rect(720, 38, 372, 422, "#101114", theme.border, 14),
    label(744, 72, "DESIGN.md", theme.accent, 12, 700),
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => line(744, 112 + i * 36, 910 + ((i * 29) % 130), 112 + i * 36, i % 3 === 0 ? theme.accent : "#52525B", 7, 'stroke-linecap="round"'))
  ].flat().join("");
}

function renderLaunch(theme) {
  return [
    `<circle cx="890" cy="90" r="250" fill="${theme.accent}" opacity="0.16"/><circle cx="930" cy="120" r="150" fill="${theme.accent}" opacity="0.12"/>`,
    pill(46, 42, 148, "NEW PRODUCT", theme),
    label(46, 112, "Make the launch", theme.text, 38, 780),
    label(46, 154, "feel like a reveal.", theme.accent, 38, 780),
    label(46, 198, "One visual hook, one proof moment, one clear action.", theme.muted, 14, 450),
    pill(46, 232, 138, "JOIN WAITLIST", theme),
    rect(420, 58, 650, 390, theme.surface, theme.border, 20, 'transform="rotate(-2 745 253)"'),
    rect(454, 92, 582, 320, theme.surfaceAlt, theme.border, 16),
    `<circle cx="745" cy="252" r="102" fill="${theme.accent}" opacity="0.2"/><circle cx="745" cy="252" r="58" fill="${theme.accent}" opacity="0.75"/>`,
    `<path d="M727 220 L786 252 L727 284 Z" fill="${theme.text}"/>`,
    ...[0, 1, 2].map((i) => rect(46 + i * 126, 384, 108, 64, theme.surfaceAlt, theme.border, 12))
  ].flat().join("");
}

function renderBrand(theme) {
  return [
    label(42, 58, "A human story", theme.text, 30, 750),
    label(42, 94, "with a clear action.", theme.text, 30, 750),
    label(42, 128, "Warm rhythm and memorable moments.", theme.muted, 13, 450),
    pill(42, 158, 122, "EXPLORE", theme),
    rect(42, 230, 460, 240, theme.surfaceAlt, theme.border, 28),
    `<circle cx="230" cy="336" r="78" fill="${theme.accent}" opacity="0.34"/><path d="M42 410 Q180 308 502 396 L502 470 L42 470 Z" fill="${theme.accent}" opacity="0.65"/>`,
    rect(536, 38, 542, 194, theme.surface, theme.border, 22),
    `<circle cx="936" cy="124" r="70" fill="${theme.accent}" opacity="0.2"/>`,
    label(570, 92, "STORY CHAPTER 01", theme.muted, 11, 700),
    line(570, 126, 850, 126, theme.text, 12, 'stroke-linecap="round" opacity="0.75"'),
    line(570, 158, 790, 158, theme.muted, 7, 'stroke-linecap="round" opacity="0.5"'),
    ...[0, 1].map((i) => `${rect(536 + i * 276, 258, 260, 212, i === 1 ? theme.accent : theme.surfaceAlt, theme.border, 22, i === 1 ? 'opacity="0.82"' : "")}${label(562 + i * 276, 426, i === 0 ? "PRODUCT MOMENT" : "COMMUNITY", i === 1 ? theme.surface : theme.muted, 11, 700)}`)
  ].flat().join("");
}

function renderPortfolio(theme) {
  const cards = [
    [28, 30, 500, 252], [554, 30, 538, 160], [554, 216, 258, 276], [838, 216, 254, 276], [28, 308, 500, 184]
  ];
  return [
    ...cards.map((card, i) => {
      const [x, y, width, height] = card;
      return `${rect(x, y, width, height, i === 0 ? theme.accent : theme.surfaceAlt, theme.border, 18, i === 0 ? 'opacity="0.9"' : "")}${label(x + 22, y + height - 26, `PROJECT ${String(i + 1).padStart(2, "0")}`, i === 0 ? theme.surface : theme.muted, 11, 700)}${i === 1 ? `<circle cx="${x + width - 88}" cy="${y + 76}" r="45" fill="${theme.accent}" opacity="0.3"/>` : ""}`;
    }),
    label(52, 82, "Selected work", theme.surface, 32, 760),
    label(52, 116, "A disciplined visual archive.", theme.surface, 14, 500)
  ].join("");
}

function renderCommerce(theme) {
  return [
    label(34, 58, "A focused collection", theme.text, 31, 750),
    label(34, 92, "Product-first hierarchy with confident metadata.", theme.muted, 14, 450),
    pill(912, 44, 164, "VIEW COLLECTION", theme),
    ...[0, 1, 2].map((i) => {
      const x = 34 + i * 358;
      return [
        rect(x, 138, 330, 286, theme.surfaceAlt, theme.border, 18),
        `<ellipse cx="${x + 165}" cy="270" rx="92" ry="72" fill="${i === 1 ? theme.accent : theme.border}" opacity="${i === 1 ? 0.7 : 0.7}"/>`,
        label(x + 4, 458, ["Essential One", "Studio Edition", "Core Object"][i], theme.text, 15, 650),
        label(x + 326, 458, ["$120", "$240", "$160"][i], theme.muted, 13, 650, "end")
      ].join("");
    })
  ].flat().join("");
}

function renderResearch(theme) {
  return [
    rect(24, 24, 690, 468, theme.surface, theme.border, 12),
    label(52, 66, "Research note / 024", theme.accent, 11, 700),
    label(52, 110, "Benchmarking agent reliability", theme.text, 27, 750),
    ...[0, 1, 2, 3].map((i) => line(54, 148 + i * 27, 520 + (i % 2) * 86, 148 + i * 27, theme.muted, 7, 'stroke-linecap="round" opacity="0.42"')),
    rect(52, 282, 622, 170, theme.surfaceAlt, theme.border, 10),
    line(84, 416, 638, 416, theme.border),
    `<path d="M84 390 C150 372 190 402 252 342 S380 358 444 290 S560 322 638 236" fill="none" stroke="${theme.accent}" stroke-width="5"/>`,
    rect(744, 24, 352, 226, "#0B1220", theme.border, 12),
    label(768, 58, "EXPERIMENT", theme.accent, 11, 700),
    ...[0, 1, 2, 3].map((i) => line(768, 94 + i * 32, 930 + i * 24, 94 + i * 32, i === 0 ? theme.accent : "#475569", 7, 'stroke-linecap="round"')),
    rect(744, 276, 352, 216, theme.surfaceAlt, theme.border, 12),
    label(768, 312, "RESULT", theme.muted, 11, 700),
    label(768, 370, "94.8%", theme.text, 40, 780),
    label(768, 404, "evaluation pass rate", theme.muted, 13, 500)
  ].flat().join("");
}

function renderFintech(theme) {
  return [
    ...[0, 1, 2].map((i) => metricCard(24 + i * 360, 24, 336, ["Net position", "Risk score", "Open alerts"][i], ["$1.82M", "LOW", "04"][i], theme)),
    rect(24, 142, 688, 342, theme.surfaceAlt, theme.border, 14),
    label(50, 176, "PORTFOLIO TREND", theme.muted, 11, 700),
    `<path d="M54 408 C120 390 168 420 234 350 S356 374 416 298 S528 334 664 220" fill="none" stroke="${theme.accent}" stroke-width="6"/>`,
    `<path d="M54 408 C120 390 168 420 234 350 S356 374 416 298 S528 334 664 220 L664 446 L54 446 Z" fill="${theme.accent}" opacity="0.12"/>`,
    rect(740, 142, 356, 342, theme.surface, theme.border, 14),
    label(766, 176, "RECENT ACTIVITY", theme.muted, 11, 700),
    ...[0, 1, 2, 3, 4].map((i) => `${line(758, 206 + i * 52, 1076, 206 + i * 52, theme.border)}<circle cx="778" cy="${232 + i * 52}" r="7" fill="${i === 0 ? theme.accent : theme.border}"/>${line(802, 232 + i * 52, 918, 232 + i * 52, theme.muted, 7, 'stroke-linecap="round" opacity="0.5"')}${label(1052, 237 + i * 52, i % 2 ? "+2.4%" : "$240", theme.text, 12, 650, "end")}`)
  ].flat().join("");
}

function renderLearning(theme) {
  return [
    rect(24, 24, 248, 468, theme.surfaceAlt, theme.border, 16),
    label(48, 62, "LEARNING", theme.text, 12, 750),
    `<circle cx="148" cy="164" r="66" fill="none" stroke="${theme.border}" stroke-width="16"/><path d="M148 98 A66 66 0 1 1 88 192" fill="none" stroke="${theme.accent}" stroke-width="16" stroke-linecap="round"/>`,
    label(148, 171, "72%", theme.text, 24, 750, "middle"),
    ...[0, 1, 2].map((i) => `${rect(46, 274 + i * 58, 204, 44, i === 0 ? theme.surface : "transparent", i === 0 ? theme.border : "transparent", 10)}${label(66, 302 + i * 58, ["Current path", "Saved lessons", "Achievements"][i], i === 0 ? theme.text : theme.muted, 12, i === 0 ? 650 : 500)}`),
    label(310, 66, "Continue learning", theme.text, 28, 750),
    label(310, 98, "Small steps, visible progress, friendly structure.", theme.muted, 13, 450),
    ...[0, 1].map((i) => `${rect(310 + i * 386, 138, 360, 166, i === 0 ? theme.accent : theme.surfaceAlt, theme.border, 16, i === 0 ? 'opacity="0.9"' : "")}${label(334 + i * 386, 176, i === 0 ? "UP NEXT" : "RECOMMENDED", i === 0 ? theme.surface : theme.muted, 10, 700)}${line(334 + i * 386, 222, 548 + i * 386, 222, i === 0 ? theme.surface : theme.text, 10, 'stroke-linecap="round" opacity="0.72"')}${line(334 + i * 386, 254, 606 + i * 386, 254, i === 0 ? theme.surface : theme.muted, 7, 'stroke-linecap="round" opacity="0.48"')}`),
    ...[0, 1, 2].map((i) => `${rect(310, 334 + i * 52, 746, 40, theme.surface, theme.border, 10)}<circle cx="334" cy="${354 + i * 52}" r="7" fill="${i === 0 ? theme.accent : theme.border}"/>${line(356, 354 + i * 52, 610 + i * 30, 354 + i * 52, theme.muted, 7, 'stroke-linecap="round" opacity="0.5"')}`)
  ].flat().join("");
}

function readableBlockName(value, fallback) {
  const normalized = String(value || fallback || "content")
    .trim()
    .replaceAll(/[-_]+/gu, " ");
  return normalized.toUpperCase();
}

function blockForRole(previewSpec, role, index, fallback) {
  const contentBlocks = Array.isArray(previewSpec?.contentBlocks)
    ? previewSpec.contentBlocks.filter((block) => typeof block === "string" && block.trim())
    : [];
  const hierarchy = previewSpec?.hierarchy && typeof previewSpec.hierarchy === "object"
    ? previewSpec.hierarchy
    : {};
  const roleValue = role === "primary"
    ? hierarchy.primary
    : Array.isArray(hierarchy[role])
      ? hierarchy[role][index]
      : undefined;

  if (typeof roleValue === "string" && contentBlocks.includes(roleValue)) return roleValue;
  const fallbackIndex = role === "primary" ? 0 : role === "secondary" ? index + 1 : contentBlocks.length - 1;
  return contentBlocks[fallbackIndex] || fallback;
}

function blockGroup(block, content, extra = "") {
  return `<g data-block="${escapeXml(block)}" ${extra}>${content}</g>`;
}

const SEMANTIC_LAYOUT_PROFILES = Object.freeze({
  "app-shell": { family: "rail", modeOffset: 0 },
  "catalog-grid": { family: "mosaic", modeOffset: 0 },
  "centered-hero": { family: "hero", modeOffset: 0 },
  "dashboard-grid": { family: "mosaic", modeOffset: 1 },
  "developer-workbench": { family: "split", modeOffset: 0 },
  "editorial-stack": { family: "rail", modeOffset: 1 },
  "evidence-grid": { family: "split", modeOffset: 2 },
  "finance-dashboard": { family: "mosaic", modeOffset: 2 },
  "learning-workspace": { family: "rail", modeOffset: 2 },
  "narrative-landing": { family: "hero", modeOffset: 1 },
  "portfolio-grid": { family: "mosaic", modeOffset: 2 },
  "research-workbench": { family: "split", modeOffset: 1 }
});

const SEMANTIC_SLOT_TEMPLATES = Object.freeze({
  hero: Object.freeze([
    {
      primary: [[24, 24, 650, 180]],
      secondary: [[24, 224, 310, 248], [354, 224, 320, 248]],
      supporting: [[694, 24, 402, 448]]
    },
    {
      primary: [[24, 24, 1072, 180]],
      secondary: [[24, 224, 430, 248], [474, 224, 300, 248]],
      supporting: [[794, 224, 302, 248]]
    },
    {
      primary: [[24, 24, 450, 448]],
      secondary: [[494, 24, 602, 190], [494, 234, 286, 238]],
      supporting: [[800, 234, 296, 238]]
    }
  ]),
  rail: Object.freeze([
    {
      primary: [[250, 24, 846, 250]],
      secondary: [[24, 24, 206, 448], [250, 294, 520, 178]],
      supporting: [[790, 294, 306, 178]]
    },
    {
      primary: [[24, 24, 760, 260]],
      secondary: [[804, 24, 292, 448], [24, 304, 360, 168]],
      supporting: [[404, 304, 380, 168]]
    },
    {
      primary: [[270, 24, 826, 280]],
      secondary: [[24, 24, 226, 210], [24, 254, 226, 218]],
      supporting: [[270, 324, 826, 148]]
    }
  ]),
  mosaic: Object.freeze([
    {
      primary: [[24, 24, 640, 300]],
      secondary: [[684, 24, 412, 140], [684, 184, 412, 140]],
      supporting: [[24, 344, 1072, 128]]
    },
    {
      primary: [[24, 172, 680, 300]],
      secondary: [[24, 24, 330, 128], [374, 24, 330, 128]],
      supporting: [[724, 24, 372, 448]]
    },
    {
      primary: [[372, 24, 724, 300]],
      secondary: [[24, 24, 328, 214], [24, 258, 328, 214]],
      supporting: [[372, 344, 724, 128]]
    }
  ]),
  split: Object.freeze([
    {
      primary: [[24, 24, 652, 448]],
      secondary: [[696, 24, 400, 160], [696, 204, 400, 160]],
      supporting: [[696, 384, 400, 88]]
    },
    {
      primary: [[424, 24, 672, 448]],
      secondary: [[24, 24, 380, 190], [24, 234, 380, 150]],
      supporting: [[24, 404, 380, 68]]
    },
    {
      primary: [[24, 24, 1072, 228]],
      secondary: [[24, 272, 330, 200], [374, 272, 330, 200]],
      supporting: [[724, 272, 372, 200]]
    }
  ])
});

const SEMANTIC_MODULE_RULES = Object.freeze([
  ["action", /(?:action|signup|contact|purchase|continue|next-step|reminder|sales|primary-action|membership)/u],
  ["navigation", /(?:navigation|tree|menu|path)/u],
  ["metric", /(?:metric|progress|benchmark|risk|countdown|milestone|account-summary|result|coverage)/u],
  ["code", /(?:code|technical|methodology|api|experiment)/u],
  ["media", /(?:story|human|creator|selected-work|case-study|product-discovery|product-detail|lesson-content)/u],
  ["evidence", /(?:evidence|governance|trust|proof|capability)/u],
  ["data", /(?:data|grid|queue|status|workflow|financial|practice|research)/u]
]);

function stablePatternNumber(value) {
  let hash = 2166136261;
  for (const character of String(value || "default-pattern")) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function semanticModuleKind(block, contentPattern) {
  const blockText = String(block || "").toLowerCase();
  const blockMatch = SEMANTIC_MODULE_RULES.find(([, pattern]) => pattern.test(blockText));
  if (blockMatch) return blockMatch[0];
  const patternText = String(contentPattern || "").toLowerCase();
  return SEMANTIC_MODULE_RULES.find(([, pattern]) => pattern.test(patternText))?.[0] || "text";
}

function semanticHierarchy(previewSpec) {
  const contentBlocks = Array.isArray(previewSpec?.contentBlocks)
    ? previewSpec.contentBlocks.filter((block) => typeof block === "string" && block.trim())
    : [];
  const contentBlockSet = new Set(contentBlocks);
  const hierarchy = previewSpec?.hierarchy && typeof previewSpec.hierarchy === "object"
    ? previewSpec.hierarchy
    : {};
  const used = new Set();
  const take = (value) => {
    if (!contentBlockSet.has(value) || used.has(value)) return undefined;
    used.add(value);
    return value;
  };

  const primary = take(hierarchy.primary) || take(contentBlocks[0]);
  const secondary = (Array.isArray(hierarchy.secondary) ? hierarchy.secondary : [])
    .map(take)
    .filter(Boolean);
  const supporting = (Array.isArray(hierarchy.supporting) ? hierarchy.supporting : [])
    .map(take)
    .filter(Boolean);
  for (const block of contentBlocks) {
    const remaining = take(block);
    if (remaining) supporting.push(remaining);
  }
  return { primary: primary ? [primary] : [], secondary, supporting };
}

function expandSemanticSlots(slots, count) {
  if (count <= slots.length) return slots.slice(0, count);
  if (slots.length === 0) return [];
  const stableSlots = slots.slice(0, -1);
  const [x, y, width, height] = slots.at(-1);
  const splitCount = count - stableSlots.length;
  const gap = 12;
  const splitHorizontally = width >= height;
  const splitSize = splitHorizontally
    ? (width - gap * (splitCount - 1)) / splitCount
    : (height - gap * (splitCount - 1)) / splitCount;
  const splitSlots = Array.from({ length: splitCount }, (_, index) => (
    splitHorizontally
      ? [x + index * (splitSize + gap), y, splitSize, height]
      : [x, y + index * (splitSize + gap), width, splitSize]
  ));
  return [...stableSlots, ...splitSlots];
}

function semanticModuleVisual(kind, width, height, theme, variant) {
  const compact = height < 118 || width < 220;
  const left = 18;
  const top = compact ? 42 : 56;
  const innerWidth = Math.max(44, width - 36);
  const innerHeight = Math.max(24, height - top - 18);

  if (kind === "action") {
    const buttonWidth = Math.min(innerWidth, compact ? 150 : 210);
    const buttonY = top + Math.max(0, (innerHeight - 44) / 2);
    return [
      rect(left, buttonY, buttonWidth, 44, theme.accent, theme.accent, 22, 'opacity="0.86"'),
      label(left + buttonWidth / 2, buttonY + 28, "CONTINUE", theme.surface, 10, 750, "middle"),
      line(left + buttonWidth + 14, buttonY + 22, Math.min(width - 18, left + buttonWidth + 52), buttonY + 22, theme.accent, 3, 'stroke-linecap="round"')
    ].join("");
  }
  if (kind === "navigation") {
    const rowCount = compact ? 2 : Math.min(5, Math.max(3, Math.floor(innerHeight / 34)));
    return Array.from({ length: rowCount }, (_, index) => {
      const rowY = top + index * Math.min(34, innerHeight / rowCount);
      return `<circle cx="${left + 7}" cy="${rowY}" r="5" fill="${index === variant % rowCount ? theme.accent : theme.border}"/>${line(left + 24, rowY, left + Math.min(innerWidth, 120 + index * 18), rowY, theme.muted, 6, 'stroke-linecap="round" opacity="0.58"')}`;
    }).join("");
  }
  if (kind === "metric") {
    const centerX = width / 2;
    const centerY = top + innerHeight / 2;
    const radius = Math.max(16, Math.min(48, innerHeight / 2 - 4, innerWidth / 5));
    return [
      `<circle cx="${centerX}" cy="${centerY}" r="${radius}" fill="none" stroke="${theme.border}" stroke-width="${compact ? 8 : 13}"/>`,
      `<path d="M${centerX} ${centerY - radius} A${radius} ${radius} 0 1 1 ${centerX - radius * 0.7} ${centerY + radius * 0.7}" fill="none" stroke="${theme.accent}" stroke-width="${compact ? 8 : 13}" stroke-linecap="round"/>`,
      label(centerX, centerY + 5, `${64 + variant * 8}%`, theme.text, compact ? 12 : 18, 760, "middle")
    ].join("");
  }
  if (kind === "code") {
    const panelHeight = Math.max(28, innerHeight);
    return [
      rect(left, top, innerWidth, panelHeight, "#0B0D10", theme.border, 10),
      ...Array.from({ length: compact ? 2 : 4 }, (_, index) => line(
        left + 16,
        top + 18 + index * Math.max(14, (panelHeight - 28) / (compact ? 2 : 4)),
        left + Math.min(innerWidth - 12, 98 + index * 24 + variant * 12),
        top + 18 + index * Math.max(14, (panelHeight - 28) / (compact ? 2 : 4)),
        index === variant % (compact ? 2 : 4) ? theme.accent : theme.muted,
        5,
        'stroke-linecap="round" opacity="0.72"'
      ))
    ].flat().join("");
  }
  if (kind === "media") {
    const imageWidth = compact ? innerWidth * 0.42 : innerWidth * 0.58;
    return [
      rect(left, top, imageWidth, innerHeight, theme.surfaceAlt, theme.border, 12),
      `<circle cx="${left + imageWidth * (0.38 + variant * 0.08)}" cy="${top + innerHeight * 0.42}" r="${Math.max(12, Math.min(36, innerHeight * 0.22))}" fill="${theme.accent}" opacity="0.42"/>`,
      `<path d="M${left} ${top + innerHeight * 0.82} Q${left + imageWidth * 0.45} ${top + innerHeight * 0.48} ${left + imageWidth} ${top + innerHeight * 0.76} L${left + imageWidth} ${top + innerHeight} L${left} ${top + innerHeight} Z" fill="${theme.accent}" opacity="0.56"/>`,
      ...[0, 1, 2].map((index) => line(
        left + imageWidth + 16,
        top + 18 + index * 24,
        Math.min(width - 16, left + imageWidth + 82 + index * 18),
        top + 18 + index * 24,
        index === 0 ? theme.text : theme.muted,
        index === 0 ? 7 : 5,
        'stroke-linecap="round" opacity="0.58"'
      ))
    ].flat().join("");
  }
  if (kind === "evidence") {
    const rowCount = compact ? 2 : 3;
    return Array.from({ length: rowCount }, (_, index) => {
      const rowY = top + index * Math.max(28, innerHeight / rowCount);
      return `${rect(left, rowY - 10, 20, 20, index === variant % rowCount ? theme.accent : theme.surfaceAlt, theme.border, 6)}${label(left + 10, rowY + 4, "✓", index === variant % rowCount ? theme.surface : theme.muted, 11, 750, "middle")}${line(left + 34, rowY, Math.min(width - 18, left + innerWidth * (0.7 + index * 0.08)), rowY, theme.muted, 6, 'stroke-linecap="round" opacity="0.52"')}`;
    }).join("");
  }
  if (kind === "data") {
    const barCount = compact ? 4 : 7;
    const barGap = 8;
    const barWidth = Math.max(8, (innerWidth - barGap * (barCount - 1)) / barCount);
    return Array.from({ length: barCount }, (_, index) => {
      const barHeight = Math.max(12, innerHeight * (0.28 + ((index + variant) % 5) * 0.13));
      return rect(
        left + index * (barWidth + barGap),
        top + innerHeight - barHeight,
        barWidth,
        barHeight,
        index === (variant + barCount - 1) % barCount ? theme.accent : theme.border,
        "none",
        5
      );
    }).join("");
  }

  const rowCount = compact ? 2 : Math.min(5, Math.max(3, Math.floor(innerHeight / 28)));
  return Array.from({ length: rowCount }, (_, index) => line(
    left,
    top + index * Math.max(20, innerHeight / rowCount),
    left + innerWidth * (0.58 + ((index + variant) % 3) * 0.13),
    top + index * Math.max(20, innerHeight / rowCount),
    index === 0 ? theme.text : theme.muted,
    index === 0 ? 8 : 6,
    'stroke-linecap="round" opacity="0.48"'
  )).join("");
}

function renderSemanticModule({ block, role, box, theme, contentPattern, variant }) {
  const [x, y, width, height] = box;
  const moduleKind = semanticModuleKind(block, contentPattern);
  const fill = role === "primary" ? theme.surfaceAlt : theme.surface;
  const motif = variant % 3 === 0
    ? `<circle cx="${width - 22}" cy="22" r="7" fill="${theme.accent}" opacity="0.72"/>`
    : variant % 3 === 1
      ? `<path d="M${width - 42} 28 L${width - 30} 12 L${width - 18} 28 Z" fill="${theme.accent}" opacity="0.72"/>`
      : `${line(width - 48, 15, width - 18, 15, theme.accent, 4, 'stroke-linecap="round"')}${line(width - 40, 27, width - 18, 27, theme.accent, 4, 'stroke-linecap="round"')}`;

  return `<g data-block="${escapeXml(block)}" data-role="${role}" data-module-kind="${moduleKind}" transform="translate(${x} ${y})">${rect(0, 0, width, height, fill, theme.border, role === "primary" ? 22 : 16)}${label(18, 28, readableBlockName(block), role === "primary" ? theme.text : theme.muted, 10, 720)}${motif}${semanticModuleVisual(moduleKind, width, height, theme, variant)}</g>`;
}

function renderSemanticDirection(theme, previewSpec) {
  const profile = SEMANTIC_LAYOUT_PROFILES[previewSpec.layoutArchetype];
  if (!profile) throw new Error(`Unknown semantic layout archetype: ${previewSpec.layoutArchetype}`);
  const patternNumber = stablePatternNumber(previewSpec.contentPattern);
  const patternVariant = patternNumber % 3;
  const layoutMode = (patternVariant + profile.modeOffset) % 3;
  const template = SEMANTIC_SLOT_TEMPLATES[profile.family][layoutMode];
  const hierarchy = semanticHierarchy(previewSpec);
  const assignments = [];

  for (const role of ["primary", "secondary", "supporting"]) {
    const blocks = hierarchy[role];
    const slots = expandSemanticSlots(template[role], blocks.length);
    blocks.forEach((block, index) => assignments.push({
      block,
      role,
      box: slots[index],
      variant: (patternVariant + index + (role === "primary" ? 0 : role === "secondary" ? 1 : 2)) % 3
    }));
  }

  return `<g data-layout-signature="semantic-${escapeXml(previewSpec.layoutArchetype)}" data-pattern-variant="${patternVariant}">${assignments.map((assignment) => renderSemanticModule({
    ...assignment,
    theme,
    contentPattern: previewSpec.contentPattern
  })).join("")}</g>`;
}

function renderCommunityCountdown(theme, previewSpec) {
  const primary = blockForRole(previewSpec, "primary", 0, "campaign-message");
  const countdown = blockForRole(previewSpec, "secondary", 0, "countdown");
  const proof = blockForRole(previewSpec, "secondary", 1, "community-proof");
  const action = blockForRole(previewSpec, "supporting", 0, "reminder-action");

  return [
    `<g data-layout-signature="countdown-rail">`,
    blockGroup(primary, [
      pill(34, 30, 152, "LIVE CAMPAIGN", theme),
      label(34, 98, "The next chapter", theme.text, 34, 780),
      label(34, 138, "starts together.", theme.accent, 34, 780),
      label(34, 178, readableBlockName(primary), theme.muted, 11, 700)
    ].join(""), 'data-role="primary"'),
    blockGroup(countdown, [
      rect(34, 220, 682, 244, theme.surfaceAlt, theme.border, 20),
      label(62, 258, readableBlockName(countdown), theme.muted, 11, 700),
      label(375, 360, "08 : 24 : 16", theme.text, 54, 780, "middle"),
      label(375, 398, "HOURS        MINUTES        SECONDS", theme.muted, 10, 650, "middle"),
      line(62, 430, 688, 430, theme.accent, 6, 'stroke-linecap="round" opacity="0.72"')
    ].join(""), 'data-role="secondary"'),
    blockGroup(proof, [
      rect(744, 30, 342, 286, theme.surface, theme.border, 20),
      label(772, 70, readableBlockName(proof), theme.muted, 11, 700),
      ...[0, 1, 2, 3, 4].map((i) => `<circle cx="${794 + i * 42}" cy="130" r="22" fill="${i === 4 ? theme.accent : theme.surfaceAlt}" stroke="${theme.border}"/>`),
      label(772, 194, "12,480 people are waiting", theme.text, 18, 700),
      label(772, 226, "Milestones unlock as the community grows.", theme.muted, 12, 450),
      ...[0, 1, 2].map((i) => `${line(772, 264 + i * 22, 1018, 264 + i * 22, theme.border, 8, 'stroke-linecap="round"')}`)
    ].flat().join(""), 'data-role="secondary"'),
    blockGroup(action, [
      rect(744, 340, 342, 124, theme.accent, theme.accent, 20, 'opacity="0.9"'),
      label(772, 378, readableBlockName(action), theme.surface, 10, 750),
      label(772, 418, "REMIND ME + SHARE", theme.surface, 17, 760),
      `<path d="M1008 404 L1044 404 M1030 390 L1044 404 L1030 418" fill="none" stroke="${theme.surface}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`
    ].join(""), 'data-role="supporting"'),
    `</g>`
  ].flat().join("");
}

function renderWellnessDailyRitual(theme, previewSpec) {
  const primary = blockForRole(previewSpec, "primary", 0, "daily-ritual");
  const humanMoment = blockForRole(previewSpec, "secondary", 0, "human-moment");
  const progress = blockForRole(previewSpec, "secondary", 1, "progress");
  const action = blockForRole(previewSpec, "supporting", 0, "membership-action");

  return [
    `<g data-layout-signature="ritual-journal">`,
    blockGroup(primary, [
      rect(28, 28, 1064, 126, theme.surfaceAlt, theme.border, 28),
      `<circle cx="82" cy="90" r="28" fill="${theme.accent}" opacity="0.24"/>`,
      `<path d="M70 90 C76 77 88 77 94 90 C88 103 76 103 70 90 Z" fill="${theme.accent}"/>`,
      label(126, 72, "Your gentle daily ritual", theme.text, 24, 740),
      label(126, 104, readableBlockName(primary), theme.muted, 11, 700),
      label(1048, 88, "DAY 06", theme.accent, 13, 750, "end")
    ].join(""), 'data-role="primary"'),
    blockGroup(humanMoment, [
      rect(28, 182, 500, 282, theme.surface, theme.border, 28),
      `<circle cx="126" cy="274" r="54" fill="${theme.accent}" opacity="0.24"/>`,
      `<circle cx="126" cy="256" r="17" fill="${theme.accent}" opacity="0.76"/><path d="M82 326 Q126 282 170 326" fill="${theme.accent}" opacity="0.58"/>`,
      label(206, 230, readableBlockName(humanMoment), theme.muted, 11, 700),
      label(206, 272, "A quiet pause", theme.text, 23, 740),
      label(206, 306, "made space for what matters.", theme.text, 18, 600),
      line(206, 352, 450, 352, theme.border, 7, 'stroke-linecap="round"'),
      line(206, 382, 408, 382, theme.border, 7, 'stroke-linecap="round"')
    ].join(""), 'data-role="secondary"'),
    blockGroup(progress, [
      rect(558, 182, 258, 282, theme.surfaceAlt, theme.border, 28),
      label(586, 222, readableBlockName(progress), theme.muted, 11, 700),
      `<circle cx="687" cy="324" r="68" fill="none" stroke="${theme.border}" stroke-width="16"/>`,
      `<path d="M687 256 A68 68 0 1 1 625 352" fill="none" stroke="${theme.accent}" stroke-width="16" stroke-linecap="round"/>`,
      label(687, 334, "72%", theme.text, 26, 760, "middle"),
      label(687, 422, "THIS WEEK", theme.muted, 10, 700, "middle")
    ].join(""), 'data-role="secondary"'),
    blockGroup(action, [
      rect(846, 182, 246, 282, theme.surface, theme.border, 28),
      label(874, 222, readableBlockName(action), theme.muted, 10, 700),
      label(874, 274, "Continue at", theme.text, 22, 730),
      label(874, 306, "your own pace.", theme.text, 22, 730),
      label(874, 350, "No streak pressure.", theme.muted, 12, 500),
      rect(874, 386, 186, 48, theme.accent, theme.accent, 24, 'opacity="0.86"'),
      label(967, 416, "CONTINUE", theme.surface, 11, 750, "middle")
    ].join(""), 'data-role="supporting"'),
    `</g>`
  ].flat().join("");
}

const VARIANT_RENDERERS = {
  developer: renderDeveloper,
  "app-shell": renderAppShell,
  enterprise: renderEnterprise,
  dashboard: renderDashboard,
  docs: renderDocs,
  launch: renderLaunch,
  brand: renderBrand,
  portfolio: renderPortfolio,
  commerce: renderCommerce,
  research: renderResearch,
  fintech: renderFintech,
  learning: renderLearning
};

const CONTENT_PATTERN_RENDERERS = {
  "community-countdown-campaign": renderCommunityCountdown,
  "wellness-daily-ritual": renderWellnessDailyRitual
};

const LAYOUT_ARCHETYPE_RENDERERS = Object.freeze(Object.fromEntries(
  Object.keys(SEMANTIC_LAYOUT_PROFILES).map((layoutArchetype) => [
    layoutArchetype,
    renderSemanticDirection
  ])
));

function resolveDirectionRenderer(previewSpec) {
  const ownRenderer = (registry, key) => (
    typeof key === "string" && Object.hasOwn(registry, key)
      ? registry[key]
      : undefined
  );
  return ownRenderer(CONTENT_PATTERN_RENDERERS, previewSpec.contentPattern)
    || ownRenderer(LAYOUT_ARCHETYPE_RENDERERS, previewSpec.layoutArchetype)
    || ownRenderer(VARIANT_RENDERERS, previewSpec.legacyVariant);
}

function validateDirectionThemeTokens(theme) {
  const tokens = theme?.tokens;
  if (!tokens || typeof tokens !== "object" || Array.isArray(tokens)) {
    throw new Error(`Theme ${theme?.id || "(unknown)"} must provide tokens.`);
  }

  const tokenNames = Object.keys(tokens).sort();
  const expectedTokenNames = [...DIRECTION_THEME_TOKEN_NAMES].sort();
  if (
    tokenNames.length !== expectedTokenNames.length
    || tokenNames.some((name, index) => name !== expectedTokenNames[index])
  ) {
    throw new Error(
      `Theme ${theme?.id || "(unknown)"} must provide exactly these tokens: `
      + `${DIRECTION_THEME_TOKEN_NAMES.join(", ")}.`
    );
  }

  for (const tokenName of DIRECTION_THEME_TOKEN_NAMES) {
    if (!DIRECTION_THEME_COLOR_PATTERN.test(tokens[tokenName])) {
      throw new Error(
        `Theme ${theme?.id || "(unknown)"} has an invalid ${tokenName} color token.`
      );
    }
  }
  return tokens;
}

export function expandVisualReferences(references = [], options = {}) {
  return references.map((reference) => expandProviderReference(reference, options));
}

export function renderStylePreviewSvg({ style, visual, title, subtitle } = {}) {
  if (!style || !visual) throw new Error("Style and visual configuration are required.");
  const theme = visual.theme;
  const renderer = VARIANT_RENDERERS[visual.variant];
  if (!renderer) throw new Error(`Unknown preview variant: ${visual.variant}`);

  const displayTitle = truncate(title || style.name, 54);
  const displaySubtitle = truncate(subtitle || style.firstViewport, 112);
  const content = renderer(theme);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="720" viewBox="0 0 1200 720" role="img" aria-labelledby="title description">
  <title id="title">${escapeXml(displayTitle)} draft style preview</title>
  <desc id="description">${escapeXml(displaySubtitle)}</desc>
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${theme.accent}"/></marker>
    <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M 24 0 L 0 0 0 24" fill="none" stroke="${theme.border}" stroke-width="1" opacity="0.18"/></pattern>
  </defs>
  <rect width="1200" height="720" fill="${theme.canvas}"/>
  <rect width="1200" height="720" fill="url(#grid)"/>
  ${label(42, 45, "AI UI STYLE DIRECTION", theme.muted, 11, 750)}
  ${label(1158, 45, "DRAFT / WIREFRAME", theme.accent, 11, 750, "end")}
  ${label(42, 92, displayTitle, theme.text, 30, 780)}
  ${label(42, 124, displaySubtitle, theme.muted, 13, 450)}
  <g transform="translate(40 160)">
    ${rect(0, 0, 1120, 520, theme.surface, theme.border, 20)}
    ${content}
  </g>
</svg>\n`;
}

export function renderDirectionPreviewSvg({ direction, theme, previewSpec, title, subtitle } = {}) {
  if (!direction || !theme || !previewSpec) {
    throw new Error("Direction, theme, and preview specification are required.");
  }
  if (previewSpec.directionId && previewSpec.directionId !== direction.id) {
    throw new Error(
      `Preview specification ${previewSpec.directionId} does not match direction ${direction.id}.`
    );
  }

  const tokens = validateDirectionThemeTokens(theme);
  const renderer = resolveDirectionRenderer(previewSpec);
  if (!renderer) {
    throw new Error(
      `Unknown direction preview renderer: contentPattern=${previewSpec.contentPattern || "(none)"}, `
      + `layoutArchetype=${previewSpec.layoutArchetype || "(none)"}, `
      + `legacyVariant=${previewSpec.legacyVariant || "(none)"}.`
    );
  }

  const displayTitle = truncate(title || direction.name, 54);
  const displaySubtitle = truncate(subtitle || direction.firstViewport, 112);
  const content = renderer(tokens, previewSpec, direction);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="720" viewBox="0 0 1200 720" role="img" aria-labelledby="title description" data-direction-id="${escapeXml(direction.id)}" data-theme-id="${escapeXml(theme.id)}" data-content-pattern="${escapeXml(previewSpec.contentPattern || "")}" data-layout-archetype="${escapeXml(previewSpec.layoutArchetype || "")}">
  <title id="title">${escapeXml(displayTitle)} draft direction preview</title>
  <desc id="description">${escapeXml(displaySubtitle)}</desc>
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${tokens.accent}"/></marker>
    <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M 24 0 L 0 0 0 24" fill="none" stroke="${tokens.border}" stroke-width="1" opacity="0.18"/></pattern>
  </defs>
  <rect width="1200" height="720" fill="${tokens.canvas}"/>
  <rect width="1200" height="720" fill="url(#grid)"/>
  ${label(42, 45, "AI UI STYLE DIRECTION", tokens.muted, 11, 750)}
  ${label(1158, 45, "DRAFT / WIREFRAME", tokens.accent, 11, 750, "end")}
  ${label(42, 92, displayTitle, tokens.text, 30, 780)}
  ${label(42, 124, displaySubtitle, tokens.muted, 13, 450)}
  <g transform="translate(40 160)">
    ${rect(0, 0, 1120, 520, tokens.surface, tokens.border, 20)}
    ${content}
  </g>
</svg>\n`;
}

export function renderProjectDraftSvg({ style, visual, brief } = {}) {
  return renderStylePreviewSvg({
    style,
    visual,
    title: truncate(brief || style.name, 54),
    subtitle: `${style.name} · project first-viewport draft`
  });
}
