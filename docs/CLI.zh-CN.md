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

- `--again`：排除当前 session 已展示过的风格。
- `--session <path>`：指定 session 状态文件。
- `--count <number>`：指定最多返回多少个结果。
- `--open`：使用系统默认浏览器打开生成的推荐画廊。
- `--json`：输出机器可读 JSON。

如果 brief 缺少必要信息，命令会返回针对性的补充问题，而不是直接推荐。

每个推荐还会返回：

- 本地生成的 SVG 草图绝对路径；
- 主要上游参考的 Light/Dark 实时预览；
- 两个额外视觉参考标签。

命令还会在 session 文件旁自动生成自包含的
`.ui-style-director/recommendations.html`，并在文本输出中提供本地路径与
`file://` 地址。

## `preview`

查看或打开最近一次生成的推荐画廊：

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

用户选择风格后，生成项目设计契约：

```bash
node bin/ai-ui-style-director.mjs apply \
  --style operational-saas-console \
  --project ./my-site \
  --brief "B2B SaaS 工作流 dashboard"
```

参数：

- `--style <id>`：必填的风格 ID。
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

刷新 provider 缓存，扫描设计与组件元数据，并把可提交索引写入 `catalog/generated/`：

```bash
node bin/ai-ui-style-director.mjs refresh-catalog --clone
```

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
