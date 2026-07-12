# Provider 与来源边界

Provider 配置位于 `catalog/providers.json`。Provider 为系统提供设计参考或实现组件，但不会成为普通用户的操作入口。

## 当前角色

- `awesome-design-md`：风格参考语料。
- `design-md-flow`：工作流参考。
- `shadcn-ui`：基础组件。
- `origin-ui`：应用和营销页面区块。
- `magic-ui`：动效丰富的营销组件。
- `tremor`：dashboard 和图表组件。

## 刷新 Provider 索引

运行：

```bash
node bin/ai-ui-style-director.mjs refresh-catalog --clone
```

命令会刷新本地 provider 仓库，扫描 `DESIGN.md`、registry 和文档文件，再把
标准化索引写入 `catalog/generated/`。当前 style-source 索引有 74 条路径，
它们只是候选素材池，不等于 74 个用户可选风格。已提交的 74 条来源属于 baseline；
未来新增或变化的来源可以进入独立的 AI 辅助策展 Workflow，但只有在结构化候选、
精确溯源、确定性去重、预览和仓库门禁全部通过后才会进入已策展 Catalog。

定时 GitHub workflow 每天执行相同的刷新和仓库检查，只在生成索引发生变化时创建 PR。

## 视觉参考

`catalog/style-visuals.json` 把每个标准化内部风格映射到 3 个真实来源。旧的
`awesome-design-md` slug 仍会展开为 getdesign.md 的 overview 与 Light/Dark
实时预览；通用 Provider 使用精确 `provider + path`，并生成固定到索引 revision
的 GitHub 来源页链接。

Adapter、state、审计和 GitHub Actions 细节见
[AI 辅助风格策展自动化](AUTOMATED_CURATION.zh-CN.md)。

已策展层从 12 个 family、每组 4 个方向的审查基线开始，并可通过受保护 PR 增长。新增
方向必须补齐 profile 和 visual、使用恰好 3 条已索引且不重复的参考、生成中性
SVG，并通过 `npm run catalog:curated:validate`；provider 路径数量本身不构成
晋升依据。

这些链接刻意与 `catalog/previews/` 分离：本地 SVG 卡片是项目自有的中性线框草图，托管预览始终属于外部参考资料，不会 vendoring 到仓库。

## 来源归因与品牌安全

Provider 仓库是灵感来源和实现材料，不代表可以克隆某个品牌。生成网站时应该使用：

- 项目自有资产；
- 具备适当使用权的生成资产；
- 遵守许可证的开源组件代码；
- 必要的来源归因和声明。

不要复制上游 logo、截图、受保护品牌名、专有文案或精确页面布局。集成组件代码前，应检查对应 provider 的许可证。仓库声明见 `THIRD_PARTY_NOTICES.md`。
