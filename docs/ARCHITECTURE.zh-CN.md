# 架构

AI UI Style Director 分为六层。

## 1. Catalog

Catalog 保存标准化设计知识。运行时消费端读取规范 v2 投影：

- `catalog/style-directions.json`：已审查的结构 Direction、产品适配、布局建议、
  字体、组件建议和 Direction 参考。
- `catalog/style-themes.json`：可复用 appearance、语义颜色 token 和固定 Theme 来源。
- `catalog/style-direction-themes.json`：允许的 Direction/Theme 组合，以及每个
  Direction 的一个默认关联。
- `catalog/style-preview-specs.json`：每个 Direction 对应一个结构 PreviewSpec。
- `catalog/style-aliases.json`：legacy 风格 ID 到历史 Direction/Theme 组合的映射。
- `catalog/style-profiles.json`、`catalog/style-visuals.json` 和
  `catalog/previews/*.svg`：legacy 策展、审计、迁移和预览兼容产物；不是运行时
  推荐主源。
- `catalog/component-kits.json`：可支持不同风格的实现组件库。
- `catalog/providers.json`：当前 7 个风格或组件来源仓库。
- `catalog/generated/style-sources.json`：当前 109 条上游风格来源路径索引；
  这些路径是候选素材线索，不是已策展的风格 profile。
- `catalog/generated/component-sources.json`：当前 600 条上游组件来源路径索引。
- `catalog/scenario-questions.json`：brief 信息不足时需要确认的问题。
- `catalog/curation-policy.json`：基线 family 的条目深度与结构变体门槛。
- `catalog/curation/source-state.json`：按内容哈希记录的处理游标；原有 74 条
  `DESIGN.md` 来源是零模型费用的首次 baseline，新增 35 条 daisyUI theme CSS
  来源则从 pending 状态开始处理。
- `catalog/curation/records/`：基线之后由每次模型处理和程序门禁产生的不可变审计记录。
- `catalog/recommendation-benchmarks.json`：保护推荐意图覆盖与确定性的 12 个代表场景。

当前规范快照包含 57 个 Direction 和 77 个关联 Theme 选择；这些数字描述当前
已提交数据，不是配置上限。

### 体验类型 taxonomy

每个规范 Direction 必须且只能有一个受治理的 `experienceType`：

| ID | 含义 |
| --- | --- |
| `consumer-app` | 用户会持续回来使用的 C 端产品或服务 |
| `marketing-site` | 品牌、发布、获客、作品集或转化前台 |
| `commerce` | 商品发现、比较、订货或购买体验 |
| `content-docs` | 阅读、学习、参考、证据或知识消费体验 |
| `business-app` | 员工或专业角色执行领域工作与协作的 B 端系统 |
| `admin-console` | 系统监控、控制、治理、运维或管理控制台 |

`experienceType` 回答“首屏的主要用户任务是什么”。它与 `family`（设计/产品族）、
`pageTypes`（可支持的页面形态）和 `goals`（产品目标）彼此独立。现有 57 个 Direction
结合页面类型、目标和受众做了维护者显式审阅的分类；运行时不存在 family 到体验类型的
简单映射。例如 consumer Direction 同时包含 C 端应用和营销前台，developer Direction
也横跨营销、文档和管理体验。

该字段只属于 Direction。Theme 只改变外观，不改变体验类别；legacy 风格 ID 通过
不可变 Direction/Theme alias 继承该值，不在旧 Profile 中重复存储。

结构化 catalog 让 agent 无需把大量上游仓库加载进上下文就能选择风格。

供给侧策展与消费侧推荐彼此独立。OpenAI-compatible 策展 Agent 只读取受限的新来源
或变更来源，并提出结构化候选；来源绑定、taxonomy、重复政策、晋升、预览生成和校验
都由程序掌握。确定性门禁通过后，现有 GitHub App 才创建可审计的 Draft PR，
并由维护者人工审查和手动合并。

## 2. 视觉预览层

`src/preview.mjs` 根据 Direction、PreviewSpec 和 Theme 渲染确定性的 SVG 线框。
PreviewSpec 控制布局原型、内容模式、区块与层级；Theme 提供 appearance 与语义
token，因此只更换 Theme 时结构保持不变。

`scripts/generate-style-previews.mjs` 继续生成并验证已提交的 legacy 卡片以保持
兼容，同时在内存中渲染全部已关联 Direction/Theme 组合，验证 v2 的确定性与
完整性。同一套语义渲染器还会生成推荐卡片，以及选择后的项目级
`first-viewport-draft.svg`。

`src/core.mjs` 会把每一组推荐打包为自包含的
`.ui-style-director/recommendations.html` 画廊。生成式 SVG 卡片以 data URI
内嵌，因此纯终端或远程用户只需复制或下载一个可移植预览文件。CLI 通过
`preview` 命令暴露该画廊，并提供可选的跨平台 `--open` 操作。对于纯终端
客户端，它还可以在 `127.0.0.1` 启动一个最小前台 HTTP 服务；该服务只暴露
指定画廊，默认由操作系统分配可用端口。

`src/loopback-server.mjs` 只为生成式推荐预览提供本机回环 HTTP 边界。host、
端口、请求、缓存和停止行为与公开托管的完整目录相互隔离。

视觉预览层把本地中性草图与外部 Light/Dark 参考分开：上游预览只用于比较，不能作为 vendored 或发布资产。

## 3. 目录浏览器

`src/catalog-browser.mjs` 根据规范 Direction、关联 Theme、PreviewSpec、组件库
标签和上游 style-source 数量构建 schema v5 目录视图模型。每个条目对应一个
Direction，并携带关联 Theme 选择及轻量 `previewUrl`，不会内嵌 SVG。
`scripts/build-catalog-site.mjs` 会把 HTML、JSON、CSS、JavaScript、favicon、
规范预览 `previews/v2/<direction-id>/<theme-id>.svg`，以及兼容的历史预览
`previews/<legacy-style-id>.svg` 一起写入 `dist/pages`。

目录模型同时生成 `entryIndex` 和词项到数字条目下标的倒排 `searchIndex`，
避免在每个搜索词 postings 中重复较长的风格 ID。搜索对
命中索引的精确词项取 postings 交集，对未知或前缀词回退到标准化文本的子串
匹配，再与体验类型、family、页面类型、密度、调性和组件库标签组合过滤。客户端按
24 张 Direction 卡片一批渐进渲染，避免 Catalog 继续扩展后一次创建全部 DOM
和图片请求；切换 Theme 只更新 Direction 卡片中的预览，不复制卡片。

无搜索、无筛选时，客户端消费构建期生成的数字顺序，按六种受治理体验类型稳定
轮转，并保留每类内部的规范顺序。当前首批 24 张每类各 4 张；只要出现搜索或任一
Facet，结果就回到规范/搜索索引顺序，因此平衡逻辑不会隐藏或提升筛选结果。

静态站点中的资源全部使用相对路径，因此可以正确运行在 GitHub 项目站点的
子路径下。`.github/workflows/pages.yml` 会在 PR 中构建产物，并在 `main` 分支
上部署到 GitHub Pages。`browse` 输出或打开托管地址；旧的 `serve` 只作为兼容
别名，不再启动完整目录的本地服务。页面把全部已审查 Direction 显示为完整
卡片；`catalog/generated/style-sources.json` 中当前 109 条记录仍然只是来源
索引，只动态显示统计数量，绝不会未经审查就升级为 Direction 卡片。

模型还包含由浏览器 schema/asset 契约、共享体验类型 taxonomy，以及规范 Direction、
Theme、关联、PreviewSpec 与 alias 文档确定性计算的 `catalogRevision`。CLI 会把本地
预期 revision 附在 Pages URL 上；浏览器把它
与已部署 HTML、JSON 的 revision 对比，部署滞后时显示不阻断浏览的提示。

该入口有意与 `preview --serve` 分离：前者浏览完整且经过审查的 Catalog，
并由 GitHub Pages 公开托管；后者只在 `127.0.0.1` 提供某一次生成的推荐结果。

## 4. 推荐核心

`src/core.mjs` 根据 family、页面类型、受众、产品目标、密度、调性、关键词和
适用场景，为 Direction 进行确定性加权匹配。程序会标准化词项、过滤过于通用
的 brief 词，并只从达到相关性阈值的 Direction 中做相关性优先的差异化。
Direction 排名完成后，`selectThemeForDirection` 才会根据同一 brief 为关联 Theme
评分；稳定并列时优先默认关联，再按 Theme ID 排序。该阶段不会改变 Direction
的分数和顺序。

Agent Skill 只负责编排：收集 brief、调用 CLI、展示结果并等待用户选择，
不会在运行时自行判断或重排风格。回归测试使用 12 个场景的推荐 benchmark
校验 Top 1、Top 5 family 覆盖和重复运行的确定性。

未来可以增加 embedding 或可选 rerank，但当前风格选择门禁不依赖它们。

session schema v2 记录 `shownDirectionIds`；`--again` 排除已展示 Direction，旧
`shownStyleIds` 仍可通过 alias 读取。推荐结果包含评分后的 Direction、所选 Theme、
PreviewSpec、本地 SVG 卡片、Direction 参考 URL 和 Theme provenance。

`scripts/validate-curated-catalog.mjs` 保留 legacy Profile/Visual/preview 策展门禁；
`scripts/migrate-direction-theme-catalog.mjs --check` 验证规范投影可确定性重建，
`scripts/validate-direction-theme-catalog.mjs` 则验证 Direction、Theme、关联、
PreviewSpec、alias、provenance 与 token 完整性。`npm run check` 会执行这些门禁、
预览检查、生成索引校验和完整测试集。

## 5. 项目契约

用户选择 Direction/Theme 组合后，推荐流程会把两个 ID 一并传给 `apply`，生成
项目专属的 `DESIGN.md` 和 `.ui-style-director/first-viewport-draft.svg`，其中记录：

- 选定 Direction 与 Theme ID；
- Direction 结构与对应 PreviewSpec；
- Direction 参考链接；
- Theme appearance、语义 token 与固定 Theme 来源；
- 项目 brief；
- 首屏结构；
- 布局规则；
- 色彩角色；
- 字体；
- 组件建议；
- 品牌安全要求。

agent 先展示草图并等待确认，再从这份契约实现 UI，而不是在编码时重新猜测视觉方向。

## 6. Agent Skill

`skills/web-style-director/SKILL.md` 把 CLI 封装成 agent 工作流：

1. 补充缺失场景信息。
2. 排序 5 个 Direction，为每个选择关联 Theme，并展示本地 SVG 卡片与
   Light/Dark 参考。
3. 等待用户选择。
4. 用户不满意时换一批。
5. 生成 `DESIGN.md` 与项目首屏草图。
6. 等待草图确认。
7. 再开始实现 UI。

同一个 skill 会把明确的 `browse`、旧 `serve` 或目录浏览意图直接路由到托管页面，
而不进入五方案网站工作流。它还会把明确的更新或卸载意图路由到根目录
`INSTALL.md`，使用户侧生命周期操作与 provider catalog 维护保持分离。

Codex 与 Claude Code 共用同一份 `SKILL.md`，仅安装路径和显式调用语法不同。skill 可以直接在仓库中运行，也可以复制到对应 agent 的个人 skill 目录。

## 为什么使用 Provider Adapter

上游项目通过 adapter 接入，而不是整库复制。`generic-design-md` 与旧版
`awesome-design-md` Adapter 负责规范化 `DESIGN.md`；`daisyui-themes` Provider 的
`daisyui-theme-css` Adapter 则只发现 `packages/daisyui/src/themes/` 下的 35 个
主题文件，解析受治理的主题 token，确定性转换 OKLCH 颜色，并输出用于内容哈希与
策展模型输入的规范 JSON。
原始 CSS 指令不会直接进入消费端 Catalog。这样可以让来源归因保持明确、逐个检查
许可证、同步上游更新，并让生成网站使用风格契约而不是克隆品牌。

Provider inventory、style-source 与 component-source 生成产物使用 schema v4；
托管浏览器视图模型独立使用 schema v5，两类契约不可混用。
