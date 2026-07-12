# Third-Party Notices

This project connects to upstream repositories as providers. Check each upstream repository for the current license before redistributing files, vendoring code, or publishing derived artifacts.

Configured providers:

- VoltAgent/awesome-design-md
- saadeghi/daisyui (MIT)
- Harzva/design-md-flow
- shadcn-ui/ui
- shadcn/originui
- magicuidesign/magicui
- tremorlabs/tremor

The daisyUI integration indexes the upstream theme CSS files as reference
material through the `daisyui-theme-css` adapter. It stores provider metadata,
pinned paths, normalized token hashes, and independently generated catalog
artifacts; it does not vendor the upstream theme files. daisyUI is distributed
under the MIT License. Re-check the pinned upstream license before copying or
redistributing daisyUI code or CSS in a target project.

Design references are inspiration and structure for agent-readable design contracts. They are not permission to copy protected logos, screenshots, exact page layouts, proprietary brand language, or other non-code assets.

Recommendations may link to public Light/Dark previews hosted by getdesign.md
for `awesome-design-md` style slugs. Those hosted pages remain external
reference material. This repository does not vendor their HTML, screenshots,
logos, or brand assets; committed SVG preview cards are independently generated
brand-neutral wireframes.

Generated websites should use:

- project-owned assets
- generated assets with suitable usage rights
- open-source component code with preserved notices
- source attribution when style profiles are derived from public examples
