# Provider 全自动刷新

Provider 目录刷新采用“正常路径无人值守、异常路径默认关闭”的设计，任何时候都
不会直接推送到 `main`。

## 正常路径

1. 定时任务或手动调度刷新 Provider 缓存。
2. `npm run check` 校验代码、预览、测试和生成目录 schema。
3. 变更白名单只允许三个 `catalog/generated/*.json` 产物。
4. 仅限本仓库的 GitHub App 创建自动化分支和 PR。
5. PR CI 自动启动，并再次执行范围与目录校验。
6. 所有必需检查通过后，GitHub 原生 auto-merge 自动 squash 合并并删除分支。

任何检查失败时，PR 保持打开且 `main` 不变。Action 运行、机器人 PR、diff、CI
日志和 squash 提交共同组成审计记录。

## 一次性 GitHub App 配置

创建一个只安装到当前仓库的 GitHub App，关闭 Webhook，并授予：

- Contents：Read and write
- Pull requests：Read and write
- Metadata：Read（GitHub 默认要求）

把 Client ID 保存为仓库变量 `REFRESH_APP_CLIENT_ID`，把 Private Key 保存为
仓库 Secret `REFRESH_APP_PRIVATE_KEY`。

开启仓库的 `Allow auto-merge` 和 `Automatically delete head branches`。继续保留
现有 `main` 保护：必须走 PR、人工审批数为 0、严格要求 `test`、必须解决对话、
要求线性历史，并禁止强推和删除。

## 安全边界

- App 只安装到本仓库，只拥有推送自动化分支和管理 PR 所需的两个写权限。
- Installation Token 一小时后过期，并在工作流结束时撤销。
- Auto-merge 无法绕过必需状态检查。
- 自动化 PR 只能修改规范化的生成目录文件。
- 上游仓库只作为数据扫描，其测试夹具不会由本项目测试命令执行。
