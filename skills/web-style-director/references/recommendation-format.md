# Recommendation Format

Present five options in the user's language. Keep each option concise and use
Markdown so visual-capable clients can render the generated SVG cards.

Use this shape:

```markdown
### 1. <Style name> (`<style-id>`)

![<Style name> draft direction](<absolute-preview-card-path>)

- **Fit:** <why this matches the scenario>
- **First viewport:** <what the top of the site should look like>
- **Live references:** [<primary label> Light](<light-preview-url>) · [Dark](<dark-preview-url>)
- **More references:** <secondary labels>
- **Component kits:** <kits>
- **Risk:** <main tradeoff>
```

Repeat for all five options, then say:

```text
Please choose 1-5, choose a style id, or say you want another batch.
```

For a client that cannot render local images, also show:

```text
Preview gallery: <http-url printed by preview --serve>
The link remains available while the preview process is running.
```

Rules:

- Show the local generated preview card for every option. If the client cannot
  render local SVG, start `preview --serve --path "<gallery-path>"`, provide
  its local HTTP URL, keep the live links, and retain concise text summaries.
  Stop the server after selection or when the task ends. If a long-running
  terminal session is unavailable, use the self-contained `file://` URL or
  `preview --open` as the fallback. Do not require the user to open five SVG
  paths one by one.
- Use only the primary reference's Light/Dark links in the main list; secondary
  labels are enough unless the user asks for more.
- Explain that cards are neutral wireframes and upstream previews are
  inspiration references, not assets to copy.
- Do not embed upstream brand screenshots or logos.
- Do not expose raw scoring unless the user asks.
- Do not start implementation after showing the options.
