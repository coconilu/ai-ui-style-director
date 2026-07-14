# CLI 参考

CLI 是 `web-style-director` skill 使用的实现层。大多数用户应直接调用 skill，而不必手动运行这些命令。

在仓库根目录运行：

```bash
node bin/ai-ui-style-director.mjs <command>
```

## `recommend`

根据 brief 推荐 5 个 UI 方向：

```bash
node bin/ai-ui-style-director.mjs recommend \
  --brief "面向财务团队的 B2B SaaS dashboard" \
  --count 5
```

参数：

- `--again`：排除当前 session 已展示过的 Direction。
- `--session <path>`：指定 session 状态文件。
- `--count <number>`：指定最多返回多少个结果。
- `--open`：使用系统默认浏览器打开生成的推荐画廊。
- `--json`：输出机器可读 JSON。

如果 brief 缺少必要信息，命令会返回针对性的补充问题，而不是直接推荐。

Direction 的匹配和排序由 `src/core.mjs` 根据 Catalog 元数据执行确定性规则。
排序完成后，程序再根据 brief、默认关联和稳定的 Theme ID 决胜规则，为每个
Direction 选择一个已关联 Theme；Theme 选择不会改变 Direction 的分数和顺序。

每个文本推荐结果和画廊都会展示 Direction ID、Direction 名称、所选 Theme ID
和 Theme 名称；机器可读结果还包含 Theme appearance 与 tokens，并返回：

- 本地生成的 SVG 草图绝对路径；
- 主要上游参考的 Light/Dark 实时预览；
- 两个额外视觉参考标签。

命令还会在 session 文件旁自动生成自包含的
`.ui-style-director/recommendations.html`，并在文本输出中提供本地路径与
`file://` 地址。

session schema v2 保存 `shownDirectionIds` 和最近的 Direction/Theme 选择。
它仍会读取旧 `shownStyleIds`，并通过 alias Catalog 将已知旧 ID 还原为
Direction，因此 `--again` 始终按 Direction 排除。

## `browse`

输出只读完整目录的 GitHub Pages 地址，并可自动打开：

```bash
node bin/ai-ui-style-director.mjs browse --open
```

参数：

- `--open`：使用操作系统默认浏览器打开托管页面。
- `--json`：输出机器可读的托管目录信息。

JSON 对象包含 `catalogUrl`、`hosted`、`catalogRevision`、`directionCount`、
`themeCount`、`linkCount`、兼容字段 `styleCount`、`sourceCount` 和 `opened`。
命令会立即返回，不会启动本地服务。`serve` 保留为
兼容别名，并在标准错误中提示迁移；其余行为与 `browse` 相同。两条命令都会
拒绝 `--port`，该参数只用于 `preview --serve`。

页面按 Direction 展示一张卡片，并可在其关联 Theme 之间切换。当前已提交快照
包含 57 个 Direction 和 77 个 Direction/Theme 关联；这只是当前数据量，不是
产品限制或未来上限。卡片继续展示已审查元数据、组件库建议和上游参考，并支持
文本搜索以及体验类型等现有标签过滤；搜索还识别“C端应用”“后台”等常见中文
别名。URL 使用 `tag=experienceType:consumer-app` 这类规范 ID 保存状态。

托管页面的 `catalog.json` 使用轻量 schema v5。它返回 Direction、关联 Theme
选择和 `previewUrl`，不会把 SVG 编码进 JSON；规范预览由相对同源路径
`previews/v2/<direction-id>/<theme-id>.svg` 提供，历史链接继续由
`previews/<legacy-style-id>.svg` 提供，因此两类地址都能运行在 GitHub 项目
子路径下。响应还包含
`entryIndex` 与词项到数字条目下标的 `searchIndex`，避免在每个 postings 中
重复较长的风格 ID：查询词有精确 postings 时直接
求交集，未知词或前缀词则回退到标准化 `searchText` 子串匹配。客户端先渲染
24 张卡片，用户继续浏览时再按 24 张一批追加，搜索或切换标签会重置批次，
而匹配总数始终反映全部结果。
无筛选首批按六种体验类型轮转；搜索和 Facet 视图保持规范/搜索索引顺序。

schema 还包含确定性的 `catalogRevision`。CLI 会把本地预期 revision 附在托管
URL 上，页面再与已部署 HTML 和 JSON 的 revision 比较。若 Pages 尚未更新，
页面会显示不阻断操作的旧版本提示，搜索和过滤仍然可用。

`catalog/generated/style-sources.json` 当前保存来自 7 个 Provider 的 109 条上游
来源路径，component 索引为 600 条。原有 74 条 `DESIGN.md` 来源仍是 baseline，
新增 35 条 daisyUI 主题从 pending 开始。浏览器只把这些来源作为候选素材池和背景
统计，不会将其扩充成 109 张风格卡片；只有通过策展与校验的 Direction 才作为
完整条目展示。

`browse` 及其 `serve` 兼容别名都不会创建或修改目标项目中的
`.ui-style-director/` 目录。这个在线完整目录与 `preview --serve` 有意保持
不同：后者仍会为某一次生成的推荐画廊启动本机回环服务。

## `preview`

查看或打开最近一次生成的单批推荐画廊：

```bash
node bin/ai-ui-style-director.mjs preview --serve
```

参数：

- `--path <file>`：指定默认 `.ui-style-director/` 目录之外的画廊。
- `--open`：使用操作系统默认浏览器打开画廊。
- `--serve`：启动前台 HTTP 预览服务并输出本地链接。
- `--port <number>`：为 `--serve` 指定端口；默认值 `0` 表示由操作系统
  选择可用端口。
- `--json`：以 JSON 输出画廊路径、URL 和打开状态。

`--serve` 只监听 `127.0.0.1`，只提供指定画廊，并持续运行到用户按下
Ctrl+C。与 `--open` 一起使用时会自动打开 HTTP 链接。不加 `--serve` 时保留
原来的文件模式：输出 `file://` 地址，`--open` 直接打开该文件。HTML 已内嵌
全部 SVG 卡片，因此远程用户也可以单独复制或下载；通过 SSH 使用本机回环
HTTP 链接时需要端口转发。

## `apply`

用户选择 Direction 和 Theme 后，生成项目设计契约：

```bash
node bin/ai-ui-style-director.mjs apply \
  --style operational-saas-console \
  --theme theme-a1ba3ddb542f \
  --project ./my-site \
  --brief "B2B SaaS 工作流 dashboard"
```

参数：

- `--style <id>`：必填的 Direction ID 或 legacy style ID。
- `--theme <id>`：与 Direction 关联的 Theme ID；推荐流程必须显式传入。
- `--project <path>`：目标项目，默认是当前目录。
- `--brief <text>`：写入设计契约的项目 brief。
- `--force`：在适当情况下替换已有的生成契约。
- `--json`：输出机器可读 JSON。

生成文件：

```text
my-site/
  DESIGN.md
  .ui-style-director/
    first-viewport-draft.svg
    selected-style.json
    recommended-components.json
    source-attribution.json
```

`first-viewport-draft.svg` 是项目级首屏草图。agent 应在开始实现前展示它并等待用户确认。

在直接使用 CLI 时，可以为兼容场景省略 `--theme`：legacy style ID 会优先查询
alias 并恢复其历史 Direction/Theme 组合；只有不与 legacy alias 同名的规范
Direction ID 才回退到声明的默认 Theme。推荐流程仍必须显式传入两个 ID，确保
实际应用的组合就是用户已审阅的组合。

v2 `DESIGN.md`、`selected-style.json` 和 `source-attribution.json` 会把 Direction
结构 provenance 与 Theme 配色 provenance 分层记录。项目草图携带两个 ID，并
使用所选语义结构和 Theme tokens。

## `questions`

输出 brief 信息不足时使用的场景问题：

```bash
node bin/ai-ui-style-director.mjs questions
```

添加 `--json` 可获取机器可读输出。

## `sync`

读取 provider 配置并写入 provider lock 文件：

```bash
node bin/ai-ui-style-director.mjs sync
```

添加 `--clone` 可把配置的 provider 仓库克隆或快进更新到本地缓存。使用 `--cache-dir <path>` 可指定缓存位置。

## `refresh-catalog`

刷新 Provider 缓存，运行配置的来源 Adapter、扫描组件元数据，并把可提交的
schema-v4 Provider 索引写入 `catalog/generated/`：

```bash
node bin/ai-ui-style-director.mjs refresh-catalog --clone
```

`daisyui-theme-css` 只发现 35 个主题 CSS 文件，在确定性转换 OKLCH 后输出规范
JSON。这个生成索引 schema 与托管浏览器使用的 schema-v5 `catalog.json`
彼此独立。

参数：

- `--clone`：扫描前克隆或更新 provider 仓库。
- `--cache-dir <path>`：指定 provider 缓存。
- `--generated-dir <path>`：指定生成索引目录。
- `--json`：输出机器可读 JSON。

生成文件：

```text
catalog/generated/
  provider-inventory.json
  style-sources.json
  component-sources.json
```

`update` 仍作为 `refresh-catalog` 的兼容别名，但它**不会**更新用户已安装的 Web Style Director。用户侧工具更新遵循根目录 `INSTALL.md` 中的 `Update` 流程。
