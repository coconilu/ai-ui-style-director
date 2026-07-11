# 支持平台

Web Style Director 只维护一份兼容 Agent Skills 的 `SKILL.md`，不同编程 agent 只在安装路径和仓库发现路径上做适配。

## 支持矩阵

| Agent | 操作系统 | 状态 | 显式调用 |
|---|---|---|---|
| Codex | Windows、macOS、Linux | 一等支持 | `$web-style-director ...` |
| Claude Code | Windows、macOS、Linux | 一等支持 | `/web-style-director ...` |
| 其他 Agent Skills 客户端 | 取决于 agent | Best effort | 取决于 agent |

“一等支持”表示仓库明确记录个人 skill 布局、wrapper 能自动找到对应仓库位置，并且该布局有自动化测试覆盖；不代表兼容宿主 agent 的所有历史版本。

## TUI 与无图形界面客户端

能够渲染 Markdown 图片的宿主可以直接嵌入生成式 SVG 卡片。纯终端宿主会拿到
结构化文字、本地卡片路径、在线参考链接，以及一个自包含的
`recommendations.html` 画廊。本机 TUI 可以运行 `preview --serve`，再打开输出的
本机回环 HTTP 链接；服务持续到按下 Ctrl+C。`preview --open` 是直接打开文件的
降级方式。SSH 用户可以转发所选端口，或复制、下载这一个 HTML 文件后在其他
设备查看。特定终端的图片协议只是可选增强，不是兼容前提。

## Codex 布局

新的个人安装使用：

```text
$HOME/.agents/skills/web-style-director
$HOME/.codex/tools/ai-ui-style-director
```

wrapper 仍兼容安装在旧路径 `$HOME/.codex/skills/web-style-director` 的 skill。不要在两个目录中重复安装同名 skill。Codex 可以自动发现该 skill，也可以通过 `$web-style-director` 显式调用。

参见 [Codex 官方定制文档](https://learn.chatgpt.com/docs/customization/overview#skills)。

## Claude Code 布局

优先从 `CLAUDE_CONFIG_DIR` 解析配置根目录；未设置时使用 `$HOME/.claude`。个人安装路径为：

```text
<claude-config>/skills/web-style-director
<claude-config>/tools/ai-ui-style-director
```

Claude Code 会把该 skill 暴露为 `/web-style-director`，也可以根据 `SKILL.md` 的 `description` 自动触发。

参见 [Claude Code Skills 官方文档](https://code.claude.com/docs/en/skills)和[配置目录说明](https://code.claude.com/docs/en/claude-directory)。

## Windows 路径

Windows 上的 `$HOME` 通常对应 `%USERPROFILE%`，因此默认个人路径为：

```text
Codex skill:       %USERPROFILE%\.agents\skills\web-style-director
Codex repository:  %USERPROFILE%\.codex\tools\ai-ui-style-director
Claude skill:      %USERPROFILE%\.claude\skills\web-style-director
Claude repository: %USERPROFILE%\.claude\tools\ai-ui-style-director
```

如果设置了 `CLAUDE_CONFIG_DIR`，应使用它解析后的绝对路径替代 `%USERPROFILE%\.claude`。

## 自定义与项目级布局

如果仓库必须位于默认目录之外，可以设置 `AI_UI_STYLE_DIRECTOR_HOME`；wrapper 会优先检查这个变量。

如果同一台机器同时安装了 Codex 和 Claude Code，位于 Claude 配置根目录的 wrapper 会优先选择 Claude 仓库，Codex wrapper 会优先选择 Codex 仓库；`AI_UI_STYLE_DIRECTOR_HOME` 始终是最高优先级的显式覆盖。

Codex 和 Claude Code 都支持项目级 skill，但根目录 `INSTALL.md` 默认安装为个人 skill，因为这个工作流通常要跨网站项目复用。只有用户明确要求时，agent 才应改用项目级安装；同时仍需保证 CLI 仓库可用并报告两个路径。

对于未列出的 agent，应先确认其实现了 Agent Skills `SKILL.md` 格式，定位其个人 skill 根目录，必要时设置 `AI_UI_STYLE_DIRECTOR_HOME`，并把结果描述为 best-effort 支持，而不是一等支持。
