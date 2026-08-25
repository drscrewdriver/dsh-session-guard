# task_plan.md — dsh-session-guard（会话守卫/门卫）· 峰谷会话门 + input-window 插件

## 目标（Goal）
做一个「**会话守卫（session-guard）**」插件：像门卫一样掌控会话流程——**该暂停的暂停**
（高峰自动用 **dsh-task-control 的会话执行门**安全暂停运行会话，**给 input-traffic 腾出
输入窗口**）、**该重来的重来**（后端自动重试）、该放行的放行；若本机没装会话门插件，
**回退为只锁定等待队列**。设置里必须有：
- **高峰自动处理开关**（高峰时段是否自动暂停）
- **周末模式开关**（识别周末 → 周末无视峰谷、畅快跑）
- **自动重试开关**（后端：turn/end 失败自动续跑）

## 需求拆解
1. **时间判定**：高峰检测 + **周末识别（正确时区）**，参考 save-money 的 `wallClock` 思路。
2. **会话门**（首选）：探测 `ctx.get('taskControl')`，高峰进入时对 running root session
   调 `pause(id,{mode:'safe',reason:'wait'})`，退出/周末调 `resume(id,{confirm:true})`。
   —— 这就是"给 input-traffic 提供窗口"：会话被安全暂停后，用户输入由 input-traffic
   冻结/排队，互不打断。
3. **回退**（无会话门）：只冻结等待队列（input-traffic freeze 语义 / 自带兜底队列）。
4. **设置页**：高峰自动开关 + 周末模式开关 + 时区 + 高峰窗口 + 恢复策略。

## 分阶段计划
| Phase | 内容 | 状态 |
|---|---|---|
| P0 调研 | 读 task-control 会话门 / input-traffic freeze / 周末时区处理 | complete |
| P1 设计 | 本文件：架构 + 设置 spec + ADR D1–D8 | complete |
| P2 host 实现 | time/scheduler/gate/bridge/detect/store/index + 路由 + 设置子板块 | complete |
| P3 client 实现 | 状态徽标 + 回退冻结按钮 + freeze-store | complete |
| P4 验证 | 27 用例全绿：时区/周末/状态机/会话门/桥接（node --test） | complete |

## 架构设计（草稿）

```
┌────────────────────────── 插件本体（host half）──────────────────────────┐
│                                                                          │
│  time.ts       isPeak(now,tz) / isWeekend(now,tz,weekendOn)             │
│  gate.ts       会话门驱动：探测 ctx.get('taskControl')                    │
│                ├─ 有 → taskControl.pause/resume（safe wait）              │
│                └─ 无 → fallbackQueue.lock()（自带队列，只锁等待队列）      │
│  scheduler.ts  状态机：NORMAL → PAUSED_PEAK（入峰暂停）→ 退峰/周末恢复     │
│  detect.ts     自动检测（两层）：                                        │
│                host：ctx.get('taskControl')？ctx.get('sessionGuard')？        │
│                client：input-traffic bundle 是否加载（存在性）             │
│  bridge.ts     ctx.provide('sessionGuard', service)  ← 冗余端口（input-traffic 适配）│
│  设置路由      /session-guard/settings（高峰自动开关 / 周末模式 / tz / 窗口）   │
│  状态路由      /session-guard/state                                           │
└──────────────────────────────────────────────────────────────────────────┘

┌────────────────────────── 浏览器 half ───────────────────────────────────┐
│  设置面板：简单开关（高峰自动处理 ｜ 周末模式 ｜ 恢复） + 附属配置          │
│  高峰状态徽标（入峰/退峰倒计时）+ 冻结横幅                                 │
│  冻结按钮（用户触发）做两件事：                                           │
│    ① 前端冻结等待队列（input-traffic / 自带 fallback 队列）               │
│    ② 调服务端 sessionGuard.stopNextTurn(sessionId) → 停掉 session 下一回合    │
└──────────────────────────────────────────────────────────────────────────┘
```

### 模块
- **time.ts**：`Intl.DateTimeFormat(timeZone)` 投影到配置时区；`isPeak` / `isWeekend`
  （周末开关 + activeDays 语义）。周末识别走 save-money 的 `wallClock` 正确做法。
- **gate.ts**：会话门驱动 + 两种路径（有 taskControl → 会话门；无 → 自带回退队列）。
  **stopNextTurn 语义**：停掉 session 的下一回合（gate），而非只动前端队列。
- **scheduler.ts**：纯状态机（参考 save-money `computeRawState` 的可测性），
  副作用由 host 执行：入峰 → 对所有 running root session stopNextTurn；退峰/周末 → resume。
- **detect.ts**（自动检测 + 挂钩）：
  - **host 探测**：`ctx.get('taskControl')` → 会话门路径；`ctx.get('sessionGuard')` 存在性。
  - **client 探测**：input-traffic 客户端 bundle 是否已加载（存在性检测）。
  - **自动挂钩**：input-traffic 在 → 冻结按钮做「前端队列冻结 + 服务端 stopNextTurn」双动作；
    input-traffic 不在 → 本插件自带 fallback 队列 + 自身 stopNextTurn。
  - ⚠️ **契约依赖**：input-traffic 现无冻结透传入口（host 半空、freeze 模块私有）。
    需 input-traffic 侧在冻结按钮触发时补调 `sessionGuard.stopNextTurn`（一个最小桥）。
- **bridge.ts**：`ctx.provide('sessionGuard', service)` —— **冗余端口**，暴露
  `stopNextTurn/resume/lockQueue/unlockQueue/state`；input-traffic 冻结按钮适配后调用
  `stopNextTurn`。**同一冻结按钮** = ① 前端冻结队列 + ② 服务端停下一回合。
  高峰自动暂停走同一 gate（scheduler → stopNextTurn）。
  **fail-open**：`sessionGuard` 是可选协作——input-traffic 调用侧用可选检测 + 尽力而为，
  后端不在时静默跳过服务端步，只保留前端冻结（无显式报错）。
- **fallback-queue**：自带队列锁（无 input-traffic 也可用）；与 input-traffic 共存时
  走 bridge 透传，不重复锁。

### 设置 UI 形态（已确认：插件子板块 + 简单开关）
- 通过 `ctx.inject(['settings'])` + `settingsNamespace('<ns>')` 注册 schema，
  在 **设置 → 插件 → 本插件名** 下生成独立子板块（同 client-auto-retry 标准写法）。
- **布尔字段渲染成简单开关**（switch），高峰自动处理、周末模式两个就是开关。
- 附带配置项也用 schema 字段（时区/高峰窗口/恢复策略），非开关项用普通输入控件。

### 设置 spec（schema 字段 → `/session-guard/settings`）
```ts
// 简单开关（boolean，渲染为 switch）
enabled: boolean      // 高峰自动处理开关
weekendMode: boolean  // 周末模式：周末无视峰谷（畅快跑）
resumeOnWeekend: boolean  // 周末到了自动恢复
queueFallback: boolean    // 无会话门时回退锁等待队列

// 附属配置（非开关）
timezone: string      // 默认 Asia/Shanghai
peakWindows: [{ start:"09:00", end:"12:00" }, { start:"14:00", end:"18:00" }]
pauseMode: "safe"     // 透传 taskControl.pause mode
pauseReason: "wait"   // 透传 taskControl.pause reason
```

## 关键决策记录（ADR）
- **D1** 周末识别用配置时区 `Intl.DateTimeFormat`，不用裸 `getUTCDay()`（避免 off-peak 的边界 bug）。
- **D2** 高峰自动处理默认 `safe`+`wait`：不中断推理，推理完成在工具派发前暂停，给输入窗口让位。
- **D3** 会话门可用性探测 = `ctx.get('taskControl')`；缺失时按 `queueFallback` 回退只锁队列。
- **D4** 暂停状态不写 session log，走插件自有持久化（学 task-control），避免重启后会话不可加载。
- **D5** 回退层**自带队列实现**（不依赖 input-traffic）；同时暴露 `sessionGuard` 冗余端口让 input-traffic 适配。
- **D6** 冻结按钮（用户触发）做**两件事**：① 前端冻结等待队列；② 调服务端
  `sessionGuard.stopNextTurn(sessionId)` 停掉 session 下一回合。高峰自动暂停走**同一 gate**
  （scheduler → stopNextTurn），默认**全局生效**。
- **D7** 自动检测/挂钩的范围（诚实边界）：
  - ✅ host 可自动探测 `taskControl`（会话门）——纯自动。
  - ✅ client 可自动探测 input-traffic **是否存在**（bundle 加载）——纯自动。
  - ⚠️ **冻结按钮透传非全自动**：input-traffic 现无任何程序化 freeze 入口（host 半空、
    freeze 模块私有）。需 **input-traffic 侧补一个最小桥**：冻结按钮触发时调用
    `sessionGuard.stopNextTurn`。本插件定义 `sessionGuard` 契约 + 自动探测；input-traffic 负责接入。
- **D8** 冻结按钮**自适应 fail-open**：后端协作插件（session-guard）**未安装时**，
  冻结按钮**不得显式报错**，优雅降级为**只冻结前端等待队列**。服务端调用一律
  **可选检测 + 尽力而为**（`ctx.get('sessionGuard')` 探测、optional 调用、失败静默），
  绝不因缺后端而中断冻结动作。
- **D9** **自动重试在后端**（session-guard host 自建 retry 模块，监听 turn/end error/429/
  max-tokens，自适应退避自动续跑）；**input-traffic 只做冻结增强（串联）**，不吸收
  重试逻辑——因此 input-traffic 改造从 feature 分支**只取冻结增强部分**（queued+steering
  摘除 / sendSteer / freeze 清中断态），auto-continue 吸收部分不纳入（重试归后端）。
  冻结（高峰暂停）期间重试让路：会话被门控时不触发自动重试。

## 待用户确认
- ✅ **已确认**：独立 DSH 插件，设置放 **设置 → 插件 → 本插件名** 独立子板块，简单开关。
- ✅ **已确认（回退层）**：自带队列实现（不依赖 input-traffic）；同时**保留冗余端口**（暴露一个
  `sessionGuard` 服务/接口），让 input-traffic 去适配接入。
- ✅ **已确认（暂停粒度）**：高峰暂停默认**全局生效**；冻结按钮做**两件事**（前端冻结队列 +
  服务端 `sessionGuard.stopNextTurn` 停下一回合）；input-traffic 冻结按钮触发时透传调服务端 `sessionGuard`。
- ✅ **已确认（input-traffic 改造）**：方案 A（patch input-traffic），**基座 = 未合并 main 的
  feature 分支 `feat/absorb-auto-continue`**（fork 该分支 + 加 peak-bridge 子分支，再提 PR）。
  改造遵循"冻结 = 一等公民"纪律，`sessionGuard` 调用 **fail-open**（D8）。

## 错误记录
| 错误 | 尝试 | 解决 |
|---|---|---|
| git clone schannel/连接失败 | 禁用 SSL / 换分支 | 网络间歇，改用 codeload tarball + GitHub API |
| tarball 截断 | 换大超时重下 | 完整 3.5MB 解出 |
| task-control src 不在 tarball | 用 GitHub API tree 定位 lib/*.js | raw 单独下载成功 |

## Phase 5（新增）—— 自实现真实锁定（脱离 dsh-task-control）

用户定案：**不装/不依赖 dsh-task-control，session-guard 自行实现"真暂停/锁定推进"**。
蓝本 = `.peakref/task-control/lib/index.js`（837 行，已通读，见 findings.md §7）。
runtime 原语（agent.cancel / goals.pause / session/event 边界 / followup /
createUserMessage）皆来自 dsh runtime 本身，非 task-control 私有，可直接自研复用。

| Phase | 内容 | 状态 |
|---|---|---|
| P5.0 研读 | 通读 task-control lib/index.js，摸清 runtime 原语与安全边界 | complete |
| P5.1 设计 | 自研会话门模块（真暂停）：状态模型 + pause/resume + session/event 边界 + 持久化；接到 gate.stopNextTurn | complete |
| P5.2 实现 | 复用 runtime 原语实现真暂停；gate 改为「自研真暂停」路径，queueFallback 仅作 agent 不可用降级 | complete |
| P5.3 验证 | 新增自研会话门单测 + 现有 31 用例回归，全绿 | complete |

### 自研会话门设计要点（待用户确认范围后再定稿）
- **暂停粒度选择**：A) 全量移植（force/safe+stop/safe+wait + resume 确认/跳过复杂流程 + 命令 UI）
  vs B) 轻量高峰门（只做 **safe+wait** 安全边界暂停 + 退峰/周末自动恢复，无命令 UI）。
  session-guard 是「高峰自动门」，B 更贴合、侵入小；A 接近 task-control 全能力。
- **接点**：现有 `gate.stopNextTurn` = 自研 pause（真暂停）；`gate.resume` = 自研 resume。
  `queueFallback`（lockQueue 标记）保留，仅当 agent 不可用 / 无法安全落地时降级。
- **风险**：依赖 dsh runtime 内部 API（agent.cancel/goals/session/event/followup），
  需实测 API 形状；改动 core 暂停语义，须回归现有 31+ 用例并做强隔离（失败 fail-open 回退 lockQueue）。
