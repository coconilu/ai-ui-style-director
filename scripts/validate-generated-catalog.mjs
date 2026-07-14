import { readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isSafeRelativePath,
  resolveProviderAdapter,
  resolveProviderCapabilities
} from "../src/provider-adapters.mjs";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA_VERSION = 4;
const CONTENT_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const SOURCE_TYPE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

export function validateGeneratedCatalog({
  providersPath = join(ROOT_DIR, "catalog", "providers.json"),
  generatedDir = join(ROOT_DIR, "catalog", "generated")
} = {}) {
  const errors = [];
  const expect = (condition, message) => {
    if (!condition) errors.push(message);
  };

  const configuredProviders = readJson(providersPath);
  const inventory = readJson(join(generatedDir, "provider-inventory.json"));
  const styleIndex = readJson(join(generatedDir, "style-sources.json"));
  const componentIndex = readJson(join(generatedDir, "component-sources.json"));

  expect(sameJson(Object.keys(inventory).sort(), ["providers", "schemaVersion"]), "provider inventory root fields must be schemaVersion and providers");
  expect(inventory.schemaVersion === SCHEMA_VERSION, `provider inventory schemaVersion must be ${SCHEMA_VERSION}`);
  expect(Array.isArray(inventory.providers), "provider inventory providers must be an array");

  const providers = Array.isArray(inventory.providers) ? inventory.providers : [];
  const configuredIds = configuredProviders.map((provider) => provider.id);
  const providerIds = providers.map((provider) => provider.id);
  expect(sameJson(providerIds, configuredIds), "provider inventory IDs and order must match catalog/providers.json");

  const fileRules = [
    ["registryFiles", "registryFiles", 200],
    ["docsFiles", "docsFiles", 100]
  ];

  for (const [index, provider] of providers.entries()) {
    const configured = configuredProviders[index];
    if (!configured) continue;
    let adapter = null;
    try {
      adapter = resolveProviderAdapter(configured);
    } catch (error) {
      errors.push(`${configured.id}: ${error.message}`);
    }
    if (adapter) {
      expect(
        SOURCE_TYPE_PATTERN.test(adapter.sourceType || ""),
        `${configured.id}: adapter ${adapter.id} must declare a lowercase kebab-case sourceType`
      );
    }
    expect(provider.repo === configured.repo, `${provider.id}: repo must match catalog/providers.json`);
    expect(provider.url === configured.url, `${provider.id}: url must match catalog/providers.json`);
    expect(provider.role === configured.role, `${provider.id}: role must match catalog/providers.json`);
    expect(provider.type === configured.type, `${provider.id}: type must match catalog/providers.json`);
    expect(provider.license === configured.license, `${provider.id}: license must match catalog/providers.json`);
    expect(typeof provider.cachePresent === "boolean", `${provider.id}: cachePresent must be boolean`);
    if (provider.cachePresent) {
      expect(/^[0-9a-f]{40}$/u.test(provider.revision || ""), `${provider.id}: cached revision must be a 40-character Git SHA`);
    } else {
      expect(provider.revision === null, `${provider.id}: missing cache must have a null revision`);
    }
    expect(provider.counts && typeof provider.counts === "object", `${provider.id}: counts must be present`);

    const styleSources = provider.styleSources;
    expect(Array.isArray(styleSources), `${provider.id}: styleSources must be an array`);
    if (Array.isArray(styleSources)) {
      if (styleSources.length > 0) {
        expect(
          configured.capabilities !== undefined,
          `${configured.id}: providers with styleSources must explicitly declare curation capabilities`
        );
        try {
          const capabilities = resolveProviderCapabilities(configured);
          expect(
            typeof capabilities.createDirection === "boolean" && typeof capabilities.createTheme === "boolean",
            `${configured.id}: effective curation capabilities must be boolean`
          );
        } catch (error) {
          errors.push(`${configured.id}: invalid curation capabilities: ${error.message}`);
        }
      }
      const paths = [];
      for (const [sourceIndex, source] of styleSources.entries()) {
        const label = `${provider.id}: styleSources[${sourceIndex}]`;
        expect(
          sameJson(Object.keys(source || {}).sort(), ["contentHash", "path", "sourceType"]),
          `${label} fields must be contentHash, path, and sourceType`
        );
        expect(isSafeRelativePath(source?.path), `${label}.path must be a safe POSIX-relative path`);
        if (adapter && typeof source?.path === "string") {
          expect(
            adapter.matchesStyleSource(source.path, basename(source.path)),
            `${label}.path must match adapter ${adapter.id}`
          );
        }
        expect(SOURCE_TYPE_PATTERN.test(source?.sourceType || ""), `${label}.sourceType must be lowercase kebab-case`);
        if (adapter) {
          expect(
            source?.sourceType === adapter.sourceType,
            `${label}.sourceType must match adapter ${adapter.id}: ${adapter.sourceType}`
          );
        }
        expect(
          CONTENT_HASH_PATTERN.test(source?.contentHash || ""),
          `${label}.contentHash must be a lowercase SHA-256 digest`
        );
        if (typeof source?.path === "string") paths.push(source.path);
      }
      expect(sameJson(paths, sortedUnique(paths)), `${provider.id}: styleSources must be sorted by unique path`);
      expect(provider.counts?.styleSources === styleSources.length, `${provider.id}: styleSources count must match styleSources`);
    }

    for (const [field, countField, limit] of fileRules) {
      const files = provider[field];
      expect(Array.isArray(files), `${provider.id}: ${field} must be an array`);
      if (!Array.isArray(files)) continue;
      expect(files.every(isSafeRelativePath), `${provider.id}: ${field} must contain safe POSIX-relative paths`);
      expect(sameJson(files, sortedUnique(files)), `${provider.id}: ${field} must be sorted and unique`);
      if (limit !== null) expect(files.length <= limit, `${provider.id}: ${field} exceeds its ${limit}-file limit`);
      expect(provider.counts?.[countField] === files.length, `${provider.id}: ${countField} count must match ${field}`);
    }
  }

  const validateSourceIndex = (indexDocument, label, expectedSources, { contentHashed = false } = {}) => {
    expect(sameJson(Object.keys(indexDocument).sort(), ["schemaVersion", "sources"]), `${label} root fields must be schemaVersion and sources`);
    expect(indexDocument.schemaVersion === SCHEMA_VERSION, `${label} schemaVersion must be ${SCHEMA_VERSION}`);
    expect(Array.isArray(indexDocument.sources), `${label} sources must be an array`);
    const actualSources = Array.isArray(indexDocument.sources) ? indexDocument.sources : [];
    if (contentHashed) {
      for (const [index, source] of actualSources.entries()) {
        expect(
          sameJson(Object.keys(source || {}).sort(), ["contentHash", "path", "providerId", "sourceType"]),
          `${label} source[${index}] fields must be contentHash, path, providerId, and sourceType`
        );
        expect(
          CONTENT_HASH_PATTERN.test(source?.contentHash || ""),
          `${label} source[${index}] contentHash must be a lowercase SHA-256 digest`
        );
        expect(isSafeRelativePath(source?.path), `${label} source[${index}] path must be a safe POSIX-relative path`);
        expect(
          SOURCE_TYPE_PATTERN.test(source?.sourceType || ""),
          `${label} source[${index}] sourceType must be lowercase kebab-case`
        );
      }
      expect(
        sameJson(actualSources, expectedSources),
        `${label} sources must exactly match provider inventory styleSources`
      );
    } else {
      expect(sameJson(actualSources, expectedSources), `${label} sources must exactly match normalized provider inventory paths`);
    }
  };

  const expectedStyleSources = providers.flatMap((provider) =>
    (Array.isArray(provider.styleSources) ? provider.styleSources : []).map((source) => ({
      providerId: provider.id,
      path: source.path,
      sourceType: source.sourceType,
      contentHash: source.contentHash
    }))
  );
  const expectedComponentSources = providers.flatMap((provider) =>
    (Array.isArray(provider.registryFiles) ? provider.registryFiles : []).map((path) => ({
      providerId: provider.id,
      path,
      sourceType: "registry"
    }))
  );
  validateSourceIndex(styleIndex, "style-sources.json", expectedStyleSources, { contentHashed: true });
  validateSourceIndex(componentIndex, "component-sources.json", expectedComponentSources);

  if (errors.length > 0) {
    throw new Error(`Generated catalog validation failed:\n- ${errors.join("\n- ")}`);
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    providerCount: providers.length,
    styleSourceCount: styleIndex.sources.length,
    componentSourceCount: componentIndex.sources.length
  };
}

function main() {
  try {
    const result = validateGeneratedCatalog();
    process.stdout.write(
      `Validated generated catalog schema v${result.schemaVersion}: ` +
        `${result.providerCount} providers, ${result.styleSourceCount} style sources, ` +
        `${result.componentSourceCount} component sources.\n`
    );
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
