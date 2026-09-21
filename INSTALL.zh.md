# 安装指南（官方 DSH CLI）

- [安装指南](./INSTALL.zh.md)
- [English installation guide](./INSTALL.md)
- [日本語インストールガイド](./INSTALL.ja.md)
- [한국어 설치 안내](./INSTALL.ko.md)
- [中文 README](./README.md)
- [English README](./README.en.md)
- [日本語 README](./README.ja.md)
- [한국어 README](./README.ko.md)
- [版本更新日志](./CHANGELOG.md)
- [日本語 changelog](./CHANGELOG.ja.md)
- [한국어 changelog](./CHANGELOG.ko.md)

## 0. 前置条件

```bash
echo "DSH_HOME=${DSH_HOME:-$HOME/.dsh}"
dsh --version
```

## 1. 安装

```bash
# npm (recommended; dsh-0.1.5 for DSH 0.1.5, dsh-0.1.2 for DSH 0.1.2)
dsh plugin --profile web add dsh-session-guard@dsh-0.1.5
# GitHub (alternative, builds from source): dsh plugin --profile web add github:drscrewdriver/dsh-session-guard
```

重启 dsh web 并刷新页面。

## 2. 验证

打开「设置 → 插件 → session-guard」。开关：`enabled`、`providerGuard`、`guardSubagents`、
`offPeakAutoResume`、`weekendMode`、`deferredResume`、`queueFallback`、`retryEnabled`；
文本/列表项：`officialProviders`、`officialBaseURLs`、`deferredResumeText`。

检查会话界面中的状态徽标——显示当前阶段（`高峰·拦官方` / `高峰·全部暂停` / `谷时` / `周末`）。

查看某个路由的官方源判定（host 路由，无需重启）：

```bash
curl -s 'http://127.0.0.1:3080/session-guard/provider?provider=deepseek-official'
# {"ok":true,"verdict":{"provider":"deepseek-official","official":true,"matchedBy":"endpoint","endpoint":"https://api.deepseek.com"}}
```

跑测试（不联网、不读凭据）：

```bash
npm test
```

## 3. 升级

```bash
dsh plugin --profile web remove dsh-session-guard
# npm (recommended; dsh-0.1.5 for DSH 0.1.5, dsh-0.1.2 for DSH 0.1.2)
dsh plugin --profile web add dsh-session-guard@dsh-0.1.5
# GitHub (alternative, builds from source): dsh plugin --profile web add github:drscrewdriver/dsh-session-guard
```

重启 dsh web 并刷新页面。设置在 `$DSH_HOME/settings.yaml` 的 `session-guard` 命名空间下，升级不会丢；
新增键（`providerGuard`、`deferredMode` 等）在你没动之前用默认值。

从 `0.1.3`/`0.1.4-beta.1` 升到 `0.1.5-beta.1`，唯一的行为变化是高峰期默认**只拦官方源**。
要恢复旧的「一律暂停」，把 `providerGuard` 设为 `false`（或用 `officialProviders` /
`officialBaseURLs` 收窄判定）。

## 4. 故障排查

| 现象 | 怎么查 |
|---|---|
| 高峰期会话照常跑 | `GET /session-guard/status` → `phase` 必须是 `peak`；`GET /session-guard/settings` → `enabled: true` |
| 本地 provider 被拦 | `GET /session-guard/provider?provider=<id>` → `matchedBy` 应为 `endpoint`/`unknown` 且 `official: false`。若是 `explicit`，把它从 `officialProviders` 里删掉 |
| 官方请求没被拦 | `matchedBy: 'endpoint'` 且 `official: false` 说明该路由 `baseURL` 不在 `officialBaseURLs` 里；把 host 加进去，或把路由 id 加进 `officialProviders` |
| 请求挂着不报错 | 这是 `hold` 模式的预期行为。要显式报错设 `deferredMode: 'error'`，或调小 `deferredMaxHoldMs` |
| 退峰后不自动继续 | `deferredResume` 必须开着（或手动 `/resume`）；会话级恢复看 `offPeakAutoResume` |
| 判定诊断不可用 | `GET /session-guard/diag` → `providerGuard`、`configurableProviders`、`held`、`deferred` |

## 5. 卸载

```bash
dsh plugin --profile web remove dsh-session-guard
```

重启 dsh web。卸载时挂起的请求会被释放（reject），不会泄漏 promise。
