import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { TextDecoder } from "node:util";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LEGACY_AWESOME_PROVIDER = "awesome-design-md";
const GETDESIGN_BASE_URL = "https://getdesign.md";
const DAISYUI_THEME_PATH = /^packages\/daisyui\/src\/themes\/([a-z0-9]+(?:-[a-z0-9]+)*)\.css$/u;
const DAISYUI_NORMALIZER_VERSION = 1;
const MAX_DAISYUI_THEME_BYTES = 16_384;
const DECIMAL_SOURCE = "(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?";
const OKLCH_VALUE = new RegExp(`^oklch\\((${DECIMAL_SOURCE})% (${DECIMAL_SOURCE}) (${DECIMAL_SOURCE})\\)$`, "u");
const REM_VALUE = new RegExp(`^(${DECIMAL_SOURCE})rem$`, "u");
const PX_VALUE = /^(0|[1-9][0-9]*)px$/u;
const SRGB_GAMUT_EPSILON = 1e-7;
const SRGB_GAMUT_ITERATIONS = 24;

const DAISYUI_COLOR_TOKENS = Object.freeze([
  "base-100",
  "base-200",
  "base-300",
  "base-content",
  "primary",
  "primary-content",
  "secondary",
  "secondary-content",
  "accent",
  "accent-content",
  "neutral",
  "neutral-content",
  "info",
  "info-content",
  "success",
  "success-content",
  "warning",
  "warning-content",
  "error",
  "error-content"
]);
const DAISYUI_COLOR_PROPERTIES = Object.freeze(DAISYUI_COLOR_TOKENS.map((token) => `--color-${token}`));
const DAISYUI_GEOMETRY_PROPERTIES = Object.freeze([
  "--radius-selector",
  "--radius-field",
  "--radius-box",
  "--size-selector",
  "--size-field",
  "--border",
  "--depth",
  "--noise"
]);
const DAISYUI_REQUIRED_PROPERTIES = new Set([
  "color-scheme",
  ...DAISYUI_COLOR_PROPERTIES,
  ...DAISYUI_GEOMETRY_PROPERTIES
]);
let cachedProviderContext;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function normalizeTextForHash(value) {
  return value.replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n");
}

function hashNormalizedText(value) {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function isSafeRelativePath(path) {
  return (
    typeof path === "string" &&
    path.length > 0 &&
    !path.startsWith("/") &&
    !path.includes("\\") &&
    path.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
  );
}

function safeProviderSourcePath(providerDir, path) {
  if (!isSafeRelativePath(path)) throw new Error(`Unsafe provider style source path: ${path}`);
  const root = resolve(providerDir);
  const target = resolve(root, ...path.split("/"));
  if (target === root || !target.startsWith(`${root}${sep}`)) {
    throw new Error(`Provider style source escaped its cache root: ${path}`);
  }
  return target;
}

function stripCssComments(value) {
  let output = "";
  let cursor = 0;
  while (cursor < value.length) {
    const start = value.indexOf("/*", cursor);
    const strayEnd = value.indexOf("*/", cursor);
    if (strayEnd !== -1 && (start === -1 || strayEnd < start)) {
      throw new Error("Invalid daisyUI theme CSS: unexpected comment terminator.");
    }
    if (start === -1) {
      output += value.slice(cursor);
      break;
    }
    output += value.slice(cursor, start);
    const end = value.indexOf("*/", start + 2);
    if (end === -1) throw new Error("Invalid daisyUI theme CSS: unterminated comment.");
    cursor = end + 2;
  }
  return output;
}

function finiteNumber(value, label, { minimum, maximum } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Invalid daisyUI theme CSS: ${label} must be finite.`);
  if (minimum !== undefined && number < minimum) {
    throw new Error(`Invalid daisyUI theme CSS: ${label} must be at least ${minimum}.`);
  }
  if (maximum !== undefined && number > maximum) {
    throw new Error(`Invalid daisyUI theme CSS: ${label} must be at most ${maximum}.`);
  }
  return Object.is(number, -0) ? 0 : number;
}

function oklchToLinearSrgb(lightnessPercent, chroma, hueDegrees) {
  const lightness = lightnessPercent / 100;
  const hueRadians = hueDegrees * Math.PI / 180;
  const a = chroma * Math.cos(hueRadians);
  const b = chroma * Math.sin(hueRadians);
  const lRoot = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const mRoot = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const sRoot = lightness - 0.0894841775 * a - 1.291485548 * b;
  const l = lRoot ** 3;
  const m = mRoot ** 3;
  const s = sRoot ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ];
}

function isInSrgbGamut(channels) {
  return channels.every((channel) => (
    channel >= -SRGB_GAMUT_EPSILON && channel <= 1 + SRGB_GAMUT_EPSILON
  ));
}

function srgbTransfer(channel) {
  return channel <= 0.0031308
    ? 12.92 * channel
    : 1.055 * channel ** (1 / 2.4) - 0.055;
}

function byteToHex(value) {
  return value.toString(16).padStart(2, "0").toUpperCase();
}

function oklchToSrgbHex({ lightnessPercent, chroma, hueDegrees }) {
  let mappedChroma = chroma;
  let linear = oklchToLinearSrgb(lightnessPercent, mappedChroma, hueDegrees);
  if (!isInSrgbGamut(linear)) {
    let lower = 0;
    let upper = chroma;
    for (let iteration = 0; iteration < SRGB_GAMUT_ITERATIONS; iteration += 1) {
      const candidate = (lower + upper) / 2;
      if (isInSrgbGamut(oklchToLinearSrgb(lightnessPercent, candidate, hueDegrees))) {
        lower = candidate;
      } else {
        upper = candidate;
      }
    }
    mappedChroma = lower;
    linear = oklchToLinearSrgb(lightnessPercent, mappedChroma, hueDegrees);
  }
  const bytes = linear.map((channel) => {
    const boundedLinear = Math.min(1, Math.max(0, channel));
    const encoded = Math.min(1, Math.max(0, srgbTransfer(boundedLinear)));
    return Math.round(encoded * 255);
  });
  return `#${bytes.map(byteToHex).join("")}`;
}

function mixHex(left, right, leftWeight) {
  const parse = (hex) => [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
  const leftChannels = parse(left);
  const rightChannels = parse(right);
  return `#${leftChannels.map((channel, index) => (
    byteToHex(Math.round(channel * leftWeight + rightChannels[index] * (1 - leftWeight)))
  )).join("")}`;
}

function parseOklch(value, property) {
  const match = OKLCH_VALUE.exec(value);
  if (!match) throw new Error(`Invalid daisyUI theme CSS: ${property} must be a strict oklch(L% C H) value.`);
  const lightnessPercent = finiteNumber(match[1], `${property} lightness`, { minimum: 0, maximum: 100 });
  const chroma = finiteNumber(match[2], `${property} chroma`, { minimum: 0, maximum: 0.5 });
  const hueDegrees = finiteNumber(match[3], `${property} hue`, { minimum: 0, maximum: 359.999999 });
  const oklch = { lightnessPercent, chroma, hueDegrees };
  return { oklch, hex: oklchToSrgbHex(oklch) };
}

function parseRem(value, property, { positive = false } = {}) {
  const match = REM_VALUE.exec(value);
  if (!match) throw new Error(`Invalid daisyUI theme CSS: ${property} must be a rem value.`);
  const minimum = positive ? Number.EPSILON : 0;
  return finiteNumber(match[1], property, { minimum, maximum: 4 });
}

function parsePx(value, property) {
  const match = PX_VALUE.exec(value);
  if (!match) throw new Error(`Invalid daisyUI theme CSS: ${property} must be an integer px value.`);
  return finiteNumber(match[1], property, { minimum: 0, maximum: 8 });
}

function parseFlag(value, property) {
  if (value !== "0" && value !== "1") {
    throw new Error(`Invalid daisyUI theme CSS: ${property} must be 0 or 1.`);
  }
  return Number(value);
}

function parseDaisyuiDeclarations(rawContent) {
  if (Buffer.byteLength(rawContent, "utf8") > MAX_DAISYUI_THEME_BYTES) {
    throw new Error(`Invalid daisyUI theme CSS: source exceeds ${MAX_DAISYUI_THEME_BYTES} bytes.`);
  }
  const normalized = normalizeTextForHash(rawContent);
  if (/[^\u0009\u000a\u0020-\u007e]/u.test(normalized)) {
    throw new Error("Invalid daisyUI theme CSS: only printable ASCII and whitespace are allowed.");
  }
  const withoutComments = stripCssComments(normalized);
  const lines = withoutComments.split("\n").map((line) => line.trim()).filter(Boolean);
  const declarations = new Map();
  for (const [index, line] of lines.entries()) {
    const match = /^(color-scheme|--[a-z0-9-]+)\s*:\s*([^;{}]+)\s*;$/u.exec(line);
    if (!match) throw new Error(`Invalid daisyUI theme CSS declaration on line ${index + 1}.`);
    const [, property, rawValue] = match;
    if (!DAISYUI_REQUIRED_PROPERTIES.has(property)) {
      throw new Error(`Invalid daisyUI theme CSS: unknown property ${property}.`);
    }
    if (declarations.has(property)) {
      throw new Error(`Invalid daisyUI theme CSS: duplicate property ${property}.`);
    }
    declarations.set(property, rawValue.trim());
  }
  if (declarations.size !== DAISYUI_REQUIRED_PROPERTIES.size) {
    const missing = [...DAISYUI_REQUIRED_PROPERTIES].filter((property) => !declarations.has(property));
    throw new Error(`Invalid daisyUI theme CSS: missing required properties: ${missing.join(", ")}.`);
  }
  return declarations;
}

function normalizeDesignMdStyleSource({ content }) {
  return { content: normalizeTextForHash(content), candidateTheme: null };
}

function normalizeDaisyuiThemeStyleSource({ path, content }) {
  const pathMatch = DAISYUI_THEME_PATH.exec(path);
  if (!pathMatch) throw new Error(`Invalid daisyUI theme source path: ${path}`);
  const themeId = pathMatch[1];
  const declarations = parseDaisyuiDeclarations(content);
  const colorScheme = declarations.get("color-scheme");
  if (colorScheme !== "light" && colorScheme !== "dark") {
    throw new Error("Invalid daisyUI theme CSS: color-scheme must be light or dark.");
  }
  const colors = Object.fromEntries(DAISYUI_COLOR_TOKENS.map((token) => [
    token,
    parseOklch(declarations.get(`--color-${token}`), `--color-${token}`)
  ]));
  const geometry = {
    radiusRem: {
      selector: parseRem(declarations.get("--radius-selector"), "--radius-selector"),
      field: parseRem(declarations.get("--radius-field"), "--radius-field"),
      box: parseRem(declarations.get("--radius-box"), "--radius-box")
    },
    sizeRem: {
      selector: parseRem(declarations.get("--size-selector"), "--size-selector", { positive: true }),
      field: parseRem(declarations.get("--size-field"), "--size-field", { positive: true })
    },
    borderPx: parsePx(declarations.get("--border"), "--border"),
    depth: parseFlag(declarations.get("--depth"), "--depth"),
    noise: parseFlag(declarations.get("--noise"), "--noise")
  };
  const canonicalTheme = {
    canvas: colors["base-100"].hex,
    surface: colors["base-200"].hex,
    surfaceAlt: colors["base-300"].hex,
    text: colors["base-content"].hex,
    muted: mixHex(colors["base-content"].hex, colors["base-100"].hex, 0.6),
    accent: colors.primary.hex,
    border: colors["base-300"].hex
  };
  const canonical = {
    schemaVersion: DAISYUI_NORMALIZER_VERSION,
    adapter: "daisyui-theme-css",
    sourceType: "theme-css",
    themeId,
    colorScheme,
    colors,
    geometry,
    canonicalTheme
  };
  return {
    content: `${JSON.stringify(canonical, null, 2)}\n`,
    candidateTheme: canonicalTheme
  };
}

function encodePath(path) {
  return path.split("/").map((part) => encodeURIComponent(part)).join("/");
}

export function pinnedProviderSourceUrl({ repo, revision, path } = {}) {
  if (typeof repo !== "string" || !/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/iu.test(repo)) return null;
  if (!/^[0-9a-f]{40}$/u.test(revision || "")) return null;
  if (typeof path !== "string" || path.length === 0) return null;
  return `https://github.com/${repo}/blob/${revision}/${encodePath(path)}`;
}

function defaultProviderContext() {
  if (cachedProviderContext) return cachedProviderContext;
  cachedProviderContext = {
    providers: readJson(join(ROOT_DIR, "catalog", "providers.json")),
    providerInventory: readJson(join(ROOT_DIR, "catalog", "generated", "provider-inventory.json"))
  };
  return cachedProviderContext;
}

function genericDesignMdMatcher(_relativePath, name) {
  return basename(name).toLowerCase() === "design.md";
}

function daisyuiThemeCssMatcher(relativePath) {
  return DAISYUI_THEME_PATH.test(relativePath);
}

function daisyuiThemeSourceSlug(relativePath) {
  return DAISYUI_THEME_PATH.exec(relativePath)?.[1] || null;
}

const PROVIDER_ADAPTERS = Object.freeze({
  "awesome-design-md": Object.freeze({
    id: "awesome-design-md",
    sourceType: "design-md",
    normalizerVersion: 1,
    matchesStyleSource: genericDesignMdMatcher,
    normalizeStyleSource: normalizeDesignMdStyleSource
  }),
  "generic-design-md": Object.freeze({
    id: "generic-design-md",
    sourceType: "design-md",
    normalizerVersion: 1,
    matchesStyleSource: genericDesignMdMatcher,
    normalizeStyleSource: normalizeDesignMdStyleSource
  }),
  "daisyui-theme-css": Object.freeze({
    id: "daisyui-theme-css",
    sourceType: "theme-css",
    normalizerVersion: DAISYUI_NORMALIZER_VERSION,
    matchesStyleSource: daisyuiThemeCssMatcher,
    sourceSlug: daisyuiThemeSourceSlug,
    normalizeStyleSource: normalizeDaisyuiThemeStyleSource
  })
});

export function resolveProviderAdapter(provider = {}) {
  const adapterId = provider.adapter ||
    (provider.id === LEGACY_AWESOME_PROVIDER ? "awesome-design-md" : "generic-design-md");
  const adapter = PROVIDER_ADAPTERS[adapterId];
  if (!adapter) throw new Error(`Unknown provider adapter: ${adapterId}`);
  return adapter;
}

export function hashStyleSourceContent(path) {
  const normalized = normalizeTextForHash(readFileSync(path, "utf8"));
  return hashNormalizedText(normalized);
}

export function loadStyleSourceDocument({ provider, providerDir, path } = {}) {
  if (!provider?.id) throw new Error("A provider with an id is required to load a style source.");
  if (typeof providerDir !== "string" || providerDir.length === 0) {
    throw new Error("A provider cache directory is required to load a style source.");
  }
  const adapter = resolveProviderAdapter(provider);
  if (!adapter.matchesStyleSource(path, basename(path || ""))) {
    throw new Error(`${provider.id}/${path} does not match the ${adapter.id} style-source contract.`);
  }
  const sourcePath = safeProviderSourcePath(providerDir, path);
  const bytes = readFileSync(sourcePath);
  let rawContent;
  try {
    rawContent = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${provider.id}/${path} is not valid UTF-8.`);
  }
  const normalized = adapter.normalizeStyleSource({ path, content: rawContent });
  if (!normalized || typeof normalized.content !== "string") {
    throw new Error(`${adapter.id} did not return normalized style-source content.`);
  }
  return {
    adapterId: adapter.id,
    sourceType: adapter.sourceType,
    normalizerVersion: adapter.normalizerVersion,
    content: normalized.content,
    contentHash: hashNormalizedText(normalized.content),
    candidateTheme: normalized.candidateTheme ?? null
  };
}

export function buildStyleSourceRecords({ provider, providerDir, paths = [] } = {}) {
  if (!provider?.id) throw new Error("A provider with an id is required to build style sources.");
  return paths.map((path) => {
    const document = loadStyleSourceDocument({ provider, providerDir, path });
    return {
      providerId: provider.id,
      path,
      sourceType: document.sourceType,
      contentHash: document.contentHash
    };
  });
}

export function visualReferenceSource(reference = {}) {
  if (typeof reference.provider !== "string" || reference.provider.length === 0) return null;
  if (typeof reference.path === "string" && reference.path.length > 0) {
    return { providerId: reference.provider, path: reference.path };
  }
  if (
    reference.provider === LEGACY_AWESOME_PROVIDER &&
    typeof reference.slug === "string" &&
    reference.slug.length > 0
  ) {
    return {
      providerId: reference.provider,
      path: `design-md/${reference.slug}/DESIGN.md`
    };
  }
  return null;
}

export function expandProviderReference(reference = {}, options = {}) {
  if (
    reference.provider === LEGACY_AWESOME_PROVIDER &&
    typeof reference.slug === "string" &&
    reference.slug.length > 0
  ) {
    const slug = encodeURIComponent(reference.slug);
    const sourceUrl = pinnedProviderSourceUrl(reference);
    return {
      ...reference,
      ...(sourceUrl ? { sourceUrl } : {}),
      pageUrl: `${GETDESIGN_BASE_URL}/${slug}/design-md`,
      lightPreviewUrl: `${GETDESIGN_BASE_URL}/design-md/${slug}/preview.html`,
      darkPreviewUrl: `${GETDESIGN_BASE_URL}/design-md/${slug}/preview-dark.html`
    };
  }

  const source = visualReferenceSource(reference);
  if (!source) return { ...reference };
  const context = options.providers && options.providerInventory
    ? options
    : defaultProviderContext();
  const provider = context.providers.find((item) => item.id === source.providerId);
  const inventory = context.providerInventory?.providers?.find((item) => item.id === source.providerId);
  const repo = reference.repo || provider?.repo;
  const revision = reference.revision || inventory?.revision;
  const sourceUrl = pinnedProviderSourceUrl({ repo, revision, path: source.path });
  if (!sourceUrl) return { ...reference };

  return {
    ...reference,
    repo,
    revision,
    sourceUrl,
    pageUrl: sourceUrl
  };
}

export const PROVIDER_ADAPTER_IDS = Object.freeze(Object.keys(PROVIDER_ADAPTERS));
