# Recommendation Format

Present five options in the user's language.

Use this shape:

```text
I recommend these five UI directions:

1. <Style name> (`<style-id>`)
Fit: <why this matches the scenario>
First viewport: <what the top of the site should look like>
Component kits: <kits>
Risk: <main tradeoff>

...

Please choose 1-5, choose a style id, or say you want another batch.
```

Do not expose raw scoring unless the user asks.

Do not start implementation after showing the options.

