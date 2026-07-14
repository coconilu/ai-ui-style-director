# 工作流程

Web Style Director 在网站实现前增加一道风格选择门禁：

1. 理解用户要新建网站还是重构网站。
2. 只追问缺失的必要信息。
3. 排序 5 个相关 UI Direction，再为每个 Direction 确定性选择一个关联 Theme，
   且不改变 Direction 排名。
4. 展示 Direction/Theme ID 与名称、无品牌 SVG 草图、离线 HTML 画廊和上游
   参考，让用户选择一组组合，或再换一批未展示的 Direction；机器可读结果还
   携带 Theme appearance 与 tokens。
5. 生成项目专属的 `DESIGN.md` 与首屏草图。
6. 等待用户确认草图方向。
7. 根据确认后的契约和草图实现并验证 UI。

核心规则很简单：用户尚未选定 Direction 和 Theme、项目尚未生成 `DESIGN.md`
和首屏草图、草图方向尚未确认时，不开始实现 UI。

## 新建网站

有效的 brief 通常需要说明：

- 网站类型；
- 目标受众；
- 主要转化或工作流目标；
- 期望的密度或调性；
- 有限制时的技术栈和项目路径。

如果用户已经提供足够信息，应直接推荐，不要额外增加问卷。

## 重构网站

推荐重构方向前，至少检查一种真实来源：

- URL；
- 截图；
- 本地项目；
- 现有品牌资产；
- 必须保留的约束。

## 推荐与换一批

每个推荐展示 Direction/Theme ID 和名称、SVG 草图、主要 Light/Dark 参考、
适配原因、首屏形态、组件库和风险；机器可读结果还包含 Theme appearance 与
tokens。用户按编号或 Direction ID 选择时，沿用该结果展示的 Theme。自包含
HTML 画廊可直接作为本地文件打开；纯终端客户端需要 HTTP 时，可用
`preview --serve` 只把该画廊临时暴露在本机回环地址。

如果用户不满意，`--again` 会按 session schema v2 的 `shownDirectionIds` 排除
已展示 Direction；旧 `shownStyleIds` 仍可通过 alias 读取。如果未展示方向已经
耗尽，流程会明确告知用户。

## 项目契约

用户选定后，推荐流程执行 `apply --style <direction-id> --theme <theme-id>`。
直接使用 CLI 并省略 Theme 时，legacy style ID 会优先按 alias 恢复历史组合；
只有不与 legacy alias 同名的规范 Direction ID 才使用其声明的默认 Theme。
`apply` 会写入：

```text
DESIGN.md
.ui-style-director/
  first-viewport-draft.svg
  selected-style.json
  recommended-components.json
  source-attribution.json
```

v2 契约会在 `DESIGN.md`、state 与 attribution 中，把 Direction 结构、
PreviewSpec 和 Direction 参考，同 Theme appearance、token 和 Theme 来源分层记录，
并包含两个 ID、首屏结构、布局、色彩角色、字体、组件建议和品牌安全约束。实现前
应展示
`first-viewport-draft.svg` 并等待确认。

## 视觉预览

- 本地 SVG 卡片由 Direction、对应 PreviewSpec 和所选 Theme 生成，可离线使用，
  不包含上游 logo 或截图。
- 上游 Light/Dark 链接只用于比较设计语言，不能作为最终网站资产。
- 每个 legacy Visual 保留 3 条已审查参考；规范 Direction 可以聚合并去重多个
  legacy 条目的来源，避免把内部抽象方向伪装成某个品牌的精确克隆。
- Catalog Browser schema v5 当前展示 57 个 Direction 卡片和 77 个关联 Theme
  预览；这只是快照，不是数量限制。规范预览路径为
  `previews/v2/<direction-id>/<theme-id>.svg`，旧链接继续使用
  `previews/<legacy-style-id>.svg`。

## Direction、Theme 与组件的关系

Web Style Director 是风格路由器，不是另一个组件库：

- **Direction** 描述结构、层级和产品适配。
- **Theme** 描述关联的 appearance 和颜色 tokens，不改变 Direction 排名。
- **Component kits** 提供可能支持这些方向的实现材料。

选定 Direction 和 Theme 共同约束页面；组件库只是可选实现输入，应适配目标
技术栈，而不能反过来引入新的视觉方向。
