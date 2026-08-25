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
