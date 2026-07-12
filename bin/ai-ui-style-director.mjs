#!/usr/bin/env node
import { resolve } from "node:path";
import { buildStyleCatalog, hostedCatalogInfo } from "../src/catalog-browser.mjs";
import {
  applyStyle,
  loadScenarioQuestions,
  openRecommendationGallery,
  openPreviewUrl,
  recommendationGalleryInfo,
  renderContextQuestions,
  renderRecommendations,
  recommendStyles,
  startRecommendationPreviewServer,
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
  recommend --brief <text> [--count 5] [--again] [--session <path>] [--open] [--json]
  browse [--open] [--json]
  preview [--path <recommendations.html>] [--open] [--serve] [--port <number>] [--json]
  apply --style <id> --project <path> [--brief <text>] [--force] [--json]
  sync [--cache-dir <path>] [--clone] [--json]
  refresh-catalog [--cache-dir <path>] [--generated-dir <path>] [--clone] [--json]
  questions [--json]

Compatibility aliases:
  serve               Alias for browse; opens the hosted catalog and no longer starts a local server
  update              Alias for refresh-catalog; does not update the installed skill

Examples:
  ai-ui-style-director recommend --brief "AI developer tool website"
  ai-ui-style-director recommend --brief "AI developer tool website" --again
  ai-ui-style-director recommend --brief "B2B operations dashboard" --open
  ai-ui-style-director browse --open
  ai-ui-style-director serve --open
  ai-ui-style-director preview --open
  ai-ui-style-director preview --serve
  ai-ui-style-director preview --serve --port 4173 --open
  ai-ui-style-director apply --style developer-product-minimal --project ./my-site --brief "AI SDK landing page"
  ai-ui-style-director refresh-catalog --clone
`;
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function serveUntilStopped(server, close) {
  return new Promise((resolvePromise, rejectPromise) => {
    let stopping = false;
    const cleanup = () => {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
      server.off("close", onClose);
      server.off("error", onError);
    };
    const onClose = () => {
      cleanup();
      resolvePromise();
    };
    const onError = (error) => {
      cleanup();
      rejectPromise(error);
    };
    const stop = () => {
      if (stopping) return;
      stopping = true;
      close().catch(onError);
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    server.once("close", onClose);
    server.once("error", onError);
  });
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
      if (args.open && !result.needsContext) {
        Object.assign(result, openRecommendationGallery(result.galleryPath));
      }
      if (args.json) printJson(result);
      else process.stdout.write(renderRecommendations(result));
      process.exitCode = 0;
      return;
    }

    if (command === "browse" || command === "serve") {
      if (args.port !== undefined) {
        throw new Error(
          "--port is no longer supported by browse/serve because the complete catalog is hosted on GitHub Pages. " +
          "Use preview --serve --port <number> only for a local recommendation gallery."
        );
      }
      const output = {
        ...hostedCatalogInfo({ catalog: buildStyleCatalog() }),
        opened: false
      };
      if (args.open) output.opened = openPreviewUrl(output.catalogUrl).opened;
      if (command === "serve") {
        process.stderr.write("serve is a compatibility alias for browse and no longer starts a local server.\n");
      }
      if (args.json) {
        printJson(output);
      } else {
        process.stdout.write(`Style catalog: ${output.catalogUrl}\n`);
        process.stdout.write(`Curated styles: ${output.styleCount} (${output.sourceCount} indexed source records)\n`);
        process.stdout.write(`${output.opened ? "Opened in the default browser." : "Pass --open to open it in the default browser."}\n`);
      }
      return;
    }

    if (command === "preview") {
      const galleryPath = args.path ? resolve(args.path) : resolve(".ui-style-director", "recommendations.html");
      if (args.serve) {
        const served = await startRecommendationPreviewServer(galleryPath, {
          port: args.port === undefined ? 0 : args.port
        });
        let opened = false;
        try {
          if (args.open) opened = openPreviewUrl(served.previewUrl).opened;
        } catch (error) {
          await served.close();
          throw error;
        }
        const output = {
          galleryPath: served.galleryPath,
          galleryUrl: served.galleryUrl,
          previewUrl: served.previewUrl,
          host: served.host,
          port: served.port,
          opened
        };
        if (args.json) {
          printJson(output);
        } else {
          process.stdout.write(`Preview server: ${output.previewUrl}\n`);
          process.stdout.write(`Gallery: ${output.galleryPath}\n`);
          process.stdout.write(`${opened ? "Opened in the default browser. " : ""}Press Ctrl+C to stop.\n`);
        }
        await serveUntilStopped(served.server, served.close);
        return;
      }
      const result = args.open
        ? openRecommendationGallery(galleryPath)
        : { ...recommendationGalleryInfo(galleryPath), opened: false };
      if (args.json) {
        printJson(result);
      } else {
        process.stdout.write(`Preview gallery: ${result.galleryUrl}\n`);
        process.stdout.write(`${result.opened ? "Opened in the default browser." : "Pass --open to open it in the default browser."}\n`);
      }
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
        process.stdout.write(`First-viewport draft: ${result.draftMarkdownPath}\n`);
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
