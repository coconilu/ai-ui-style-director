# AI UI Style Director

[English](README.md)

AI UI Style Director 是面向编程 agent 的 UI 风格决策工作流。在新建或重构网站之前，它会先推荐 5 个合适的视觉方向；你选定后，它会生成项目专属的 `DESIGN.md`，再让 agent 开始实现。

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
- [开发与维护](docs/DEVELOPMENT.zh-CN.md)
- [第三方声明](THIRD_PARTY_NOTICES.md)

MIT License。使用上游设计与组件资料时，请遵守对应许可证，不要复制受保护的品牌资产、专有文案或精确页面布局。
