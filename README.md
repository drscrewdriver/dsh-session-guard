# dsh-session-guard

高峰自动会话门插件：**高峰时段自动暂停运行中的会话**（经 dsh-task-control 的会话执行门），
无会话门时**回退为只锁定等待队列**；**周末模式**正确识别周末、无视峰谷畅快跑。

- 设置：**设置 → 插件 → session-guard** 独立子板块，**简单开关**。
- 高峰判定基于**配置时区**（`Intl.DateTimeFormat`），周末识别不踩裸 `getUTCDay()` 的
  北京边界 8 小时 bug。
- 冗余端口：`ctx.provide('sessionGuard', service)`，input-traffic 冻结按钮可透传接入。

## 安装

```bash
dsh plugin --profile web add github:<owner>/dsh-session-guard
```

装后重启 dsh web 并刷新页面。

## 设置（简单开关）

| 开关 | 默认 | 说明 |
|---|---|---|
| `enabled` | on | **高峰自动处理**：高峰时段自动暂停运行会话 |
| `weekendMode` | on | **周末模式**：识别周末 → 无视峰谷，畅快跑 |
| `resumeOnWeekend` | on | 进入周末自动恢复已暂停会话 |
| `queueFallback` | on | 无会话门（task-control 未装）时回退锁等待队列 |
| `retryEnabled` | off | **自动重试**（后端）：turn/end 失败（error/429/max-tokens）自动续跑 |

附属配置：`timezone`（默认 Asia/Shanghai）、`peakWindows`（默认 09:00–12:00 / 14:00–18:00）、
`pauseMode` / `pauseReason`（透传 taskControl.pause，默认 safe+wait）、
`retryText` / `retryGraceMs` / `retryCooldownMs` / `retryMaxConsecutive`（重试参数）。

## 行为

- **高峰进入**（且非周末）：对所有 running root session 调
  `taskControl.pause(id, { mode:'safe', reason:'wait' })` —— 不打断推理，
  推理完成后、工具派发前暂停，给输入窗口让位。
- **无 taskControl**：回退为**只锁等待队列**（自带实现，不依赖 input-traffic），fail-open 不报错。
- **退峰 / 周末**：`taskControl.resume(id, { confirm:true })` 或清队列锁。
- **自动重试（后端，D9）**：监听 `turn/end`，error/interrupted/max-tokens 且分类为
  瞬时失败时，自适应退避自动 `followup(retryText)` 续跑；永久失败（鉴权/余额/模型/
  上下文超限）停止；**冻结/门控期间让路**（不绕过会话门）；用户介入或成功回合重置计数。
- **input-traffic 协作**：其冻结按钮触发时经 `sessionGuard.stopNextTurn` 透传服务端，
  未装本插件则静默跳过（D8 fail-open）。input-traffic **只做冻结增强**，不承担重试
  （重试归本插件后端）。

## 冗余端口 `sessionGuard`

```js
{
  stopNextTurn(sessionId, opts),  // 停掉 session 下一回合（会话门 / 回退锁队列）
  resume(sessionId, opts),        // 恢复
  lockQueue(sessionId, reason),   // 显式锁队列
  unlockQueue(sessionId),         // 显式解锁
  state(sessionId),               // { queueLocked, lockReason, taskControlAvailable, taskControl }
}
```

## HTTP 路由

- `GET /session-guard/state?session=<id>` — 会话状态
- `GET /session-guard/settings` — 设置 + taskControl 可用性
- `POST /session-guard/rpc` — `{ action: stopNextTurn|resume|lockQueue|unlockQueue|state, sessionId }`

## 状态存储

每会话 JSON：`$DSH_HOME/.dsh/session-guard/<sessionId>.json`（原子写；`DSH_SESSION_GUARD_STATE_DIR` 可覆盖）。

## 测试

```bash
npm test   # node --test tests/*.test.mjs（27 用例：时区/周末/状态机/会话门/桥接）
```

## 模块

| 文件 | 职责 |
|---|---|
| `src/time.js` | 高峰/周末判定（时区正确） |
| `src/scheduler.js` | 纯状态机 NORMAL ↔ PAUSED_PEAK |
| `src/gate.js` | 会话门驱动（taskControl 透传 / 回退锁队列，fail-open） |
| `src/bridge.js` | `sessionGuard` 冗余端口 |
| `src/retry.js` | 后端自动重试（失败分类/退避/冻结让路） |
| `src/detect.js` | 自动检测（host taskControl / client input-traffic 桥） |
| `src/store.js` | 每会话持久化状态 |
| `src/index.js` | host apply（设置子板块/路由/tick/提供服务/重试接线） |
| `src/client/` | 浏览器 half（状态徽标 + 回退冻结按钮） |

## License

MIT
