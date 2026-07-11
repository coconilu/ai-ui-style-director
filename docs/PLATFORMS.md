# Supported Platforms

Web Style Director keeps one Agent Skills-compatible `SKILL.md` and adapts only
the installation and repository-discovery paths for each coding agent.

## Support matrix

| Agent | Operating systems | Status | Explicit invocation |
|---|---|---|---|
| Codex | Windows, macOS, Linux | First-class | `$web-style-director ...` |
| Claude Code | Windows, macOS, Linux | First-class | `/web-style-director ...` |
| Other Agent Skills clients | Agent-dependent | Best effort | Agent-dependent |

First-class means that this repository documents the personal skill layout,
the wrapper automatically discovers the matching repository location, and the
layout is covered by automated tests. It does not imply support for every
historical release of the host agent.

## TUI and headless clients

Hosts that can render Markdown images may embed the generated SVG cards
directly. Terminal-only hosts receive structured text, local card paths, live
reference links, and a self-contained `recommendations.html` gallery. A local
TUI can run `preview --serve` and open the printed loopback HTTP URL; the
process remains active until Ctrl+C. `preview --open` is the direct-file
fallback. SSH users can forward the selected port, or copy the single HTML file
and view it elsewhere. Terminal-specific image protocols are optional
enhancements, not a compatibility requirement.

## Codex layout

New personal installations use:

```text
$HOME/.agents/skills/web-style-director
$HOME/.codex/tools/ai-ui-style-director
```

The wrapper also supports existing skills under the legacy
`$HOME/.codex/skills/web-style-director` path. Do not install the same skill in
both roots. Codex can discover skills implicitly or invoke this one explicitly
as `$web-style-director`.

See the official [Codex customization documentation](https://learn.chatgpt.com/docs/customization/overview#skills).

## Claude Code layout

Resolve the configuration root from `CLAUDE_CONFIG_DIR`, or default to
`$HOME/.claude`. Personal installations use:

```text
<claude-config>/skills/web-style-director
<claude-config>/tools/ai-ui-style-director
```

Claude Code exposes the skill as `/web-style-director` and may also invoke it
automatically from the `description` in `SKILL.md`.

See the official [Claude Code skills documentation](https://code.claude.com/docs/en/skills)
and [configuration-directory reference](https://code.claude.com/docs/en/claude-directory).

## Windows paths

On Windows, `$HOME` normally resolves to `%USERPROFILE%`. Therefore the default
personal paths are:

```text
Codex skill:       %USERPROFILE%\.agents\skills\web-style-director
Codex repository:  %USERPROFILE%\.codex\tools\ai-ui-style-director
Claude skill:      %USERPROFILE%\.claude\skills\web-style-director
Claude repository: %USERPROFILE%\.claude\tools\ai-ui-style-director
```

When `CLAUDE_CONFIG_DIR` is set, replace `%USERPROFILE%\.claude` with its
resolved absolute value.

## Custom and project-scoped layouts

Set `AI_UI_STYLE_DIRECTOR_HOME` when the repository must live outside the
documented defaults. The wrapper checks that variable before any standard
location.

When both Codex and Claude Code are installed, a wrapper under the Claude
configuration root prefers the Claude repository; a Codex wrapper prefers the
Codex repository. `AI_UI_STYLE_DIRECTOR_HOME` remains the explicit override.

Codex and Claude Code both support project-scoped skills, but the root
`INSTALL.md` intentionally installs this tool as a personal skill because the
workflow is useful across website repositories. An agent may use a project
scope only when the user explicitly requests it; it must still keep the CLI
repository available and report both paths.

For unlisted agents, verify that they implement the Agent Skills `SKILL.md`
format, identify their personal skill root, set `AI_UI_STYLE_DIRECTOR_HOME` when
needed, and describe the result as best-effort rather than first-class support.
