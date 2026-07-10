# AI UI Style Director

[English](README.md)

AI UI Style Director 是面向编程 agent 的 UI 风格决策工作流。在新建或重构网站之前，它会先推荐 5 个合适的视觉方向；你选定后，它会生成项目专属的 `DESIGN.md`，再让 agent 开始实现。

## 安装

把下面这段话发给你的编程 agent：

```text
请阅读并执行：
https://raw.githubusercontent.com/coconilu/ai-ui-style-director/main/INSTALL.md

把 Web Style Director 安装到当前 agent，并在安装后完成自检。
```

安装过程需要 Git 和 Node.js 20 或更高版本。

## 使用

```text
/web-style-director 我想做一个面向开发者的 AI 工具网站
```

不支持 slash command 的 agent，可以使用显式 skill 名称或自然语言：

```text
$web-style-director 我想做一个面向开发者的 AI 工具网站
```

接下来只需从 5 个方向中选择一个，或让 agent 再换一批。选定后，agent 会生成 `DESIGN.md` 并据此实现网站。

## 更新

```text
/web-style-director update
```

也可以说：`请更新 web-style-director，并在更新后完成自检。`

## 卸载

```text
/web-style-director uninstall
```

`delete` 和“删除 web-style-director”也会被识别为卸载意图。卸载只移除工具本身，不会删除项目中的 `DESIGN.md`、`.ui-style-director/` 或网站代码。

## 详细文档

- [工作流程](docs/WORKFLOW.zh-CN.md)
- [CLI 参考](docs/CLI.zh-CN.md)
- [Provider 与来源边界](docs/PROVIDERS.zh-CN.md)
- [架构](docs/ARCHITECTURE.zh-CN.md)
- [开发与维护](docs/DEVELOPMENT.zh-CN.md)
- [第三方声明](THIRD_PARTY_NOTICES.md)

MIT License。使用上游设计与组件资料时，请遵守对应许可证，不要复制受保护的品牌资产、专有文案或精确页面布局。
