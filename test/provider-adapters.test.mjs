import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { validateCuratedCatalog } from "../scripts/validate-curated-catalog.mjs";
import { renderRecommendationGalleryHtml, renderRecommendations } from "../src/core.mjs";
import {
  buildStyleSourceRecords,
  expandProviderReference,
  hashStyleSourceContent,
  resolveProviderAdapter,
  visualReferenceSource
} from "../src/provider-adapters.mjs";
import { expandVisualReferences } from "../src/preview.mjs";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");

test("generic design-md adapter builds stable content-hashed source records", () => {
  const dir = mkdtempSync(join(tmpdir(), "style-director-provider-adapter-"));
  const sourcePath = join(dir, "styles", "calm", "DESIGN.md");
  mkdirSync(dirname(sourcePath), { recursive: true });
  writeFileSync(sourcePath, "# Calm\r\n\r\nA quiet interface.\r\n", "utf8");
  const windowsHash = hashStyleSourceContent(sourcePath);
  writeFileSync(sourcePath, "# Calm\n\nA quiet interface.\n", "utf8");
  assert.equal(hashStyleSourceContent(sourcePath), windowsHash);

  const records = buildStyleSourceRecords({
    provider: { id: "example-styles", adapter: "generic-design-md" },
    providerDir: dir,
    paths: ["styles/calm/DESIGN.md"]
  });
  assert.deepEqual(records, [
    {
      providerId: "example-styles",
      path: "styles/calm/DESIGN.md",
      sourceType: "design-md",
      contentHash: windowsHash
    }
  ]);
  assert.equal(resolveProviderAdapter({ id: "another-provider" }).id, "generic-design-md");
  assert.throws(
    () => resolveProviderAdapter({ id: "bad-provider", adapter: "not-real" }),
    /Unknown provider adapter/u
  );
});

test("legacy awesome-design-md references preserve the existing getdesign URLs", () => {
  const [reference] = expandVisualReferences([
    { provider: "awesome-design-md", slug: "linear.app", label: "Linear", role: "app shell" }
  ]);
  assert.equal(reference.pageUrl, "https://getdesign.md/linear.app/design-md");
  assert.equal(reference.lightPreviewUrl, "https://getdesign.md/design-md/linear.app/preview.html");
  assert.equal(reference.darkPreviewUrl, "https://getdesign.md/design-md/linear.app/preview-dark.html");
  assert.deepEqual(visualReferenceSource(reference), {
    providerId: "awesome-design-md",
    path: "design-md/linear.app/DESIGN.md"
  });
});

test("exact provider paths expand to revision-pinned GitHub source pages", () => {
  const revision = "a".repeat(40);
  const reference = expandProviderReference(
    {
      provider: "example-styles",
      path: "styles/calm ui/DESIGN.md",
      label: "Calm UI",
      role: "quiet information hierarchy"
    },
    {
      providers: [{ id: "example-styles", repo: "example/ui-styles" }],
      providerInventory: { providers: [{ id: "example-styles", revision }] }
    }
  );
  assert.equal(
    reference.pageUrl,
    `https://github.com/example/ui-styles/blob/${revision}/styles/calm%20ui/DESIGN.md`
  );
  assert.equal(reference.lightPreviewUrl, undefined);
  assert.deepEqual(visualReferenceSource(reference), {
    providerId: "example-styles",
    path: "styles/calm ui/DESIGN.md"
  });
});

test("consumer recommendation surfaces fall back to a generic pinned source link", () => {
  const dir = mkdtempSync(join(tmpdir(), "style-director-generic-consumer-"));
  const previewPath = join(dir, "preview.svg");
  writeFileSync(previewPath, '<svg xmlns="http://www.w3.org/2000/svg"/>\n', "utf8");
  const pageUrl = `https://github.com/example/ui-styles/blob/${"a".repeat(40)}/styles/calm/DESIGN.md`;
  const result = {
    brief: "developer documentation",
    needsContext: false,
    exhausted: false,
    galleryUrl: "file:///tmp/recommendations.html",
    galleryPath: "/tmp/recommendations.html",
    sessionPath: "/tmp/session.json",
    recommendations: [{
      rank: 1,
      id: "generic-calm",
      name: "Generic Calm",
      score: 10,
      bestFor: ["Developer documentation"],
      firstViewport: "Calm document shell.",
      componentKits: ["shadcn-ui"],
      risks: ["May feel quiet."],
      visual: {
        previewCardPath: previewPath,
        previewCardMarkdownPath: previewPath.replaceAll("\\", "/"),
        references: [{ label: "Calm source", role: "quiet hierarchy", pageUrl }]
      }
    }]
  };
  const html = renderRecommendationGalleryHtml(result);
  assert.match(html, new RegExp(pageUrl.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  assert.match(html, />Source<\/a>/u);
  assert.doesNotMatch(html, /href="undefined"/u);
  const terminal = renderRecommendations(result);
  assert.match(terminal, /Source reference: Calm source/u);
  assert.doesNotMatch(terminal, /undefined/u);
});

test("curated catalog validator accepts exact generic reference paths", () => {
  const dir = mkdtempSync(join(tmpdir(), "style-director-generic-reference-"));
  const previewsDir = join(dir, "previews");
  mkdirSync(previewsDir, { recursive: true });
  const profile = JSON.parse(readFileSync(join(rootDir, "catalog", "style-profiles.json"), "utf8"))[0];
  profile.sourceProvider = "example-styles";
  profile.sourceSlug = "calm";
  profile.sourcePath = "styles/calm/DESIGN.md";
  profile.sourceRepo = "example/ui-styles";
  profile.sourceRevision = "a".repeat(40);
  profile.sourceContentHash = `sha256:${"b".repeat(64)}`;
  profile.sourceUrl = `https://github.com/example/ui-styles/blob/${"a".repeat(40)}/styles/calm/DESIGN.md`;
  const visual = JSON.parse(readFileSync(join(rootDir, "catalog", "style-visuals.json"), "utf8"))[0];
  visual.references = ["calm", "dense", "editorial"].map((slug) => ({
    provider: "example-styles",
    path: `styles/${slug}/DESIGN.md`,
    repo: "example/ui-styles",
    revision: "a".repeat(40),
    contentHash: `sha256:${"b".repeat(64)}`,
    sourceUrl: `https://github.com/example/ui-styles/blob/${"a".repeat(40)}/styles/${slug}/DESIGN.md`,
    label: slug,
    role: `${slug} reference role`
  }));

  const profilesPath = join(dir, "style-profiles.json");
  const visualsPath = join(dir, "style-visuals.json");
  const styleSourcesPath = join(dir, "style-sources.json");
  const policyPath = join(dir, "curation-policy.json");
  writeFileSync(profilesPath, `${JSON.stringify([profile], null, 2)}\n`, "utf8");
  writeFileSync(visualsPath, `${JSON.stringify([visual], null, 2)}\n`, "utf8");
  writeFileSync(
    styleSourcesPath,
    `${JSON.stringify({
      schemaVersion: 3,
      sources: visual.references.map((reference) => ({
        providerId: reference.provider,
        path: reference.path,
        sourceType: "design-md",
        contentHash: `sha256:${"b".repeat(64)}`
      }))
    }, null, 2)}\n`,
    "utf8"
  );
  writeFileSync(
    policyPath,
    `${JSON.stringify({
      schemaVersion: 1,
      requiredFamilies: [profile.family],
      minimumProfilesPerFamily: 1,
      minimumVisualVariantsPerFamily: 1
    }, null, 2)}\n`,
    "utf8"
  );
  copyFileSync(join(rootDir, "catalog", "previews", `${profile.id}.svg`), join(previewsDir, `${profile.id}.svg`));

  const fixture = { profilesPath, visualsPath, styleSourcesPath, previewsDir, policyPath };
  assert.equal(validateCuratedCatalog(fixture).referenceCount, 3);

  profile.sourcePath = "styles/missing/DESIGN.md";
  writeFileSync(profilesPath, `${JSON.stringify([profile], null, 2)}\n`, "utf8");
  assert.throws(
    () => validateCuratedCatalog(fixture),
    /sourceProvider\/sourcePath is missing from style-sources\.json/u
  );
  profile.sourcePath = "styles/calm/DESIGN.md";
  writeFileSync(profilesPath, `${JSON.stringify([profile], null, 2)}\n`, "utf8");

  visual.references[0] = {
    provider: "example-styles",
    slug: "calm",
    label: "calm",
    role: "invalid generic slug"
  };
  writeFileSync(visualsPath, `${JSON.stringify([visual], null, 2)}\n`, "utf8");
  assert.throws(
    () => validateCuratedCatalog(fixture),
    /exact provider\/path reference or a legacy awesome-design-md slug/u
  );
});
