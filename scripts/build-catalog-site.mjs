#!/usr/bin/env node
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, parse, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildStyleCatalog,
  buildStyleCatalogStaticAssets
} from "../src/catalog-browser.mjs";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST_DIR = join(ROOT_DIR, "dist");

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--json") {
      args.json = true;
      continue;
    }
    if (token === "--output") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--output requires a directory path");
      args.output = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown catalog build option: ${token}`);
  }
  return args;
}

function safeAssetOutputPath(outputDir, assetPath) {
  if (isAbsolute(assetPath)) throw new Error(`Catalog asset path must be relative: ${assetPath}`);
  const outputPath = resolve(outputDir, assetPath);
  const relativePath = relative(outputDir, outputPath);
  if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error(`Catalog asset escapes output directory: ${assetPath}`);
  }
  return outputPath;
}

function isDescendant(parentDir, candidateDir) {
  const relativePath = relative(parentDir, candidateDir);
  return Boolean(relativePath) && !relativePath.startsWith("..") && !isAbsolute(relativePath);
}

function safeCatalogOutputDir(outputDir, { allowExternalOutput = false } = {}) {
  const resolvedOutputDir = resolve(outputDir);
  const filesystemRoot = parse(resolvedOutputDir).root;
  const outputContainsRepository = resolvedOutputDir === ROOT_DIR
    || isDescendant(resolvedOutputDir, ROOT_DIR);
  const outputInsideRepository = isDescendant(ROOT_DIR, resolvedOutputDir);
  const outputInsideDist = isDescendant(DIST_DIR, resolvedOutputDir);

  if (resolvedOutputDir === filesystemRoot || outputContainsRepository) {
    throw new Error(`Refusing to replace unsafe catalog output directory: ${resolvedOutputDir}`);
  }
  if (outputInsideRepository && !outputInsideDist) {
    throw new Error(`Catalog output directory must be inside ${DIST_DIR}: ${resolvedOutputDir}`);
  }
  if (!outputInsideRepository && !allowExternalOutput) {
    throw new Error(
      `Catalog output directory must be inside ${DIST_DIR}; external output requires an explicit override: ${resolvedOutputDir}`
    );
  }
  return resolvedOutputDir;
}

export function writeCatalogSite({
  outputDir = join(ROOT_DIR, "dist", "pages"),
  catalog = buildStyleCatalog(),
  allowExternalOutput = false
} = {}) {
  const resolvedOutputDir = safeCatalogOutputDir(outputDir, { allowExternalOutput });

  const { assets } = buildStyleCatalogStaticAssets({ catalog });
  rmSync(resolvedOutputDir, { recursive: true, force: true });
  mkdirSync(resolvedOutputDir, { recursive: true });

  let totalBytes = 0;
  for (const [assetPath, asset] of assets) {
    const outputPath = safeAssetOutputPath(resolvedOutputDir, assetPath);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, asset.body, "utf8");
    totalBytes += Buffer.byteLength(asset.body, "utf8");
  }

  return {
    outputDir: resolvedOutputDir,
    catalogRevision: catalog.catalogRevision,
    styleCount: catalog.styleCount,
    sourceCount: catalog.sourceCount,
    fileCount: assets.size,
    totalBytes
  };
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = writeCatalogSite({
      outputDir: args.output ? resolve(args.output) : undefined
    });
    if (args.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    else {
      process.stdout.write(
        `Built catalog site: ${result.outputDir} ` +
        `(${result.styleCount} styles, ${result.fileCount} files, revision ${result.catalogRevision})\n`
      );
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
