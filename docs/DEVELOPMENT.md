# Development and Maintenance

## Repository layout

```text
ai-ui-style-director/
  bin/                         # CLI entry point
  src/                         # recommendation, apply, and provider logic
  scripts/                     # deterministic preview generation
  catalog/                     # styles, visuals, previews, providers, and questions
  skills/web-style-director/   # agent skill
  examples/new-site/           # example brief and generated DESIGN.md
  docs/                        # detailed documentation
  test/                        # Node.js tests
```

The MVP has no runtime npm dependencies and requires Node.js 20 or newer.

## Checks

Run:

```bash
npm test
npm run check
```

`npm run check` validates JavaScript syntax and runs the test suite.

Regenerate style cards after changing `style-visuals.json` or preview rendering:

```bash
npm run previews
npm run previews:check
```

The check command verifies that every profile has one visual configuration,
three references, and an up-to-date committed SVG.

Validate the skill separately with the Codex `skill-creator` validator when it
is available:

```bash
python <skill-creator>/scripts/quick_validate.py skills/web-style-director
```

## Provider maintenance

Refresh provider-derived indexes with:

```bash
node bin/ai-ui-style-director.mjs refresh-catalog --clone
npm run check
```

`.github/workflows/refresh-providers.yml` performs this work daily and opens a
pull request if `catalog/generated/` changes.

## User-facing releases

Keep these surfaces consistent when installation layout or lifecycle behavior
changes:

- root `INSTALL.md`;
- `docs/PLATFORMS.md` and `docs/PLATFORMS.zh-CN.md`;
- `docs/VISUAL_PREVIEWS.md` and `docs/VISUAL_PREVIEWS.zh-CN.md`;
- `catalog/style-visuals.json` and `catalog/previews/`;
- `skills/web-style-director/SKILL.md`;
- `skills/web-style-director/references/lifecycle.md`;
- `skills/web-style-director/scripts/style-director.mjs`;
- the four operations shown in both README files.

An installed copy uses the repository as the CLI source and a separately
registered skill folder. Updating therefore refreshes the repository, redeploys
the skill folder, and verifies the installed wrapper.

The wrapper must keep these first-class discovery paths covered by tests:

- Codex repository under `$HOME/.codex/tools` with the skill under
  `$HOME/.agents/skills`;
- existing Codex skill installations under `$HOME/.codex/skills`;
- Claude Code repository and skill under `CLAUDE_CONFIG_DIR`, or `$HOME/.claude`
  when that variable is unset.
