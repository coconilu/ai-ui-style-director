import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const curationWorkflow = readFileSync(
  join(rootDir, ".github", "workflows", "curate-style-sources.yml"),
  "utf8"
);
const ciWorkflow = readFileSync(join(rootDir, ".github", "workflows", "ci.yml"), "utf8");
const pagesWorkflow = readFileSync(join(rootDir, ".github", "workflows", "pages.yml"), "utf8");

const curationAllowlist =
  "^(catalog/style-(directions|themes|direction-themes|preview-specs)\\.json|catalog/curation/source-state\\.json|catalog/curation/records/[0-9a-f]{64}\\.json)$";

test("curation allowlist accepts canonical v2 artifacts and rejects legacy catalog mutations", () => {
  const allowed = new RegExp(curationAllowlist, "u");
  for (const path of [
    "catalog/style-directions.json",
    "catalog/style-themes.json",
    "catalog/style-direction-themes.json",
    "catalog/style-preview-specs.json",
    "catalog/curation/source-state.json",
    `catalog/curation/records/${"a".repeat(64)}.json`
  ]) {
    assert.match(path, allowed);
  }
  for (const path of [
    "catalog/style-profiles.json",
    "catalog/style-visuals.json",
    "catalog/style-aliases.json",
    "catalog/previews/legacy-style.svg"
  ]) {
    assert.doesNotMatch(path, allowed);
  }
});

test("curation workflow uses trusted main-only triggers and bounded execution", () => {
  assert.match(curationWorkflow, /schedule:\s*\n\s+- cron: "30 19 \* \* \*"/u);
  assert.match(curationWorkflow, /push:\s*\n\s+branches: \[main\]/u);
  assert.match(curationWorkflow, /paths:\s*\n\s+- catalog\/providers\.json/u);
  assert.match(curationWorkflow, /- src\/curation\.mjs/u);
  assert.match(curationWorkflow, /- src\/experience-types\.mjs/u);
  assert.match(curationWorkflow, /- src\/provider-adapters\.mjs/u);
  assert.match(curationWorkflow, /workflow_dispatch:/u);
  assert.match(curationWorkflow, /curator_provider:\s*\n\s+description: Model provider for this run/u);
  assert.doesNotMatch(curationWorkflow, /^\s{2}pull_request:/mu);
  assert.match(curationWorkflow, /permissions:\s*\n\s+contents: read/u);
  assert.match(curationWorkflow, /pull-requests: read/u);
  assert.match(curationWorkflow, /if: github\.ref == 'refs\/heads\/main'/u);
  assert.match(curationWorkflow, /group: curate-style-sources/u);
  assert.match(curationWorkflow, /cancel-in-progress: false/u);
  assert.match(curationWorkflow, /timeout-minutes: 120/u);
  assert.match(curationWorkflow, /CURATOR_BATCH_SIZE: "5"/u);
  assert.match(curationWorkflow, /CURATOR_MAX_INPUT_CHARS: "80000"/u);
  assert.match(curationWorkflow, /CURATOR_MAX_OUTPUT_TOKENS: "4096"/u);
  assert.match(curationWorkflow, /CURATOR_MAX_RETRIES: "1"/u);
  assert.match(curationWorkflow, /CURATOR_REQUEST_TIMEOUT_MS: "120000"/u);
});

test("Catalog Pages exposes read-only same-repository PR previews without deploying them", () => {
  const buildJobIndex = pagesWorkflow.indexOf("  build:");
  const deployJobIndex = pagesWorkflow.indexOf("\n  deploy:");
  const buildJob = pagesWorkflow.slice(buildJobIndex, deployJobIndex);

  assert.ok(buildJobIndex >= 0);
  assert.ok(deployJobIndex > buildJobIndex);
  assert.doesNotMatch(pagesWorkflow, /pull_request_target/u);
  assert.match(pagesWorkflow, /permissions:\s*\n\s+contents: read/u);
  assert.doesNotMatch(buildJob, /pull-requests: write|pages: write|id-token: write/u);
  assert.equal(
    [...pagesWorkflow.matchAll(
      /if: github\.event_name == 'pull_request' && github\.event\.pull_request\.head\.repo\.full_name == github\.repository/gu
    )].length,
    2
  );
  assert.match(pagesWorkflow, /uses: actions\/upload-artifact@v7/u);
  assert.match(
    pagesWorkflow,
    /name: catalog-preview-pr-\$\{\{ github\.event\.pull_request\.number \}\}-attempt-\$\{\{ github\.run_attempt \}\}/u
  );
  assert.match(pagesWorkflow, /path: dist\/pages/u);
  assert.match(pagesWorkflow, /if-no-files-found: error/u);
  assert.match(pagesWorkflow, /include-hidden-files: false/u);
  assert.match(pagesWorkflow, /retention-days: 7/u);
  assert.match(pagesWorkflow, /steps\.pr-preview\.outputs\.artifact-url/u);
  assert.match(pagesWorkflow, /steps\.pr-preview\.outputs\.artifact-digest/u);
  assert.match(pagesWorkflow, /GITHUB_STEP_SUMMARY/u);
  assert.match(pagesWorkflow, /python -m http\.server --bind 127\.0\.0\.1 --directory \. 4173/u);
  assert.match(
    pagesWorkflow,
    /- name: Upload Pages artifact\s*\n\s+if: github\.event_name != 'pull_request'/u
  );
  assert.match(
    pagesWorkflow,
    /deploy:\s*\n\s+if: github\.event_name != 'pull_request' && github\.ref == 'refs\/heads\/main'/u
  );
});

test("curation workflow defaults to DeepSeek, preserves Kimi fallback, and supports a clean no-op", () => {
  assert.match(curationWorkflow, /CURATOR_PROVIDER: \$\{\{ github\.event\.inputs\.curator_provider \|\| vars\.CURATOR_PROVIDER \|\| 'deepseek' \}\}/u);
  assert.match(curationWorkflow, /CURATOR_BASE_URL=https:\/\/api\.deepseek\.com/u);
  assert.match(curationWorkflow, /CURATOR_MODEL=deepseek-v4-flash/u);
  assert.match(curationWorkflow, /CURATOR_TEMPERATURE=0/u);
  assert.match(curationWorkflow, /echo "CURATOR_THINKING=disabled"/u);
  assert.match(curationWorkflow, /CURATOR_API_KEY: \$\{\{ secrets\.DEEPSEEK_API_KEY \}\}/u);
  assert.match(curationWorkflow, /CURATOR_BASE_URL=https:\/\/api\.kimi\.com\/coding\/v1/u);
  assert.match(curationWorkflow, /CURATOR_MODEL=kimi-for-coding/u);
  assert.match(curationWorkflow, /CURATOR_TEMPERATURE=1/u);
  assert.match(curationWorkflow, /echo "CURATOR_THINKING="/u);
  assert.match(curationWorkflow, /CURATOR_API_KEY: \$\{\{ secrets\.KIMI_CODE_API_KEY \}\}/u);
  assert.match(curationWorkflow, /Unsupported CURATOR_PROVIDER/u);
  assert.match(
    curationWorkflow,
    /node scripts\/curate-style-sources\.mjs \\\s*\n\s+--drain \\\s*\n\s+--clone \\\s*\n\s+--cache-dir \.ui-style-director\/cache\/providers/u
  );
  assert.match(curationWorkflow, /--batch-size "\$CURATOR_BATCH_SIZE"/u);
  assert.match(curationWorkflow, /--max-input-chars "\$CURATOR_MAX_INPUT_CHARS"/u);
  assert.match(curationWorkflow, /--max-output-tokens "\$CURATOR_MAX_OUTPUT_TOKENS"/u);
  assert.match(curationWorkflow, /Reject undeclared changes on no-op/u);
  assert.match(curationWorkflow, /No new or changed source content was found/u);
  assert.match(curationWorkflow, /curation drain must finish with zero remaining sources/u);
  assert.match(curationWorkflow, /curation drain must process all/u);
  assert.match(curationWorkflow, /Detect existing curation pull request/u);
  assert.match(curationWorkflow, /gh pr list --state open --limit 1000/u);
  assert.match(curationWorkflow, /startswith\("automation\/curate-style-sources-"\)/u);
  assert.match(curationWorkflow, /steps\.guard\.outputs\.skip != 'true'/u);
});

test("write-capable GitHub App token is unavailable to the model and only created after gates pass", () => {
  const guardIndex = curationWorkflow.indexOf("- name: Detect existing curation pull request");
  const curateIndex = curationWorkflow.indexOf("- name: Curate changed sources with DeepSeek");
  const validateIndex = curationWorkflow.indexOf("- name: Validate curated output");
  const tokenIndex = curationWorkflow.indexOf("- name: Create curation bot token");
  const publishIndex = curationWorkflow.indexOf("- name: Commit and open draft pull request");

  assert.ok(guardIndex >= 0);
  assert.ok(curateIndex > guardIndex);
  assert.ok(validateIndex > curateIndex);
  assert.ok(tokenIndex > validateIndex);
  assert.ok(publishIndex > tokenIndex);

  const modelStep = curationWorkflow.slice(curateIndex, curationWorkflow.indexOf("- name: Read curation result"));
  assert.doesNotMatch(modelStep, /REFRESH_APP|GH_TOKEN|app-token/u);
  const kimiIndex = modelStep.indexOf("- name: Curate changed sources with Kimi");
  const deepseekStep = modelStep.slice(0, kimiIndex);
  const kimiStep = modelStep.slice(kimiIndex);
  assert.match(deepseekStep, /secrets\.DEEPSEEK_API_KEY/u);
  assert.doesNotMatch(deepseekStep, /secrets\.KIMI_CODE_API_KEY/u);
  assert.match(kimiStep, /secrets\.KIMI_CODE_API_KEY/u);
  assert.doesNotMatch(kimiStep, /secrets\.DEEPSEEK_API_KEY/u);
  const guardStep = curationWorkflow.slice(guardIndex, curationWorkflow.indexOf("- name: Validate trusted base"));
  assert.match(guardStep, /GH_TOKEN: \$\{\{ github\.token \}\}/u);
  assert.match(curationWorkflow, /persist-credentials: false/u);
  assert.match(curationWorkflow, /actions\/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1 # v3/u);
  assert.match(curationWorkflow, /client-id: \$\{\{ vars\.REFRESH_APP_CLIENT_ID \}\}/u);
  assert.match(curationWorkflow, /private-key: \$\{\{ secrets\.REFRESH_APP_PRIVATE_KEY \}\}/u);
  assert.match(curationWorkflow, /permission-contents: write/u);
  assert.match(curationWorkflow, /permission-pull-requests: write/u);
});

test("curation automation leaves an allowlisted, append-only draft PR for maintainer review", () => {
  const workflowAllowlists = [...curationWorkflow.matchAll(/allowed='([^']+)'/gu)].map((match) => match[1]);
  assert.deepEqual(workflowAllowlists, [curationAllowlist, curationAllowlist]);
  assert.match(curationWorkflow, /catalog\/style-directions\.json/u);
  assert.match(curationWorkflow, /catalog\/style-themes\.json/u);
  assert.match(curationWorkflow, /catalog\/style-direction-themes\.json/u);
  assert.match(curationWorkflow, /catalog\/style-preview-specs\.json/u);
  assert.doesNotMatch(curationAllowlist, /style-profiles|style-visuals|style-aliases|catalog\/previews/u);
  assert.match(curationWorkflow, /catalog\/curation\/records/u);
  assert.match(curationWorkflow, /Pinned provider revision and source content hash: passed/u);
  assert.match(curationWorkflow, /Input tokens:/u);
  assert.match(curationWorkflow, /Output tokens:/u);
  assert.match(curationWorkflow, /Batch size:/u);
  assert.match(curationWorkflow, /Pending at start:/u);
  assert.match(curationWorkflow, /records\.length > 50/u);
  assert.match(curationWorkflow, /`skipped=\$\{count\("skipped"\)\}`/u);
  assert.match(curationWorkflow, /created_direction_and_theme=\$\{actionCount\("created-direction-and-theme"\)\}/u);
  assert.match(curationWorkflow, /created_direction_with_existing_theme=\$\{actionCount\("created-direction-with-existing-theme"\)\}/u);
  assert.match(curationWorkflow, /added_theme_to_direction=\$\{actionCount\("added-theme-to-direction"\)\}/u);
  assert.match(curationWorkflow, /linked_existing_theme=\$\{actionCount\("linked-existing-theme"\)\}/u);
  assert.match(curationWorkflow, /duplicate_theme=\$\{actionCount\("duplicate-theme"\)\}/u);
  assert.match(curationWorkflow, /SKIPPED: \$\{\{ steps\.result\.outputs\.skipped \}\}/u);
  assert.match(curationWorkflow, /Direction: \$\{directionId\} \| Theme: \$\{themeId\}/u);
  assert.match(curationWorkflow, /Created Direction \+ Theme:/u);
  assert.match(curationWorkflow, /Created Direction with existing Theme:/u);
  assert.match(curationWorkflow, /Added Theme to Direction:/u);
  assert.match(curationWorkflow, /Linked existing Theme:/u);
  assert.match(curationWorkflow, /Duplicate Theme:/u);
  assert.match(curationWorkflow, /Pull-request catalog preview: download it from the Catalog Pages build summary/u);
  assert.doesNotMatch(curationWorkflow, / — /u);
  assert.match(curationWorkflow, /gh pr create/u);
  assert.match(curationWorkflow, /--head "\$branch" \\\s*\n\s+--draft\)"/u);
  assert.match(curationWorkflow, /Review policy: created as a draft; a maintainer must review, mark it ready, and merge it manually\./u);
  assert.match(curationWorkflow, /Review: maintainer review and manual merge required/u);
  assert.doesNotMatch(curationWorkflow, /gh pr merge|--auto/u);
  assert.match(curationWorkflow, /automation\/curate-style-sources-\$\{GITHUB_RUN_ID\}-\$\{GITHUB_RUN_ATTEMPT\}/u);
  assert.match(curationWorkflow, /git diff --quiet "\$GITHUB_SHA" origin\/main -- \\\s*\n\s+catalog \\\s*\n\s+src \\\s*\n\s+scripts/u);
  assert.match(curationWorkflow, /git rebase origin\/main\s*\n\s+npm run check/u);

  assert.match(ciWorkflow, /startsWith\(github\.head_ref, 'automation\/curate-style-sources-'\)/u);
  assert.match(ciWorkflow, new RegExp(`allowed='${curationAllowlist.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}'`, "u"));
  assert.match(ciWorkflow, /Curation records are append-only/u);
  assert.match(ciWorkflow, /must add at least one immutable curation record/u);
  assert.match(ciWorkflow, /must update catalog\/curation\/source-state\.json/u);
});
