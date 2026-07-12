import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LEGACY_AWESOME_PROVIDER = "awesome-design-md";
const GETDESIGN_BASE_URL = "https://getdesign.md";
let cachedProviderContext;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function normalizeTextForHash(value) {
  return value.replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n");
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

const PROVIDER_ADAPTERS = Object.freeze({
  "awesome-design-md": Object.freeze({
    id: "awesome-design-md",
    matchesStyleSource: genericDesignMdMatcher
  }),
  "generic-design-md": Object.freeze({
    id: "generic-design-md",
    matchesStyleSource: genericDesignMdMatcher
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
  return `sha256:${createHash("sha256").update(normalized, "utf8").digest("hex")}`;
}

export function buildStyleSourceRecords({ provider, providerDir, paths = [] } = {}) {
  if (!provider?.id) throw new Error("A provider with an id is required to build style sources.");
  resolveProviderAdapter(provider);
  return paths.map((path) => ({
    providerId: provider.id,
    path,
    sourceType: "design-md",
    contentHash: hashStyleSourceContent(join(providerDir, path))
  }));
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
