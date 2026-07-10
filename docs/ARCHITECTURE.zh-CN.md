# 架构

AI UI Style Director 分为五层。

## 1. Catalog

Catalog 保存标准化设计知识：

- `catalog/style-profiles.json`：人工维护的风格方向。
- `catalog/style-visuals.json`：预览变体、主题和真实视觉参考。
- `catalog/previews/`：生成的无品牌 SVG 卡片。
- `catalog/component-kits.json`：可支持不同风格的实现组件库。
- `catalog/providers.json`：风格或组件来源仓库。
- `catalog/scenario-questions.json`：brief 信息不足时需要确认的问题。

结构化 catalog 让 agent 无需把大量上游仓库加载进上下文就能选择风格。

## 2. 视觉预览层

`src/preview.mjs` 把标准化视觉元数据渲染为确定性的 SVG 线框草图。`scripts/generate-style-previews.mjs` 生成并验证 12 张提交到仓库的风格卡片；同一个渲染器在选定后生成项目级 `first-viewport-draft.svg`。

视觉预览层把本地中性草图与外部 Light/Dark 参考分开：上游预览只用于比较，不能作为 vendored 或发布资产。

## 3. 推荐核心

`src/core.mjs` 根据页面类型、受众、产品目标、密度、调性、关键词和场景线索，为风格 profile 进行确定性加权匹配。

未来可以增加 embedding，但风格选择门禁并不依赖 embedding 才能发挥作用。

推荐结果会在评分 profile 之外附带本地 SVG 卡片和展开后的视觉参考 URL。

## 4. 项目契约

用户选择风格后，`apply` 会生成项目专属的 `DESIGN.md` 和 `.ui-style-director/first-viewport-draft.svg`，其中记录：

- 选定风格；
- 来源 provider 与 slug；
- 真实视觉参考链接；
- 项目 brief；
- 首屏结构；
- 布局规则；
- 色彩角色；
- 字体；
- 组件建议；
- 品牌安全要求。

agent 先展示草图并等待确认，再从这份契约实现 UI，而不是在编码时重新猜测视觉方向。

## 5. Agent Skill

`skills/web-style-director/SKILL.md` 把 CLI 封装成 agent 工作流：

1. 补充缺失场景信息。
2. 推荐带本地 SVG 卡片与 Light/Dark 参考的 5 个风格。
3. 等待用户选择。
4. 用户不满意时换一批。
5. 生成 `DESIGN.md` 与项目首屏草图。
6. 等待草图确认。
7. 再开始实现 UI。

同一个 skill 还会把明确的更新或卸载意图路由到根目录 `INSTALL.md`，使用户侧生命周期操作与 provider catalog 维护保持分离。

Codex 与 Claude Code 共用同一份 `SKILL.md`，仅安装路径和显式调用语法不同。skill 可以直接在仓库中运行，也可以复制到对应 agent 的个人 skill 目录。

## 为什么使用 Provider Adapter

上游项目通过 adapter 接入，而不是整库复制。这样可以让来源归因保持明确、逐个检查许可证、同步上游更新，并让生成网站使用风格契约而不是克隆品牌。
