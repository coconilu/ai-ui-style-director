#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CURATION_PROCESSING_POLICY_VERSION,
  CURATION_RECORD_SCHEMA_VERSION,
  processingPolicyHashForProvider,
  sourceKey,
  validateCurationState
} from "../src/curation.mjs";
import { validateCatalogV2 } from "../src/catalog-v2.mjs";
import {
  deterministicDirectionId,
  themeTokenDistance
} from "../src/curation-catalog-v2.mjs";
import {
  isSafeRelativePath,
  resolveProviderAdapter,
  resolveProviderCapabilities
} from "../src/provider-adapters.mjs";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RECORD_DECISIONS = new Set(["promoted", "duplicate", "skipped", "invalid"]);
const HASH = /^sha256:[0-9a-f]{64}$/u;
const RECORD_ID = /^[0-9a-f]{64}$/u;
const SAFE_TOKEN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const THEME_FIELDS = Object.freeze(["canvas", "surface", "surfaceAlt", "text", "muted", "accent", "border"]);
const SENSITIVE_KEYS = /^(api[-_]?key|authorization|private[-_]?key|secret|token)$/iu;
const RECORD_SCHEMA_VERSIONS = new Set([1, CURATION_RECORD_SCHEMA_VERSION]);
const V2_ACTION_DECISIONS = new Map([
  ["created-direction-and-theme", "promoted"],
  ["created-direction-with-existing-theme", "promoted"],
  ["added-theme-to-direction", "promoted"],
  ["linked-existing-theme", "promoted"],
  ["duplicate-theme", "duplicate"],
  ["skipped", "skipped"],
  ["invalid", "invalid"]
]);
const DIRECTION_BASES = new Set(["state-alias", "nearest", "created", "none"]);
const CAPABILITY_FIELDS = Object.freeze(["createDirection", "createTheme"]);
const CANONICAL_PROMOTION_FILES = new Set([
  "catalog/style-directions.json",
  "catalog/style-themes.json",
  "catalog/style-direction-themes.json",
  "catalog/style-preview-specs.json"
]);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function bareSha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function isTheme(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value)) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...THEME_FIELDS].sort()) &&
    THEME_FIELDS.every((field) => /^#[0-9a-f]{6}$/iu.test(value[field] || ""));
}

function themesEqual(left, right) {
  return isTheme(left) && isTheme(right) && THEME_FIELDS.every((field) => (
    left[field].toUpperCase() === right[field].toUpperCase()
  ));
}

function exactKeys(value, keys) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function isCapability(value) {
  return exactKeys(value, CAPABILITY_FIELDS)
    && CAPABILITY_FIELDS.every((field) => typeof value[field] === "boolean");
}

function capabilitiesEqual(left, right) {
  return isCapability(left) && isCapability(right)
    && CAPABILITY_FIELDS.every((field) => left[field] === right[field]);
}

function canonicalPairKey(directionId, themeId) {
  return JSON.stringify([directionId, themeId]);
}

function readCanonicalCatalog(paths) {
  const entries = Object.entries(paths);
  const existing = entries.filter(([, path]) => existsSync(path));
  if (existing.length === 0) return null;
  if (existing.length !== entries.length) {
    const missing = entries.filter(([, path]) => !existsSync(path)).map(([key]) => key);
    throw new Error(`Canonical curation validation requires all Direction/Theme files; missing ${missing.join(", ")}.`);
  }
  return validateCatalogV2(Object.fromEntries(entries.map(([key, path]) => [key, readJson(path)])));
}

function containsSensitiveKey(value) {
  if (Array.isArray(value)) return value.some(containsSensitiveKey);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, nested]) => SENSITIVE_KEYS.test(key) || containsSensitiveKey(nested));
}

function expectedRecordId(record) {
  const fields = [
    record.source.providerId,
    record.source.path,
    record.source.contentHash,
    record.source.sourceType,
    record.source.adapterId,
    String(record.source.normalizerVersion),
    record.agent.promptVersion
  ];
  if (record.schemaVersion === CURATION_RECORD_SCHEMA_VERSION) {
    fields.push(JSON.stringify({
      adapter: record.checks?.capability?.adapter,
      declared: record.checks?.capability?.declared,
      effective: record.checks?.capability?.effective
    }));
    fields.push(
      String(record.source.processingPolicyVersion),
      record.source.processingPolicyHash
    );
  }
  fields.push(
    record.transition.fromHash || "unseen",
    record.agent.responseId || "no-response-id",
    record.agent.responseHash,
    record.createdAt,
    String(record.eventNonce)
  );
  return bareSha256(fields.join("\u0000"));
}

function nullableSafeId(value) {
  return value === null || SAFE_TOKEN.test(value || "");
}

function unitNumber(value) {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function sourceMatchesRecord(source, recordSource) {
  return source?.kind === "source-pinned"
    && source.provider === recordSource?.providerId
    && source.path === recordSource?.path
    && source.revision === recordSource?.revision
    && source.contentHash === recordSource?.contentHash;
}

function validateRecordV2({ file, record, errors, canonical }) {
  const expect = (condition, message) => {
    if (!condition) errors.push(`${file}: ${message}`);
  };
  expect(Boolean(canonical), "record v2 requires the canonical Direction/Theme catalog");

  const sourceFields = [
    "providerId",
    "path",
    "sourceType",
    "adapterId",
    "normalizerVersion",
    "capabilities",
    "processingPolicyHash",
    "contentHash",
    "processingPolicyVersion",
    "revision",
    "truncated",
    "consumedCharacters"
  ];
  expect(exactKeys(record.source, sourceFields), "source must contain the exact v2 provenance fields");
  expect(SAFE_TOKEN.test(record?.source?.providerId || ""), "source.providerId must be lowercase kebab-case");
  expect(isSafeRelativePath(record?.source?.path), "source.path must be a safe POSIX-relative path");
  expect(isCapability(record?.source?.capabilities), "source.capabilities must contain boolean createDirection/createTheme");
  expect(
    Number.isInteger(record?.source?.processingPolicyVersion) && record.source.processingPolicyVersion > 0,
    "source.processingPolicyVersion must be a positive integer"
  );
  expect(HASH.test(record?.source?.processingPolicyHash || ""), "source.processingPolicyHash must be SHA-256");
  expect(/^[0-9a-f]{40}$/u.test(record?.source?.revision || ""), "source.revision must be a pinned 40-character Git SHA");
  expect(typeof record?.source?.truncated === "boolean", "source.truncated must be boolean");
  expect(
    Number.isInteger(record?.source?.consumedCharacters) && record.source.consumedCharacters >= 0,
    "source.consumedCharacters must be a non-negative integer"
  );
  const capability = record?.checks?.capability;
  expect(exactKeys(capability, ["adapter", "declared", "effective", "passed"]), "checks.capability has invalid fields");
  expect(isCapability(capability?.adapter), "checks.capability.adapter must be an exact capability object");
  expect(capability?.declared === null || isCapability(capability?.declared), "checks.capability.declared must be null or an exact capability object");
  expect(isCapability(capability?.effective), "checks.capability.effective must be an exact capability object");
  expect(typeof capability?.passed === "boolean", "checks.capability.passed must be boolean");
  if (isCapability(capability?.adapter) && (capability.declared === null || isCapability(capability.declared))) {
    const expectedEffective = Object.fromEntries(CAPABILITY_FIELDS.map((field) => [
      field,
      capability.adapter[field] && (capability.declared?.[field] ?? true)
    ]));
    expect(capabilitiesEqual(capability.effective, expectedEffective), "checks.capability.effective must be adapter/declared intersection");
    expect(capabilitiesEqual(record.source.capabilities, expectedEffective), "source.capabilities must match checks.capability.effective");
    const expectedPolicyHash = `sha256:${bareSha256(JSON.stringify({
      processingPolicyVersion: record.source.processingPolicyVersion,
      adapterId: record.source.adapterId,
      normalizerVersion: record.source.normalizerVersion,
      effectiveCapabilities: expectedEffective
    }))}`;
    expect(
      record.source.processingPolicyHash === expectedPolicyHash,
      "source.processingPolicyHash must bind the recorded version, adapter, normalizer, and effective capabilities"
    );
  }

  const direction = record?.checks?.direction;
  expect(
    exactKeys(direction, ["threshold", "basis", "nearestDirectionId", "score", "selectedDirectionId", "passed"]),
    "checks.direction has invalid fields"
  );
  expect(unitNumber(direction?.threshold), "checks.direction.threshold must be in [0, 1]");
  expect(DIRECTION_BASES.has(direction?.basis), "checks.direction.basis is invalid");
  expect(nullableSafeId(direction?.nearestDirectionId), "checks.direction.nearestDirectionId must be null or a safe ID");
  expect(unitNumber(direction?.score), "checks.direction.score must be in [0, 1]");
  expect(nullableSafeId(direction?.selectedDirectionId), "checks.direction.selectedDirectionId must be null or a safe ID");
  expect(typeof direction?.passed === "boolean", "checks.direction.passed must be boolean");

  const theme = record?.checks?.theme;
  expect(
    exactKeys(theme, ["threshold", "nearestThemeId", "distance", "duplicate", "passed"]),
    "checks.theme has invalid fields"
  );
  expect(unitNumber(theme?.threshold), "checks.theme.threshold must be in [0, 1]");
  expect(theme?.nearestThemeId === null || /^theme-[0-9a-f]{12}$/u.test(theme?.nearestThemeId || ""), "checks.theme.nearestThemeId must be null or a Theme ID");
  expect(theme?.distance === null || unitNumber(theme?.distance), "checks.theme.distance must be null or in [0, 1]");
  expect(typeof theme?.duplicate === "boolean", "checks.theme.duplicate must be boolean");
  expect(typeof theme?.passed === "boolean", "checks.theme.passed must be boolean");
  if (
    typeof theme?.duplicate === "boolean"
    && typeof theme?.passed === "boolean"
    && !["skipped", "invalid"].includes(record?.result?.action)
  ) {
    expect(theme.passed === !theme.duplicate, "checks.theme.passed must be the inverse of duplicate");
  }

  const result = record?.result;
  expect(exactKeys(result, ["action", "directionId", "themeId"]), "result must contain action, directionId, and themeId");
  const expectedDecision = V2_ACTION_DECISIONS.get(result?.action);
  expect(Boolean(expectedDecision), "result.action is invalid");
  expect(expectedDecision === record.decision, "result.action must agree with decision");
  expect(nullableSafeId(result?.directionId), "result.directionId must be null or a safe ID");
  expect(result?.themeId === null || /^theme-[0-9a-f]{12}$/u.test(result?.themeId || ""), "result.themeId must be null or a Theme ID");
  if (["skipped", "invalid"].includes(result?.action)) {
    expect(result.directionId === null && result.themeId === null, `${result.action} result must not select a Direction or Theme`);
    expect(
      theme?.nearestThemeId === null
        && theme?.distance === null
        && theme?.duplicate === false
        && theme?.passed === false,
      `${result.action} result must retain the explicit unexecuted Theme-check state`
    );
  }
  if (["created-direction-and-theme", "created-direction-with-existing-theme", "added-theme-to-direction", "linked-existing-theme", "duplicate-theme"].includes(result?.action)) {
    expect(typeof result.directionId === "string" && typeof result.themeId === "string", "resolved result requires Direction and Theme IDs");
  }
  if (result?.directionId !== null && canonical) {
    expect(canonical.directionById.has(result.directionId), `result references missing Direction ${result.directionId}`);
    expect(canonical.previewSpecByDirectionId.has(result.directionId), `result Direction ${result.directionId} has no PreviewSpec`);
  }
  if (result?.themeId !== null && canonical) {
    expect(canonical.themeById.has(result.themeId), `result references missing Theme ${result.themeId}`);
  }
  if (result?.directionId && result?.themeId && expectedDecision !== "invalid" && canonical) {
    expect(
      canonical.linkByKey.has(canonicalPairKey(result.directionId, result.themeId)),
      "resolved result Direction/Theme pair is not linked"
    );
  }
  if (result?.directionId !== null) {
    expect(direction?.selectedDirectionId === result.directionId, "checks.direction.selectedDirectionId must match result.directionId");
  }
  if (result?.action === "duplicate-theme") {
    expect(theme?.duplicate === true, "duplicate-theme result requires checks.theme.duplicate=true");
    expect(theme?.nearestThemeId === result.themeId, "duplicate-theme result must use the nearest Theme");
    expect(capability?.passed === true, "duplicate-theme result must pass the capability gate");
    expect(direction?.passed === true, "duplicate-theme result must pass the Direction gate");
  }
  if (["created-direction-and-theme", "created-direction-with-existing-theme", "added-theme-to-direction", "linked-existing-theme"].includes(result?.action)) {
    expect(capability?.passed === true, "promoted v2 result must pass the capability gate");
    expect(direction?.passed === true, "promoted v2 result must pass the Direction gate");
    expect(theme?.passed === true, "promoted v2 result must pass the Theme gate");
  }
  if (["created-direction-and-theme", "created-direction-with-existing-theme"].includes(result?.action)) {
    expect(
      capability?.effective?.createDirection === true && capability?.effective?.createTheme === true,
      `${result.action} requires effective createDirection and createTheme capabilities`
    );
    try {
      expect(
        result.directionId === deterministicDirectionId(record?.candidate?.profile),
        `${result.action} result.directionId must be derived deterministically from candidate.profile`
      );
    } catch (error) {
      expect(false, `${result.action} candidate.profile cannot derive a deterministic Direction ID: ${error.message}`);
    }
  }
  if (["added-theme-to-direction", "linked-existing-theme", "duplicate-theme"].includes(result?.action)) {
    expect(capability?.effective?.createTheme === true, `${result.action} requires effective createTheme capability`);
  }

  if (record.decision === "promoted") {
    const promotion = record.promotion;
    expect(exactKeys(promotion, ["action", "directionId", "themeId", "files"]), "promotion has invalid v2 fields");
    expect(promotion?.action === result?.action, "promotion.action must match result.action");
    expect(promotion?.directionId === result?.directionId, "promotion.directionId must match result.directionId");
    expect(promotion?.themeId === result?.themeId, "promotion.themeId must match result.themeId");
    expect(
      Array.isArray(promotion?.files)
        && promotion.files.length > 0
        && promotion.files.every((path) => CANONICAL_PROMOTION_FILES.has(path))
        && new Set(promotion.files).size === promotion.files.length,
      "promotion.files must contain unique canonical Direction/Theme files only"
    );
    const files = new Set(Array.isArray(promotion?.files) ? promotion.files : []);
    if (promotion?.action === "created-direction-and-theme") {
      for (const path of [
        "catalog/style-directions.json",
        "catalog/style-themes.json",
        "catalog/style-direction-themes.json",
        "catalog/style-preview-specs.json"
      ]) expect(files.has(path), `created-direction-and-theme promotion must include ${path}`);
      expect(files.size === 4, "created-direction-and-theme promotion must change exactly four canonical files");
    } else if (promotion?.action === "created-direction-with-existing-theme") {
      expect(
        files.size === 3
          && files.has("catalog/style-directions.json")
          && files.has("catalog/style-direction-themes.json")
          && files.has("catalog/style-preview-specs.json"),
        "created-direction-with-existing-theme promotion must change Direction, link, and PreviewSpec files only"
      );
    } else if (promotion?.action === "added-theme-to-direction") {
      expect(
        files.size === 2
          && files.has("catalog/style-themes.json")
          && files.has("catalog/style-direction-themes.json"),
        "added-theme-to-direction promotion must change Theme and link files only"
      );
    } else if (promotion?.action === "linked-existing-theme") {
      expect(
        files.size === 1 && files.has("catalog/style-direction-themes.json"),
        "linked-existing-theme promotion must change only the link file"
      );
    }

    const selectedTheme = canonical?.themeById.get(result?.themeId);
    if (files.has("catalog/style-themes.json")) {
      expect(
        selectedTheme?.sources?.some((source) => sourceMatchesRecord(source, record.source)),
        "new Theme provenance must match the processed source"
      );
    }
  }

  const selectedTheme = canonical?.themeById.get(result?.themeId);
  if (record.decision === "promoted" && selectedTheme && record?.candidate?.visual?.theme) {
    expect(
      themesEqual(record.candidate.visual.theme, selectedTheme.tokens),
      "candidate Theme tokens must match the selected canonical Theme"
    );
  }
  if (record.decision === "duplicate" && selectedTheme && record?.candidate?.visual?.theme) {
    const distance = themeTokenDistance(record.candidate.visual.theme, selectedTheme.tokens);
    const roundedDistance = distance === null ? null : Number(distance.toFixed(6));
    expect(distance !== null, "duplicate candidate and selected Theme must have comparable tokens");
    expect(
      roundedDistance !== null && Math.abs(roundedDistance - theme.distance) <= 0.000001,
      "checks.theme.distance must equal the deterministic candidate/Theme distance"
    );
    expect(distance !== null && distance <= theme.threshold, "duplicate Theme distance must be within threshold");
  }
}

export function validateCurationArtifacts({
  statePath = join(ROOT_DIR, "catalog", "curation", "source-state.json"),
  recordsDir = join(ROOT_DIR, "catalog", "curation", "records"),
  profilesPath,
  visualsPath,
  previewsDir,
  directionsPath,
  themesPath,
  directionThemesPath,
  previewSpecsPath,
  aliasesPath,
  styleSourcesPath,
  providersPath
} = {}) {
  if (!existsSync(statePath)) throw new Error("Curation source-state.json is missing; create the checked-in baseline first.");
  const state = readJson(statePath);
  validateCurationState(state);
  const errors = [];
  const catalogDir = resolve(dirname(statePath), "..");
  const resolvedProfilesPath = profilesPath || join(catalogDir, "style-profiles.json");
  const resolvedVisualsPath = visualsPath || join(catalogDir, "style-visuals.json");
  const resolvedPreviewsDir = previewsDir || join(catalogDir, "previews");
  const resolvedStyleSourcesPath = styleSourcesPath || join(catalogDir, "generated", "style-sources.json");
  const resolvedProvidersPath = providersPath || join(catalogDir, "providers.json");
  const canonical = readCanonicalCatalog({
    directions: directionsPath || join(catalogDir, "style-directions.json"),
    themes: themesPath || join(catalogDir, "style-themes.json"),
    directionThemes: directionThemesPath || join(catalogDir, "style-direction-themes.json"),
    previewSpecs: previewSpecsPath || join(catalogDir, "style-preview-specs.json"),
    aliases: aliasesPath || join(catalogDir, "style-aliases.json")
  });
  if (state.schemaVersion === 2 && !canonical) {
    throw new Error("Curation source-state v2 requires the canonical Direction/Theme catalog.");
  }
  const profiles = existsSync(resolvedProfilesPath) ? readJson(resolvedProfilesPath) : [];
  const visuals = existsSync(resolvedVisualsPath) ? readJson(resolvedVisualsPath) : [];
  const profileIds = new Set(Array.isArray(profiles) ? profiles.map((profile) => profile?.id) : []);
  const visualIds = new Set(Array.isArray(visuals) ? visuals.map((visual) => visual?.styleId) : []);
  const profilesById = new Map(Array.isArray(profiles) ? profiles.map((profile) => [profile?.id, profile]) : []);
  const visualsById = new Map(Array.isArray(visuals) ? visuals.map((visual) => [visual?.styleId, visual]) : []);
  const styleSourcesDocument = existsSync(resolvedStyleSourcesPath) ? readJson(resolvedStyleSourcesPath) : { sources: [] };
  const styleSourcesByKey = new Map(
    (Array.isArray(styleSourcesDocument?.sources) ? styleSourcesDocument.sources : [])
      .map((source) => [sourceKey(source), source])
  );
  const configuredProviders = existsSync(resolvedProvidersPath) ? readJson(resolvedProvidersPath) : [];
  const governance = {
    providersById: new Map((Array.isArray(configuredProviders) ? configuredProviders : []).map((provider) => [provider.id, provider]))
  };
  const files = existsSync(recordsDir)
    ? readdirSync(recordsDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map((entry) => entry.name)
        .sort()
    : [];
  const records = new Map();

  for (const file of files) {
    const id = file.slice(0, -5);
    if (!RECORD_ID.test(id)) {
      errors.push(`${file}: filename must be a 64-character lowercase hex record ID`);
      continue;
    }
    const record = readJson(join(recordsDir, file));
    if (!RECORD_SCHEMA_VERSIONS.has(record?.schemaVersion)) {
      errors.push(`${file}: schemaVersion must be 1 or ${CURATION_RECORD_SCHEMA_VERSION}`);
    }
    if (record?.recordId !== id) errors.push(`${file}: recordId must match the filename`);
    if (!Number.isInteger(record?.eventNonce) || record.eventNonce < 0) {
      errors.push(`${file}: eventNonce must be a non-negative integer`);
    }
    if (typeof record?.createdAt !== "string" || Number.isNaN(Date.parse(record.createdAt))) {
      errors.push(`${file}: createdAt must be an ISO-compatible timestamp`);
    }
    if (!record?.source || !HASH.test(record.source.contentHash || "")) errors.push(`${file}: source.contentHash must be SHA-256`);
    if (!SAFE_TOKEN.test(record?.source?.sourceType || "")) errors.push(`${file}: source.sourceType must be lowercase kebab-case`);
    if (!SAFE_TOKEN.test(record?.source?.adapterId || "")) errors.push(`${file}: source.adapterId must be lowercase kebab-case`);
    if (!Number.isInteger(record?.source?.normalizerVersion) || record.source.normalizerVersion <= 0) {
      errors.push(`${file}: source.normalizerVersion must be a positive integer`);
    }
    if (!record?.agent || typeof record.agent.promptVersion !== "string" || record.agent.promptVersion.trim() === "") {
      errors.push(`${file}: agent.promptVersion must be a non-empty string`);
    }
    if (!HASH.test(record?.agent?.responseHash || "")) errors.push(`${file}: agent.responseHash must be SHA-256`);
    if (record?.agent?.responseId !== null && typeof record?.agent?.responseId !== "string") {
      errors.push(`${file}: agent.responseId must be null or a string`);
    }
    if (["style-curation-v4", "direction-theme-curation-v1"].includes(record?.agent?.promptVersion)) {
      const attempts = record.agent.attempts;
      if (
        !Number.isInteger(record.agent.attemptCount) ||
        record.agent.attemptCount < 1 ||
        record.agent.attemptCount > 2 ||
        !Array.isArray(attempts) ||
        attempts.length !== record.agent.attemptCount
      ) {
        errors.push(`${file}: v4 agent metadata must contain one or two matching attempts`);
      } else {
        for (const [index, attempt] of attempts.entries()) {
          const expectedPhase = index === 0 ? "initial" : "repair";
          if (attempt?.phase !== expectedPhase) errors.push(`${file}: agent.attempts[${index}].phase must be ${expectedPhase}`);
          if (!HASH.test(attempt?.responseHash || "")) errors.push(`${file}: agent.attempts[${index}].responseHash must be SHA-256`);
          if (attempt?.responseId !== null && typeof attempt?.responseId !== "string") {
            errors.push(`${file}: agent.attempts[${index}].responseId must be null or a string`);
          }
          if (typeof attempt?.model !== "string" || attempt.model.trim() === "") {
            errors.push(`${file}: agent.attempts[${index}].model must be a non-empty string`);
          }
          if (!Array.isArray(attempt?.validationErrors) || !attempt.validationErrors.every((error) => typeof error === "string")) {
            errors.push(`${file}: agent.attempts[${index}].validationErrors must be a string array`);
          }
        }
        const finalAttempt = attempts.at(-1);
        if (finalAttempt.responseHash !== record.agent.responseHash || finalAttempt.responseId !== record.agent.responseId) {
          errors.push(`${file}: final attempt must match the top-level agent response identity`);
        }
        if (JSON.stringify(finalAttempt.validationErrors) !== JSON.stringify(record?.checks?.schema?.errors)) {
          errors.push(`${file}: final attempt validation errors must match checks.schema.errors`);
        }
      }
    }
    if (
      !record?.transition ||
      (record.transition.fromHash !== null && !HASH.test(record.transition.fromHash || "")) ||
      record.transition.toHash !== record?.source?.contentHash
    ) {
      errors.push(`${file}: transition must describe the previous and current source hashes`);
    }
    if (record?.source && record?.agent && record?.transition && expectedRecordId(record) !== id) {
      errors.push(`${file}: recordId does not match the immutable processing event`);
    }
    if (!RECORD_DECISIONS.has(record?.decision)) errors.push(`${file}: decision is invalid`);
    if (record?.schemaVersion === 1 && record?.decision === "promoted" && !record?.promotion?.styleId) {
      errors.push(`${file}: promoted v1 decision requires promotion.styleId`);
    }
    if (record?.schemaVersion === CURATION_RECORD_SCHEMA_VERSION && record?.decision === "promoted" && !record?.promotion) {
      errors.push(`${file}: promoted v2 decision requires promotion metadata`);
    }
    if (record?.decision !== "promoted" && record?.promotion !== null) errors.push(`${file}: non-promoted decision must have null promotion`);
    if (!record?.checks || typeof record.checks !== "object") {
      errors.push(`${file}: deterministic checks are required`);
    } else {
      const binding = record.checks.themeBinding;
      if (
        !binding ||
        typeof binding.required !== "boolean" ||
        typeof binding.applied !== "boolean" ||
        typeof binding.passed !== "boolean"
      ) {
        errors.push(`${file}: checks.themeBinding must describe required, applied, and passed state`);
      } else {
        if (binding.required && !isTheme(binding.expectedTheme)) {
          errors.push(`${file}: required theme binding must include an exact expectedTheme`);
        }
        if (!binding.required && binding.expectedTheme !== null) {
          errors.push(`${file}: optional theme binding must have a null expectedTheme`);
        }
        if (record.decision === "promoted" && (!binding.applied || !binding.passed)) {
          errors.push(`${file}: promoted records must pass every applicable theme binding`);
        }
      }
    }
    if (!record?.workflow || typeof record.workflow !== "object") errors.push(`${file}: workflow metadata is required`);
    if (containsSensitiveKey(record)) errors.push(`${file}: record contains a secret-shaped field`);
    if (record?.schemaVersion === CURATION_RECORD_SCHEMA_VERSION) {
      validateRecordV2({ file, record, errors, canonical });
    }
    records.set(id, record);
  }

  if (canonical) {
    const legacyBackedDirectionIds = new Set(canonical.aliases.map((alias) => alias.directionId));
    const legacyBackedThemeIds = new Set(canonical.aliases.map((alias) => alias.themeId));
    const directionCreationRecords = [...records.values()].filter((record) =>
      record.schemaVersion === CURATION_RECORD_SCHEMA_VERSION
      && record.decision === "promoted"
      && ["created-direction-and-theme", "created-direction-with-existing-theme"].includes(record?.result?.action)
      && record?.promotion?.files?.includes("catalog/style-directions.json")
      && record?.promotion?.files?.includes("catalog/style-preview-specs.json")
    );
    const themeCreationRecords = [...records.values()].filter((record) =>
      record.schemaVersion === CURATION_RECORD_SCHEMA_VERSION
      && record.decision === "promoted"
      && ["created-direction-and-theme", "added-theme-to-direction"].includes(record?.result?.action)
      && record?.promotion?.files?.includes("catalog/style-themes.json")
    );
    for (const direction of canonical.directions) {
      if (legacyBackedDirectionIds.has(direction.id)) continue;
      if (!directionCreationRecords.some((record) => record.result.directionId === direction.id)) {
        errors.push(`canonical-only Direction ${direction.id} has no immutable v2 creation record`);
      }
    }
    for (const theme of canonical.themes) {
      if (legacyBackedThemeIds.has(theme.id)) continue;
      for (const source of theme.sources || []) {
        const proof = themeCreationRecords.find((record) =>
          record.result.themeId === theme.id && sourceMatchesRecord(source, record.source)
        );
        if (!proof) {
          errors.push(`canonical-only Theme ${theme.id} source ${source?.provider || "unknown"}/${source?.path || "unknown"} has no immutable v2 creation record`);
        }
      }
    }
  }

  for (const entry of state.sources) {
    if (state.schemaVersion === 2) {
      for (const directionId of entry.directionIds) {
        if (!canonical?.directionById.has(directionId)) {
          errors.push(`state entry ${entry.providerId}/${entry.path} Direction ${directionId} is missing from style-directions.json`);
        }
      }
      for (const themeId of entry.themeIds) {
        if (!canonical?.themeById.has(themeId)) {
          errors.push(`state entry ${entry.providerId}/${entry.path} Theme ${themeId} is missing from style-themes.json`);
        }
      }
      for (const styleId of entry.styleIds) {
        const alias = canonical?.aliasByLegacyStyleId.get(styleId);
        if (!alias) {
          errors.push(`state entry ${entry.providerId}/${entry.path} legacy style ${styleId} has no immutable alias`);
        } else {
          if (!entry.directionIds.includes(alias.directionId)) {
            errors.push(`state entry ${entry.providerId}/${entry.path} is missing aliased Direction ${alias.directionId}`);
          }
          if (!entry.themeIds.includes(alias.themeId)) {
            errors.push(`state entry ${entry.providerId}/${entry.path} is missing aliased Theme ${alias.themeId}`);
          }
        }
      }
      for (const themeId of entry.themeIds) {
        const linked = entry.directionIds.some((directionId) =>
          canonical?.linkByKey.has(canonicalPairKey(directionId, themeId))
        );
        if (!linked) {
          errors.push(`state entry ${entry.providerId}/${entry.path} Theme ${themeId} is not linked to a retained Direction`);
        }
      }
    }
    if (entry.status === "baseline") continue;
    const record = records.get(entry.recordId);
    if (!record) {
      errors.push(`state entry ${entry.providerId}/${entry.path} references missing record ${entry.recordId}`);
      continue;
    }
    if (sourceKey(entry) !== sourceKey(record.source) || entry.processedHash !== record.source.contentHash) {
      errors.push(`state entry ${entry.providerId}/${entry.path} does not match record ${entry.recordId}`);
    }
    if (
      state.schemaVersion === 2
      && record.schemaVersion === CURATION_RECORD_SCHEMA_VERSION
      && entry.processingPolicyHash !== record.source.processingPolicyHash
    ) {
      errors.push(`state entry ${entry.providerId}/${entry.path} processing policy does not match record ${entry.recordId}`);
    }
    if (state.schemaVersion === 2 && record.schemaVersion === CURATION_RECORD_SCHEMA_VERSION) {
      const configuredProvider = governance.providersById.get(entry.providerId);
      const indexedSource = styleSourcesByKey.get(sourceKey(entry));
      if (configuredProvider && indexedSource?.contentHash === entry.processedHash) {
        try {
          const currentPolicyHash = processingPolicyHashForProvider(configuredProvider);
          if (entry.processingPolicyHash === currentPolicyHash) {
            const adapter = resolveProviderAdapter(configuredProvider);
            const effective = resolveProviderCapabilities(configuredProvider);
            const capability = record?.checks?.capability;
            if (record.source.processingPolicyVersion !== CURATION_PROCESSING_POLICY_VERSION) {
              errors.push(`current record ${record.recordId} processing policy version is stale`);
            }
            if (record.source.sourceType !== indexedSource.sourceType) {
              errors.push(`current record ${record.recordId} sourceType does not match generated/style-sources.json`);
            }
            if (record.source.adapterId !== adapter.id || record.source.normalizerVersion !== adapter.normalizerVersion) {
              errors.push(`current record ${record.recordId} adapter snapshot does not match catalog/providers.json`);
            }
            if (!capabilitiesEqual(capability?.effective, effective) || !capabilitiesEqual(record.source.capabilities, effective)) {
              errors.push(`current record ${record.recordId} effective capabilities do not match catalog/providers.json`);
            }
          }
        } catch (error) {
          errors.push(`current record ${record.recordId} provider policy is invalid: ${error.message}`);
        }
      }
    }
    if (entry.status !== record.decision) errors.push(`state entry ${entry.providerId}/${entry.path} status does not match record decision`);
    if (record.schemaVersion === 1 && entry.status === "promoted") {
      const promotedStyleId = record?.promotion?.styleId;
      if (!promotedStyleId || !entry.styleIds.includes(promotedStyleId)) {
        errors.push(`state entry ${entry.providerId}/${entry.path} does not retain its promoted style ID`);
      } else {
        const candidateProfile = record?.candidate?.profile;
        const expectedStyleId = candidateProfile
          ? `${candidateProfile.family}-${candidateProfile.composition}-${candidateProfile.emphasis}-${record.source.contentHash.slice("sha256:".length, "sha256:".length + 8)}`
          : null;
        if (promotedStyleId !== expectedStyleId) {
          errors.push(`record ${record.recordId} promotion style ID does not match its controlled candidate primitives`);
        }
        const profile = profilesById.get(promotedStyleId);
        if (
          profile?.sourceProvider !== record.source.providerId ||
          profile?.sourcePath !== record.source.path ||
          profile?.sourceRevision !== record.source.revision ||
          profile?.sourceContentHash !== record.source.contentHash
        ) {
          errors.push(`record ${record.recordId} promotion provenance does not match style-profiles.json`);
        }
        const visual = visualsById.get(promotedStyleId);
        const primaryReference = visual?.references?.find((reference) =>
          reference.provider === record.source.providerId && reference.path === record.source.path
        );
        if (
          !primaryReference ||
          primaryReference.revision !== record.source.revision ||
          primaryReference.contentHash !== record.source.contentHash
        ) {
          errors.push(`record ${record.recordId} primary source is not pinned in style-visuals.json`);
        }
        const binding = record?.checks?.themeBinding;
        if (binding?.required) {
          if (!themesEqual(record?.candidate?.visual?.theme, binding.expectedTheme)) {
            errors.push(`record ${record.recordId} candidate theme does not match its adapter-derived binding`);
          }
          if (!themesEqual(visual?.theme, binding.expectedTheme)) {
            errors.push(`record ${record.recordId} promoted visual theme does not match its adapter-derived binding`);
          }
        }
      }
    } else if (record.schemaVersion === CURATION_RECORD_SCHEMA_VERSION) {
      const result = record.result || {};
      if (["promoted", "duplicate"].includes(entry.status)) {
        if (!result.directionId || !entry.directionIds.includes(result.directionId)) {
          errors.push(`state entry ${entry.providerId}/${entry.path} does not retain its selected Direction ID`);
        }
        if (!result.themeId || !entry.themeIds.includes(result.themeId)) {
          errors.push(`state entry ${entry.providerId}/${entry.path} does not retain its selected Theme ID`);
        }
      }
    }
    if (state.schemaVersion === 2 && record.schemaVersion === 1 && record.decision === "promoted") {
      const alias = canonical?.aliasByLegacyStyleId.get(record?.promotion?.styleId);
      if (!alias || !entry.directionIds.includes(alias.directionId) || !entry.themeIds.includes(alias.themeId)) {
        errors.push(`state entry ${entry.providerId}/${entry.path} does not retain the canonical alias of its v1 promotion`);
      }
    }
  }

  for (const entry of state.sources) {
    for (const styleId of entry.styleIds) {
      if (!profileIds.has(styleId)) errors.push(`state entry ${entry.providerId}/${entry.path} style ${styleId} is missing from style-profiles.json`);
      if (!visualIds.has(styleId)) errors.push(`state entry ${entry.providerId}/${entry.path} style ${styleId} is missing from style-visuals.json`);
      if (!existsSync(join(resolvedPreviewsDir, `${styleId}.svg`))) {
        errors.push(`state entry ${entry.providerId}/${entry.path} style ${styleId} has no preview SVG`);
      }
    }
  }

  if (errors.length > 0) throw new Error(`Curation artifact validation failed:\n- ${errors.join("\n- ")}`);
  return {
    stateSourceCount: state.sources.length,
    recordCount: records.size,
    processedSourceCount: state.sources.filter((entry) => entry.status !== "baseline").length
  };
}

function main() {
  try {
    const result = validateCurationArtifacts();
    process.stdout.write(
      `Validated curation artifacts: ${result.stateSourceCount} tracked sources, ` +
        `${result.processedSourceCount} agent-processed, ${result.recordCount} immutable records.\n`
    );
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
