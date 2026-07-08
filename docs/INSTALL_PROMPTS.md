# Install Prompts

This file provides prompts that users can paste into Codex or another coding agent to install the `web-style-director` skill.

## Codex Install Prompt

Paste this into Codex:

```text
Please install the Web Style Director skill from this GitHub repository:

https://github.com/coconilu/ai-ui-style-director

Install it for local Codex use with this layout:

1. Clone or update the repository at:
   - Windows: %USERPROFILE%\.codex\tools\ai-ui-style-director
   - macOS/Linux: ~/.codex/tools/ai-ui-style-director

2. Copy the skill folder from:
   skills/web-style-director

   to:
   - Windows: %USERPROFILE%\.codex\skills\web-style-director
   - macOS/Linux: ~/.codex/skills/web-style-director

3. Do not copy only the skill unless the repository is also available at ~/.codex/tools/ai-ui-style-director, because the skill calls the repository CLI.

4. Verify the install by running:
   node ~/.codex/skills/web-style-director/scripts/style-director.mjs recommend --brief "AI developer tool website" --count 5

5. If the verification passes, tell me the exact installed skill path and the CLI repository path.
```

## Windows PowerShell Install Prompt

Paste this into Codex on Windows:

```text
Install https://github.com/coconilu/ai-ui-style-director as a Codex skill on Windows PowerShell.

Use these paths:

- Repo path: $env:USERPROFILE\.codex\tools\ai-ui-style-director
- Skill path: $env:USERPROFILE\.codex\skills\web-style-director

Steps:

1. Create $env:USERPROFILE\.codex\tools and $env:USERPROFILE\.codex\skills if they do not exist.
2. If the repo path already exists, run git pull --ff-only there. Otherwise clone the repo there.
3. Copy the repository's skills\web-style-director folder to the skill path. Replace the old skill folder only after confirming the target path is inside $env:USERPROFILE\.codex\skills.
4. Run this verification:

   node "$env:USERPROFILE\.codex\skills\web-style-director\scripts\style-director.mjs" recommend --brief "AI developer tool website" --count 5

5. Report the installed paths and whether verification succeeded.
```

## Agent-Neutral Install Prompt

Use this for other coding agents:

```text
Install the ai-ui-style-director repository and expose its web-style-director skill/workflow to the current coding agent.

Source repository:
https://github.com/coconilu/ai-ui-style-director

Required behavior:

- Keep the full repository available because the skill wrapper calls bin/ai-ui-style-director.mjs.
- Install or register skills/web-style-director as the agent-facing skill.
- If your agent supports environment variables, set AI_UI_STYLE_DIRECTOR_HOME to the cloned repository path.
- Verify with:
  node <installed-skill-path>/scripts/style-director.mjs recommend --brief "AI developer tool website" --count 5

After installation, the agent should use this workflow:

1. Ask for missing site context when needed.
2. Recommend five UI style directions.
3. Let the user choose or reroll.
4. Generate DESIGN.md.
5. Only then write UI code.
```

