# 架构

AI UI Style Director 分为四层。

## 1. Catalog

Catalog 保存标准化设计知识：

- `catalog/style-profiles.json`：人工维护的风格方向。
- `catalog/component-kits.json`：可支持不同风格的实现组件库。
- `catalog/providers.json`：风格或组件来源仓库。
- `catalog/scenario-questions.json`：brief 信息不足时需要确认的问题。

结构化 catalog 让 agent 无需把大量上游仓库加载进上下文就能选择风格。

## 2. 推荐核心

`src/core.mjs` 根据页面类型、受众、产品目标、密度、调性、关键词和场景线索，为风格 profile 进行确定性加权匹配。

未来可以增加 embedding，但风格选择门禁并不依赖 embedding 才能发挥作用。

## 3. 项目契约

用户选择风格后，`apply` 会生成项目专属的 `DESIGN.md`，其中记录：

- 选定风格；
- 来源 provider 与 slug；
- 项目 brief；
- 首屏结构；
- 布局规则；
- 色彩角色；
- 字体；
- 组件建议；
- 品牌安全要求。

agent 应从这份契约实现 UI，而不是在编码时重新猜测视觉方向。

## 4. Agent Skill

`skills/web-style-director/SKILL.md` 把 CLI 封装成 agent 工作流：

1. 补充缺失场景信息。
2. 推荐 5 个风格。
3. 等待用户选择。
4. 用户不满意时换一批。
5. 生成 `DESIGN.md`。
6. 再开始实现 UI。

同一个 skill 还会把明确的更新或卸载意图路由到根目录 `INSTALL.md`，使用户侧生命周期操作与 provider catalog 维护保持分离。

## 为什么使用 Provider Adapter

上游项目通过 adapter 接入，而不是整库复制。这样可以让来源归因保持明确、逐个检查许可证、同步上游更新，并让生成网站使用风格契约而不是克隆品牌。
