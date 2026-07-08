#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const candidateRoots = [
  process.env.AI_UI_STYLE_DIRECTOR_HOME,
  resolve(scriptDir, "..", "..", ".."),
  resolve(scriptDir, "..", "assets", "ai-ui-style-director"),
  join(homedir(), ".codex", "tools", "ai-ui-style-director"),
  join(homedir(), ".codex", "skills", "web-style-director", "assets", "ai-ui-style-director")
].filter(Boolean);

const repoRoot = candidateRoots.find((root) => existsSync(join(root, "bin", "ai-ui-style-director.mjs")));

if (!repoRoot) {
  process.stderr.write("Cannot find ai-ui-style-director CLI.\n\n");
  process.stderr.write("Install one of these layouts:\n");
  process.stderr.write("- Clone the repo to ~/.codex/tools/ai-ui-style-director\n");
  process.stderr.write("- Or set AI_UI_STYLE_DIRECTOR_HOME to the cloned repo path\n");
  process.stderr.write("- Or keep this skill inside the repository at skills/web-style-director\n");
  process.exit(1);
}

const binPath = join(repoRoot, "bin", "ai-ui-style-director.mjs");
const result = spawnSync(process.execPath, [binPath, ...process.argv.slice(2)], {
  stdio: "inherit",
  cwd: process.cwd()
});

process.exit(result.status ?? 1);
