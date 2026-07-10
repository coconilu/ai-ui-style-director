# 视觉预览

Web Style Director 使用两层互补预览，让用户在选择前看见方向，同时避免复制受保护的品牌截图。

## 生成式风格卡片

`catalog/previews/` 为 `catalog/style-profiles.json` 中的每个风格保存一张确定性生成的 SVG 线框草图。它快速表达布局、密度、层级和配色，并刻意使用通用标签与图形，不包含上游 logo、文案、截图或专有资产。

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
内嵌其中。纯终端客户端会输出它的 `file://` 地址，并可通过
`preview --open` 打开。当用户需要更多比较时，还可以查看另外两个参考标签。

画廊是 TUI、SSH 与无图形界面工作流的可移植降级方案，不依赖 Kitty
graphics、Sixel 等特定终端图片协议。没有本地图形环境时，可以复制或下载
HTML 后在其他设备打开；结构化文字和在线参考链接仍然可用。

## 项目草图

用户选定后，`apply` 会写入 `.ui-style-director/first-viewport-draft.svg`。该草图沿用选定方向的中性布局与配色，并记录项目 brief。agent 会展示草图，把项目特定调整同步记录到 `DESIGN.md`，并在实现 UI 前等待用户确认。

项目草图用于确认方向与信息架构，不是像素级最终 mockup。

## 新增或修改风格

1. 在 `catalog/style-profiles.json` 新增或更新标准化 profile。
2. 在 `catalog/style-visuals.json` 增加唯一对应项。
3. 使用真实上游 slug，并说明每条参考的有限角色。
4. 运行 `npm run previews`。
5. 目视检查生成的 SVG。
6. 运行 `npm run check`。
