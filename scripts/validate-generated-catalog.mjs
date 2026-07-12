import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveProviderAdapter } from "../src/provider-adapters.mjs";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA_VERSION = 3;
const CONTENT_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/u;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isSafeRelativePath(path) {
  return (
    typeof path === "string" &&
    path.length > 0 &&
    !path.startsWith("/") &&
    !path.includes("\\") &&
    !path.split("/").includes("..")
  );
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
    ["designMdFiles", "designMdFiles", null],
    ["registryFiles", "registryFiles", 200],
    ["docsFiles", "docsFiles", 100]
  ];

  for (const [index, provider] of providers.entries()) {
    const configured = configuredProviders[index];
    if (!configured) continue;
    try {
      resolveProviderAdapter(configured);
    } catch (error) {
      errors.push(`${configured.id}: ${error.message}`);
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

  const validateSourceIndex = (indexDocument, label, sourceType, providerField, { contentHashed = false } = {}) => {
    expect(sameJson(Object.keys(indexDocument).sort(), ["schemaVersion", "sources"]), `${label} root fields must be schemaVersion and sources`);
    expect(indexDocument.schemaVersion === SCHEMA_VERSION, `${label} schemaVersion must be ${SCHEMA_VERSION}`);
    expect(Array.isArray(indexDocument.sources), `${label} sources must be an array`);
    const expectedSources = providers.flatMap((provider) =>
      (Array.isArray(provider[providerField]) ? provider[providerField] : []).map((path) => ({
        providerId: provider.id,
        path,
        sourceType
      }))
    );
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
      }
      const normalizedActual = actualSources.map(({ providerId, path, sourceType }) => ({
        providerId,
        path,
        sourceType
      }));
      expect(
        sameJson(normalizedActual, expectedSources),
        `${label} sources must exactly match normalized provider inventory paths`
      );
    } else {
      expect(sameJson(actualSources, expectedSources), `${label} sources must exactly match normalized provider inventory paths`);
    }
  };

  validateSourceIndex(styleIndex, "style-sources.json", "design-md", "designMdFiles", { contentHashed: true });
  validateSourceIndex(componentIndex, "component-sources.json", "registry", "registryFiles");

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
