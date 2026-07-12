# AI 辅助风格策展自动化

这条流水线把新收录的上游 `DESIGN.md` 资料转换为受治理的 Catalog 提案。模型负责
理解和组合资料，但不能直接批准文件、伪造来源，也不能绕过仓库门禁。

## 完整流程

1. `refresh-providers.yml` 扫描已配置 Provider 并更新生成索引。每条风格来源以
   `providerId + path` 作为稳定身份，以规范化内容的 SHA-256 作为版本身份。
2. `curate-style-sources.yml` 找出当前内容哈希尚未出现在
   `catalog/curation/source-state.json` 中的新来源或变更来源。
3. Workflow 按 `provider-inventory.json` 记录的精确 revision 检出 Provider，并在
   调用模型前核对文件哈希。
4. OpenAI-compatible 客户端向 Kimi Code 发送受预算约束的请求，明确把来源标记为
   不可信数据；上下文只包含当前来源、少量相关 Profile、有限参考池和允许使用的 taxonomy。
5. 模型只能返回 `skip`，或受控 taxonomy/设计原语、主题颜色和精确来源选择，
   不能编写消费端说明文本。
6. 程序校验字段、可信词表、组件库、精确来源路径、恰好三条不重复参考、
   主来源是否包含、主题颜色、风格 ID 唯一性和确定性重复分数。
7. 通过门禁后，名称、首屏说明、布局规则、字体、风险和参考标签都由程序模板生成，
   同时生成确定性的中性 SVG。
   重复、跳过或非法候选只留痕，不会进入用户可选目录。
8. 每个处理过的来源都会在 `catalog/curation/records/` 下写入一条不可变记录，
   同时更新 source state；之后由 `npm run check` 校验完整仓库。
9. 只有上述门禁全部通过，Workflow 才创建现有
   `ai-ui-style-director-refresh` GitHub App 的写 Token。App 提交白名单内的文件、
   创建 PR 并开启 squash auto-merge；分支保护要求的 `test` 仍必须通过。

GitHub App 是可审计的仓库操作身份，不是推理引擎。Kimi Code 生成候选，Node.js
程序执行政策，GitHub 分支保护决定 App 创建的 PR 能否合并。

这是针对不可信上游文本的纵深防御：模型自由文本只保留为审计理由；后续会被消费端
Agent 读取的内容全部来自可信 taxonomy 和程序模板。`DESIGN.md` 也会明确声明：
Catalog 元数据绝不授权凭证访问、网络请求、Shell/工具执行或指令变更。

模型不能创建新的 family、taxonomy 值、组件库或说明模板。扩展这些治理词表必须走
普通的人工审查代码/政策 PR；自动策展只能重新组合已批准的原语。

## 状态与审计契约

`catalog/curation/source-state.json` 是处理游标，每条记录保存：

- Provider 与精确路径组成的稳定来源身份；
- 最近一次处理的内容哈希；
- `baseline`、`promoted`、`duplicate`、`skipped` 或 `invalid` 状态；
- 对应的不可变 record ID；
- 已晋升的 style ID（如有）。

record ID 是一次不可变处理事件的 SHA-256，输入包含 Provider、路径、当前与上一版
内容哈希、Prompt 版本、响应身份/hash、时间戳和碰撞序号。这样即使来源发生 A→B→A 回退，
也只会追加新记录，不会覆盖旧决策。审计记录还包含来源 revision、Token 用量、
规范化候选、程序门禁结果、晋升文件以及 GitHub Actions run；不会保存 API Key、
Authorization Header 或原始请求。

当前 74 条来源已经作为 `baseline` 提交，不会在首次上线时被批量发送给模型。只有
新增路径或内容哈希变化才会进入待处理队列。

## Provider Adapter

来源数量没有写死。向 `catalog/providers.json` 增加 Provider 即可；非 Awesome
来源默认使用 `generic-design-md` Adapter，递归发现文件名为 `DESIGN.md` 的资料。
现有语料显式使用 `awesome-design-md`，以继续保留原来的 overview 和 Light/Dark
预览链接。

通用来源的 Visual Reference 使用精确 `{ provider, path }` 溯源；页面链接由仓库、
固定 revision 和编码后的路径生成。未来接入其他文件格式时，应新增一个输出相同
标准来源记录的 Adapter，而不是修改策展核心和消费端契约。

扫描会索引所有匹配的 `DESIGN.md`，不存在写死的来源数量或用户选择数量。下文的
每次 5 条只是单次运行的成本上限，不是 Catalog 总量上限。

## GitHub 配置

继续复用现有 App 配置：

- Repository Variable：`REFRESH_APP_CLIENT_ID`；
- Repository Secret：`REFRESH_APP_PRIVATE_KEY`。

在未来真正出现新来源前，新增一个模型凭证：

```text
KIMI_CODE_API_KEY
```

Workflow 只在模型步骤中把它映射为通用的 `CURATOR_API_KEY`。默认参数是：

```text
CURATOR_BASE_URL=https://api.kimi.com/coding/v1
CURATOR_MODEL=kimi-for-coding
CURATOR_MAX_SOURCES=5
CURATOR_MAX_INPUT_CHARS=80000
CURATOR_MAX_OUTPUT_TOKENS=4096
CURATOR_MAX_RETRIES=1
CURATOR_REQUEST_TIMEOUT_MS=120000
```

只有可信的 `main` push、每日定时任务和手动触发能运行该 Workflow；PR 上下文不会
获得模型 Secret。模型步骤也拿不到 GitHub App Token，因为写 Token 只在确定性
校验通过后创建。

## 本地操作

校验 state 和不可变审计记录：

```bash
npm run catalog:curation:validate
```

只在全新部署且尚无 state 时创建基线：

```bash
npm run catalog:curate:baseline
```

在本地处理待办来源：

```bash
CURATOR_BASE_URL=https://api.kimi.com/coding/v1 \
CURATOR_MODEL=kimi-for-coding \
CURATOR_API_KEY=... \
npm run catalog:curate -- --clone --max-sources 5
```

没有待办时命令会干净退出，因此针对已提交的基线不需要 API Key。网络、认证等基础
设施错误不会推进 state；模型返回的结构非法时会记录为 `invalid`，避免同一来源哈希
形成无限付费重试。

## 规模与成本控制

每次最多处理 5 个来源；单个上游文档最多送入 80,000 字符；模型最多看到 60 条
参考候选和 40 个相近 Profile；请求最多重试一次。每日任务为基础设施失败提供兜底，
source-state 合并也会让大批待办通过连续的受保护 PR 逐批消化。

重复判断只扫描结构化的已策展 Profile，不扫描原始 Provider 仓库，几十到几百个风格
时足够稳定。消费端目录已经使用数值倒排索引、Facet 过滤、独立 SVG 路由和每批 24
张卡片的渐进渲染。如果未来已策展 Catalog 达到数千条，可以在不改变来源身份和审计
历史的前提下增加持久化搜索索引或 Embedding。
