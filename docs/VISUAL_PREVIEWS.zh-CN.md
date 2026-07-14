# 视觉预览

Web Style Director 使用两层互补预览，让用户在选择前看见方向，同时避免复制受保护的品牌截图。

## 生成式 Direction/Theme 卡片

运行时预览由三类规范输入共同渲染：

- `catalog/style-directions.json`：结构、意图、密度、字体、组件建议和 Direction
  参考；
- `catalog/style-preview-specs.json`：布局原型、内容模式、内容区块和层级；
- `catalog/style-themes.json`，通过 `catalog/style-direction-themes.json` 关联：
  appearance、语义 token 和固定 Theme 来源。

PreviewSpec 控制可见结构，Theme 控制颜色 token，因此同一 Direction 只切换
Theme 时会保持相同布局。每张 SVG 都刻意使用通用标签和图形，不包含上游 logo、
文案、截图或专有资产。

当前快照包含 57 个 Direction 和 77 个关联 Theme 选择；这些数字不是上限。
Catalog Pages 在 `previews/v2/<direction-id>/<theme-id>.svg` 生成规范资源；推荐
session 则把所选组合写入
`.ui-style-director/recommendation-previews/<direction-id>--<theme-id>.svg`。

已提交的 `catalog/previews/<legacy-style-id>.svg` 及其
`style-profiles.json` / `style-visuals.json` 元数据继续作为策展审计、迁移和 URL
兼容层；它们不是运行时推荐主源。

重新生成并验证：

```bash
npm run previews
npm run previews:check
```

这些命令继续确定性检查全部已提交 legacy SVG，并在内存中渲染每个规范
Direction/Theme 关联。运行时推荐卡片写入本地并内嵌到画廊，因此推荐可以离线
工作，agent 也不需要为了展示默认 5 个方案而临时运行浏览器。

## 上游实时预览

Direction 参考保留有限用途的结构 provenance。对于 `awesome-design-md` 参考，
推荐核心会派生 getdesign.md 托管的 overview、Light 和 Dark 公共地址；Theme
记录则单独保留固定 token 来源。用户可以借此进一步查看结构、字体、组件样式和
表面处理。

实时预览属于外部参考资料，可能独立变化、需要网络访问，也绝不能被复制到生成网站中。

## 推荐行为

支持视觉展示的 agent 会为每个结果展示排序后的 Direction 与所选 Theme，嵌入
本地 SVG 卡片并附上主要 Light/Dark 链接。每次成功推荐还会生成自包含的
`.ui-style-director/recommendations.html` 画廊，把生成卡片作为 data URI 内嵌。
纯终端客户端可以启动 `preview --serve`、把输出的本机回环 HTTP 链接给用户，
并在用户选择期间保持进程运行。服务只监听 `127.0.0.1`、只提供该画廊，按
Ctrl+C 后停止；`file://` 和 `preview --open` 仍是降级方式。画廊保留 Direction
与 Theme ID，使所选组合可以显式传给 `apply`。

画廊是 TUI、SSH 与无图形界面工作流的可移植降级方案，不依赖 Kitty
graphics、Sixel 等特定终端图片协议。如果浏览器不在同一台机器，可以转发
预览端口，或复制、下载 HTML 后在其他设备打开；结构化文字和在线参考链接
仍然可用。

## 完整目录浏览器

GitHub Pages 目录会在另一个浏览入口中使用生成的规范 SVG 卡片。它不只展示
某次推荐中默认的五个 Direction，而是按已策展 Direction 展示一张卡片、切换其
关联 Theme，并支持文本搜索以及体验类型、family、页面类型、密度、调性和组件库
过滤。无筛选首批结果按六种体验类型确定性轮转，搜索和筛选结果保持规范顺序：

```bash
node bin/ai-ui-style-director.mjs browse --open
```

`browse` 会打开托管的项目站点并立即返回。旧 `serve` 仍是兼容别名，但不再
启动完整目录的本地服务。两者都是只读入口，不会创建推荐 session 状态，也
不会修改目标项目。

目录的 `catalog.json` 使用轻量 schema v5。每张 Direction 卡片携带关联 Theme
选择和相对 `previewUrl`，不会把 SVG 作为 data URI 塞进 JSON。规范预览通过
`previews/v2/<direction-id>/<theme-id>.svg` 独立同源路径按需加载，历史 URL
继续由 `previews/<legacy-style-id>.svg` 提供。搜索优先使用倒排索引的精确词项
postings，未命中时回退到子串匹配，页面则按 24 张 Direction 卡片一批渐进渲染。
确定性的 revision 会在已部署 HTML 或 JSON 落后于 CLI 所期待的本地 Catalog
时显示提示。这与单次推荐的自包含 HTML 画廊是两种有意不同的交付方式。

页面还会把当前来自 7 个 Provider 的 109 条上游 style-source 索引作为来源背景
统计展示；component-source 索引为 600 条。原有 74 条来源是 baseline，新增
35 条 daisyUI 主题从 pending 开始。这些路径缺少完整卡片所需的已审查元数据，
因此只保留为候选素材池和数量，不会成为额外风格条目。

## 项目草图

用户选定后，`apply` 会写入 `.ui-style-director/first-viewport-draft.svg`。该草图
组合所选 Direction、对应 PreviewSpec 与 Theme token，并记录两个 ID 和项目
brief。agent 会展示草图，把项目特定调整同步记录到 `DESIGN.md`，并在实现 UI
前等待用户确认。

项目草图用于确认方向与信息架构，不是像素级最终 mockup。

## 新增或修改 Catalog 材料

供给侧策展仍可能写入 legacy Profile/Visual/preview 审计产物。在这些材料影响
运行时消费前，需要重建并校验规范投影：

1. 分别审查 Direction 结构、Direction 参考和 PreviewSpec。
2. 独立审查 Theme token 与固定 Theme 来源。
3. 确认每个允许的 Direction/Theme 关联及其唯一默认项。
4. 运行 `npm run previews` 并目视检查兼容预览。
5. 已批准的 legacy 策展层发生变化时，运行 `npm run catalog:v2:migrate`。
6. 运行 `npm run catalog:v2:validate` 和 `npm run previews:check`。
7. 运行 `npm run check`。
