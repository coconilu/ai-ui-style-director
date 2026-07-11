# Web Style Director Agent Setup

This file is the execution contract for installing, updating, or uninstalling
Web Style Director with a coding agent.

Canonical repository:

```text
https://github.com/coconilu/ai-ui-style-director
```

## Choose the operation

- If the user asks to install, follow **Install**.
- If the user asks to update or upgrade, follow **Update**.
- If the user asks to uninstall, remove, or delete Web Style Director, follow
  **Uninstall**.
- If the operation is unclear, ask before changing the filesystem.

Do not interpret “delete” as permission to delete a website project,
`DESIGN.md`, or `.ui-style-director/` project state.

## Supported agents

This installer and the bundled wrapper provide first-class layouts for:

- Codex on Windows, macOS, and Linux.
- Claude Code on Windows, macOS, and Linux.

For another Agent Skills-compatible coding agent, discover its documented
personal skill directory and treat the installation as best effort. Do not
claim that an unlisted agent is verified.

## Detect the agent

1. Use the agent named by the user, when provided.
2. Otherwise inspect the current agent's documented configuration roots and
   environment.
3. If both Codex and Claude Code installations are present and the active agent
   cannot be determined, ask which one to configure before writing files.
4. Install into only one active skill directory unless the user explicitly asks
   to configure more than one agent.

## Paths

### Codex

Use these defaults for a new Codex installation:

| Purpose | Windows | macOS/Linux |
|---|---|---|
| Repository | `%USERPROFILE%\.codex\tools\ai-ui-style-director` | `$HOME/.codex/tools/ai-ui-style-director` |
| Skill | `%USERPROFILE%\.agents\skills\web-style-director` | `$HOME/.agents/skills/web-style-director` |

`$HOME/.agents/skills` is the preferred Codex skill root. If an existing
installation is found under the legacy `$HOME/.codex/skills` root, update it in
place instead of creating a duplicate. Migrate it only when the user explicitly
requests migration.

### Claude Code

First resolve the Claude Code configuration root:

- Use `CLAUDE_CONFIG_DIR` when it is set.
- Otherwise use `%USERPROFILE%\.claude` on Windows.
- Otherwise use `$HOME/.claude` on macOS/Linux.

Then use:

| Purpose | Path under the resolved Claude configuration root |
|---|---|
| Repository | `tools/ai-ui-style-director` |
| Skill | `skills/web-style-director` |

For example, the default Windows skill path is
`%USERPROFILE%\.claude\skills\web-style-director`, and the default macOS/Linux
skill path is `$HOME/.claude/skills/web-style-director`.

Keep the repository and registered skill as separate paths. Report the detected
agent and both absolute paths when finished.

## Prerequisites

1. Confirm that Git is available.
2. Confirm that Node.js 20 or newer is available.
3. Resolve all destination paths to absolute paths before writing or deleting.
4. Do not use elevated privileges or install global npm packages.

If a prerequisite is missing, stop and tell the user exactly what is missing.

## Install

1. Detect the current agent and resolve its repository and skill paths using
   the rules above.
2. Search the supported current and legacy locations for an existing copy. If
   multiple copies could be active, stop and report them instead of creating
   another copy.
3. If the repository path already exists:
   - verify that it is a Git repository;
   - verify that `origin` points to the canonical repository;
   - follow **Update** instead of cloning over it.
4. Otherwise, create only the required parent directory and clone the canonical
   repository into the repository path.
5. Confirm that `<repository>/skills/web-style-director/SKILL.md` exists.
6. Install the skill folder at the agent's skill path. Stage the new copy in a
   temporary sibling directory first, then replace only the resolved
   `web-style-director` skill directory.
7. Run **Verify**.
8. Report the agent, repository path, skill path, detected version or commit,
   and verification result. Tell the user to restart the agent if the new skill
   is not discovered in the current session.

## Update

1. Detect the agent and resolve the existing repository and skill paths. Keep an
   existing supported or legacy layout in place unless migration was requested.
   Do not guess a replacement target.
2. Verify that the repository is a Git checkout of the canonical repository.
3. Check the repository for local modifications. If it contains user changes,
   stop and report them instead of overwriting them. Treat the installed skill
   directory as a generated deployment copy: do not inspect it for local
   modifications and do not preserve files that exist only there.
4. Fetch the canonical remote and update the current branch with a fast-forward
   only operation. Do not reset, force-checkout, or discard changes.
5. Confirm that the updated skill source exists.
6. Stage a fresh copy of `<repository>/skills/web-style-director` in a temporary
   sibling directory, then force-replace the entire resolved installed
   `web-style-director` directory, including modified or extra files inside it.
   This overwrite permission applies only to that resolved skill directory.
   Never remove or overwrite a project `DESIGN.md`, project
   `.ui-style-director/`, provider cache, or website source code during update.
7. Run **Verify**.
8. Report the agent, previous and current commit, both installed paths, and the
   verification result.

Updating Web Style Director is different from refreshing its provider catalog.
The developer command for the latter is documented in `docs/CLI.md`.

## Uninstall

1. Detect the agent, then resolve and display the exact repository and skill
   paths.
2. Confirm that the skill path identifies `web-style-director` and the
   repository path identifies the canonical repository.
3. Check both locations for user modifications. If modifications exist, stop
   and report them unless the user explicitly confirms their removal.
4. Remove only the resolved skill directory and repository directory. On
   Windows, keep path validation and deletion in PowerShell; do not pass paths
   between shells.
5. Remove `AI_UI_STYLE_DIRECTOR_HOME` only if its value points to the removed
   repository. Do not change unrelated environment variables.
6. Verify that the two installation paths no longer exist.
7. Report the agent and what was removed. Tell the user to restart the agent if
   its skill list still shows the removed skill.

Never remove `DESIGN.md`, `.ui-style-director/`, provider caches inside user
projects, or any project source code during uninstall.

## Verify

Run the installed wrapper from a temporary working directory so verification
does not create session state in a user project:

```text
node <skill-path>/scripts/style-director.mjs recommend --brief "AI developer tool website" --count 5 --session <temporary-directory>/session.json --json
```

Verification passes only when the command exits successfully and returns five
recommendations. Remove the temporary verification directory afterward.
