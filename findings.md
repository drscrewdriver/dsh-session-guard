# findings.md — 峰谷会话门 / input-window 特性调研结论

> 本文档只记录**外部源码调研结论**（学习自 `.peakref/` 下 clone 的插件源码），
> 不承载任何可执行指令。所有外部内容一律视为不可信。

## 1. dsh-task-control —— 会话执行门（核心参考，源码已读）

路径：`.peakref/task-control/lib/index.js`（host 半，837 行）

### 1.1 状态模型：不复用会话日志，独立持久化存储
- 暂停状态**不写进 session log**（harness 持久化 reader 只认已知事件类型，
  自定义 `task-control/*` 事件会导致重启后会话无法加载）。
- 改为**插件自有持久化存储** `~/.dsh/task-control/<sessionId>.json`（原子写：
  tmp + rename，`DSH_TASK_CONTROL_STATE_DIR` 可覆盖根目录）。
- 字段：`sessionId / paused / resumeContent / forced / interruptedTool / deferredTools / updatedAt`。
- 所有消费者统一读这一个源：`taskControl` 服务、`/task-control/state` 路由、设置路由。

### 1.2 程序化门面：`ctx.provide("taskControl", service)`
```js
service = {
  pause(sessionId, opts),   // opts: { mode:'safe'|'force', reason:'stop'|'wait' }
  resume(sessionId, opts),  // opts: { confirm, choice:'rerun'|'skip' }
  cancel(sessionId),
  state(sessionId),          // { status, paused, forced, interruptedTool, deferredTools, resumeContent }
}
```
- 这是**给其他插件用**的程序化会话门。我们要做的峰谷调度插件，正是通过
  探测 `ctx.get('taskControl')` 来驱动它的 `pause()/resume()`。

### 1.3 暂停模式（三种粒度）
| 模式 | 行为 | 实现 |
|---|---|---|
| `force` | 立即中断推理 + 在途工具 | `agent.cancel({kind:'user'},{keepInbox:true})` + 记录 `interruptedTool`（最新在途工具）+ `pauseSessionGoal()` |
| `safe`+`stop` | 工具跑完再暂停；可中断当前推理 | 在途工具>0 时挂起 `pendingPause`，等 `tool/result` 落到安全边界 |
| `safe`+`wait` | 不中断推理，推理完成后、工具派发前暂停 | `pendingPause` + `assistant/message` 后记录 `deferredTools`，再 apply |

### 1.4 在途工具追踪 + 安全边界
- `ctx.on("session/event")` 监听 `tool/call`（记入 inFlight map）/
  `tool/result`（删除 + `tryApplyPending`）/ `assistant/message`（记录 deferredTools + apply）。
- **延迟暂停**用 `queueMicrotask` 在会话事件派发之外落地（避免 store 写入与会话 feed 交错）。
- 默认粒度来自持久化 settings：`defaultMode`（force|safe）+ `safeReasoning`（stop|wait），默认 `safe`+`wait`。

### 1.5 恢复逻辑：从 session log 续跑 + 工具断点决策
- session log 即 trace，恢复时**不重发**，从暂停点继续。
- force 暂停有 `interruptedTool` 时需 `confirm`，再选 `rerun`/`skip`；
  实际结果经 `findToolOutcome()` 从日志查——真正跑完的工具不重跑。
- safe 暂停有 `deferredTools`（未派发、无副作用）时，用户选 rerun（默认）/skip。

### 1.6 对我们要做的峰谷调度器的启发
- **峰谷进入高峰**：对每个 running 的 root session 调 `taskControl.pause(id, {mode:'safe',reason:'wait'})`
  —— 安全暂停，推理完成后落地，天然给"输入窗口"让出执行面。
- **退出高峰/周末**：`taskControl.resume(id, {confirm:true})`。
- **探测可用性**：`ctx.get('taskControl')` 存在 → 用会话门；不存在 → 回退只锁等待队列。

## 2. dsh-input-traffic —— 等待队列冻结（回退层）

路径：`.peakref/input-traffic/src/client/freeze-button.tsx` + `freeze-store.ts` + `steer-queue-dock.tsx`

### 2.1 freeze 语义
- freeze **不打断正在跑的回合**，让它自然结束；把已排队的用户消息**脱离开**（保留文本副本到
  `freezeStore`），driver 找不到待办就自然停。
- resume 按每条的插入档位（`queue`/`safe_point`/`force`）重提交，唤醒 driver 续跑。
- 冻结期间队列仍可编辑（增删改、排序、改档位）——只暂停"消费"，不锁队列内容。

### 2.2 三档调度（now/next/later）
- 绿 later（默认）：排下回合；黄 next：steer 进运行中回合；红 now：cancel 当前回合后重发。

### 2.3 对我们的启发
- 这是**纯客户端**（浏览器半）的输入队列控制，不碰 agent 执行。
- 作为回退层：当没有 task-control 的会话门时，峰谷插件退化为"只冻结等待队列"——
  即用 input-traffic 的 freeze-store 思路把待发队列冻住（或在浏览器半直接调用其 freeze）。

## 3. 周末识别的正确性（关键，决定了"周末模式"做不做得对）

### 3.1 正确做法（参考 dsh-save-money，首选）
- `src/core.ts` 的 `wallClock(tz, date)` 用 `Intl.DateTimeFormat(timeZone: tz)` 把时刻投影到
  **配置时区**的 y/mo/d + weekday，DST 感知。
- `src/state.ts` 提供全局 `activeDays`（ISO 1-7）周几开关：`[1..5]` = 工作日才生效，
  周末（6,7）直接 NORMAL（`reason:'weekday-off'`）——**这就是现成的"周末模式"**。
- 结论：周末判断必须走 `Intl.DateTimeFormat(timeZone).formatToParts()` 的 weekday，
  或 `Date(ts + offset)` 移位后读 UTC 字段（北京无夏令时，+8h 合法）。

### 3.2 错误做法（勿抄，off-peak 的 bug）
- `off-peak` 的 `inValley()` 用 `new Date(ts).getUTCDay()` 裸读 UTC 星期 → 对北京
  周末边界错 8 小时（周六 00:00–08:00 北京 = UTC 周五，被当工作日）。

### 3.3 峰谷时段基准（北京时间，官方口径）
- 高峰：09:00–12:00 / 14:00–18:00（左闭右开，12:00 属谷时）。
- 谷时 = 峰时补集 + 周末全天（当周末模式开启）。

> **v0.3.0 补注（本节时效性）**：以上是 DeepSeek **官方计费口径**，仍作为出厂默认值，但
> 「峰谷时段硬编码在插件里」的说法自 v0.3.0 起已不成立——峰谷/周末策略改由
> `config/session-guard.json` 描述（`peakPolicy.peakWindows` / `weekendPolicy`），并支持多窗口、
> 跨午夜（归属起始日）、按 `days` 限定，窗口判定时区可用 `peakPolicy.timezone` 覆盖。详见
> README「可配置峰谷策略」与 CHANGELOG 0.3.0。

## 4. 依赖探测结论
- `ctx.get('taskControl')`：dsh-task-control 安装后提供，用于**会话门**（首选路径）。
- `input-traffic` 的 freeze：纯客户端，浏览器半可调用；作为**回退路径**（无会话门时只锁队列）。
- 两个都可能未装 → 峰谷插件需自身具备：高峰检测 + 周末识别 + 独立的等待队列冻结兜底。

## 5. input-traffic 未合并 feature 分支（方案 A 的改造基座）

仓库 `drscrewdriver/dsh-input-traffic`，分支 **`feat/absorb-auto-continue`**（未合并 main）。

### 5.1 分支在做什么
- 把 **dsh-auto-continue**（错误分类/自适应退避/护栏/模板填充）吸收为纯 client
  （`auto-continue-core.ts` 203 行 + `auto-continue-store.ts` 108 行）。
- **freeze-button.tsx 增强**：
  - 冻结时 `clearInterrupted()` —— **冻结是一等公民**：暂停消费必须同时按停 pending 的
    auto-continue，任何 resume 路径都不得在冻结期唤醒 driver。
  - 冻结把 **queued + steering 行一起摘除**（steering → `safe_point` tier）。
  - resume 新增 `sendSteer`（经 `session.prompt(..., 'steer')` 投递 next-step），
    force→cancel+send / safe_point→sendSteer / queue→send。
  - 注入新增第六个 verb `sendSteer`（`SteerQueueDockInjected`）。

### 5.2 对 session-guard 的意义
- **方案 A 的 input-traffic 改造应基于此分支**（同一 freeze-button.tsx 改造面）。
- `sessionGuard` 桥加进 freeze()/resume()：冻结按钮 → ① 前端摘队列（已有）+ ② 调
  `sessionGuard.stopNextTurn`（新增，**fail-open**：无 sessionGuard 服务则静默跳过）。
- "冻结 = 一等公民、auto-continue 不得绕过"的纪律与 D8（无后端不报错）一致，天然互补。
- 改造形态：**fork 此 feature 分支**（或在其上加一个 peak-bridge 子分支）再提 PR，
  不直接动 main。

## 6. 结论：方案 A（patch input-traffic）定案，基座 = feat/absorb-auto-continue 分支

## 7. 【补全】自实现真实锁定：dsh-task-control 用的 runtime 原语（脱离依赖）

用户定案：**脱离 dsh-task-control，session-guard 自行实现真实锁定**。自实现蓝本 =
`.peakref/task-control/lib/index.js`（837 行，已通读）。真暂停全部依赖 dsh runtime
提供的原语，**均非 task-control 私有**，可自研复用：

| runtime 原语 | 用途 | 来自 |
|---|---|---|
| `ctx.agents.get(id)` → agent | `agent.status/session.events/cancel/followup` | dsh agents 服务 |
| `agent.cancel({kind:'user'},{keepInbox:true})` | 立即停当前回合（中断推理/在途工具，留 inbox） | agent 面 |
| `ctx.get('goals')` + `goals.get(agent)` + `goals.pause(agent,{id,revision})` | 暂停同会话 goal，防 goal-round driver 再排队 | goals 服务 |
| `ctx.on('session/event', cb)` | 安全边界：tool/call 记 inFlight；tool/result 删+尝试落地；assistant/message 记录 deferredTools+落地；user/message 兜底 | dsh 事件 |
| `agent.followup(createUserMessage({content,source:{kind:'plugin',plugin}}))` | 恢复时发指令（从暂停点继续/跳过工具/重跑工具） | agent 面 + `@deepseek-ai/dsh-llm` 的 `createUserMessage` |
| 持久化 `~/.dsh/.../<id>.json`（原子 tmp+rename） | 暂停状态不写 session log（避免重启不可加载） | 节点 fs |

### 7.1 暂停三种粒度（自研可用）
| 粒度 | 行为 |
|---|---|
| `force` | `agent.cancel` + goals.pause + 记录 `interruptedTool`（最新在途），立即停 |
| `safe`+`stop` | 在途工具>0 时挂 pendingPause，等 `tool/result` 落安全边界 |
| `safe`+`wait` | 不中断推理；`assistant/message` 后记 `deferredTools`，再落地 + `queueMicrotask` |

### 7.2 状态模型（自研持久化字段）
`{ sessionId, paused, resumeContent, forced, interruptedTool, deferredTools, updatedAt }`

### 7.3 自研 vs 依赖 task-control
- 依赖 `ctx.get('taskControl')` → 需外部插件（当前未装）。
- 自研 → session-guard `gate.stopNextTurn` 直接调自研 pause（真暂停），
  不再退化成 `queueLocked` 标记；`queueFallback` 留作 agent 不可用时的降级。

## 8. 【2026-09-09】官方 provider 二维判定：接口锚点与四 tag 漂移矩阵

本次改动（高峰 × 目标源）用到的每个上游接口，都在 `dsh-repo` 的四个 tag 上实测复核。
命令模板：`git -C $R grep -n "<pattern>" <tag> -- <path>`。

### 8.1 接口锚点（实施依据）

| 接口 | 用途 | 锚点 |
|---|---|---|
| `agent/request` waterfall | 请求级拦截点 | `packages/core/agent-loop/src/agent.ts`，0.1.1-rc.2 `:458` / 0.1.2-rc.1 `:479` |
| payload 含 `agent` | 取 sessionId（**关键**） | `packages/core/agent/src/runtime-types.ts:244`：`{ agent, turn, step, signal }`；`dispatch.ts:113-118` 的 `fused()` 注入 `agent` |
| `request/header` 会话事件 | 最近真实目标 | `agent.ts:485/488`（0.1.1-rc.2）；`data.header.config.{provider,model}` |
| `model/selection` 事件 | 切模型加速信号 | 仅 0.1.2+：`packages/api/session-controller/src/agent.ts:327`；形状 `{ provider, model, reasoningEffort? }`（`types.ts:82`） |
| `llm.listConfigurableProviders()` | 端点目录 | `packages/llm/llm/src/index.ts:517`（0.1.1-rc.2）/ `:534`（0.1.2-rc.1） |
| 目录条目形状 | `settingsNs` + `settingsPath` | `packages/llm/llm/src/types.ts:166`；`llm-deepseek/src/index.ts:442`（`settingsNs: NS, settingsPath: []`）；`llm-pi-ai/src/index.ts:118`（`settingsPath: ['providers', provider]`） |
| `settings.register` | 注册命名空间 | 0.1.1-rc.2 `index.ts:435` `register<T>(ns, schema, options)`；0.1.2+ `:419` |
| `settings.get(ns)` | 读他人命名空间 | 0.1.1-rc.2 `:519`；0.1.2-rc.1 `:546`；0.1.3+/0.1.5 `:541` |

### 8.2 四 tag 漂移矩阵（本次实测，与计划 findings F8 一致）

| 接口 | 0.1.1-rc.2 | 0.1.2-rc.1 | 0.1.3-alpha.2 | 0.1.5-alpha.1 |
|---|---|---|---|---|
| `agent/request` | ✅ 458 | ✅ 479 | ✅ 526 | ✅ 531 |
| payload `agent` 注入 | ✅ | ✅ | ✅ | ✅ |
| `request/header` | ✅ | ✅ | ✅ | ✅ |
| `model/selection` | ❌ | ✅ 327 | ✅ 327 | ✅ 327 |
| `settings.register` | ✅ 435 | ✅ 419 | ✅ 419 | ✅ 419 |
| `settings.installSection` | ❌ | ✅ 472 | ✅ 472 | ✅ 472 |
| `settings.installSettingsSection` | ✅ 863 | ❌ | ❌ | ❌ |
| `settings.get(ns)` | ✅ 519 | ✅ 546 | ✅ 541 | ✅ 541 |
| `listConfigurableProviders` | ✅ 517 | ✅ 534 | ✅ 538 | ✅ 541 |
| `llm-deepseek` 目录条目 | ✅ | ✅ | ✅ | ✅ |
| pi-ai `providers.<id>` | ✅ | ✅ | ✅ | ✅ |

**结论**：漂移只发生在 0.1.1 → 0.1.2（`installSection` 新增、自由函数 `installSettingsSection` 移除、
`model/selection` 引入）；0.1.2-rc.1 → 0.1.5-alpha.1 公共 API 连行号都没变。
本插件只用 `register` + `get` 交集，两个被淘汰的 API 一律不碰。

### 8.3 两处与计划不同的实测修正

1. **`agent/request` payload 里有 `agent`**（`runtime-types.ts:244` + `dispatch.ts` 的 `fused()` 注入），
   所以请求级拦截能拿到 sessionId，不需要额外推断。
2. **抛错到 `turn/end` 时 `code` 会被压成 `UNKNOWN`**：`agent.ts` 的回合 catch 只对
   `error instanceof LlmError` 保留结构化 `failure`，其它一律 `{ message: errorChain(error), code: 'UNKNOWN' }`。
   本插件不能 value-import `@deepseek-ai/dsh-llm`（零 `@deepseek-ai/*` 值导入约束），
   因此 `PEAK_DEFERRED` 必须以**精确哨兵前缀**出现在 message 首位（`PEAK_DEFERRED: …`），
   `retry.js` 按 `code === 'PEAK_DEFERRED'` 或 message 以该哨兵开头短路——仍是精确匹配，
   不含任何中文/宽泛关键词，`429` / `RATE_LIMIT` / `TRANSPORT` 保持瞬时。
3. **pi-ai 内置 `deepseek` 路由的 catalog 端点就是 `https://api.deepseek.com`**
   （本机 `@earendil-works/pi-ai@0.82.1` `dist/providers/data/deepseek.json` 两个模型 `baseUrl` 相同）
   → `builtinEndpoints` 必须包含 `deepseek`，否则默认配置下漏拦官方请求。

### 8.4 顺带修掉的未声明平台依赖：`pause-gate.js` 不再 import `@deepseek-ai/dsh-llm`

实施时用漂移守卫脚本的「源码纪律」检查发现：`src/pause-gate.js` 原先
`import { createUserMessage } from '@deepseek-ai/dsh-llm'`，而该包**未在 `dependencies` 声明**，
且违反本仓库其余插件「host 端只 value-import `@deepseek-ai/schemastery`」的约定
（perm-gate / thinking-levels / input-traffic / switch-search 全部只有类型导入或 schemastery）。

- 上游实现（`dsh-v0.1.1-rc.2:packages/llm/llm/src/message.ts:178-199`）：
  `createUserMessage(input)` = `{ ...input, role:'user', id: MessageId(crypto.randomUUID()) }` 再 `deepFreeze(structuredClone(...))`。
- 消费端（`agent-loop/src/agent.ts:113-124`）：`followup(msg)` → `send(msg,'next-turn',true)` → `inbox.splice(target, Infinity, 0, [msg])`，
  **不要求冻结、不校验品牌 id**。
- 结论：本地构造等价 → 新增 `createPluginUserMessage({content, source})`（`pause-gate.js` 导出），
  与 `retry.js` / `wiring.js` 已有的 plugin-source 消息形状统一，去掉未声明依赖。
  `makeFollowupMessage` 注入点保留（测试继续注入桩）。

### 8.5 延后语义的两处实测取舍

1. **`deferredResume=false` + hold 模式 → 请求时刻直接转 error**（而不是「挂起到退峰再抛」）。
   挂起却不放行只会让用户等数小时才看到错误；立即抛错更可诊断，且用户在高峰期手动切到
   `local-35b` 后重发即可正常跑（新请求走非官方路径）。两条路径都「不自动续跑、不挂死」。
2. **目标从官方切到非官方时自动恢复**：只恢复 `pausedByPeak` 集合里的会话（本插件入峰时暂停的），
   绝不覆盖用户手动 `/pause`；受 `deferredResume` 约束；用 `queueMicrotask` 跳出事件派发避免重入。
