<p align="center">
  <strong>高峰自动会话门：周末模式 + 高峰自动暂停 + 官方源二维判定 + 会话级冻结 + 后端自动重试</strong>
</p>

<p align="center">
  <a href="README.en.md">English</a> · <strong>中文</strong> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a>
</p>
<p align="center">
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-263146?style=flat-square"></a>
  <img src="https://camo.githubusercontent.com/2c11fb2e0e14bb9985c5acbe61123a7441c5ee63aa27fa6e04e2a707ebfd6022/68747470733a2f2f696d672e736869656c64732e696f2f62616467652f6473682d2d706c7567696e2d72656164792d3437384342463f6c6f676f3d646565707365656b266c6f676f436f6c6f723d7768697465" alt="dsh-plugin" data-canonical-src="https://img.shields.io/badge/dsh--plugin-ready-478CBF?logo=deepseek&amp;logoColor=white" style="max-width: 100%;">
  <img alt="Public beta" src="https://img.shields.io/badge/status-public%20beta-7da1de?style=flat-square">
</p>

![高峰处理](assets/stop-peek.png)
![高峰处理](assets/高峰低峰周末提醒-周末状态.png)

# dsh-session-guard

- [English README](./README.en.md)
- [中文 README](./README.md)
- [日本語 README](./README.ja.md)
- [한국어 README](./README.ko.md)
- [Installation guide](./INSTALL.md)
- [中文安装指南](./INSTALL.zh.md)
- [日本語インストールガイド](./INSTALL.ja.md)
- [한국어 설치 안내](./INSTALL.ko.md)
- [Changelog](./CHANGELOG.md)
- [日本語 changelog](./CHANGELOG.ja.md)
- [한국어 changelog](./CHANGELOG.ko.md)

> **兼容性说明：** v0.1.1 已包含日语（`ja`）和韩语（`ko`）字典，但当前官方 DSH 只通过 `LocaleRuntime` 提供 `zh` 和 `en`。在原版 DSH 中选择 `ja` 或 `ko` 会失败，并提示 `locale "<id>" is not registered`。需要等待官方 DSH 增加对应 locale ID 后才能正常使用。高级用户可以维护 DSH fork 进行扩展。

> **▼ DSH 版本适配**
>
> | DSH 版本 | 加载 | 设置注册 | 会话事件 / 会话门 | 客户端半 |
> | --- | --- | --- | --- | --- |
> | 0.1.0-rc.7 ~ 0.1.1-rc.x | ✅ | `ctx.settings.register(ns, schema, { base })` | ✅ 形状一致 | ✅ 无平台值导入 |
> | 0.1.2-alpha.2+ / 0.1.2-rc.1 | ✅ | `register` 仍保留（另加 `installSection`） | ✅ 形状一致 | ✅ 无平台值导入 |
> | 0.1.3+ / 0.1.5-alpha.1 | 接口仍在（未验证） | `register` 仍在（行号未变） | ✅ | ✅ |
>
> 一份产物同时支持两版本。`session/event`、`agent.cancel`、`goals.pause`、
> `agent.followup`、`commands.register`、`timer.interval`、`webServer.register`、
> `agent/request`、`llm.listConfigurableProviders`、`settings.register/get` 在
> `dsh-v0.1.1-rc.2` 与 `dsh-v0.1.2-rc.1` 之间签名一致（并已核到 `0.1.5-alpha.1`）；
> 唯一需要双读的是 `tool/result` 记录的调用 id 形态（`content[].toolCallId` 优先、
> `source.callId` 回退），已抽到 `src/tool-call-id.js` 并配单测——两版本的回放日志都可能出现这两种形态。
> `model/selection` 事件**仅 0.1.2+**，只做切模型加速且必须特性探测；设置面只用
> `register` + `get` 交集（不碰 `installSection` / 已移除的 `installSettingsSection`）。
> 漂移守卫脚本：`tools/check-api-drift.ps1`（对四个 tag 断言必需接口存在）。

> 高峰时段自动暂停运行中的会话、低峰/周末自动续跑；配合 input-traffic 的冻结按钮做到**会话级**锁定；后端**自动重试**在冻结/门控期间让路。核心基于**自研会话门**（`agent.cancel keepInbox + goals.pause + session/event 安全边界 + followup 续跑`），不再依赖 dsh-task-control。

无需修改 dsh 源码、无需提 PR：`dsh plugin` 命令组装 + bundle patch 装配的 cordis 插件。

> 💡 **为什么推荐**：DeepSeek 已于 2026-08-17 实行**峰谷计费**——高峰时段（默认北京时间 9:00-12:00、14:00-18:00）单价为闲时（含午间、夜间、周末与节假日）的 **2 倍**。本插件在高峰自动停住运行会话、退峰自动续跑，错峰长跑最多可省 **50%**；手动冻结（配 input-traffic 按钮）可进一步按会话精确控停。

> ⚙️ **v0.3.0 起峰谷策略可配置**：时段、时区、窗口的星期限定、周末规则全部由 `config/session-guard.json` 决定，不再是硬编码；另有**畅跑**——单会话限时豁免峰谷暂停（见下文「畅跑（free-run）」）。

## 功能一览

- **可配置峰谷策略（v0.3.0）**：峰谷/周末策略由 `config/session-guard.json` 定义（四级解析顺序，设置界面的值仍优先）；三模式 `OFF_PEAK / PEAK / NORMAL`，多窗口、跨午夜、工作日限定；损坏文件 fail-open，`reloadConfig` 热重载。
- **畅跑（free-run）**：输入区一个「畅跑」按钮，给**单个会话**排一段或几段限时豁免——窗口内无视峰谷照常跑，到点自动结束并回到常规峰谷判定；排期落盘，重启不丢。
- **周末模式**：识别周末（基于配置时区 `Intl.DateTimeFormat`，不踩裸 `getUTCDay()` 的北京边界 8 小时 bug）→ 周末无视峰谷、畅快跑。
- **高峰自动暂停（全局）**：进入高峰（且非周末）时，对所有 running root session 自动暂停；退峰只自动恢复**本插件暂停的**会话（手动 `/pause` 的不动）——**全局开关，无需手动**。
- **官方源二维判定（providerGuard）**：高峰期**只在请求目标是 DeepSeek 官方源时**才拦；用本地/第三方 provider（如 `local-35b`）照常跑，不受高峰门影响。判定口径 = 显式 id 名单 → `baseURL` 端点 → catalog 默认端点 → 内置 id。
- **请求级兜底 + 延后队列**：入峰后才启动的会话、会话中途被切到官方源的情况，由 `agent/request` 请求级守卫拦住（默认 `hold`：请求挂起不报错，退峰自动放行）。
- **会话级冻结 / 恢复**：`sessionGuard` 冗余端口 + `POST /session-guard/rpc`，input-traffic 冻结按钮逐会话透传接入；也提供 `/pause /resume /cancel` 手动命令。
- **后端自动重试（D9）**：turn/end 瞬时失败（error/429/max-tokens）自适应退避自动续跑；永久失败停止；**冻结/门控期间让路**，绝不绕过会话门。
- **fail-open**：自研会话门不可用、session-guard 未装、设置服务缺失——均静默降级，绝不因依赖而崩。

## 界面预览

实际运行截屏（Windows，dsh web）——周末模式激活状态：

<figure>
  <img style="max-width:100%" alt="输入区状态控制条：处于激活态的「周末」按钮高亮（周末模式开启时无视峰谷畅快跑），相邻「冻结会话」按钮（配 input-traffic）、DeepSeek-V4-Flash 思维档位与发送控件，底部为轮次/步数、LLM 耗时、缓存命中率等状态条" src="assets/高峰低峰周末提醒-周末状态.png" />
  <figcaption>周末模式激活：输入区「周末」徽标高亮，与「冻结会话」并列；周末无视峰谷、会话自动畅跑。</figcaption>
</figure>

## 安装

```bash
# npm (recommended; dsh-0.1.5 for DSH 0.1.5, dsh-0.1.2 for DSH 0.1.2)
dsh plugin --profile web add dsh-session-guard@dsh-0.1.5
# GitHub (alternative, builds from source): dsh plugin --profile web add github:drscrewdriver/dsh-session-guard
```

装后重启 dsh web 并刷新页面。

## 设置（设置 → 插件 → session-guard，简单开关）

| 开关 | 默认 | 说明 |
|---|---|---|
| `enabled` | on | **高峰自动暂停冻结会话**：高峰时段自动暂停运行会话 |
| `stepLevelPause` | on | **step 级门控**：高峰在下一个 step 的模型请求**之前**拉门（比回合级暂停更早、更省）；关掉则回退为回合级暂停 |
| `providerGuard` | on | **官方源二维判定**：高峰期只拦 DeepSeek 官方源，本地/第三方 provider 照常跑 |
| `guardSubagents` | on | **纳入子代理请求**：子代理请求同样计费，默认一并拦截 |
| `offPeakAutoResume` | on | **低谷自动恢复**：低峰时段自动恢复被暂停的会话；关掉则退峰不自动恢复（需手动） |
| `weekendMode` | on | **周末模式**：识别周末 → 周末不自动暂停（周末本无高峰，畅快跑） |
| `deferredResume` | on | **退峰自动继续**：关闭后延后的请求/会话不自动续跑，需手动 `/resume` |
| `queueFallback` | on | 自研会话门不可用时回退锁等待队列（fail-open） |
| `retryEnabled` | off | **自动重试（后端）**：瞬时失败自动续跑（默认关，保守） |

附属配置：

- `timezone`（默认 Asia/Shanghai）——IANA 时区名，**驱动全部时间判定**（星期几 / 周末 / 峰窗口匹配）；`peakPolicy.timezone` 可单独覆盖峰窗口判定（详见下文「可配置峰谷策略」）；
- `peakWindows`/`peakPolicy`（默认 09:00–12:00 / 14:00–18:00，工作日）——峰谷窗口与周末策略的权威来源现在是配置文件 `config/session-guard.json`，设置界面里设过的值仍是最高优先级；
- `pauseMode`（`safe`/`force`）、`pauseReason`（`wait`/`stop`）——暂停推进方式；
- `stepGateTimeoutMs`（默认 300000）——step 门挂起超时；到期释放门并**升级为回合级暂停**（防死锁，不会形成「每 5 分钟一个 step」的 token 滴漏）；
- 官方源判定：`officialProviders`（追加官方 provider id，逗号分隔，优先级最高）、`officialBaseURLs`（官方端点 host 名单，默认 `api.deepseek.com`）；
- 延后队列：`deferredMode`（`hold` 挂起等待 / `error` 报错并延后）、`deferredResumeText`（退峰续跑文案）、`deferredMaxHoldMs`（挂起上限，默认 6 小时，到期转 error）；
- 重试参数：`retryText`、`retryGraceMs`、`retryCooldownMs`、`retryBackoffFactor`、`retryBackoffMaxMs`、`retryMaxConsecutive`。

## 行为

### 高峰自动门（全局）

- **入峰**（且非周末）：`stepLevelPause` 开启时**不再立即掐断回合**——会话自然跑到下一个 `agent/pre-step` 边界由 step 门拉门（见下节）；关掉则对所有 running root session 调 `gate.stopNextTurn`（自研会话门真暂停，或按 `queueFallback` 回退锁等待队列）；
- **退峰 / 周末**：先 `releaseAll` 放行被挂起的 step（回合原地续跑），再 `gate.resume` 恢复**本插件暂停的**会话——受 `offPeakAutoResume` 开关控制，关掉则退峰不自动恢复。自动释放带 `auto: true`，因此手动 `/pause` 的会话不会被覆盖；
- **峰谷时区**：由配置决定——`peakPolicy.timezone`（省略时跟随 `timezone`）驱动峰窗口判定，默认 `Asia/Shanghai`，与 DeepSeek 官方计费基准一致。v0.2.0 的「固定北京时间」不再是硬编码（见下文「可配置峰谷策略」）；
- 状态机：单实例 `NORMAL ↔ PAUSED_PEAK`（`scheduler.js`），由单一 30s tick 驱动。

### step 级门控（v0.2.0，省 token 的关键）

挂在 `agent/pre-step` waterfall 上：**在下一个 step 的模型请求发生之前**把回合挂起。

- **拉门条件**（全部满足）：`enabled` + `stepLevelPause` + `step > 1` + 高峰（按配置的峰谷时区，默认北京时间，非周末）+ 目标 provider 属官方（`providerGuard`，关闭时全部拦）+ 该会话未被请求级 hold + 本峰内未被手动跳过；
- **为什么 `step > 1`**：一个回合的第 1 个 step 由请求级守卫覆盖，两道门不重叠；
- **释放路径**：① `POST /session-guard/rpc {action:'stepResume'}` / `/resume` / 冗余端口 `stepResume` → 放行当前 step，且**本高峰内不再拦该会话**；② 退峰 → 全部放行，回合原地续跑（**不需要 followup**）；③ 冻结按钮 / `/pause` / `/cancel` → 释放门并转入回合级暂停；④ `signal` abort（用户取消）→ 释放门；
- **超时升级**：挂起超过 `stepGateTimeoutMs`（默认 5 分钟）→ 释放门并**升级为回合级 force 暂停**，退峰统一恢复（不会卡死，也不会在高峰形成 token 滴漏）；
- **状态**：`GET /session-guard/state?session=<id>` 返回 `paused: { step, turn }` 与 `stepGate: { held, since, bypass }`；服务端口 `state()` 的 `paused` **仍是布尔**（向后兼容），step 态用 `pausedStep`；
- **不落盘**：挂起的是进程内 Promise，重启即失效（避免幽灵状态）。

### 可配置峰谷策略（v0.3.0：`config/session-guard.json`）

峰谷/周末策略**不再硬编码**——改高峰时段、时区、窗口的星期限定、周末规则，都只是改一份配置文件。日常改**用户级**那一份，改完 `POST /session-guard/rpc {"action":"reloadConfig"}` 即时生效，无需重启。

解析顺序（**先命中者胜**）：

| # | 路径 | 层级 |
|---|---|---|
| 1 | `$DSH_SESSION_GUARD_CONFIG` | 显式指定路径 |
| 2 | `$DSH_HOME/config/session-guard.json` | 用户级（**日常改这里**） |
| 3 | `<cwd>/config/session-guard.json` | 项目级 |
| 4 | `<plugin>/config/session-guard.json` | 包内默认（随包发布） |

- 该文件是 cordis `settings` 命名空间的**默认层**：设置界面（设置 → 插件 → session-guard）里显式设过的值**仍然优先**；`settings` 服务不可用时直接用文件值。`reloadConfig` 读取的是设置服务的**原始用户层**，所以重载只改变你**没有**在界面上亲手改过的键——界面里改过的值依旧压过文件；
- **取值会校验，坏值不会悄悄搞坏守卫**：无法读取的文件、非法 JSON、非数组/非法 `peakWindows`、越界的标量——一律记入 `errors` 并**保留该项默认值**，绝不允许静默退化成「没有峰窗口」或守卫失效；显式写 `"peakWindows": []` 仍然算**有意为之**的「不要峰窗口」；
- **损坏不阻塞启动（fail-open）**：错误被收集、以 warning 记录（启动时与 `reloadConfig` 时各记一次），回退内置默认值——`GET /session-guard/settings` 与 `GET /session-guard/diag` 的 `configFile.errors` 能看到具体原因。即使文件值连设置 schema 都过不去，设置面板**仍会用内置默认值注册**（绝不静默消失），坏值被忽略并记 warning。

```json
{
  "enabled": true,
  "timezone": "Asia/Shanghai",
  "peakPolicy": {
    "timezone": "Asia/Shanghai",
    "peakWindows": [
      { "name": "morning",   "start": "09:00", "end": "12:00", "days": ["mon","tue","wed","thu","fri"] },
      { "name": "afternoon", "start": "14:00", "end": "18:00", "days": ["mon","tue","wed","thu","fri"] }
    ]
  },
  "weekendPolicy": { "enabled": true, "days": ["sat","sun"], "mode": "offPeak" }
}
```

| 字段 | 默认 | 说明 |
|---|---|---|
| `enabled` | `true` | 总开关 |
| `timezone` | `Asia/Shanghai` | IANA 时区名，驱动**全部**判定：星期几、周末、峰窗口匹配；**按 IANA 数据库校验**，非法/拼错的时区（如 `"Asia/Shangai"`）被拒绝并保留默认值（别名如 `Asia/Calcutta` 可用） |
| `peakPolicy.timezone` | 省略 | **只**覆盖峰窗口判定——把高峰钉在 DeepSeek 计费时区（如 `Asia/Shanghai`），周末仍跟随 `timezone`；省略则跟随 `timezone`。同样按 IANA 校验 |
| `peakPolicy.peakWindows[].name` | — | 窗口名（出现在 `/peak` 响应里） |
| `peakPolicy.peakWindows[].start` / `end` | — | `HH:MM`，**左闭右开** `[start, end)` |
| `peakPolicy.peakWindows[].days` | 省略/为空 = 每天 | `mon`…`sun`；`start > end` = **跨午夜**，且归属**起始日**（`fri` 22:00–06:00 覆盖到周六 01:00） |
| `weekendPolicy.enabled` | `true` | 周末规则开关 |
| `weekendPolicy.days` | `["sat","sun"]` | 哪些星期算周末 |
| `weekendPolicy.mode` | `"offPeak"` | 目前只支持 `"offPeak"`（整个周末视为谷时）；无法识别的 `mode` 会**记 warning 并禁用该周末规则**，不会静默接受 |

`peakWindows` **支持多个窗口**。默认行为与 v0.2.0 一致：`timezone` 默认 `Asia/Shanghai`，随包默认配置未写 `peakPolicy.timezone`（此时跟随 `timezone`），结果同为 `Asia/Shanghai`；窗口带 `days` 又叠加默认周末规则。旧设置形状 `peakWindows: [{start,end}]` + `weekendMode: true/false` 继续可用（无 `days` = 每天）。

#### 三种模式与优先级（`TimePolicyResolver`）

| 优先级 | 条件 | 模式 |
|---|---|---|
| 1 | 当天是周末日（按 `weekendPolicy`） | **OFF_PEAK**——整天，无视峰谷窗口 |
| 2 | 否则命中某个峰窗口 | **PEAK** |
| 3 | 否则 | **NORMAL**（工作日谷时） |

v0.2.0 的两值判决保留兼容：`pause === (mode === PEAK)`，`reason` 仍是 `'disabled' | 'weekend' | 'peak' | 'off-peak'`（`/status` 的旧 `phase` 字段同样保留给既有徽标）。

#### 畅跑（free-run，v0.3.0）

输入区右侧的「畅跑」按钮（slot `conversation.input.right`，id `session-guard-free-run`，order 20，排在 input-traffic「❄ 冻结追加」左侧）给**单个会话**排定**限时豁免峰谷**的任务。

**按钮**：

- 文案**固定**：`畅跑`；任务多于 1 个时为 `畅跑 ×N`——文案不再编码状态；
- **点击永远打开「畅跑任务管理」面板**（不再直接执行任何动作）；当前是否正在生效由按钮的**高亮颜色**与悬停提示表示；
- 悬停提示同时**逐条列出每个任务的时间范围与状态**，并说明点击会打开管理面板。

**面板布局（只有一个弹层，不新增其它 UI 表面）**：

- 顶部工具栏三个文字按钮：
  1. `新建畅跑任务`——展开 / 收起内联表单（`开始` / `结束`，各为原生日期选择器 + 小时下拉，**小时粒度**：开始小时 H = `H:00`，结束小时 H = `H:59`，即**整个结束小时都算在内**），带 `确定` / `取消`；
  2. `暂停全部任务`——暂停所有尚未结束的任务；当所有尚未结束的任务都已暂停时，文案翻转为 `恢复全部任务`；没有可操作的任务时禁用；
  3. `删除全部任务`——删除所有任务；没有任何任务时禁用。
- 每个任务行右侧两个图标按钮：
  1. `⏸` / `▶`——暂停 / 恢复**该单个任务**（图标与提示随该任务状态翻转）；对已经结束的任务禁用；
  2. `×`——删除该任务。
- 每行同时显示时间范围与状态标签：`进行中` / `已暂停` / `待开始` / `已结束`；
- 面板头部显示标题、时间所按解释的时区，以及一个小的 `×` 用于关闭。点击外部或按 Esc 也可关闭。

语义（精确）：

- **单会话**：只有用了该按钮的那个会话被豁免，其他会话在高峰照常暂停；
- **暂停粒度是「每个任务」**，不是会话级：不再有会话级启停开关。暂停一个任务，其余任务照常工作；
- **生效判定**：只要**至少一个未暂停的任务覆盖当前时刻**，畅跑即生效；被暂停的任务不参与判定；
- 任务是**绝对起止时刻**，半开区间 `[from, to)`，**小时精度且结束小时整点包含**：开始小时 H 取 `H:00`，结束小时 H 取 `H:59`（所以「开始 12 时 → 结束 14 时」= `12:00 → 14:59`，覆盖 12、13、14 三个小时；「开始 12 时 → 结束 12 时」只覆盖那一小时；「结束 23 时」= `23:59`，一天最后一小时 23:00–24:00 可选）；宿主的窗口仍是半开区间 `[from, to)`，只是选择器把 `:59` 交给它；表单的值按配置的 `timezone` 解释（面板标注该时区，与 `peakWindows`、周末规则同一个时区）；
- `from` 可以是**马上**也可以是**很久以后**；早于当前时刻的 `from` 会被钳到当前时刻（所以「立刻开始」可用）；
- **一次性**：每个任务到 `to` 自动结束、不再匹配——这是它的正常生命周期，**不是配置错误**，因此**不报错**；用户随时可以再新建任务；
- **自动合并只发生在暂停状态相同的窗口之间**：重叠或相邻（相邻 = 首尾相接一口气跑）且**暂停状态相同**的窗口合并；一个暂停窗口与一个启用窗口重叠时两者都保留（启用窗口仍在其覆盖时间内生效）；合并后最多 **8** 个任务，超过则新建失败并给出明确错误；
- 被暂停的任务**不产生自动状态转换**（不会自己开始），只有用户按 `▶` / `恢复全部任务` 后才重新生效；
- 任务**落盘**（每会话一个 JSON，位于插件自己的状态目录下）——因为 `from` 可能在将来，dsh 重启不能丢排期；
- 畅跑生效期间该会话不会被任何地方拦住：自动的回合级 / step 门暂停会跳过它，本来会被 `agent/request` 挂起的请求也放行（插件为此加了**按会话的 `release`**，让已经挂起的请求继续）；
- 当畅跑不再适用（所有覆盖此刻的任务都被暂停，或某个任务的窗口在峰内结束）时，会话**重新挂起**，并在下一个谷时自动继续——即「会话自动挂起，等待波谷自动继续」；
- 不影响 `providerGuard`、手动 `/pause`、周末规则或全局峰谷状态机（`GET /session-guard/status` 仍是全局的——畅跑是会话级概念，不改变全局徽标）。

#### 暂停 / 恢复语义（v0.3.0 起）

- `pause` 复用既有会话门：保存暂停快照、等安全边界，并**记录 `pausedReason`**——峰谷策略暂停为 `"peak_window"`，显式 `/pause` 为 `"manual"`；
- 自动释放（退峰、周末、目标切走到非官方 provider）以 `auto: true` 调用，因此**只恢复本插件暂停的会话**：**用户手动 `/pause` 的会话不会被自动恢复**。手动 `/resume` **始终有效**；
- 恢复发生在模式**不再是 PEAK** 时——同时覆盖 OFF_PEAK（周末）与 NORMAL（工作日谷时）；
- `GET /session-guard/state` 现在返回 `paused.reason`。

#### 相关路由增量

- `GET /session-guard/peak` — **新增**：实时模式（PEAK/OFF_PEAK/NORMAL）、命中窗口名、距高峰分钟数、下一个高峰、距退峰毫秒数、归一化后的策略；
- `GET /session-guard/status` — 新增 `mode` / `reason` / `windowName` / `minutesUntilPeak` / `peakTimezone` / `weekendDays` / 解析出的 `configFile` 路径，**不再有 `billingTimezone`**；
- `GET /session-guard/settings` — 新增 `configFile: {path, candidates, errors}`；
- `GET /session-guard/diag` — 新增 `configFile` 与 `freeRun` 诊断（`{tracked, active, persisted, root}`）；
- `GET /session-guard/events`（SSE）— 只有 `step` 事件（step 门状态变化即时推送）；
- `GET /session-guard/state?session=<id>` — 新增 `freeRun` 对象：`{ state, active, available, timezone, windows: [{id, from, to, fromInput, toInput, fromDisplay, toDisplay, paused, status}], activeId, msRemaining, nextStartMs, nextStartDisplay }`——新增 `active` 布尔（取代已移除的 `enabled`）；每个窗口带 `paused`，其 `status` 可为 `active` / `paused` / `scheduled` / `ended`；
- `POST /session-guard/rpc` — 新增插件级动作 `reloadConfig`（**不需要 `sessionId`**），以及会话级畅跑动作：`freeRunAdd {sessionId, from, to}`（新建任务，与暂停状态相同的重叠 / 相邻任务合并）、`freeRunRemove {sessionId, id}`（删除一个任务）、`freeRunPause {sessionId, id}` / `freeRunResume {sessionId, id}`（暂停 / 恢复**单个**任务）、`freeRunPauseAll {sessionId}` / `freeRunResumeAll {sessionId}`（暂停 / 恢复所有尚未结束的任务，即面板的第二个按钮）、`freeRunClear {sessionId}`（删除全部任务，即面板的第三个按钮）；旧的会话级 `freeRunSuspend` / `freeRunResume`（不带 `id`）已**移除**；非法输入（以及未知的任务 `id`）返回 `{ok:false, error}` 说明原因（例如 `to` 必须晚于 `from`）。

#### 默认峰谷定义，以及「不识别中国法定节假日」（重要限制）

**出厂默认的峰谷定义**（一句话）：时区 `Asia/Shanghai`（北京时间）；**高峰** = 周一至周五 `09:00–12:00`
与 `14:00–18:00`（由 `peakWindows[].days: [mon…fri]` 限定）；**其余时间一律空闲**（含周末；但**不含**法定节假日，
见下条）。改时段/时区/周末规则都只是改配置文件，见上文各表。

**插件不识别中国法定节假日**。没有节假日日历：落在工作日的法定节假日会被当作**普通工作日**处理，
因此只要它落在峰窗口内就**算高峰**，守卫**会照常暂停**会话（例如国庆、端午、中秋、春节假期里的工作日
10:00 就是 PEAK）。这是**有意的范围决定**——节假日日历与调休、任务排程、多会话管理一样，都在「明确不做」之列。

**周末则无条件空闲，包括调休补班日**：被国务院指定为上班日的周六仍然是 `OFF_PEAK`，永远不会被当成高峰。

**「空闲」= 不会被暂停**，它涵盖两种内部模式：`OFF_PEAK`（周末，全天）与 `NORMAL`（工作日峰窗口之外）。
只有 `PEAK` 会触发暂停——这样三种模式的用词就不会混淆。

**目前没有按日期排除的配置**——`peakWindows[].days` 只到**星期几**的粒度，**无法**在配置文件里排除某一个
具体日期（`"2026-10-01"` 这类写法不会被识别）。今天的可行做法只有两条：那天把守卫关掉
（`config/session-guard.json` 里的 `enabled`，或设置面板）；或者接受会话在该日峰窗口内被暂停。

> 如将来要做节假日支持，顺理成章的形态是在 `config/session-guard.json` 里加一份
> `holidays: ["YYYY-MM-DD", …]` 列表，并按配置时区求值——**目前未实现**。

#### 行为变化与限制（诚实列出）

- **默认峰窗口带 `days: ["mon"…"fri"]`**：配合默认周末规则实际行为不变；但若**关掉周末规则又保留出厂默认窗口**，周六/周日不再算高峰——想要周末高峰就把 `days` 放宽或省略；
- **峰窗口现在按配置时区判定**：显式把 `timezone` 设成非北京时区的人会看到高峰跟着变（这正是本特性的目的）；要保住对齐计费的高峰，钉住 `peakPolicy.timezone: "Asia/Shanghai"`。用默认 `timezone` 时这是 no-op；
- **自动退峰恢复不再覆盖手动 `/pause`**；
- **明确不做**：节假日日历（详见上文「不识别中国法定节假日」）、调休、任务排程、多会话管理。

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

### 状态徽标（前端展示）

输入区右侧显示一个**纯展示**状态徽标，实时反映当前所处阶段：

| 阶段 | 徽标文案 | CSS 类 | 含义 |
|---|---|---|---|
| `peak`（二维判定开） | 高峰·拦官方 | `sg-peak` | 高峰期，只拦 DeepSeek 官方源请求 |
| `peak`（二维判定关） | 高峰·全部暂停 | `sg-peak` | 高峰期，全部会话暂停 |
| `off-peak` | 谷时 | `sg-off` | 非高峰时段，会话正常运行 |
| `weekend` | 周末 | `sg-weekend` | 周末（周末模式开启时），无视峰谷畅快跑 |

- **轮询**：每 15 秒请求 `GET /session-guard/status`，获取全局 `phase`、`providerGuard`、`held`、`deferred`、`stepHeld`（v0.3.0 起 `/status` 另报 `mode`/`reason`/`windowName`/`minutesUntilPeak`/`peakTimezone`/`weekendDays`/`configFile`；`phase` 为兼容保留）；
- **fail-open**：路由不可达、网络错误、或 `enabled` 关闭时→ 徽标静默隐藏，不影响任何会话；
- **独立于 input-traffic**：徽标由 session-guard 客户端独立渲染，**不需要安装 input-traffic 插件**即可显示。input-traffic 只负责冻结按钮，与徽标无依赖关系；
- **tooltip**：悬停显示 `阶段 · 时区 · 周末模式 · 判定口径 · 挂起/延后/step 挂起数量`。

### 官方源判定口径（providerGuard）

高峰期**不是无差别停会话**，而是先判断「这次请求真正要去的路由是不是 DeepSeek 官方源」：

| 优先级 | 依据 | `matchedBy` | 例子 |
|---|---|---|---|
| 1 | `officialProviders` 显式 id 名单 | `explicit` | 用户把自建网关声明为官方 |
| 2 | 实时 `baseURL` 归一化后的 host | `endpoint` | `deepseek-official` 改到中转 → **不拦** |
| 3 | catalog 内置默认端点 | `endpoint-default` | pi-ai 的 `deepseek` 路由默认就打官方 API → **拦** |
| 4 | 内置 id 名单（`deepseek-official`） | `route-id` | 读不到端点时的兜底 |
| 5 | 其他 | `unknown` | 非官方，放行 |

- **端点优先于 id**：同名 `deepseek-official` 但把 `baseURL` 指向中转的配置**不会**被误拦；反过来，pi-ai 内置 `deepseek` 路由的默认端点就是官方 API，**不会**被漏拦。
- **端点来源**：`ctx.get('llm').listConfigurableProviders()` 找目录条目 → `ctx.settings.get(settingsNs)` 按 `settingsPath` 读 `baseURL`（只读非密字段，绝不读 `apiKeyEnv` 的值）。每次请求实时算、不缓存 → provider 配置热改立即生效。
- **目标转非官方即恢复**：高峰暂停后把该会话切到本地/第三方 provider（0.1.2+ 的 `model/selection` 事件）→ 自动恢复该会话（受 `deferredResume` 约束）；只恢复本插件因入峰暂停的会话，**不会**碰用户手动 `/pause` 的会话。0.1.1 无该事件 → 退化为「下次请求或手动 `/resume`」。
- **取不到端点**：`llm` 服务缺失、命名空间结构变化、字段非字符串——一律降级为 id / 内置端点判定并记 `matchedBy`，**绝不抛出**。
- **排查误判**：`GET /session-guard/provider?provider=<id>` 返回 `{ official, matchedBy, endpoint }`。

### 请求级守卫与延后队列

- **为什么要请求级**：30s tick 只在 `NORMAL → PAUSED_PEAK` 跳变时处理当时 `running` 的会话；入峰后新启动的会话、会话中途切到官方源的情况都会漏。`agent/request` waterfall 是**每次请求都过**的兜底。
- **判定基于 `next()` 的返回值**：模型选择中间件会在 waterfall 内把 provider/model 覆盖成 UI 里选的值，所以必须先 `await next()` 再判定。
- **hold 模式（默认）**：请求挂起、**不发出也不报错**，退峰瞬间自动放行（`msUntilOffPeak` 精确定时，30s tick 兜底）；用户取消（abort）则正常中断。
- **error 模式**：抛可识别的 `PEAK_DEFERRED` 错误 + 记入延后队列，退峰按 `deferredResumeText` 续跑（`deferredResume` 关闭则不自动继续）。
- **上限保护**：`deferredMaxHoldMs`（默认 6h）到期仍未退峰 → 转 error，避免无限挂起。
- **互斥铁律**：hold 期间**不会**再调会话门暂停（暂停要等安全边界，而请求被挂住就永远到不了安全边界 → 双方互等）。入峰时已挂起的会话会被跳过。
- **不持久化**：延后队列是进程内 promise，重启即消失。

### 边界（明确不做）

- **不换 provider / 不做转接**：只拦不路由；
- **compaction 不走 `agent/request`**：会话被暂停时不会发生压缩；高峰期间若手动触发压缩仍可能打官方源（本插件不拦 `ctx.llm.stream` 层）；
- **0.1.1 没有 `model/selection` 事件**：切到非官方源后的自动恢复退化为「等下一次请求或手动 `/resume`」（0.1.2+ 立即生效）；
- **不新增 npm 依赖**、不读写凭据、不动 `dsh-llm-retry` 的 429 / 传输层重试。

### 时区处理与校验

- 时区判定基于 **IANA 时区名**（如 `Asia/Shanghai`、`Asia/Tokyo`、`Asia/Seoul`），通过 `Intl.DateTimeFormat` 投影为配置时区的墙钟，**不依赖裸 `getUTCDay()`**——避免北京时区 UTC+8 边界错 8 小时的经典 bug（周六 00:30 北京时间，UTC 还是周五）；
- `timezone`（默认 `Asia/Shanghai`）驱动**全部**判定：星期几、周末与峰窗口匹配（v0.3.0 前峰窗口固定北京时间）；
- `peakPolicy.timezone` 可选，**只**覆盖峰窗口判定——把高峰钉在 DeepSeek 计费时区而周末仍跟随本地 `timezone`；省略时跟随 `timezone`；
- `Intl.DateTimeFormat` 本身即为校验层：传入无效时区名（如 `Foo/Bar`）会抛 `RangeError`，被外层 try-catch 静默降级为默认时区 `Asia/Shanghai`（fail-open）；
- 峰谷窗口为**左闭右开** `[start, end)`，支持跨午夜窗口（如 `22:00–06:00`，归属**起始日**）；
- `timezone` 配置项对所有语言（中/英/日/韩）通用——`Intl.DateTimeFormat` 的 IANA 时区名不依赖 locale，日文/韩文界面下时区行为与中文完全一致。

### 与 input-traffic 的分工：一个「停」，一个「排」

两者作用在**同一条链**的不同环节，边界由 DSH 自身的 inbox 模型决定：

```
用户输入 ──(input-traffic 定档)──▶ next-step / next-turn 两条待处理队列
                                        │
                          agent/pre-step ──(本插件 step 门)──▶ 放行 / 挂起
                                        │
                            agent/request ──(本插件请求级 hold)──▶ 放行 / 挂起
                                        │
                                     模型调用
```

**DSH 的队列语义（两条队列，别记混）**

| 队列 | 含义 | 消费时机 |
|---|---|---|
| `next-step` | 「等下一个 step 边界的输入」 | 下一个 `agent/pre-step`：与**工具返回同级**，在同一次 turn 里再走一个 step |
| `next-turn` | 「等待独立回合的提示」 | 当前回合结束后，作为**新的 turn** 开跑 |

`Inbox.claim()` **永远先取光 `next-step`**，只有该次边界要开新回合时再额外取 **1 条** `next-turn`；一个 turn 的第 1 个 step 取 next-turn，之后都取 next-step。

**职责划分**

- **session-guard = 停**：只决定「何时可以推进」，**不碰队列内容与顺序**。
  - step 门（`agent/pre-step`）：在下一个 step 的模型请求**之前**挂起；
  - 回合级暂停（`agent.cancel({keepInbox:true})` + `goals.pause` + 安全边界）：停掉当前回合，**队列原样保留**；
  - 请求级守卫（`agent/request` hold）：挂起**这一次模型请求**。
- **input-traffic = 排**：只决定「用户输入进哪条队列、什么档位、何时被消费」。
  - 三档 = 往哪条队列放：红「打断」先 `cancel()` 再 `steer`；黄「插话」`steer`（→ `next-step`，同 turn 的下一步）；绿「排队」留在 `next-turn`；
  - 冻结 = 把 `queued` + `steering` 行整体摘出（保留档位）+ composer block + 调 `sessionGuard.stopNextTurn`；恢复 = 清 block → 先 `sessionGuard.resume` → 按档位重投。

**相遇点上的两条铁律**

1. **冻结必须让本插件先释放 step 门**：step 门挂在 `agent/pre-step`，而回合级暂停在等安全边界事件——两者互等（本插件 `pauseTask` / `cancelTask` 已先 `release`）；
2. **step 门挂起时消息已被取走**：`preStep()` 先 `inbox.claim()` 再派发 waterfall，所以挂起期间新输入排在被取走的那批之后；`keepInbox` 只作用于回合级暂停。

**不会互相越界**：input-traffic 不监听 `agent/pre-step` / `agent/request`（唯一例外是「打断」档显式 `cancel()`，那是用户主动要求打断）；本插件也不改写 `next-step` / `next-turn` 的内容与顺序。

按钮上：本插件的「畅跑」（order 20）与 input-traffic 的「❄ 冻结追加 / 恢复追加」（order 30）并列显示、互不取代——前者给单会话排限时峰谷豁免，后者控队列摘除 + 回合级冻结。

## 冗余端口 `sessionGuard`

```js
{
  stopNextTurn(sessionId, opts),  // 停掉 session 下一回合（自研会话门 / 回退锁队列）
  resume(sessionId, opts),        // 恢复（confirm + choice: rerun|skip）
  lockQueue(sessionId, reason),   // 显式锁队列
  unlockQueue(sessionId),         // 显式解锁
  stepPause(sessionId),           // 手动请求 step 级暂停（下一次 pre-step 边界拉门，step 1 也拦）
  stepResume(sessionId, opts),    // 解开 step 门（v0.2.0）；opts.bypass=false 时不置本峰跳过
  state(sessionId),               // { queueLocked, lockReason, paused, pausedStep, stepHeldSince, stepBypass, taskControlAvailable, taskControl }
}
```

## HTTP 路由

- `GET /session-guard/state?session=<id>` — 会话状态（含 `paused: { step, turn, manual, reason }` / `stepGate` / `freeRun` / 最近目标 / 是否挂起 / 是否延后）
- `GET /session-guard/peak` — **实时峰谷策略**（`mode` / `windowName` / `minutesUntilPeak` / 下一个高峰 / `msUntilOffPeak` / 归一化策略）
- `GET /session-guard/events?session=<id>` — **SSE**：只有 `step` 事件，step 门状态变化即时推送
- `GET /session-guard/settings` — 设置 + taskControl 可用性 + `configFile: {path, candidates, errors}`
- `GET /session-guard/status` — 全局当前阶段（状态徽标轮询；含 `mode` / `reason` / `windowName` / `minutesUntilPeak` / `peakTimezone` / `weekendDays` / `stepHeld` / `configFile`）
- `GET /session-guard/provider?provider=<id>` — 官方源判定诊断（`official` / `matchedBy` / `endpoint`）
- `GET /session-guard/diag` — 运行时诊断（含 `stepGate` / `configFile` / `freeRun`）
- `POST /session-guard/rpc` — `{ action: stopNextTurn|resume|lockQueue|unlockQueue|stepPause|stepResume|state|reloadConfig|freeRunAdd|freeRunRemove|freeRunPause|freeRunResume|freeRunPauseAll|freeRunResumeAll|freeRunClear, sessionId }`（`reloadConfig` 不需要 `sessionId`；`freeRunRemove` / `freeRunPause` / `freeRunResume` 另需任务 `id`）

## 状态存储

每会话 JSON：`$DSH_HOME/.dsh/session-guard/<sessionId>.json`（原子写；`DSH_SESSION_GUARD_STATE_DIR` 可覆盖）。

畅跑排期另存一份每会话 JSON：`$DSH_HOME/.dsh/session-guard/free-run/<sessionId>.json`（原子写；`DSH_SESSION_GUARD_FREE_RUN_DIR` 可覆盖）——`from` 可能在将来，重启不能丢排期。

## 测试

```bash
npm test   # node --test "tests/*.test.mjs"（390 通过：时区/峰谷策略/配置文件/周末/状态机/会话门/畅跑/桥接/重试）
```

## 模块

| 文件 | 职责 |
|---|---|
| `src/time.js` | 高峰/周末判定（时区正确）+ `msUntilOffPeak`（退峰精确定时） |
| **时间策略解析器（`TimePolicyResolver`）** | **v0.3.0：三模式判定（OFF_PEAK / PEAK / NORMAL）+ 配置文件解析与归一化（`peakPolicy` / `weekendPolicy`）** |
| `src/scheduler.js` | 纯状态机 NORMAL ↔ PAUSED_PEAK |
| `src/provider.js` | 官方源五级判定（纯函数：端点归一化 + 判定矩阵） |
| `src/provider-directory.js` | 端点目录（`llm.listConfigurableProviders` + `settings.get`，全链路降级） |
| `src/deferrals.js` | 延后登记表（hold 挂起 / 释放 / 超限 / `PeakDeferredError`） |
| `src/request-guard.js` | `agent/request` 请求级守卫（hold / error 两模式） |
| `src/step-gate.js` | **`agent/pre-step` step 级门控**（v0.2.0：拉门 / 释放 / 超时升级 / bypass，纯判定 `decideStepHold` 可单测） |
| `src/targets.js` | 会话「最近真实目标」追踪（`request/header` + `model/selection`） |
| `src/wiring.js` | 接线编排（入峰过滤 / step 门接线 / 退峰释放 / 精确定时 / 卸载清理） |
| `src/pause-gate.js` | 自研会话门引擎（agent.cancel keepInbox + goals.pause + 安全边界 + followup 续跑；暂停前先释放 step 门） |
| `src/pause-store.js` | 自研暂停状态持久化 |
| `src/free-run.js` | **畅跑状态与存储（v0.3.0）**：窗口归一化 / 重叠与相邻合并 / 上限 8 / 派生五态 / 每会话落盘 |
| `src/gate.js` | 会话门驱动（自研真暂停 / 回退锁队列，fail-open） |
| `src/bridge.js` | `sessionGuard` 冗余端口 |
| `src/retry.js` | 后端自动重试（失败分类/退避/冻结让路；只按精确码 `PEAK_DEFERRED` 短路） |
| `src/detect.js` | 自动检测（host taskControl / client input-traffic 桥） |
| `src/store.js` | 每会话持久化状态 |
| `src/settings.js` | 设置子板块（schemastery schema + fail-open 注册） |
| `src/index.js` | host apply（设置/路由/tick/提供服务/重试接线/请求守卫） |
| `src/client/` | 浏览器 half（**畅跑按钮** `free-run-button.tsx` + 文案投影 `free-run-button-text.ts` + 状态徽标 + 设置卡片） |

## License

MIT — 见 [LICENSE](LICENSE)。
