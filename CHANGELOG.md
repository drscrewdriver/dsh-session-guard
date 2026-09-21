# Changelog

All notable changes to `dsh-session-guard` are recorded here. Versions follow semver.

- [English changelog](./CHANGELOG.md)
- [日本語 changelog](./CHANGELOG.ja.md)
- [한국어 changelog](./CHANGELOG.ko.md)

## 0.3.0 — 2026-09-21

### Added

- **可配置的峰谷策略（`config/session-guard.json`）。** 峰谷/周末策略不再硬编码在代码里，改由一份 JSON 描述。
  解析顺序（先命中者胜）：`$DSH_SESSION_GUARD_CONFIG` → `$DSH_HOME/config/session-guard.json`（用户级，
  日常改这里）→ `<cwd>/config/session-guard.json`（项目级）→ `<plugin>/config/session-guard.json`（包内默认）。
  该文件是 cordis `settings` 命名空间的**默认层**：设置界面（设置 → 插件 → session-guard）里显式设过的值
  仍然优先；`settings` 服务不可用时直接采用文件值。文件损坏**绝不阻塞启动**：错误被收集、以 warning 记录，
  并回退内置默认值（fail-open）。`POST /session-guard/rpc {"action":"reloadConfig"}` 可在不重启的情况下重载。
- **时间策略解析器（`TimePolicyResolver`），三种模式**：① 当天是周末日（按 `weekendPolicy`）→ **OFF_PEAK**
  （整天，无视峰谷窗口）；② 否则命中某个峰谷窗口 → **PEAK**；③ 否则 → **NORMAL**（工作日谷时）。
  v0.2.0 的两值判决保留兼容：`pause === (mode === PEAK)`，`reason` 仍是
  `'disabled' | 'weekend' | 'peak' | 'off-peak'`。旧设置形状（`peakWindows: [{start,end}]` +
  `weekendMode: true/false`）继续可用（无 `days` = 每天）。
- **畅跑（free-run，新）**：输入区一个「畅跑」按钮（slot `conversation.input.right`，id `session-guard-free-run`，order 20），给**单个会话**排定限时豁免峰谷的任务。任务窗口是绝对起止时刻、半开区间 `[from, to)`、小时精度，按配置 `timezone` 解释；`from` 早于此刻则钳到此刻（「立刻开始」可用）。每个任务到 `to` 自动结束、不再匹配——这是正常生命周期，**不报错**，可反复再排。**暂停粒度是每个任务**：`paused` 标记落在**单个任务**上（不再有会话级启停开关），只要**至少一个未暂停的任务覆盖此刻**畅跑即生效，被暂停的任务不参与判定，也不会产生自动状态转换（不会自己开始）。**自动合并只在暂停状态相同的窗口之间发生**：重叠或相邻（相邻 = 首尾相接）且暂停状态相同的窗口合并，暂停窗口与启用窗口重叠时两者都保留；合并后上限 8 个，超过返回明确错误。排期**落盘**（每会话一个 JSON），重启不丢。生效期间该会话不被任何地方拦住：回合级 / step 门暂停跳过它，本会被 `agent/request` 挂起的请求也放行（新增**按会话的 `release`**）；畅跑不再适用（覆盖此刻的任务全部暂停，或任务在峰内结束）时会话**重新挂起**，退峰自动继续。
- **畅跑管理面板（重设计）**：按钮文案**固定**为「畅跑」（多于 1 个任务时 `畅跑 ×N`），**点击永远打开「畅跑任务管理」面板**，生效状态由按钮高亮色与悬停提示表达，悬停提示还逐条列出每个任务的时间范围与状态。面板是唯一的 UI 表面：顶部工具栏三个文字按钮 `新建畅跑任务`（内联表单：`开始` / `结束`，原生日期选择器 + 小时下拉，小时粒度，`确定` / `取消`）、`暂停全部任务`（全部未结束任务已暂停时文案翻转为 `恢复全部任务`；无任务时禁用）、`删除全部任务`（无任务时禁用）；每个任务行右侧两个图标按钮 `⏸` / `▶`（暂停 / 恢复该单个任务，已结束的任务禁用）与 `×`（删除该任务）；每行显示时间范围与状态标签 `进行中` / `已暂停` / `待开始` / `已结束`；面板头部显示标题、所用时区与关闭用的 `×`，点击外部或 Esc 也可关闭。
- **新模块**：`src/free-run.js`（畅跑模型 + 存储）、`src/client/free-run-button.tsx`、`src/client/free-run-button-text.ts`（文案与状态投影，纯函数可单测）；`TimePolicyResolver`（时间策略解析）。测试新增 `tests/free-run.test.mjs`（25）、`tests/free-run-isolation.test.mjs`（7）、`tests/free-run-button-text.test.mjs`（10）；`tests/config-file.test.mjs` 为 29、`tests/index-apply.test.mjs` 为 21。全套 **368 通过**。
- **新路由** `GET /session-guard/peak`——实时模式（PEAK/OFF_PEAK/NORMAL）、命中窗口名、距高峰分钟数、下一个高峰、距退峰毫秒数、归一化后的策略。
- **新字段与 RPC 动作**：`GET /session-guard/state` 新增 `freeRun` 对象（`state` / `active` / `available` / `timezone` / `windows[]`（每项含 `id` / `from` / `to` / `fromInput` / `toInput` / `fromDisplay` / `toDisplay` / `paused` / `status`）/ `activeId` / `msRemaining` / `nextStartMs` / `nextStartDisplay`）——`active` 取代了旧的 `enabled`，窗口的 `status` 可为 `active` / `paused` / `scheduled` / `ended`；`GET /session-guard/diag` 新增 `freeRun`（`{tracked, active, persisted, root}`）；`POST /session-guard/rpc` 新增插件级 `reloadConfig`（不需要 `sessionId`）与会话级 `freeRunAdd` / `freeRunRemove` / `freeRunPause` / `freeRunResume` / `freeRunPauseAll` / `freeRunResumeAll` / `freeRunClear`（非法输入与未知任务 `id` 返回 `{ok:false, error}`，例如 `to` 必须晚于 `from`）。
- **新设置项**（`peakPolicy` 内）：`timezone`（可选，只覆盖峰窗口判定）、`peakWindows`（支持多个窗口；`days` 省略/为空 = 每天；`start > end` = 跨午夜，且归属**起始日**），以及顶层 `weekendPolicy`。
- **参数校验与安全回退（不再可能「静默搞坏守卫」）**：`timezone`（含 `peakPolicy.timezone`）按 **IANA 数据库**
  校验，非法/拼错（如 `"Asia/Shangai"`）会被拒绝并保留默认 `Asia/Shanghai`（别名如 `Asia/Calcutta` 可用）。
  文件不可读、JSON 非法、`peakWindows` 非数组/非法、标量越界，都记入 `configFile.errors`（`GET /session-guard/settings`
  与 `/diag` 可见）并在启动与 `reloadConfig` 时记 warning；受影响键保留默认值，不再退化成「没有峰窗口」或失效的守卫。
  显式 `"peakWindows": []` 仍视为有意关闭峰窗口。配置值连设置 schema 都过不去时，设置面板**仍以内置默认值注册**
  （绝不静默移除），坏值被忽略并记 warning。

### Changed

- **峰窗口判定时区可配置**：`timezone`（IANA 名）现在驱动**全部**判定——星期几、周末与窗口匹配，
  默认 `Asia/Shanghai`；`peakPolicy.timezone` 可选，可把高峰钉在 DeepSeek 计费时区，同时让周末仍跟随本地
  `timezone`。默认配置下两者同为 `Asia/Shanghai`，行为与 v0.2.0 完全一致。
- **默认峰窗口带上 `days: ["mon"…"fri"]`。** 配合默认周末规则，实际行为不变；但若**关掉周末规则又保留
  出厂默认窗口**，周六/周日不再算高峰——想要周末高峰就把 `days` 放宽或直接省略。
- **自动恢复只在模式不再是 PEAK 时发生**（同时覆盖 OFF_PEAK 周末与 NORMAL 工作日谷时）。自动释放
  （退峰、周末、目标切走到非官方 provider）以 `auto: true` 调用，因此**只恢复本插件暂停的会话**；
  用户手动 `/pause` 的会话不再被自动恢复（手动 `/resume` 仍然始终有效）。
- **暂停会记录 `pausedReason`**：峰谷策略暂停为 `"peak_window"`，显式 `/pause` 为 `"manual"`。
  `GET /session-guard/state` 现在返回 `paused.reason`。
- **`GET /session-guard/status`** 现在报告 `mode`、`reason`、`windowName`、`minutesUntilPeak`、
  `peakTimezone`、`weekendDays` 与解析出的 `configFile` 路径，**不再报告
  `billingTimezone`**；旧的 `phase` 字段（`weekend`/`peak`/`off-peak`）保留给既有客户端徽标。
- **`GET /session-guard/settings`** 追加 `configFile: {path, candidates, errors}`；
  **`GET /session-guard/diag`** 追加 `configFile` 与 `freeRun` 诊断。
- **`GET /session-guard/events`（SSE）** 现在只推送 `step` 事件。
- **输入区按钮换代**：移除旧「暂停会话 / 继续会话」按钮（slot `session-guard-pause`），改由「畅跑」按钮（slot `session-guard-free-run`，order 20，仍在 input-traffic 冻结按钮左侧）占据该位置。`/pause`、`/resume`、`/cancel` 斜杠命令与 `sessionGuard` 冗余端口（含 `stepPause` / `stepResume`）**保持不变**。
- **畅跑交互重设计（同一 PR 内改定）**：按钮文案固定为「畅跑」/「畅跑 ×N」，**点击永远打开管理面板**（旧版「畅跑中」点击会直接暂停畅跑，导致生效期间面板不可达——该死角已消除）；暂停从**会话级**改为**每个任务一级**，会话级启停开关被移除；会话级 `freeRunSuspend` / `freeRunResume` 动作（不带 `id`）被移除，改为按任务 `id` 的 `freeRunPause` / `freeRunResume` 与工具栏对应的 `freeRunPauseAll` / `freeRunResumeAll`。窗口语义（单会话、绝对起止时刻 `[from, to)`、小时精度、`from` 钳到此刻、一次性到点结束不报错、落盘、上限 8）全部不变。
- **不再有任何硬编码**：改高峰时段、时区、窗口的星期限定或周末规则，都只是改配置文件。

### Notes

- **高峰前询问已在评审中移除**：它没有实际使用场景——真正的需求是「让这一个会话现在就继续跑」，而畅跑以更简单、更可预期的形态满足了它，因此入峰前提醒、倒计时与继续通行证全部删除。
- **不识别中国法定节假日（有意为之）**：出厂默认峰谷定义 = 「`Asia/Shanghai` 时区下周一至周五
  `09:00–12:00` / `14:00–18:00` 为高峰，其余时间空闲」。插件**没有节假日日历**，落在工作日的法定节假日被当作
  普通工作日——只要落在峰窗口内就**算高峰并照常暂停**（国庆/端午/中秋/春节假期里的工作日 10:00 即 PEAK）。
  周末则无条件空闲，**包括调休补班日**（被指定上班的周六仍是 `OFF_PEAK`）。「空闲」= 不暂停，涵盖
  `OFF_PEAK`（周末全天）与 `NORMAL`（工作日峰窗口之外），只有 `PEAK` 触发暂停。目前**没有按日期排除的配置**
  （`peakWindows[].days` 只到星期几粒度），只能当天关闭 `enabled`（配置文件或设置面板）或接受暂停。
- **明确不做**：节假日日历、调休（make-up workdays）、任务排程、多会话管理。

## 0.2.0-beta.1 — 2026-09-10

### Added

- **Step-level gate (`agent/pre-step`).** During peak hours the turn is now held **before** the
  next step's model request instead of being interrupted at a turn boundary: the session keeps
  running until the next `agent/pre-step`, where the gate holds it (setting `stepLevelPause`, on by
  default). The turn resumes **in place** off-peak — no followup message needed. Hold conditions:
  peak (Beijing time) + not weekend + `step > 1` + official target provider (`providerGuard`) +
  not request-held + not bypassed in this peak window. New module `src/step-gate.js` (pure
  `decideStepHold` + hold / release / abort / timeout engine).
- **`stepResume` port + RPC + `/resume`.** `sessionGuard.stepResume(sessionId, {bypass})`,
  `POST /session-guard/rpc {action:'stepResume'}` and `/resume` all release the gate; a manual
  resume also stops gating that session for the rest of the peak window.
- **Timeout escalation.** `stepGateTimeoutMs` (default 300000) releases the gate and escalates to a
  turn-level **force** pause, so a long peak neither deadlocks nor drips one step every five minutes.
- **"⏸ Pause session" button** (client, slot `conversation.input.right`, id `session-guard-pause`,
  order 20 — left of input-traffic's freeze button). It polls `/session-guard/state` once a second,
  stays disabled while nothing is held, and calls `stepResume` when it is. The status badge moved to
  order 40 and now reports the number of step-held sessions.
- **New settings**: `stepLevelPause`, `stepGateTimeoutMs`.
- **New state**: `GET /session-guard/state` now returns `paused: { step, turn }` and
  `stepGate: { held, since, bypass }`; `/status` returns `stepHeld`; `/diag` returns `stepGate`.
  The service port's `state().paused` stays boolean for compatibility (new field `pausedStep`).

### Fixed

- **Deadlock between a held step and a turn-level pause.** `pauseTask` / `resumeTask` /
  `cancelTask` now release the step gate first: a step hold sits at `agent/pre-step`, where no
  `assistant/message` or `tool/result` can ever arrive, so a `safe` pause used to wait forever and
  never persisted `paused`.

### Changed

- **Peak entry no longer interrupts running turns** when `stepLevelPause` is on (`onEnterPeak` arms
  the step gate instead of calling `stopNextTurn`); with it off the previous turn-level behaviour is
  unchanged.
- input-traffic's freeze button label is now **"Freeze & append"** (`冻结追加` / `凍結して追加` /
  `동결 후 추가`), and its resume label **"Resume & append"** (`恢复追加` / `再開して追加` /
  `재개 후 추가`) — it freezes the turn and keeps queued messages, distinct from the pause button.
- **The pause button is a toggle now**: "Pause session" / "Resume session" (no disabled grey state).
  Clicking "Pause session" calls the new `stepPause` action, which holds the session at the **next
  step boundary** (step 1 included, regardless of peak or provider); "Resume session" calls
  `stepResume`. New port method `sessionGuard.stepPause(sessionId)`.
- **SSE push**: new route `GET /session-guard/events?session=<id>` pushes step-gate state changes the
  moment they happen, so peak auto-holds flip the button to "Resume session" without waiting for a
  poll; the 10s `/session-guard/state` poll remains as a fallback. `/state` now reports
  `paused.manual` and `stepGate.manual`.
- **Styling aligned** with input-traffic's composer button (24px height, 6px radius, 12px font, the
  same border/hover/pressed tokens) for both the pause button and the status badge; styles are
  injected once via `<style data-plugin-css="session-guard-client">`.

## Unreleased

### Added

- **Official-source two-dimensional guard (peak × target provider).** Peak hours now block only
  requests whose target route is a DeepSeek official source; local/third-party providers keep
  running. Verdict order: explicit `officialProviders` id list → live `baseURL` endpoint →
  catalog builtin endpoint (pi-ai's `deepseek`) → builtin id (`deepseek-official`); each verdict
  reports `matchedBy`. New modules: `src/provider.js` (pure), `src/provider-directory.js`,
  `src/deferrals.js`, `src/request-guard.js`, `src/targets.js`, `src/wiring.js`.
- **Request-level backstop (`agent/request`).** Covers sessions started after peak entry and
  sessions switched to an official source mid-run — the 30s tick only handled sessions that were
  already `running` at the transition. Default `hold` mode suspends the request without an error
  and releases it at the exact off-peak instant (`msUntilOffPeak`); `error` mode throws a
  recognizable `PEAK_DEFERRED` failure and records a deferral for off-peak resume.
- **New settings**: `providerGuard`, `officialProviders`, `officialBaseURLs`, `deferredResume`,
  `deferredResumeText`, `deferredMode`, `deferredMaxHoldMs` (default 6h), `guardSubagents`.
- **New routes**: `GET /session-guard/provider?provider=<id>` (verdict diagnostics);
  `/session-guard/status` now reports `providerGuard` / `held` / `deferred`;
  `/session-guard/state` reports the session's last target.
- **Drift guard** `tools/check-api-drift.ps1` asserting the required APIs exist on
  `dsh-v0.1.1-rc.2` / `dsh-v0.1.2-rc.1` / `dsh-v0.1.3-alpha.2` / `dsh-v0.1.5-alpha.1`.

### Changed

- **DSH dual-version support (0.1.0-rc.7 … 0.1.2-rc.1).** One artifact now covers both
  `dsh-v0.1.1-rc.2` and `dsh-v0.1.2-rc.1`. The `tool/result` call-id dual read
  (`content[].toolCallId` first, `source.callId` fallback — both forms appear in replay logs of
  both versions) is extracted to the dependency-free `src/tool-call-id.js` with unit tests.
  `dsh.client.inject` no longer names `@deepseek-ai/dsh-client-runtime` (removed in 0.1.2) or
  `@deepseek-ai/dsh-client-ui-slots` (not a dynamic client row); peer ranges widened to
  `>=0.1.0-rc.7 <0.2.0-0` and the removed package dropped. Added `engines.dsh` and a
  version-compatibility table to the README (ZH/EN).
- **Settings surface stays on the intersection API**: `settings.register` + `settings.get` only;
  `installSection` (0.1.2+) and the removed `installSettingsSection` are never used. Optional
  APIs (`model/selection`, `llm.listConfigurableProviders`, `settings.get`) are feature-probed and
  degrade instead of throwing.
- **`src/retry.js` short-circuits only the exact `PEAK_DEFERRED` sentinel.** 429 / `RATE_LIMIT` /
  `TRANSPORT` / timeout failures remain transient, so DSH's global retry (`dsh-llm-retry` on
  `agent/request-error`) and this plugin's own retry semantics are unchanged. `dsh-llm-retry`
  itself is never touched.
- Badge distinguishes "peak · official only" from "peak · all paused".

## 0.1.4 — 2026-09-09

### Changed

- **Public beta release** of the dual-version line (`0.1.4-beta.1`): version metadata, README
  compatibility table and package metadata aligned for the beta channel.

## 0.1.3 — 2026-09-09

### Fixed

- **package.json encoding restored**: description was corrupted (GB2312 bytes misread as UTF-8); rewritten with correct Chinese text.
- **Missing metadata**: added `repository`, `homepage` fields.
- **peerDependencies corrected**: removed pinned `dsh-llm` exact version; added `cordis`, `dsh-client-runtime`, `dsh-client-locale`, `dsh-client-ui-settings`, `dsh-client-ui-slots` as optional peers matching `dsh.client.inject`.
- Added `dsh.plugin.json` manifest.

## 0.1.2 — 2026-08-28

### Fixed

- **Peak timezone fixed**: 峰谷判定固定北京时间 (`BILLING_TIMEZONE`)，周末判定用配置时区。

## 0.1.1 — 2026-08-24

### Added

- **Backend auto-retry (D9)**: `turn/end` transient failures (error/429/max-tokens) trigger adaptive-backoff `followup(retryText)` resume; permanent failures (auth/balance/model/context limit) stop; user intervention or successful turn resets consecutive failure count.
- **Freeze/gate yield**: retry skips when `isFrozen(sessionId)` is true (queueLocked / paused / taskControl paused), never bypasses the session gate.

### Changed

- `sessionGuard` redundant port now exposes `state(sessionId)` returning `{ queueLocked, lockReason, paused, taskControlAvailable, taskControl }`.
- HTTP route `GET /session-guard/diag` returns runtime diagnostics including retry state.

### Fixed

- Weekend detection now uses `Intl.DateTimeFormat` with the configured timezone instead of bare `getUTCDay()`, fixing an 8-hour boundary bug for Beijing timezone.

## 0.1.0 — 2026-08-18

### Added

- Initial release: peak auto-pause (global), weekend mode, per-session freeze/resume via `sessionGuard` redundant port + RPC bridge, custom session gate (`agent.cancel keepInbox + goals.pause + session/event safe boundary + followup resume`), settings panel (Settings → Plugins → session-guard).
