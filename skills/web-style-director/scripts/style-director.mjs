#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..", "..", "..");
const binPath = join(repoRoot, "bin", "ai-ui-style-director.mjs");

if (!existsSync(binPath)) {
  process.stderr.write(`Cannot find ai-ui-style-director CLI at ${binPath}\n`);
  process.exit(1);
}

const result = spawnSync(process.execPath, [binPath, ...process.argv.slice(2)], {
  stdio: "inherit",
  cwd: process.cwd()
});

process.exit(result.status ?? 1);

