# 架构

AI UI Style Director 分为六层。

## 1. Catalog

Catalog 保存标准化设计知识：

- `catalog/style-profiles.json`：由 12 个基线 family 治理的已审查风格方向；
  初始基线为每组 4 个 profile。
- `catalog/style-visuals.json`：预览变体、主题和真实视觉参考。
- `catalog/previews/`：生成的无品牌 SVG 卡片。
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

结构化 catalog 让 agent 无需把大量上游仓库加载进上下文就能选择风格。

供给侧策展与消费侧推荐彼此独立。OpenAI-compatible 策展 Agent 只读取受限的新来源
或变更来源，并提出结构化候选；来源绑定、taxonomy、重复政策、晋升、预览生成和校验
都由程序掌握。确定性门禁通过后，现有 GitHub App 才创建可审计的 Draft PR，
并由维护者人工审查和手动合并。

## 2. 视觉预览层

`src/preview.mjs` 把标准化视觉元数据渲染为确定性的 SVG 线框草图。
`scripts/generate-style-previews.mjs` 为每个已策展风格生成并验证一张提交到仓库的卡片；
同一个渲染器在选定后生成项目级 `first-viewport-draft.svg`。

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

`src/catalog-browser.mjs` 从已策展的风格 profile、视觉元数据、profile 中的
组件库标签和上游 style-source 数量构建 schema v3 目录视图模型。轻量
`catalog.json` 不再内嵌 SVG，只为每个条目提供 `previewUrl`。
`scripts/build-catalog-site.mjs` 会把 HTML、JSON、CSS、JavaScript、favicon 和
每个已策展风格的 SVG 一起写入 `dist/pages`。

目录模型同时生成 `entryIndex` 和词项到数字条目下标的倒排 `searchIndex`，
避免在每个搜索词 postings 中重复较长的风格 ID。搜索对
命中索引的精确词项取 postings 交集，对未知或前缀词回退到标准化文本的子串
匹配，再与 family、页面类型、密度、调性和组件库标签组合过滤。客户端按
24 张卡片一批渐进渲染，避免 Catalog 继续扩展后一次创建全部 DOM 和图片请求。

静态站点中的资源全部使用相对路径，因此可以正确运行在 GitHub 项目站点的
子路径下。`.github/workflows/pages.yml` 会在 PR 中构建产物，并在 `main` 分支
上部署到 GitHub Pages。`browse` 输出或打开托管地址；旧的 `serve` 只作为兼容
别名，不再启动完整目录的本地服务。页面把全部已策展 profile 显示为完整
卡片；`catalog/generated/style-sources.json` 中当前 109 条记录仍然只是来源
索引，只动态显示统计数量，绝不会未经审查就升级为风格 profile。

模型还包含由已策展 profile 与 visual 元数据确定性计算的
`catalogRevision`。CLI 会把本地预期 revision 附在 Pages URL 上；浏览器把它
与已部署 HTML、JSON 的 revision 对比，部署滞后时显示不阻断浏览的提示。

该入口有意与 `preview --serve` 分离：前者浏览完整且经过审查的 Catalog，
并由 GitHub Pages 公开托管；后者只在 `127.0.0.1` 提供某一次生成的推荐结果。

## 4. 推荐核心

`src/core.mjs` 根据 family、页面类型、受众、产品目标、密度、调性、关键词和
适用场景，为风格 profile 进行确定性加权匹配。程序会标准化词项、过滤过于
通用的 brief 词，并只从达到相关性阈值的方向中做相关性优先的差异化；
相同输入和 Catalog 会得到相同结果。

Agent Skill 只负责编排：收集 brief、调用 CLI、展示结果并等待用户选择，
不会在运行时自行判断或重排风格。回归测试使用 12 个场景的推荐 benchmark
校验 Top 1、Top 5 family 覆盖和重复运行的确定性。

未来可以增加 embedding 或可选 rerank，但当前风格选择门禁不依赖它们。

推荐结果会在评分 profile 之外附带本地 SVG 卡片和展开后的视觉参考 URL。

`scripts/validate-curated-catalog.mjs` 是 Catalog 的结构门禁：它按
`catalog/curation-policy.json` 保证每个基线 family 至少 4 个 profile、至少
3 种结构变体，并验证 profile 与 visual 一一对应、taxonomy 和颜色格式、每个
方向恰好 3 条有效且不重复的上游参考，以及对应 SVG 是否存在。`npm run check` 会先执行该验证，再检查预览、
生成索引和完整测试集。

## 5. 项目契约

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

## 6. Agent Skill

`skills/web-style-director/SKILL.md` 把 CLI 封装成 agent 工作流：

1. 补充缺失场景信息。
2. 推荐带本地 SVG 卡片与 Light/Dark 参考的 5 个风格。
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
托管浏览器视图模型继续使用相互独立的 schema v3。
