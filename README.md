<p align="center">
  <strong>高峰自动会话门：周末模式 + 高峰自动暂停 + 会话级冻结 + 后端自动重试</strong>
</p>
<p align="center">
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-263146?style=flat-square"></a>
  <img src="https://camo.githubusercontent.com/2c11fb2e0e14bb9985c5acbe61123a7441c5ee63aa27fa6e04e2a707ebfd6022/68747470733a2f2f696d672e736869656c64732e696f2f62616467652f6473682d2d706c7567696e2d72656164792d3437384342463f6c6f676f3d646565707365656b266c6f676f436f6c6f723d7768697465" alt="dsh-plugin" data-canonical-src="https://img.shields.io/badge/dsh--plugin-ready-478CBF?logo=deepseek&amp;logoColor=white" style="max-width: 100%;">
  <img alt="Public beta" src="https://img.shields.io/badge/status-public%20beta-7da1de?style=flat-square">
</p>

# dsh-session-guard

> 高峰时段自动暂停运行中的会话、低峰/周末自动续跑；配合 input-traffic 的冻结按钮做到**会话级**锁定；后端**自动重试**在冻结/门控期间让路。核心基于**自研会话门**（`agent.cancel keepInbox + goals.pause + session/event 安全边界 + followup 续跑`），不再依赖 dsh-task-control。

无需修改 dsh 源码、无需提 PR：`dsh plugin` 命令组装 + bundle patch 装配的 cordis 插件。

> 💡 **为什么推荐**：DeepSeek 已于 2026-08-17 实行**峰谷计费**——高峰时段（北京时间 9:00-12:00、14:00-18:00）单价为闲时（含午间、夜间、周末与节假日）的 **2 倍**。本插件在高峰自动停住运行会话、退峰自动续跑，错峰长跑最多可省 **50%**；手动冻结（配 input-traffic 按钮）可进一步按会话精确控停。

## 功能一览

- **周末模式**：识别周末（基于配置时区 `Intl.DateTimeFormat`，不踩裸 `getUTCDay()` 的北京边界 8 小时 bug）→ 周末无视峰谷、畅快跑。
- **高峰自动暂停（全局）**：进入高峰（且非周末）时，对所有 running root session 自动暂停；退峰自动恢复全部——**全局开关，无需手动**。
- **会话级冻结 / 恢复**：`sessionGuard` 冗余端口 + `POST /session-guard/rpc`，input-traffic 冻结按钮逐会话透传接入；也提供 `/pause /resume /cancel` 手动命令。
- **后端自动重试（D9）**：turn/end 瞬时失败（error/429/max-tokens）自适应退避自动续跑；永久失败停止；**冻结/门控期间让路**，绝不绕过会话门。
- **fail-open**：自研会话门不可用、session-guard 未装、设置服务缺失——均静默降级，绝不因依赖而崩。

## 安装

```bash
dsh plugin --profile web add github:<owner>/dsh-session-guard
```

装后重启 dsh web 并刷新页面。

## 设置（设置 → 插件 → session-guard，简单开关）

| 开关 | 默认 | 说明 |
|---|---|---|
| `enabled` | on | **高峰自动处理**：高峰时段自动暂停运行会话 |
| `weekendMode` | on | **周末模式**：识别周末 → 周末不自动暂停（周末本无高峰，畅快跑） |
| `queueFallback` | on | 自研会话门不可用时回退锁等待队列（fail-open） |
| `retryEnabled` | off | **自动重试（后端）**：瞬时失败自动续跑（默认关，保守） |

附属配置：

- `timezone`（默认 Asia/Shanghai）、`peakWindows`（默认 09:00–12:00 / 14:00–18:00）；
- `pauseMode`（`safe`/`force`）、`pauseReason`（`wait`/`stop`）——暂停推进方式；
- 重试参数：`retryText`、`retryGraceMs`、`retryCooldownMs`、`retryBackoffFactor`、`retryBackoffMaxMs`、`retryMaxConsecutive`。

## 行为

### 高峰自动门（全局）

- **入峰**（且非周末）：对所有 running root session 调 `gate.stopNextTurn`——自研会话门真暂停（不打断推理，推理完成/工具派发前落在安全边界暂停），或按 `queueFallback` 回退锁等待队列；
- **退峰 / 周末**：`gate.resume` **全部**会话（自动续跑，无需手动）；
- 状态机：单实例 `NORMAL ↔ PAUSED_PEAK`（`scheduler.js`），由单一 30s tick 驱动。

### 会话锁定（冻结）

- **冗余端口**：`ctx.provide('sessionGuard', service)`——`stopNextTurn(sessionId)` / `resume(sessionId)` / `lockQueue(sessionId)` / `unlockQueue(sessionId)` / `state(sessionId)`；
- **RPC 桥**：`POST /session-guard/rpc { action, sessionId }`——input-traffic 冻结按钮按 `sessionId` **逐会话**调用 `stopNextTurn` / `resume`；本插件未装则静默跳过（D8 fail-open）；
- **手动命令**：`/pause [force|safe] [stop|wait]`、`/resume [confirm] [rerun|skip]`、`/cancel`——作用于调用它的会话（取 `invocation.agent.id`）。

### 后端自动重试（D9）

监听 `turn/end`，将失败分类：

- **瞬时失败**（error/429/max-tokens 等）→ 自适应退避自动 `followup(retryText)` 续跑；
- **永久失败**（鉴权/余额/模型/上下文超限）→ 停止；
- **冻结/门控期间让路**：`isFrozen(sessionId)` 为真（queueLocked / paused / taskControl paused）时不重试；
- 用户介入或成功回合重置连续失败计数。

### 与 input-traffic 协作

- input-traffic 的**冻结按钮**触发时经 `sessionGuard.stopNextTurn`（RPC，会话级）透传服务端；
- input-traffic **只做冻结增强**（队列冻结/解冻 + composer block），重试归本插件后端；
- 两者共享「会话隔离」语义：input-traffic 冻结队列按 sessionId 隔离，session-guard RPC 同样按 sessionId 锁。

## 冗余端口 `sessionGuard`

```js
{
  stopNextTurn(sessionId, opts),  // 停掉 session 下一回合（自研会话门 / 回退锁队列）
  resume(sessionId, opts),        // 恢复（confirm + choice: rerun|skip）
  lockQueue(sessionId, reason),   // 显式锁队列
  unlockQueue(sessionId),         // 显式解锁
  state(sessionId),               // { queueLocked, lockReason, paused, taskControlAvailable, taskControl }
}
```

## HTTP 路由

- `GET /session-guard/state?session=<id>` — 会话状态
- `GET /session-guard/settings` — 设置 + taskControl 可用性
- `GET /session-guard/status` — 全局当前阶段（状态徽标轮询）
- `GET /session-guard/diag` — 运行时诊断
- `POST /session-guard/rpc` — `{ action: stopNextTurn|resume|lockQueue|unlockQueue|state, sessionId }`

## 状态存储

每会话 JSON：`$DSH_HOME/.dsh/session-guard/<sessionId>.json`（原子写；`DSH_SESSION_GUARD_STATE_DIR` 可覆盖）。

## 测试

```bash
npm test   # node --test tests/*.test.mjs（时区/周末/状态机/会话门/桥接/重试）
```

## 模块

| 文件 | 职责 |
|---|---|
| `src/time.js` | 高峰/周末判定（时区正确） |
| `src/scheduler.js` | 纯状态机 NORMAL ↔ PAUSED_PEAK |
| `src/pause-gate.js` | 自研会话门引擎（agent.cancel keepInbox + goals.pause + 安全边界 + followup 续跑） |
| `src/pause-store.js` | 自研暂停状态持久化 |
| `src/gate.js` | 会话门驱动（自研真暂停 / 回退锁队列，fail-open） |
| `src/bridge.js` | `sessionGuard` 冗余端口 |
| `src/retry.js` | 后端自动重试（失败分类/退避/冻结让路） |
| `src/detect.js` | 自动检测（host taskControl / client input-traffic 桥） |
| `src/store.js` | 每会话持久化状态 |
| `src/settings.js` | 设置子板块（schemastery schema + fail-open 注册） |
| `src/index.js` | host apply（设置/路由/tick/提供服务/重试接线） |
| `src/client/` | 浏览器 half（状态徽标 + 设置卡片） |

## License

MIT — 见 [LICENSE](LICENSE)。
