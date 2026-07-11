# 架构

AI UI Style Director 分为六层。

## 1. Catalog

Catalog 保存标准化设计知识：

- `catalog/style-profiles.json`：人工维护的风格方向。
- `catalog/style-visuals.json`：预览变体、主题和真实视觉参考。
- `catalog/previews/`：生成的无品牌 SVG 卡片。
- `catalog/component-kits.json`：可支持不同风格的实现组件库。
- `catalog/providers.json`：风格或组件来源仓库。
- `catalog/generated/style-sources.json`：上游风格来源路径索引；这些路径是
  来源线索，不是已策展的风格 profile。
- `catalog/scenario-questions.json`：brief 信息不足时需要确认的问题。

结构化 catalog 让 agent 无需把大量上游仓库加载进上下文就能选择风格。

## 2. 视觉预览层

`src/preview.mjs` 把标准化视觉元数据渲染为确定性的 SVG 线框草图。`scripts/generate-style-previews.mjs` 生成并验证 12 张提交到仓库的风格卡片；同一个渲染器在选定后生成项目级 `first-viewport-draft.svg`。

`src/core.mjs` 会把每一组推荐打包为自包含的
`.ui-style-director/recommendations.html` 画廊。生成式 SVG 卡片以 data URI
内嵌，因此纯终端或远程用户只需复制或下载一个可移植预览文件。CLI 通过
`preview` 命令暴露该画廊，并提供可选的跨平台 `--open` 操作。对于纯终端
客户端，它还可以在 `127.0.0.1` 启动一个最小前台 HTTP 服务；该服务只暴露
指定画廊，默认由操作系统分配可用端口。

`src/loopback-server.mjs` 提供推荐预览与完整目录浏览共同使用的本机回环
HTTP 边界。host、端口、请求、缓存和停止行为集中在同一个模块中，避免两个
入口的安全边界发生偏移，同时保持它们展示的内容相互独立。

视觉预览层把本地中性草图与外部 Light/Dark 参考分开：上游预览只用于比较，不能作为 vendored 或发布资产。

## 3. 目录浏览器

`src/catalog-browser.mjs` 从已策展的风格 profile、视觉元数据、生成式 SVG
卡片、profile 中的组件库标签和上游 style-source 数量构建目录视图模型。
`serve` 通过只读页面暴露该模型，并提供文本搜索以及 family、页面类型、
密度、调性和组件库过滤。

浏览器只在 `127.0.0.1` 提供 `/`、`/catalog.json`、`/app.js` 和
`/styles.css`。页面把全部已策展 profile 显示为完整卡片；
`catalog/generated/style-sources.json` 中的记录仍然只是来源索引，只动态显示
当前统计数量，绝不会未经审查就升级为风格 profile。

该入口有意与 `preview --serve` 分离：前者浏览完整且经过审查的 Catalog，
后者只提供某一次生成的推荐结果。两者都不是公共托管服务。

## 4. 推荐核心

`src/core.mjs` 根据页面类型、受众、产品目标、密度、调性、关键词和场景线索，为风格 profile 进行确定性加权匹配。

未来可以增加 embedding，但风格选择门禁并不依赖 embedding 才能发挥作用。

推荐结果会在评分 profile 之外附带本地 SVG 卡片和展开后的视觉参考 URL。

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

同一个 skill 会把明确的 `serve` 或目录浏览意图直接路由到前台目录浏览器，
而不进入五方案网站工作流。它还会把明确的更新或卸载意图路由到根目录
`INSTALL.md`，使用户侧生命周期操作与 provider catalog 维护保持分离。

Codex 与 Claude Code 共用同一份 `SKILL.md`，仅安装路径和显式调用语法不同。skill 可以直接在仓库中运行，也可以复制到对应 agent 的个人 skill 目录。

## 为什么使用 Provider Adapter

上游项目通过 adapter 接入，而不是整库复制。这样可以让来源归因保持明确、逐个检查许可证、同步上游更新，并让生成网站使用风格契约而不是克隆品牌。
