# AI UI Style Director

[English](README.md)

AI UI Style Director 是一个面向编程 agent 的工作流和 CLI，用来在新建或重构网站前先推荐 UI 风格方向。

它解决 AI 生成网站时一个常见问题：agent 在视觉方向还没明确时就开始写代码。这个项目增加了一道风格选择门禁：

1. 理解用户的新建网站或重构网站场景。
2. 从整理好的风格目录里推荐 5 个相关 UI 方向。
3. 如果用户不满意，重新推荐 5 个未展示过的备选方向。
4. 用户选择一个方向后，生成项目专属 `DESIGN.md`。
5. 编程 agent 再基于这个 `DESIGN.md` 实现 UI。

## 为什么它不是另一个组件库

这个项目是给 coding agent 用的风格路由器。它会连接设计参考语料和组件库，但不会复制上游品牌、截图或专有资产。

它把两个问题分开：

- **Style profiles**：受 `DESIGN.md` 语料启发、适合 agent 阅读的设计方向。
- **Component kits**：可落地的实现材料，例如 shadcn/ui、Origin UI、Magic UI 和 Tremor。

## 快速开始

推荐 5 个 UI 风格方向：

```bash
node bin/ai-ui-style-director.mjs recommend --brief "AI developer tool website"
```

用户不满意时，排除上一轮结果并重新推荐：

```bash
node bin/ai-ui-style-director.mjs recommend --brief "AI developer tool website" --again
```

用户选择风格后，为项目生成 `DESIGN.md`：

```bash
node bin/ai-ui-style-director.mjs apply \
  --style developer-product-minimal \
  --project ./examples/new-site \
  --brief "AI SDK landing page for developers" \
  --force
```

查看已配置的上游 provider：

```bash
node bin/ai-ui-style-director.mjs sync
```

可选：把 provider 仓库克隆到本地缓存：

```bash
node bin/ai-ui-style-director.mjs sync --clone
```

刷新 provider 仓库并重新生成可提交索引：

```bash
node bin/ai-ui-style-director.mjs update --clone
```

## CLI 命令

### `recommend`

根据用户 brief 推荐 5 个 UI 风格方向。

```bash
node bin/ai-ui-style-director.mjs recommend --brief "B2B SaaS dashboard for finance teams" --count 5
```

常用参数：

- `--again`：排除当前 session 已展示过的风格。
- `--session <path>`：使用自定义 session 文件。
- `--json`：输出机器可读 JSON。

如果 brief 太模糊，命令不会强行猜测，而是返回必要的补充问题。

### `apply`

生成项目级 `DESIGN.md` 和状态文件。

```bash
node bin/ai-ui-style-director.mjs apply --style operational-saas-console --project ./my-site
```

生成文件：

```text
my-site/
  DESIGN.md
  .ui-style-director/
    selected-style.json
    recommended-components.json
    source-attribution.json
```

### `sync`

读取 provider 配置并写入 provider lock 文件。加上 `--clone` 后，会克隆或更新配置里的 GitHub 仓库。

### `update`

克隆或更新 provider，扫描本地缓存里的 `DESIGN.md`、registry 文件和 docs，然后把生成索引写到 `catalog/generated/`。

```bash
node bin/ai-ui-style-director.mjs update --clone
```

生成文件：

```text
catalog/generated/
  provider-inventory.json
  style-sources.json
  component-sources.json
```

这个命令适合本地和 CI 使用。它会让上游数据保持可发现，但不会自动改写人工维护的 `catalog/style-profiles.json`。

## Agent Skill

Codex 兼容的 skill 位于：

```text
skills/web-style-director/
```

如果想让 Codex 或其他 agent 通过提示词自动安装，直接使用：

```text
docs/INSTALL_PROMPTS.md
```

这个 skill 强制执行一条规则：

> 用户选择一个推荐风格并生成项目 `DESIGN.md` 之前，不能开始写 UI 代码。

典型流程：

1. 用户要求新建网站或重构网站。
2. 如果场景信息不足，先确认必要因素。
3. 给出 5 个 UI 方向。
4. 用户选择其一，或要求再换一批。
5. 生成 `DESIGN.md`。
6. agent 读取 `DESIGN.md` 后再开始写 UI 代码。

## Provider 模型

Provider 配置在 `catalog/providers.json`。

当前 provider 角色：

- `awesome-design-md`：风格语料库
- `design-md-flow`：工作流参考
- `shadcn-ui`：基础组件
- `origin-ui`：应用和营销页面区块
- `magic-ui`：动效丰富的营销组件
- `tremor`：dashboard 和图表组件

这些 provider 是灵感来源和实现材料，不代表可以复制受保护的品牌资产。

## 目录结构

```text
ai-ui-style-director/
  bin/                         # CLI 入口
  src/                         # 推荐、应用、同步核心逻辑
  catalog/                     # 风格、provider、组件库和问题配置
  skills/web-style-director/   # Codex skill
  examples/new-site/           # 示例 brief 和生成的 DESIGN.md
  docs/                        # 架构说明
  test/                        # Node 测试
```

## 开发

运行测试：

```bash
npm test
npm run check
```

当前 MVP 没有运行时 npm 依赖。

## 保持 Provider 更新

手动刷新时运行：

```bash
node bin/ai-ui-style-director.mjs update --clone
npm run check
```

仓库里也包含一个每日定时 GitHub Action：每天刷新 provider，重新生成 `catalog/generated/*`，运行检查；如果索引有变化，会自动创建 PR。

## 品牌和许可证边界

上游 `DESIGN.md` 和 UI 仓库只作为参考和 provider 使用。生成网站时应该使用：

- 项目自有资产
- 有合适使用权的生成资产
- 保留许可证信息的开源组件代码
- 必要的来源归因

不要复制上游 logo、截图、受保护品牌名、专有文案或精确页面布局。
