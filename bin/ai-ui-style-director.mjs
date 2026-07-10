#!/usr/bin/env node
import { resolve } from "node:path";
import {
  applyStyle,
  loadScenarioQuestions,
  renderContextQuestions,
  renderRecommendations,
  recommendStyles,
  syncProviders,
  updateCatalog
} from "../src/core.mjs";

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      args._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function usage() {
  return `ai-ui-style-director

Commands:
  recommend --brief <text> [--count 5] [--again] [--session <path>] [--json]
  apply --style <id> --project <path> [--brief <text>] [--force] [--json]
  sync [--cache-dir <path>] [--clone] [--json]
  refresh-catalog [--cache-dir <path>] [--generated-dir <path>] [--clone] [--json]
  questions [--json]

Compatibility aliases:
  update              Alias for refresh-catalog; does not update the installed skill

Examples:
  ai-ui-style-director recommend --brief "AI developer tool website"
  ai-ui-style-director recommend --brief "AI developer tool website" --again
  ai-ui-style-director apply --style developer-product-minimal --project ./my-site --brief "AI SDK landing page"
  ai-ui-style-director refresh-catalog --clone
`;
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0] || "help";

  try {
    if (command === "help" || args.help) {
      process.stdout.write(usage());
      return;
    }

    if (command === "questions") {
      const result = { questions: loadScenarioQuestions() };
      if (args.json) printJson(result);
      else process.stdout.write(renderContextQuestions({ questions: result.questions }));
      return;
    }

    if (command === "recommend") {
      const result = recommendStyles({
        brief: args.brief || "",
        count: Number(args.count || 5),
        again: Boolean(args.again),
        sessionPath: args.session ? resolve(args.session) : resolve(".ui-style-director", "session.json")
      });
      if (args.json) printJson(result);
      else process.stdout.write(renderRecommendations(result));
      process.exitCode = 0;
      return;
    }

    if (command === "apply") {
      const result = applyStyle({
        styleId: args.style,
        projectDir: args.project || process.cwd(),
        brief: args.brief || "",
        force: Boolean(args.force)
      });
      if (args.json) {
        printJson(result);
      } else {
        process.stdout.write(`Generated ${result.designPath}\n`);
        process.stdout.write(`State directory: ${result.stateDir}\n`);
        process.stdout.write(`Selected style: ${result.style.name} (${result.style.id})\n`);
      }
      return;
    }

    if (command === "sync") {
      const result = syncProviders({
        cacheDir: args["cache-dir"] ? resolve(args["cache-dir"]) : resolve(".ui-style-director", "cache", "providers"),
        clone: Boolean(args.clone)
      });
      if (args.json) printJson(result);
      else {
        process.stdout.write(`Provider lock: ${result.lockPath}\n`);
        for (const provider of result.providers) {
          process.stdout.write(`- ${provider.id}: ${provider.status} (${provider.repo})\n`);
        }
      }
      return;
    }

    if (command === "refresh-catalog" || command === "update") {
      const result = updateCatalog({
        cacheDir: args["cache-dir"] ? resolve(args["cache-dir"]) : resolve(".ui-style-director", "cache", "providers"),
        generatedDir: args["generated-dir"] ? resolve(args["generated-dir"]) : undefined,
        clone: Boolean(args.clone)
      });
      if (args.json) {
        printJson(result);
      } else {
        process.stdout.write(`Generated provider index files:\n`);
        for (const file of result.generatedFiles) {
          process.stdout.write(`- ${file}\n`);
        }
        process.stdout.write(`Style sources: ${result.styleSourceCount}\n`);
        process.stdout.write(`Component sources: ${result.componentSourceCount}\n`);
        for (const provider of result.providers) {
          process.stdout.write(
            `- ${provider.id}: ${provider.cachePresent ? provider.revision || "cached" : "not cached"} ` +
              `(DESIGN.md ${provider.counts.designMdFiles}, registry ${provider.counts.registryFiles}, docs ${provider.counts.docsFiles})\n`
          );
        }
      }
      return;
    }

    process.stderr.write(`Unknown command: ${command}\n\n${usage()}`);
    process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

main();
