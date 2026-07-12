#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CURATION_SCHEMA_VERSION,
  sourceKey,
  validateCurationState
} from "../src/curation.mjs";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RECORD_DECISIONS = new Set(["promoted", "duplicate", "skipped", "invalid"]);
const HASH = /^sha256:[0-9a-f]{64}$/u;
const RECORD_ID = /^[0-9a-f]{64}$/u;
const SAFE_TOKEN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const THEME_FIELDS = Object.freeze(["canvas", "surface", "surfaceAlt", "text", "muted", "accent", "border"]);
const SENSITIVE_KEYS = /^(api[-_]?key|authorization|private[-_]?key|secret|token)$/iu;

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

function containsSensitiveKey(value) {
  if (Array.isArray(value)) return value.some(containsSensitiveKey);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, nested]) => SENSITIVE_KEYS.test(key) || containsSensitiveKey(nested));
}

function expectedRecordId(record) {
  return bareSha256([
    record.source.providerId,
    record.source.path,
    record.source.contentHash,
    record.source.sourceType,
    record.source.adapterId,
    String(record.source.normalizerVersion),
    record.agent.promptVersion,
    record.transition.fromHash || "unseen",
    record.agent.responseId || "no-response-id",
    record.agent.responseHash,
    record.createdAt,
    String(record.eventNonce)
  ].join("\u0000"));
}

export function validateCurationArtifacts({
  statePath = join(ROOT_DIR, "catalog", "curation", "source-state.json"),
  recordsDir = join(ROOT_DIR, "catalog", "curation", "records"),
  profilesPath,
  visualsPath,
  previewsDir
} = {}) {
  if (!existsSync(statePath)) throw new Error("Curation source-state.json is missing; create the checked-in baseline first.");
  const state = readJson(statePath);
  validateCurationState(state);
  const errors = [];
  const catalogDir = resolve(dirname(statePath), "..");
  const resolvedProfilesPath = profilesPath || join(catalogDir, "style-profiles.json");
  const resolvedVisualsPath = visualsPath || join(catalogDir, "style-visuals.json");
  const resolvedPreviewsDir = previewsDir || join(catalogDir, "previews");
  const profiles = existsSync(resolvedProfilesPath) ? readJson(resolvedProfilesPath) : [];
  const visuals = existsSync(resolvedVisualsPath) ? readJson(resolvedVisualsPath) : [];
  const profileIds = new Set(Array.isArray(profiles) ? profiles.map((profile) => profile?.id) : []);
  const visualIds = new Set(Array.isArray(visuals) ? visuals.map((visual) => visual?.styleId) : []);
  const profilesById = new Map(Array.isArray(profiles) ? profiles.map((profile) => [profile?.id, profile]) : []);
  const visualsById = new Map(Array.isArray(visuals) ? visuals.map((visual) => [visual?.styleId, visual]) : []);
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
    if (record?.schemaVersion !== CURATION_SCHEMA_VERSION) errors.push(`${file}: schemaVersion must be ${CURATION_SCHEMA_VERSION}`);
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
    if (record?.decision === "promoted" && !record?.promotion?.styleId) errors.push(`${file}: promoted decision requires promotion.styleId`);
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
    records.set(id, record);
  }

  for (const entry of state.sources) {
    if (entry.status === "baseline") continue;
    const record = records.get(entry.recordId);
    if (!record) {
      errors.push(`state entry ${entry.providerId}/${entry.path} references missing record ${entry.recordId}`);
      continue;
    }
    if (sourceKey(entry) !== sourceKey(record.source) || entry.processedHash !== record.source.contentHash) {
      errors.push(`state entry ${entry.providerId}/${entry.path} does not match record ${entry.recordId}`);
    }
    if (entry.status !== record.decision) errors.push(`state entry ${entry.providerId}/${entry.path} status does not match record decision`);
    if (entry.status === "promoted") {
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
