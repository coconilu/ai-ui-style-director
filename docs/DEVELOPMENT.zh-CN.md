# 开发与维护

## 仓库结构

```text
ai-ui-style-director/
  bin/                         # CLI 入口
  src/                         # 推荐、应用与 provider 逻辑
  scripts/                     # 确定性预览生成
  catalog/                     # 风格、视觉、预览、provider 与问题
  skills/web-style-director/   # agent skill
  examples/new-site/           # 示例 brief 与生成的 DESIGN.md
  docs/                        # 详细文档
  test/                        # Node.js 测试
```

当前 MVP 没有运行时 npm 依赖，需要 Node.js 20 或更高版本。

## 检查

运行：

```bash
npm test
npm run check
```

`npm run check` 会验证 JavaScript 语法并运行测试。

修改 `style-visuals.json` 或预览渲染逻辑后，应重新生成风格卡片：

```bash
npm run previews
npm run previews:check
```

检查命令会确认每个 profile 都有一条视觉配置、3 条参考和一张最新提交的 SVG。

如果环境中有 Codex `skill-creator`，还应单独验证 skill：

```bash
python <skill-creator>/scripts/quick_validate.py skills/web-style-director
```

## Provider 维护

刷新 provider 生成索引：

```bash
node bin/ai-ui-style-director.mjs refresh-catalog --clone
npm run check
```

`.github/workflows/refresh-providers.yml` 每天执行该流程，并在 `catalog/generated/` 发生变化时创建 PR。

## 用户侧版本发布

安装结构或生命周期行为变化时，应保持以下入口一致：

- 根目录 `INSTALL.md`；
- `docs/PLATFORMS.md` 与 `docs/PLATFORMS.zh-CN.md`；
- `docs/VISUAL_PREVIEWS.md` 与 `docs/VISUAL_PREVIEWS.zh-CN.md`；
- `catalog/style-visuals.json` 与 `catalog/previews/`；
- `skills/web-style-director/SKILL.md`；
- `skills/web-style-director/references/lifecycle.md`；
- `skills/web-style-director/scripts/style-director.mjs`；
- 两份 README 中展示的四个操作。

安装后的工具以仓库作为 CLI 来源，并在 agent 目录注册一份独立 skill。因此更新时需要刷新仓库、重新部署 skill，再验证已安装的 wrapper。

wrapper 必须通过测试覆盖以下一等发现路径：

- Codex 仓库位于 `$HOME/.codex/tools`，skill 位于 `$HOME/.agents/skills`；
- 已安装在 `$HOME/.codex/skills` 的旧 Codex skill；
- Claude Code 仓库与 skill 位于 `CLAUDE_CONFIG_DIR`，未设置该变量时位于 `$HOME/.claude`。
