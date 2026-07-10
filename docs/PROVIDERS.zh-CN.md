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

命令会刷新本地 provider 仓库，扫描 `DESIGN.md`、registry 和文档文件，再把标准化索引写入 `catalog/generated/`。它不会自动改写人工维护的 `catalog/style-profiles.json`。

定时 GitHub workflow 每天执行相同的刷新和仓库检查，只在生成索引发生变化时创建 PR。

## 来源归因与品牌安全

Provider 仓库是灵感来源和实现材料，不代表可以克隆某个品牌。生成网站时应该使用：

- 项目自有资产；
- 具备适当使用权的生成资产；
- 遵守许可证的开源组件代码；
- 必要的来源归因和声明。

不要复制上游 logo、截图、受保护品牌名、专有文案或精确页面布局。集成组件代码前，应检查对应 provider 的许可证。仓库声明见 `THIRD_PARTY_NOTICES.md`。
