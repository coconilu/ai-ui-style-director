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

## Paths

For Codex, use these defaults unless the user explicitly chooses other paths:

| Purpose | Windows | macOS/Linux |
|---|---|---|
| Repository | `%USERPROFILE%\.codex\tools\ai-ui-style-director` | `~/.codex/tools/ai-ui-style-director` |
| Skill | `%USERPROFILE%\.codex\skills\web-style-director` | `~/.codex/skills/web-style-director` |

For another coding agent, discover its documented skill directory. Keep the
repository and registered skill as separate paths, and report both paths when
finished.

## Prerequisites

1. Confirm that Git is available.
2. Confirm that Node.js 20 or newer is available.
3. Resolve all destination paths to absolute paths before writing or deleting.
4. Do not use elevated privileges or install global npm packages.

If a prerequisite is missing, stop and tell the user exactly what is missing.

## Install

1. Resolve the repository and skill paths for the current agent.
2. If the repository path already exists:
   - verify that it is a Git repository;
   - verify that `origin` points to the canonical repository;
   - follow **Update** instead of cloning over it.
3. Otherwise, create only the required parent directory and clone the canonical
   repository into the repository path.
4. Confirm that `<repository>/skills/web-style-director/SKILL.md` exists.
5. Install the skill folder at the agent's skill path. Stage the new copy in a
   temporary sibling directory first, then replace only the resolved
   `web-style-director` skill directory.
6. Run **Verify**.
7. Report the repository path, skill path, detected version or commit, and
   verification result. Tell the user to restart the agent if its skill list is
   cached.

## Update

1. Resolve the existing repository and skill paths. Do not guess a deletion or
   replacement target.
2. Verify that the repository is a Git checkout of the canonical repository.
3. Check the repository and installed skill for local modifications. If either
   contains user changes, stop and report them instead of overwriting them.
4. Fetch the canonical remote and update the current branch with a fast-forward
   only operation. Do not reset, force-checkout, or discard changes.
5. Confirm that the updated skill source exists.
6. Stage a fresh copy of `<repository>/skills/web-style-director` in a temporary
   sibling directory, then replace only the installed `web-style-director`
   directory.
7. Run **Verify**.
8. Report the previous and current commit, both installed paths, and the
   verification result.

Updating Web Style Director is different from refreshing its provider catalog.
The developer command for the latter is documented in `docs/CLI.md`.

## Uninstall

1. Resolve and display the exact repository and skill paths.
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
7. Report what was removed. Tell the user to restart the agent if its skill list
   is cached.

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
