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

const curationAllowlist =
  "^(catalog/style-profiles\\.json|catalog/style-visuals\\.json|catalog/curation/source-state\\.json|catalog/curation/records/[0-9a-f]{64}\\.json|catalog/previews/[a-z0-9]+(-[a-z0-9]+)*\\.svg)$";

test("curation workflow uses trusted main-only triggers and bounded execution", () => {
  assert.match(curationWorkflow, /schedule:\s*\n\s+- cron: "30 19 \* \* \*"/u);
  assert.match(curationWorkflow, /push:\s*\n\s+branches: \[main\]/u);
  assert.match(curationWorkflow, /workflow_dispatch:/u);
  assert.doesNotMatch(curationWorkflow, /^\s{2}pull_request:/mu);
  assert.match(curationWorkflow, /permissions:\s*\n\s+contents: read/u);
  assert.match(curationWorkflow, /if: github\.ref == 'refs\/heads\/main'/u);
  assert.match(curationWorkflow, /group: curate-style-sources/u);
  assert.match(curationWorkflow, /cancel-in-progress: false/u);
  assert.match(curationWorkflow, /timeout-minutes: 30/u);
  assert.match(curationWorkflow, /CURATOR_MAX_SOURCES: "5"/u);
  assert.match(curationWorkflow, /CURATOR_MAX_INPUT_CHARS: "80000"/u);
  assert.match(curationWorkflow, /CURATOR_MAX_OUTPUT_TOKENS: "4096"/u);
  assert.match(curationWorkflow, /CURATOR_MAX_RETRIES: "1"/u);
  assert.match(curationWorkflow, /CURATOR_REQUEST_TIMEOUT_MS: "120000"/u);
});

test("curation workflow calls Kimi through the OpenAI-compatible environment and supports a clean no-op", () => {
  assert.match(curationWorkflow, /CURATOR_BASE_URL: https:\/\/api\.kimi\.com\/coding\/v1/u);
  assert.match(curationWorkflow, /CURATOR_MODEL: kimi-for-coding/u);
  assert.match(curationWorkflow, /CURATOR_API_KEY: \$\{\{ secrets\.KIMI_CODE_API_KEY \}\}/u);
  assert.match(
    curationWorkflow,
    /node scripts\/curate-style-sources\.mjs \\\s*\n\s+--clone \\\s*\n\s+--cache-dir \.ui-style-director\/cache\/providers/u
  );
  assert.match(curationWorkflow, /--max-sources "\$CURATOR_MAX_SOURCES"/u);
  assert.match(curationWorkflow, /--max-input-chars "\$CURATOR_MAX_INPUT_CHARS"/u);
  assert.match(curationWorkflow, /--max-output-tokens "\$CURATOR_MAX_OUTPUT_TOKENS"/u);
  assert.match(curationWorkflow, /Reject undeclared changes on no-op/u);
  assert.match(curationWorkflow, /No new or changed source content was found/u);
});

test("write-capable GitHub App token is unavailable to the model and only created after gates pass", () => {
  const curateIndex = curationWorkflow.indexOf("- name: Curate changed sources");
  const validateIndex = curationWorkflow.indexOf("- name: Validate curated output");
  const tokenIndex = curationWorkflow.indexOf("- name: Create curation bot token");
  const publishIndex = curationWorkflow.indexOf("- name: Commit and open draft pull request");

  assert.ok(curateIndex >= 0);
  assert.ok(validateIndex > curateIndex);
  assert.ok(tokenIndex > validateIndex);
  assert.ok(publishIndex > tokenIndex);

  const modelStep = curationWorkflow.slice(curateIndex, curationWorkflow.indexOf("- name: Read curation result"));
  assert.doesNotMatch(modelStep, /REFRESH_APP|GH_TOKEN|app-token/u);
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
  assert.match(curationWorkflow, /catalog\/curation\/records/u);
  assert.match(curationWorkflow, /Pinned provider revision and source content hash: passed/u);
  assert.match(curationWorkflow, /Input tokens:/u);
  assert.match(curationWorkflow, /Output tokens:/u);
  assert.match(curationWorkflow, /`skipped=\$\{count\("skipped"\)\}`/u);
  assert.match(curationWorkflow, /SKIPPED: \$\{\{ steps\.result\.outputs\.skipped \}\}/u);
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
