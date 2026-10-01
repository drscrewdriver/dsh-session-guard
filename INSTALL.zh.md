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
dsh plugin --profile web add dsh-session-guard@dsh-0.1.7

# 或直接走 git 分支
dsh plugin --profile web add github:drscrewdriver/dsh-session-guard#compat/0.1.7
```

`compat/0.1.7` 是 DSH `0.1.7-rc.x` 专线：npm 包版本号 **`3.1.1`**，dist-tag **`dsh-0.1.7`**，
`package.json` 与 `dsh.plugin.json` 的 `engines.dsh` 均为 `>=0.1.7-rc.1 <0.1.8-0`。

DSH `0.1.5-rc.x` 宿主请改用 **`compat/0.1.5`** 分支（npm dist-tag `dsh-0.1.5`，版本 `3.0.0`）。
DSH `0.1.2-rc.x` 宿主请改用 **`legacy/0.1.2`** 分支（npm dist-tag `dsh-0.1.2`，版本 `0.3.1`）。
`main` 已冻结在 `0.2.0-beta.1`，**不再是 0.1.2 线的发布分支**。

> ⚠️ 不要依赖裸包名 `dsh-session-guard`：npm 的 `latest` 标签无法同时服务两条互斥版本线
> （两条线的 `engines.dsh` 按 semver 预发布规则互斥），必须显式指定 dist-tag。

重启 dsh web 并刷新页面。

## 2. 验证

打开「设置 → 插件 → session-guard」。本线插件不注册命名空间、也不提供自定义设置卡片：它导出
`Config = SettingsSchema`，每个字段都标了 `.volatile()`，dsh 据此**自动生成这个表单**。开关：`enabled`、
`providerGuard`、`guardSubagents`、`offPeakAutoResume`、`weekendMode`、`deferredResume`、`queueFallback`、
`retryEnabled`；文本/列表项：`officialProviders`、`officialBaseURLs`、`deferredResumeText`。

峰谷/周末策略也可用 JSON 文件配置（解析顺序：`$DSH_SESSION_GUARD_CONFIG` →
`$DSH_HOME/config/session-guard.json` → `<cwd>/config/session-guard.json` →
`<plugin>/config/session-guard.json`）。该文件是默认层，自动生成表单里设过的值仍优先；改完可用
`POST /session-guard/rpc {"action":"reloadConfig"}` 热重载，无需重启。详见
[README.md](./README.md) 的「可配置峰谷策略」。

检查会话界面中的状态徽标——显示当前阶段（`高峰·拦官方` / `高峰·全部暂停` / `谷时` / `周末`）。
旁边的「畅跑」按钮（order 20，在 input-traffic 冻结按钮左侧）文案固定为「畅跑」（多于一个任务时为
`畅跑 ×N`），**点击永远打开畅跑任务管理面板**，在其中新建、暂停 / 恢复或删除**单个会话**的限时峰谷豁免
（暂停按任务逐个生效，不是会话级开关）。详见 [README.md](./README.md) 的「畅跑（free-run）」。

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
dsh plugin --profile web add dsh-session-guard@dsh-0.1.7
```

重启 dsh web 并刷新页面。设置在 apply 的组合条目里（通过自动生成的表单修改），升级不会丢；
新增键（`providerGuard`、`deferredMode` 等）在你没动之前用默认值。峰谷策略来自
`config/session-guard.json`，同样不会丢。

从 `0.1.3`/`0.1.4-beta.1` 升到 `0.1.5-beta.1`，唯一的行为变化是高峰期默认**只拦官方源**。
要恢复旧的「一律暂停」，把 `providerGuard` 设为 `false`（或用 `officialProviders` /
`officialBaseURLs` 收窄判定）。

### 从带「暂停按钮」的版本升级

旧的输入区「暂停会话 / 继续会话」按钮已**移除**，「畅跑」按钮（slot `session-guard-free-run`，
order 20）占据该位置。`/pause`、`/resume`、`/cancel` 命令与 `sessionGuard` 端口（含 `stepPause` /
`stepResume`）保持不变。畅跑窗口现在在任务面板里按小时精度编辑（开始小时 = `H:00`、结束小时 = `H:59`，即结束小时整点包含，「结束 23 时」= `23:59`）；原先想在峰谷上做的特例改由配置文件承担。

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
