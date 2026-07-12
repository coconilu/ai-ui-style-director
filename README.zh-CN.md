# AI UI Style Director

[English](README.md)

AI UI Style Director 是面向编程 agent 的 UI 风格决策工作流。在新建或重构网站之前，它会先推荐 5 个合适的视觉方向；你选定后，它会生成项目专属的 `DESIGN.md`，再让 agent 开始实现。

Catalog 从 12 个 family、每组 4 个方向的已审查基线开始，并可通过可审计策展 PR
继续增长。推荐排序由 Node.js 程序根据结构化字段做确定性匹配；agent
负责收集需求、调用命令、展示结果和执行选择门禁，不在运行时凭主观判断替换
排序。

当前一等支持 Codex 与 Claude Code，可运行在 Windows、macOS 和 Linux。其他兼容 Agent Skills 的工具按 best-effort 方式支持。

## 安装

把下面这段话发给你的编程 agent：

```text
请阅读并执行：
https://raw.githubusercontent.com/coconilu/ai-ui-style-director/main/INSTALL.md

把 Web Style Director 安装到当前 agent，并在安装后完成自检。
```

安装过程需要 Git 和 Node.js 20 或更高版本。

## 使用

Codex：

```text
$web-style-director 我想做一个面向开发者的 AI 工具网站
```

Claude Code：

```text
/web-style-director 我想做一个面向开发者的 AI 工具网站
```

agent 会为 5 个方向分别展示一张无品牌 SVG 草图和上游 Light/Dark 实时预览链接。选定后，它会生成项目专属的 `DESIGN.md` 与首屏草图，确认后再实现网站。

## 浏览已策展风格目录

无需进入网站工作流，即可打开包含全部已策展风格的可搜索页面。

Codex：

```text
$web-style-director browse
```

Claude Code：

```text
/web-style-director browse
```

也可以直接运行 CLI 并自动打开页面：

```bash
node bin/ai-ui-style-director.mjs browse --open
```

目录由
[coconilu.github.io/ai-ui-style-director](https://coconilu.github.io/ai-ui-style-director/)
托管。旧的 `serve` 指令保留为 `browse` 的兼容别名，但不再启动完整目录的本地
服务。

页面会列出全部已审查的风格 profile，并支持文本搜索以及 family、页面类型、
密度、调性和组件库过滤。目录接口使用轻量 schema v3：卡片只携带
`previewUrl`，SVG 通过独立的同源路由按需加载；搜索优先使用倒排索引的精确
词项 postings，未命中时回退到子串匹配，结果再以每批 24 张卡片渐进渲染。
命令会把确定性的 Catalog revision 附在页面 URL 上；若 Pages 部署仍是旧版，
页面会给出提示，但不会阻止继续浏览。

当前生成索引中的 74 条 style source 是上游来源路径，只构成候选素材池；页面
会动态展示该数量，但不会把它们伪装成 74 个完整风格。只有经过 profile、视觉
配置、3 条参考和 SVG 校验的条目才进入已策展方向；当前基线为 48 个，后续
可通过可审计策展 PR 继续增长。`browse` 是只读
操作，不会创建或修改项目中的 `.ui-style-director/` 状态。

命令会立即返回。可用 `--open` 自动打开浏览器，或用 `--json` 输出机器可读的
托管目录信息。`--port` 只保留给项目级 `preview --serve` 使用。

## 示例：为管理台选择 UI 方向

一句需求，在写 UI 代码前得到 5 个可以直接比较的方向：

![Web Style Director 推荐五种管理台 UI 方向](docs/assets/admin-dashboard-example.zh-CN.png)

## 示例：把选定方向落实到正式界面

这个真实的 Mason Market Timeline 重构案例展示了完整的门控流程：先推荐
5 个方向，再把方案 4 与方案 2 的金融语义组合起来，生成项目专属的
`DESIGN.md` 和首屏草稿，并且只在用户明确确认后实现代码。图片同时保留
原始 UI，并与响应式正式界面并排对照。

![Mason Market Timeline 从风格选择到实现与验证的 UI 重构案例](docs/assets/mason-market-timeline-case-study.zh-CN.png)

完整目录页与单次推荐预览是两个不同入口。使用纯终端客户端时，每次推荐还会
生成自包含的
`.ui-style-director/recommendations.html` 画廊。启动本地预览服务，再打开命令
输出的链接：

```bash
node bin/ai-ui-style-director.mjs preview --serve
```

服务只监听 `127.0.0.1`，默认选择可用端口，按 Ctrl+C 后停止。
`preview --open` 仍可作为直接打开文件的降级方式。

## 更新

Codex：

```text
$web-style-director update
```

Claude Code：

```text
/web-style-director update
```

也可以说：`请更新 web-style-director，并在更新后完成自检。`

## 卸载

Codex：

```text
$web-style-director uninstall
```

Claude Code：

```text
/web-style-director uninstall
```

`delete` 和“删除 web-style-director”也会被识别为卸载意图。卸载只移除工具本身，不会删除项目中的 `DESIGN.md`、`.ui-style-director/` 或网站代码。

## 详细文档

- [工作流程](docs/WORKFLOW.zh-CN.md)
- [视觉预览](docs/VISUAL_PREVIEWS.zh-CN.md)
- [支持平台](docs/PLATFORMS.zh-CN.md)
- [CLI 参考](docs/CLI.zh-CN.md)
- [Provider 与来源边界](docs/PROVIDERS.zh-CN.md)
- [架构](docs/ARCHITECTURE.zh-CN.md)
- [实现详解与开源集成](docs/IMPLEMENTATION.zh-CN.md)
- [Provider 全自动刷新](docs/AUTOMATED_REFRESH.zh-CN.md)
- [AI 辅助风格策展自动化](docs/AUTOMATED_CURATION.zh-CN.md)
- [开发与维护](docs/DEVELOPMENT.zh-CN.md)
- [第三方声明](THIRD_PARTY_NOTICES.md)

MIT License。使用上游设计与组件资料时，请遵守对应许可证，不要复制受保护的品牌资产、专有文案或精确页面布局。
