#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { curateStyleSources } from "../src/curation.mjs";

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new Error(`Unexpected positional argument: ${token}`);
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function positiveInteger(value, fallback, name) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer.`);
  return parsed;
}

function writeResult(path, result) {
  const body = `${JSON.stringify(result, null, 2)}\n`;
  if (!path) {
    process.stdout.write(body);
    return;
  }
  const outputPath = resolve(path);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, body, "utf8");
  process.stdout.write(`Curation result: ${outputPath}\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rootDir = args.root ? resolve(args.root) : undefined;
  const options = {
    baseline: Boolean(args.baseline),
    clone: Boolean(args.clone),
    cacheDir: args["cache-dir"] ? resolve(args["cache-dir"]) : undefined,
    maxSources: positiveInteger(args["max-sources"], 5, "max-sources"),
    maxInputChars: positiveInteger(args["max-input-chars"], 80_000, "max-input-chars"),
    maxOutputTokens: positiveInteger(args["max-output-tokens"], 4_096, "max-output-tokens")
  };
  if (rootDir) options.rootDir = rootDir;
  if (options.cacheDir === undefined) delete options.cacheDir;
  const result = await curateStyleSources(options);
  writeResult(args.output, result);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
