---
name: web-style-director
description: Recommend, preview, and lock UI style directions before building or redesigning websites, browse the curated style catalog, and manage this skill's installed lifecycle. Use when the user asks to create or restyle a website, landing page, SaaS/product site, dashboard, docs site, portfolio, or ecommerce page; asks to serve, browse, search, or filter the Web Style Director catalog; or explicitly asks to update, upgrade, uninstall, remove, or delete web-style-director. For website work, present five relevant visual directions with draft cards and live references, wait for selection, generate DESIGN.md plus a project first-viewport draft, wait for confirmation, and only then proceed to UI code.
---

# Web Style Director

Use this skill as the style-selection gate before website UI implementation.

## Request Routing

- For an explicit `browse` or `serve` request, or a request to search or filter the
  complete Web Style Director catalog, read `references/catalog-browser.md`
  and perform only that catalog-browser operation. Do not ask for a website
  brief, recommend five directions, run `apply`, or enter the website workflow.
- For an explicit update, upgrade, uninstall, remove, or delete request about
  `web-style-director`, read `references/lifecycle.md` and perform only that
  lifecycle operation. Do not enter the website workflow.
- Treat `delete` as uninstall only when it clearly names this tool. Never infer
  permission to delete a user project or generated project files.
- For website creation or redesign, continue with the workflow below.

## Core Rule

Do not write UI code until the user has selected one recommended Direction and
its Theme, `DESIGN.md` and the project first-viewport draft have been generated
or updated, and the user has confirmed the draft.

## Workflow

1. Determine whether the user wants a new website or a redesign.
2. If the scenario is underspecified, ask only the minimum necessary questions from `references/context-questions.md`.
3. Run the style recommender:

   ```bash
   node skills/web-style-director/scripts/style-director.mjs recommend --brief "<brief>" --count 5
   ```

4. Present exactly five UI Direction options when available. For each option,
   show its `directionId`, recommended `themeId`, Direction name, Theme name and
   appearance, local SVG preview card, primary live-reference links, fit
   reason, first-viewport shape, component kits, and risk. The command also
   generates a self-contained recommendation gallery. If the client cannot
   render local images, start the foreground loopback preview server in a
   long-running terminal session:

   ```bash
   node skills/web-style-director/scripts/style-director.mjs preview --serve --path "<gallery-path>"
   ```

   Give the user the printed `http://127.0.0.1:<port>/` link and keep the
   process alive while they review the options. Stop it after selection, when
   the task ends, or before replacing the gallery with another batch. If the
   long-running terminal session is unavailable, fall back to the printed
   `file://` URL or `preview --open`. Visual-capable clients should continue to
   render the local SVG cards directly and do not need the server. Follow
   `references/recommendation-format.md`.
5. Wait for the user's selection. The user may choose by number or exact
   Direction ID. In both cases, use the Theme paired with that Direction in the
   recommendation result.
6. If the user rejects the options, rerun with `--again`; it excludes Directions
   already shown in the current session:

   ```bash
   node skills/web-style-director/scripts/style-director.mjs recommend --brief "<brief>" --again --count 5
   ```

7. After selection, generate the target project's `DESIGN.md` and
   `.ui-style-director/first-viewport-draft.svg`:

   ```bash
   node skills/web-style-director/scripts/style-director.mjs apply --style <direction-id> --theme <theme-id> --project <project-path> --brief "<brief>"
   ```

   Only for manual legacy compatibility, `--style <legacy-style-id>` may omit
   `--theme`; this restores the historical Direction and Theme selection.

8. Read the generated `DESIGN.md`, present the project first-viewport draft,
   and wait for confirmation. If the user requests another Direction or Theme,
   return to recommendation. If they request a project-specific adjustment, record it in
   `DESIGN.md` and update the draft before asking again.
9. After confirmation, implement the UI using the target repo's framework. Use
   the recommended component kits only when they fit the repo stack and user
   constraints.
10. Verify the rendered UI against both `DESIGN.md` and the confirmed draft;
    record intentional deviations.

## New Website Intake

For new websites, the minimum useful brief is:

- website type
- audience
- primary conversion or workflow goal
- desired density
- required stack or target project path, if any

If the user gives enough context, do not ask more questions before recommending Directions.

## Redesign Intake

For redesigns, inspect the existing source first when available:

- URL
- screenshot
- local project path
- existing brand assets
- constraints on what must be preserved

If none is provided, ask for at least one source before recommending.

## Recommendation Output

Use the visual format in `references/recommendation-format.md`. Keep the text
concise so five preview cards remain scannable. Do not overload the user with
raw catalog fields. For terminal-only clients, prefer the generated HTML
gallery over asking the user to open five SVG files separately. The preview
server is local-only and temporary; do not change its host to `0.0.0.0` or
present it as a public URL.

## Selection Rules

- Accept a number, exact Direction ID, or clear natural-language selection.
- A number or Direction ID selects the Theme shown with that recommendation.
- Accept a legacy style ID without a Theme only as an explicit manual
  compatibility input; resolve it to its historical Direction and Theme.
- If the user asks for a hybrid direction, pick the dominant Direction and record secondary inspiration in the brief before applying.
- If the user says "not satisfied", "change another batch", "reroll", or similar, use `--again` to exclude previously shown Directions.
- If fewer than five unseen Directions remain, say that the catalog is exhausted for this session and show the remaining options.

## Implementation Rules

- Read `DESIGN.md` immediately before editing UI code.
- Treat generated preview cards and upstream live previews as selection
  references, never as assets to ship.
- Show the project first-viewport draft and obtain confirmation before editing
  UI code.
- Preserve the Direction's density, first viewport, component model, and
  typography, and preserve the Theme's appearance and palette.
- Do not copy upstream logos, screenshots, brand names, or exact proprietary layouts.
- Do not introduce a new Direction or Theme during coding unless the user selects it.
- For multi-section sites, keep section rhythm consistent with the selected Direction instead of mixing unrelated UI kits.

## Resources

- `scripts/style-director.mjs`: wrapper around the repository CLI.
- `references/context-questions.md`: context questions for underspecified requests.
- `references/recommendation-format.md`: output format for style options.
- `references/design-md-contract.md`: what to do after `DESIGN.md` is generated.
- `references/catalog-browser.md`: hosted catalog routing, revision checks, and
  the `serve` compatibility alias.
- `references/lifecycle.md`: update and safe-uninstall routing.
