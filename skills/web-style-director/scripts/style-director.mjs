#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const homeDir = homedir();
const claudeConfigDir = process.env.CLAUDE_CONFIG_DIR
  ? resolve(process.env.CLAUDE_CONFIG_DIR)
  : join(homeDir, ".claude");
const relativeToClaudeConfig = relative(claudeConfigDir, scriptDir);
const runsFromClaudeConfig =
  relativeToClaudeConfig === "" ||
  (!relativeToClaudeConfig.startsWith("..") && !isAbsolute(relativeToClaudeConfig));
const codexRoots = [
  join(homeDir, ".codex", "tools", "ai-ui-style-director"),
  join(homeDir, ".agents", "skills", "web-style-director", "assets", "ai-ui-style-director"),
  join(homeDir, ".codex", "skills", "web-style-director", "assets", "ai-ui-style-director")
];
const claudeRoots = [
  join(claudeConfigDir, "tools", "ai-ui-style-director"),
  join(claudeConfigDir, "skills", "web-style-director", "assets", "ai-ui-style-director")
];
const candidateRoots = [
  process.env.AI_UI_STYLE_DIRECTOR_HOME,
  resolve(scriptDir, "..", "..", ".."),
  resolve(scriptDir, "..", "assets", "ai-ui-style-director"),
  ...(runsFromClaudeConfig ? [...claudeRoots, ...codexRoots] : [...codexRoots, ...claudeRoots])
].filter(Boolean);

const repoRoot = candidateRoots.find((root) => existsSync(join(root, "bin", "ai-ui-style-director.mjs")));

if (!repoRoot) {
  process.stderr.write("Cannot find ai-ui-style-director CLI.\n\n");
  process.stderr.write("Install one of these layouts:\n");
  process.stderr.write("- Codex: clone the repo to ~/.codex/tools/ai-ui-style-director\n");
  process.stderr.write("- Claude Code: clone the repo to ${CLAUDE_CONFIG_DIR:-~/.claude}/tools/ai-ui-style-director\n");
  process.stderr.write("- Or set AI_UI_STYLE_DIRECTOR_HOME to the cloned repo path\n");
  process.stderr.write("- Or keep this skill inside the repository at skills/web-style-director\n");
  process.stderr.write("\nInstall instructions:\n");
  process.stderr.write("https://raw.githubusercontent.com/coconilu/ai-ui-style-director/main/INSTALL.md\n");
  process.exit(1);
}

const binPath = join(repoRoot, "bin", "ai-ui-style-director.mjs");
const result = spawnSync(process.execPath, [binPath, ...process.argv.slice(2)], {
  stdio: "inherit",
  cwd: process.cwd()
});

process.exit(result.status ?? 1);
