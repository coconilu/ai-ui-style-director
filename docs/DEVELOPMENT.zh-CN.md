# 开发与维护

## 仓库结构

```text
ai-ui-style-director/
  bin/                         # CLI 入口
  src/                         # 推荐、应用与 provider 逻辑
  scripts/                     # 确定性预览与静态站点生成
  catalog/                     # 风格、视觉、预览、provider 与问题
  skills/web-style-director/   # agent skill
  examples/new-site/           # 示例 brief 与生成的 DESIGN.md
  docs/                        # 详细文档
  test/                        # Node.js 测试
```

当前实现没有运行时 npm 依赖，需要 Node.js 20 或更高版本。已策展 Catalog
从 12 个 family、每组 4 个方向的审查基线开始，并可通过受保护的策展 PR 增长；
生成索引当前包含 7 个 Provider、109 条 style source 和 600 条 component source。
原有 74 条 `DESIGN.md` 来源仍是 baseline，新增 35 条 daisyUI 主题从 pending
开始；来源路径不会自动进入推荐或目录页面。

## 检查

运行：

```bash
npm test
npm run check
```

`npm run check` 会验证 JavaScript 语法、已策展 Catalog、SVG 一致性、Provider
生成索引、策展状态与不可变审计记录，并运行完整测试，其中包含 12 个场景的推荐 benchmark。

只运行已策展 Catalog 门禁：

```bash
npm run catalog:curated:validate
```

该命令会先应用 `catalog/curation-policy.json`，保证每个基线 family 至少
4 个 profile、至少 3 种 visual variant；同时检查 profile/visual 一一对应、
taxonomy 和颜色格式、每个方向恰好 3 条不重复且存在于来源索引的参考，以及
对应 SVG 是否存在。

只校验 AI 辅助策展的 state 与审计记录：

```bash
npm run catalog:curation:validate
```

模型与程序的职责边界、首次基线、GitHub App 工作流和通用 Provider 接入方式见
[AI 辅助风格策展自动化](AUTOMATED_CURATION.zh-CN.md)。

修改 `style-visuals.json` 或预览渲染逻辑后，应重新生成风格卡片：

```bash
npm run previews
npm run previews:check
```

`previews:check` 会确认提交的 SVG 与当前渲染结果一致；更完整的字段、参考和
文件对应关系由 `catalog:curated:validate` 检查。

构建可部署的完整目录站点：

```bash
npm run catalog:build
```

该命令会重建 `dist/pages`，其中包含 schema v5 `catalog.json`、页面与资源、
每个 Direction/Theme 关联的规范 SVG，以及 legacy alias 预览路径。产物是
确定性的，并全部使用适配 GitHub 项目子路径的相对引用；它不提交到仓库。
`.github/workflows/pages.yml` 会在 PR 中运行构建，并从 `main` 通过 GitHub Pages
部署。

## 新增或修改风格

1. 从 `catalog/generated/style-sources.json` 的候选路径中研究可用参考，但不要
   直接把路径批量转换成 profile。
2. 在 `catalog/style-profiles.json` 新增唯一的 kebab-case ID，补全 family、
   页面类型、受众、目标、密度、调性、适用/避免场景、布局、组件库和风险。
   新方向应与所在 family 的现有 4 个方向形成真正的场景或结构差异，而不是
   只换颜色。
   新增时需继续满足 `catalog/curation-policy.json` 的基线深度与结构多样性门槛。
3. 在 `catalog/style-visuals.json` 新增同 ID 的 visual，选择受支持的 SVG
   variant、补全 7 个主题色，并指定恰好 3 条不重复的有效 provider/slug 参考。
4. 运行 `npm run previews`，目视检查新增或变化的 SVG；确认信息结构、密度和
   层级确实表达该方向，且没有上游品牌资产。
5. 运行 `npm run catalog:curated:validate`，先修复结构、来源或预览缺失问题。
6. 如果新增 taxonomy、family 或修改评分规则，相应更新
   `catalog/recommendation-benchmarks.json`；现有 12 个场景仍须保持合理的
   Top 1、Top 5 覆盖和确定性。
7. 最后运行 `npm run check`，确保预览、目录检索、推荐和完整回归全部通过。

目录浏览器会从已审查的 Direction/Theme 数据动态生成 schema v5、倒排索引、
facets 和 `catalogRevision`，无需维护第二份手工搜索索引。每个 Direction 条目
携带关联 Theme 的相对预览 URL，SVG 由同源静态路径加载；前端按 24 张 Direction
卡片一批渐进渲染，因此新增条目不会让首屏 DOM 与 SVG 总体积一起线性膨胀。
默认顺序必须是完整且确定性的全排列，其中前 24 张按六种体验类型轮转；搜索与
Facet 路径必须保持规范/搜索索引顺序。浏览器契约或缓存资源行为变化时，应同步提升
Browser schema/asset 版本。

如果环境中有 Codex `skill-creator`，还应单独验证 skill：

```bash
python <skill-creator>/scripts/quick_validate.py skills/web-style-director
```

## Provider 维护

刷新 provider 生成索引：

```bash
node bin/ai-ui-style-director.mjs refresh-catalog --clone
npm run check
```

`.github/workflows/refresh-providers.yml` 每天执行该流程，并在 `catalog/generated/` 发生变化时创建 PR。

`daisyui-theme-css` Adapter 只发现 35 个主题文件，确定性转换 OKLCH，并输出用于
内容哈希与策展模型的规范 JSON。未来接入其他非 `DESIGN.md` 格式时，应为 matcher、
规范化、哈希和非法输入补齐同等测试，而不是扩大通用扫描器范围。

来源哈希变化后，`.github/workflows/curate-style-sources.yml` 会在另一条可审计 PR
中提出受治理的 Catalog 新增。确定性刷新结果与模型辅助策展结果继续使用彼此独立的
文件白名单。

## 用户侧版本发布

安装结构或生命周期行为变化时，应保持以下入口一致：

- 根目录 `INSTALL.md`；
- `docs/PLATFORMS.md` 与 `docs/PLATFORMS.zh-CN.md`；
- `docs/VISUAL_PREVIEWS.md` 与 `docs/VISUAL_PREVIEWS.zh-CN.md`；
- `catalog/style-visuals.json` 与 `catalog/previews/`；
- `skills/web-style-director/SKILL.md`；
- `skills/web-style-director/references/lifecycle.md`；
- `skills/web-style-director/scripts/style-director.mjs`；
- 两份 README 中展示的四个操作。

安装后的工具以仓库作为 CLI 来源，并在 agent 目录注册一份独立 skill。因此更新时需要刷新仓库、重新部署 skill，再验证已安装的 wrapper。

wrapper 必须通过测试覆盖以下一等发现路径：

- Codex 仓库位于 `$HOME/.codex/tools`，skill 位于 `$HOME/.agents/skills`；
- 已安装在 `$HOME/.codex/skills` 的旧 Codex skill；
- Claude Code 仓库与 skill 位于 `CLAUDE_CONFIG_DIR`，未设置该变量时位于 `$HOME/.claude`。
