# 视觉预览

Web Style Director 使用两层互补预览，让用户在选择前看见方向，同时避免复制受保护的品牌截图。

## 生成式风格卡片

`catalog/previews/` 为 `catalog/style-profiles.json` 中的每个风格保存一张确定性
生成的 SVG 线框草图。初始基线对应 12 个 family、每个 family 4 个方向；之后
每个新增的已策展 Profile 也必须有一张卡片。草图快速表达布局、密度、层级和配色，并刻意使用通用标签与
图形，不包含上游 logo、文案、截图或专有资产。

源元数据位于 `catalog/style-visuals.json`：

- `styleId`：对应的标准化风格 profile。
- `variant`：`src/preview.mjs` 中的一种 SVG 布局渲染器。
- `theme`：草图使用的语义色彩。
- `references`：3 个真实上游风格 slug，以及各自的标签和有限参考角色。

重新生成并验证：

```bash
npm run previews
npm run previews:check
```

生成的 SVG 会提交到仓库，因此推荐流程可以离线工作，agent 也不需要为了展示 5 个方案而临时运行浏览器。

## 上游实时预览

对于 `awesome-design-md` 参考，推荐核心会派生 getdesign.md 托管的 overview、Light 和 Dark 公共地址，方便用户进一步查看 token、字体、组件样式和表面处理。

实时预览属于外部参考资料，可能独立变化、需要网络访问，也绝不能被复制到生成网站中。

## 推荐行为

支持视觉展示的 agent 会嵌入 5 张本地 SVG 卡片并附上主要 Light/Dark
链接。每次成功推荐还会生成自包含的
`.ui-style-director/recommendations.html` 画廊，把 5 张卡片作为 data URI
内嵌其中。纯终端客户端会启动 `preview --serve`、把输出的本机回环 HTTP 链接
给用户，并在用户选择期间保持进程运行。服务只监听 `127.0.0.1`、只提供该
画廊，按 Ctrl+C 后停止；`file://` 和 `preview --open` 仍是降级方式。当用户
需要更多比较时，还可以查看另外两个参考标签。

画廊是 TUI、SSH 与无图形界面工作流的可移植降级方案，不依赖 Kitty
graphics、Sixel 等特定终端图片协议。如果浏览器不在同一台机器，可以转发
预览端口，或复制、下载 HTML 后在其他设备打开；结构化文字和在线参考链接
仍然可用。

## 完整目录浏览器

GitHub Pages 目录会在另一个浏览入口中复用已经提交的中性 SVG 卡片。它不只
展示某次推荐的五个方向，而是列出全部已策展 profile，并支持文本搜索以及
family、页面类型、密度、调性和组件库过滤：

```bash
node bin/ai-ui-style-director.mjs browse --open
```

`browse` 会打开托管的项目站点并立即返回。旧 `serve` 仍是兼容别名，但不再
启动完整目录的本地服务。两者都是只读入口，不会创建推荐 session 状态，也
不会修改目标项目。

目录的 `catalog.json` 使用轻量 schema v3，卡片只保存相对 `previewUrl`，不会把
全部 SVG 作为 data URI 一次塞进 JSON。预览通过
`previews/<style-id>.svg` 独立同源路径按需加载；搜索优先使用倒排索引的精确
词项 postings，未命中时回退到子串匹配，页面则按 24 张卡片一批渐进渲染。
确定性的 revision 会在已部署 HTML 或 JSON 落后于 CLI 所期待的本地 Catalog
时显示提示。这与单次推荐的自包含 HTML 画廊是两种有意不同的交付方式。

页面还会把当前来自 7 个 Provider 的 109 条上游 style-source 索引作为来源背景
统计展示；component-source 索引为 600 条。原有 74 条来源是 baseline，新增
35 条 daisyUI 主题从 pending 开始。这些路径缺少完整卡片所需的已审查元数据，
因此只保留为候选素材池和数量，不会成为额外风格条目。

## 项目草图

用户选定后，`apply` 会写入 `.ui-style-director/first-viewport-draft.svg`。该草图沿用选定方向的中性布局与配色，并记录项目 brief。agent 会展示草图，把项目特定调整同步记录到 `DESIGN.md`，并在实现 UI 前等待用户确认。

项目草图用于确认方向与信息架构，不是像素级最终 mockup。

## 新增或修改风格

1. 在 `catalog/style-profiles.json` 新增或更新标准化 profile。
2. 在 `catalog/style-visuals.json` 增加唯一对应项。
3. 使用真实上游 slug，并说明每条参考的有限角色。
4. 运行 `npm run previews`。
5. 目视检查生成的 SVG。
6. 运行 `npm run catalog:curated:validate`，检查 profile/visual 一一对应、主题
   色、恰好 3 条有效参考及预览文件。
7. 运行 `npm run check`；如果改变 taxonomy 或评分逻辑，同时确认 12 场景推荐
   benchmark 仍通过。
