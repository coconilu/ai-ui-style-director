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
Preview gallery: <file-url printed by the recommend command>
Open it with: ai-ui-style-director preview --open --path "<gallery-path>"
```

Rules:

- Show the local generated preview card for every option. If the client cannot
  render local SVG, provide the self-contained gallery URL, keep the live
  links, and retain concise text summaries. Do not require the user to open five
  SVG paths one by one.
- Use only the primary reference's Light/Dark links in the main list; secondary
  labels are enough unless the user asks for more.
- Explain that cards are neutral wireframes and upstream previews are
  inspiration references, not assets to copy.
- Do not embed upstream brand screenshots or logos.
- Do not expose raw scoring unless the user asks.
- Do not start implementation after showing the options.
