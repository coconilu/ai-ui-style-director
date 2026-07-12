import { expandProviderReference } from "./provider-adapters.mjs";

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

export function renderProjectDraftSvg({ style, visual, brief } = {}) {
  return renderStylePreviewSvg({
    style,
    visual,
    title: truncate(brief || style.name, 54),
    subtitle: `${style.name} · project first-viewport draft`
  });
}
