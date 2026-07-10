# Installed Lifecycle

Use this reference only when the user explicitly asks to update or uninstall
`web-style-director`.

## Locate the installation

Locate the repository in this order:

1. `AI_UI_STYLE_DIRECTOR_HOME`, when set.
2. The repository containing the active skill, when the skill runs in place.
3. `~/.codex/tools/ai-ui-style-director` for the default Codex layout.

Resolve the active skill directory separately. Before changing anything,
confirm that the repository contains `INSTALL.md` and
`bin/ai-ui-style-director.mjs`.

## Execute the request

- For **update** or **upgrade**, read the located repository's `INSTALL.md` and
  follow its **Update** section.
- For **uninstall**, **remove**, or **delete**, read `INSTALL.md` completely,
  then follow its **Uninstall** section.

Do not translate a lifecycle request into the CLI compatibility command
`update`; that command only refreshes provider-derived catalog data.

Report the exact paths inspected or changed and the final verification result.
Never delete project `DESIGN.md`, `.ui-style-director/`, or website source code.
