<p align="center">
  <strong>Peak auto session gate: weekend mode + peak auto-pause + official-source guard + session-level freeze + backend auto-retry</strong>
</p>
<p align="center">
  <strong>English</strong> · <a href="README.md">中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a>
</p>
<p align="center">
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-263146?style=flat-square"></a>
  <img src="https://camo.githubusercontent.com/2c11fb2e0e14bb9985c5acbe61123a7441c5ee63aa27fa6e04e2a707ebfd6022/68747470733a2f2f696d672e736869656c64732e696f2f62616467652f6473682d2d706c7567696e2d72656164792d3437384342463f6c6f676f3d646565707365656b266c6f676f436f6c6f723d7768697465" alt="dsh-plugin" style="max-width: 100%;">
  <img alt="Public beta" src="https://img.shields.io/badge/status-public%20beta-7da1de?style=flat-square">
</p>

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

> **Compatibility note:** v0.1.1 ships Japanese (`ja`) and Korean (`ko`) dictionaries, but the current official DSH releases expose only `zh` and `en` through `LocaleRuntime`. On stock DSH, selecting `ja` or `ko` fails with `locale "<id>" is not registered`. These languages will work after official DSH adds the locale IDs. Advanced users can use a DSH fork that updates `LOCALE_IDS` and `LOCALES` labels, then rebuild.

> **▼ DSH version compatibility**
>
> | DSH version | Load | Settings registration | Session events / gate | Client half |
> | --- | --- | --- | --- | --- |
> | 0.1.0-rc.7 ~ 0.1.1-rc.x | ➖ not on this line (history before `legacy/0.1.2`) | `ctx.settings.register(ns, schema, { base })` | ✅ same shape | ✅ no platform value imports |
> | 0.1.2-alpha.2+ / 0.1.2-rc.1 | ➖ not on this line → use `legacy/0.1.2` (npm `dsh-0.1.2`) | `register` still present (`installSection` added) | ✅ same shape | ✅ no platform value imports |
> | **0.1.7-rc.1+** | ✅ (**this line**, dist-tag `dsh-0.1.7`) | declarative: `Config` `.volatile()` fields are projected into the form by the host, **no `register` call** (the `settings` service itself still exists) | ✅ events read via the `snapshotEvents()` dual path | ✅ client injects only `slots` + `locale`, no settings dependency |
> | 0.1.5-rc.2 | ✅ (`compat/0.1.5` branch, dist-tag `dsh-0.1.5`) | `register` unchanged (string namespaces) | ✅ events read via `snapshotEvents()` dual path | ✅ |
>
> **This line's identity**: branch `compat/0.1.7`, npm version **`3.1.1`** (semver), dist-tag
> **`dsh-0.1.7`**. `engines.dsh` in `package.json` and `dsh.plugin.json`, plus the four
> `@deepseek-ai/dsh-client-*` peers, are all `>=0.1.7-rc.1 <0.1.8-0`.
> Earlier READMEs used "2.x / 3.x" as a **line nickname**, which is a narrative habit and **not a
> version number you can pull from the registry** — always go by the npm versions `0.3.1` (0.1.2
> line), `3.0.0`/`3.0.1` (0.1.5 line) and `3.1.1` (0.1.7 line).
>
> **Where the other lines live**: DSH `0.1.2-rc.x` hosts should use branch **`legacy/0.1.2`**
> (npm dist-tag `dsh-0.1.2`, version `0.3.1`). **`main` is frozen at `0.2.0-beta.1` and is no
> longer the 0.1.2 line's release branch.** DSH `0.1.0-rc.7` ~ `0.1.1-rc.x` hosts should use a
> historical version ≤ `0.1.2`.
>
> **0.1.5 adaptation (compat/0.1.5 branch, npm 3.0.0)**:
> ① dual-path resume enqueue — 0.1.5 turns Inbox into an agent-loop read-only projection;
> if `agent.followup` is gone the plugin falls back to `agent.send`, and degrades to a warn
> (never throws) when neither exists; ② resume messages now carry
> `source.form: 'instructions'` (0.1.5 ContextFormed contract; older versions ignore it);
> ③ `webServer.register` is wrapped in try/catch so a failed registration only logs instead
> of breaking host loading; ④ 0.1.5 removes the `session.events` array accessor — events are
> now read via `snapshotEvents()` (legacy array kept as fallback), affecting only the
> `findToolOutcome` / `lastUserPrompt` helper paths.
> Verified that 0.1.5 `WebRoute` (exact/prefix + SSE) contract is
> unchanged — client `fetch('/session-guard/...')` needs no `/api` prefix.
> The table below spans the 0.1.1 / 0.1.2 API generations; this line only claims the 0.1.7 row.
> `session/event`, `agent.cancel`, `goals.pause`,
> `agent.followup`, `commands.register`, `timer.interval`, `webServer.register`,
> `agent/request`, `llm.listConfigurableProviders` and `settings.register/get`
> are signature-identical between `dsh-v0.1.1-rc.2` and `dsh-v0.1.2-rc.1`
> (this line verified through `dsh-v0.1.5-rc.2`). The one
> seam that needs a dual read is the `tool/result` call id (`content[].toolCallId`
> first, `source.callId` as fallback) — both forms appear in replay logs of both
> versions. It now lives in `src/tool-call-id.js` with unit tests.
> Since 0.1.5 the `session.events` array accessor is removed; this line reads events
> through `snapshotEvents()` (with the legacy array as fallback), affecting only
> the `findToolOutcome` / `lastUserPrompt` helper paths.
> The `model/selection` event exists **only on 0.1.2+** and is feature-probed.
> On this line the settings surface is declarative (`Config` + `.volatile()`), so no
> `register` / `installSection` / `installSettingsSection` call is made at all.
> Drift guard: `tools/check-api-drift.ps1` (defaults to asserting against `dsh-v0.1.5-rc.2`).

> Automatically pause running sessions during peak pricing hours and resume during off-peak/weekend; pair with input-traffic's freeze button for **per-session** locking; backend **auto-retry** yields during freeze/gate. Core based on a custom session gate (`agent.cancel keepInbox + goals.pause + session/event safe boundary + followup resume`), no longer depending on dsh-task-control.

A cordis plugin assembled via the `dsh plugin` command and a bundle patch — no dsh source changes, no PR required.

> 💡 **Why recommended**: DeepSeek moved to **peak/off-peak billing** on 2026-08-17 — the peak window (09:00-12:00, 14:00-18:00 Beijing time by default) costs **2×** the off-peak rate. This plugin auto-pauses running sessions during peak and auto-resumes off-peak, saving up to **50%** on long-running sessions; manual freeze (via input-traffic button) provides per-session precision.

> ⚙️ **The peak policy is configurable**: windows, timezone, weekday scoping and the weekend rule all come from `config/session-guard.json` — nothing is hardcoded any more. There is also **free-run**, a per-session time-boxed exemption from peak pausing (see "Free-run" below).

## Features

- **Configurable peak policy**: the peak/weekend policy lives in `config/session-guard.json` (four-step resolution order; values set in the auto-generated settings form still win). Three modes `OFF_PEAK / PEAK / NORMAL`, multiple windows, cross-midnight and weekday-limited windows; a malformed file fails open and `reloadConfig` hot-reloads.
- **Free-run (畅跑)**: one "畅跑" button in the composer that schedules one or more time-boxed exemptions for **a single session** — inside the window the session keeps running through peak, and when the window ends it falls back to the normal peak judgement; the schedule is persisted, so a restart does not lose it.
- **Weekend mode**: detects weekends (timezone-correct via `Intl.DateTimeFormat`, no bare `getUTCDay()` Beijing-boundary 8-hour bug) → weekends ignore peak/off-peak, run freely.
- **Peak auto-pause (global)**: on peak entry (and not weekend), auto-pauses all running root sessions; off-peak only auto-resumes the sessions **this plugin paused** (a manual `/pause` is left alone) — **global switch, no manual action needed**.
- **Official-source guard (`providerGuard`)**: during peak hours only requests whose target is a DeepSeek official source are blocked; local/third-party providers (e.g. `local-35b`) keep running. Verdict order = explicit id list → `baseURL` endpoint → catalog default endpoint → builtin id.
- **Request-level backstop + deferral queue**: sessions started after peak entry, or switched to an official source mid-session, are caught by the `agent/request` guard (default `hold`: the request is suspended without an error and released off-peak).
- **Per-session freeze / resume**: `sessionGuard` redundant port + `POST /session-guard/rpc`, input-traffic freeze button per-session passthrough; also provides `/pause /resume /cancel` manual commands.
- **Backend auto-retry (D9)**: turn/end transient failures (error/429/max-tokens) auto-retry with adaptive backoff; permanent failures stop; **yields during freeze/gate**, never bypasses the session gate.
- **Fail-open**: custom session gate unavailable, session-guard not installed, config file malformed, the `settings` service lacking `register`/`get` — all silently degrade, never crash on dependencies.

## Installation

```bash
# DSH 0.1.7-rc.x hosts (this line, dist-tag dsh-0.1.7)
dsh plugin --profile web add dsh-session-guard@dsh-0.1.7

# or straight from the git branch
dsh plugin --profile web add github:drscrewdriver/dsh-session-guard#compat/0.1.7

# DSH 0.1.2-rc.x hosts must use the 0.1.2 line instead
dsh plugin --profile web add dsh-session-guard@dsh-0.1.2
```

`compat/0.1.7` is the DSH `0.1.7-rc.x` line, npm version **`3.1.1`**. DSH `0.1.5-rc.x` hosts must use
the **`compat/0.1.5`** branch (npm dist-tag `dsh-0.1.5`, version `3.0.0`). DSH `0.1.2-rc.x` hosts must
use the **`legacy/0.1.2`** branch (npm dist-tag `dsh-0.1.2`, version `0.3.1`). **`main` is frozen at
`0.2.0-beta.1` and is no longer the 0.1.2 line's release branch.**

> ⚠️ Do not rely on the bare package name `dsh-session-guard`: npm's `latest` tag cannot serve two
> mutually exclusive version lines (their `engines.dsh` ranges are exclusive under semver
> prerelease matching) — always pin the dist-tag explicitly.

Restart dsh web and refresh the page after installation.

## Settings (Settings → Plugins → session-guard, simple toggles)

On this line the `settings` service **still exists** (class `SettingsForms`; `hasSettings: true`,
`hasDescribe: true`), but `dsh-settings` **no longer offers `register()` (nor `get()`)** — only
`describe()` and `configure()`. The plugin does **not** inject `settings` because it consumes nothing
from that service (there is no `register` to call and no `get` to read), **not because the service is
absent**. The settings surface is therefore **declarative**: the plugin exports
`Config = SettingsSchema`, every field of which is marked `.volatile()`, and dsh **auto-generates the
settings form** (Settings → Plugins → session-guard). The plugin registers no namespace and ships no
custom settings card. Runtime values are read from the apply composition entry and merged over the
`config/session-guard.json` default layer (see the next section).

> ⚠️ The client half is a separate matter: the **client-side** service `settingsScope` genuinely is
> not provided on this line. Declaring it in the client's static `inject` left the client entry
> pending forever (`waiting for service: settingsScope`) and fatally broke the app's web boot. That is
> why the client half uses `inject = ['slots', 'locale']` and ships no settings card. The web-boot
> danger comes from `settingsScope` (client), never from the host `settings` service.

| Toggle | Default | Description |
|---|---|---|
| `enabled` | on | **Peak auto-pause**: auto-pause running sessions during peak hours |
| `stepLevelPause` | on | **Step-level gate**: during peak, hold *before* the next step's model request (earlier and cheaper than turn-level); off = fall back to turn-level pause |
| `providerGuard` | on | **Official-source guard**: block only DeepSeek official sources during peak; local/third-party providers keep running |
| `guardSubagents` | on | **Guard subagent requests**: subagent requests are billed too, guarded by default |
| `offPeakAutoResume` | on | **Off-peak auto-resume**: auto-resume the sessions this plugin paused off-peak; off = no auto-resume (manual required) |
| `weekendMode` | on | **Weekend mode**: detect weekends → no auto-pause on weekends (no peak, run freely) |
| `deferredResume` | on | **Auto-resume after peak**: off = deferred requests/sessions stay parked until a manual `/resume` |
| `queueFallback` | on | Fallback to lock-wait queue when custom session gate is unavailable (fail-open) |
| `retryEnabled` | off | **Auto-retry (backend)**: transient failure auto-resume (off by default, conservative) |

Additional configuration:

- `timezone` (default Asia/Shanghai) — an IANA name driving **every** time decision (weekday / weekend / peak-window matching); `peakTimezone` optionally overrides peak-window judgement only (see "Configurable peak policy" below);
- `peakWindows` (default 09:00–12:00 / 14:00–18:00, weekdays) — the authoritative source for peak windows and the weekend rule is now the config file `config/session-guard.json`; values changed in the auto-generated form still win;
- `pauseMode` (`safe`/`force`), `pauseReason` (`wait`/`stop`);
- `stepGateTimeoutMs` (default 300000) — step-gate hold timeout; on expiry the gate is released and the session **escalates to a turn-level pause** (anti-deadlock, and no "one step per 5 minutes" token drip);
- Official-source guard: `officialProviders` (extra official provider ids, comma separated, highest priority), `officialBaseURLs` (official endpoint hosts, default `api.deepseek.com`);
- Deferral queue: `deferredMode` (`hold` / `error`), `deferredResumeText`, `deferredMaxHoldMs` (hold cap, default 6h, then converts to an error);
- Retry parameters: `retryText`, `retryGraceMs`, `retryCooldownMs`, `retryBackoffFactor`, `retryBackoffMaxMs`, `retryMaxConsecutive`.

## Behavior

### Peak auto-gate (global)

- **Peak entry** (and not weekend): with `stepLevelPause` on, the running turn is **no longer interrupted** — the session runs to the next `agent/pre-step` boundary where the step gate holds it (see below); with it off, calls `gate.stopNextTurn` on all running root sessions (custom session gate truly pauses, or falls back to lock-wait queue per `queueFallback`);
- **Off-peak / weekend**: first `releaseAll` the held steps (the turn just continues in place), then `gate.resume` the sessions **this plugin paused** — controlled by `offPeakAutoResume`. Release runs with `auto: true`, so a session you paused manually with `/pause` is left alone;
- **Peak timezone**: decided by config — `peakTimezone` (falling back to `timezone`) drives peak-window evaluation, defaulting to `Asia/Shanghai`, matching DeepSeek's official billing basis. The v0.2.0 "always Beijing time" is no longer hardcoded (see "Configurable peak policy" below);
- State machine: single-instance `NORMAL ↔ PAUSED_PEAK` (`scheduler.js`), driven by a single 30s tick.

### Step-level gate (v0.2.0, the token saver)

Hooks the `agent/pre-step` waterfall and holds the turn **before the next step's model request happens**.

- **Hold conditions** (all required): `enabled` + `stepLevelPause` + `step > 1` + peak (per the configured peak timezone, Beijing by default; not weekend) + official target provider (`providerGuard`; all providers when off) + the session is not request-held + the session is not exempted by **free-run** + not manually bypassed this peak window;
- **Why `step > 1`**: the first step of a turn is covered by the request-level guard, so the two gates never overlap;
- **Release paths**: ① `POST /session-guard/rpc {action:'stepResume'}` / `/resume` / the `stepResume` port method → lets the current step through and **stops gating this session for the rest of the peak window**; ② off-peak → release all, the turn continues in place (**no followup needed**); ③ freeze button / `/pause` / `/cancel` → release the gate and move to a turn-level pause; ④ `signal` abort → release;
- **Timeout escalation**: holding longer than `stepGateTimeoutMs` (default 5 min) releases the gate and **escalates to a turn-level force pause**, resumed off-peak (no deadlock, no token drip);
- **State**: `GET /session-guard/state?session=<id>` returns `paused: { step, turn }` and `stepGate: { held, since, bypass }`; the service port's `paused` **stays boolean** for compatibility, with `pausedStep` for the step gate;
- **Push updates**: `GET /session-guard/events?session=<id>` (SSE) pushes `step` events the moment the step-gate state changes, so the client converges without waiting for a poll;
- **Not persisted**: the hold is an in-process promise; a restart drops it (no ghost state).

### Configurable peak policy (`config/session-guard.json`)

The peak/weekend policy is **no longer hardcoded** — changing peak hours, the timezone, the weekday scoping or the weekend rule is a config-file edit only. Day to day you edit the **user-level** copy; then `POST /session-guard/rpc {"action":"reloadConfig"}` applies it without a restart.

Resolution order (**first hit wins**):

| # | Path | Level |
|---|---|---|
| 1 | `$DSH_SESSION_GUARD_CONFIG` | explicit path |
| 2 | `$DSH_HOME/config/session-guard.json` | user level (**the normal place to edit**) |
| 3 | `<cwd>/config/session-guard.json` | project level |
| 4 | `<plugin>/config/session-guard.json` | bundled default (shipped in the package) |

- The file is the **default layer**: values explicitly set in the auto-generated settings form (the `Config` `.volatile()` fields projected by dsh into Settings → Plugins → session-guard) **still win** — runtime values are the config-file default layer with the composition-entry form overrides merged on top. On this line the `settings` service still exists, but `dsh-settings` no longer offers `register()`/`get()`, so there is no separate plugin-readable "settings user layer";
- `reloadConfig` re-reads the **config-file default layer** only, so a reload changes every key you have **not** personally overridden in the form — form edits keep winning over the file;
- **Values are validated; a bad value can never quietly break the guard**: an unreadable file, invalid JSON, a non-array/invalid `peakWindows`, an out-of-range scalar or an invalid timezone is recorded in `errors` and logged as a warning (at startup and again on `reloadConfig`), and the **affected key keeps its default** — the plugin never silently ends up with "no peak windows" or a non-functional guard. An explicit `"peakWindows": []` is still honoured as the deliberate "no peak windows" intent;
- **A malformed file never blocks startup (fail open)**: errors are collected, logged as warnings and the built-in defaults are used — `GET /session-guard/settings` and `GET /session-guard/diag` expose the cause under `configFile.errors`. Even when file values cannot pass the settings schema, the settings form **is still generated from the built-in defaults** (never silently removed); the bad values are ignored and a warning is logged;
- **Chinese statutory holidays are deliberately not recognised**: there is no holiday calendar, so a statutory holiday falling on a weekday is treated as an ordinary workday — see "The default peak definition, and 'Chinese statutory holidays are NOT recognised'" below.

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

| Field | Default | Meaning |
|---|---|---|
| `enabled` | `true` | master switch |
| `timezone` | `Asia/Shanghai` | IANA name driving **every** decision: weekday, weekend and window matching; **validated against the IANA database**, so an invalid or misspelled zone (e.g. `"Asia/Shangai"`) is rejected and the default kept (aliases such as `Asia/Calcutta` are accepted) |
| `peakPolicy.timezone` | omitted | overrides **only** the peak-window evaluation — pin peaks to the DeepSeek billing timezone (e.g. `Asia/Shanghai`) while the weekend still follows `timezone`; when omitted it follows `timezone`. Also IANA-validated |
| `peakPolicy.peakWindows[].name` | — | window name (appears in the `/peak` response and in `/status`'s `windowName`) |
| `peakPolicy.peakWindows[].start` / `end` | — | `HH:MM`, half-open `[start, end)` |
| `peakPolicy.peakWindows[].days` | omitted/empty = every day | `mon`…`sun`; `start > end` means the window **crosses midnight** and belongs to its **start day** (a `fri` 22:00–06:00 window covers Saturday 01:00) |
| `weekendPolicy.enabled` | `true` | weekend rule switch |
| `weekendPolicy.days` | `["sat","sun"]` | which weekdays count as weekend |
| `weekendPolicy.mode` | `"offPeak"` | currently only `"offPeak"` (the whole weekend is off-peak); an unrecognised `mode` is **rejected with a warning and the weekend rule is disabled** rather than silently accepted |

`peakWindows` supports **multiple** windows. The default behaviour matches v0.2.0: `timezone` defaults to `Asia/Shanghai` and the bundled config omits `peakPolicy.timezone` (which then follows `timezone`), so both resolve to `Asia/Shanghai`; the weekday-scoped windows sit on top of the default weekend rule. The legacy settings shape `peakWindows: [{start,end}]` + `weekendMode: true/false` still works (no `days` = every day).

#### Three modes and their priority (`TimePolicyResolver`)

| Priority | Condition | Mode |
|---|---|---|
| 1 | today is a weekend day (per `weekendPolicy`) | **OFF_PEAK** — the whole day, regardless of peak windows |
| 2 | otherwise a peak window matches | **PEAK** |
| 3 | otherwise | **NORMAL** (weekday off-peak) |

v0.2.0's two-value verdict is preserved for compatibility: `pause === (mode === PEAK)`, and `reason` keeps its old values `'disabled' | 'weekend' | 'peak' | 'off-peak'` (the legacy `phase` field of `/status` is kept for existing badges too).

#### Free-run (畅跑)

The "畅跑" button in the composer's right row (slot `conversation.input.right`, id `session-guard-free-run`, order 20, left of input-traffic's "❄ Freeze & append") schedules **time-boxed exemptions from peak pausing** for **one session**.

**Button**:

- The label is **fixed**: `畅跑`, or `畅跑 ×N` when there is more than one task — the text no longer encodes state;
- **Clicking always opens the free-run task-management panel** (it never performs an action directly); whether free-run is currently in effect is shown by the button's **highlight colour** and by the hover tooltip;
- The tooltip also **lists every task with its time range and status**, and states that clicking opens the management panel.

**Panel layout (one popup, no additional UI surface)**:

- Three text buttons in a toolbar at the top:
  1. `新建畅跑任务` — toggles an inline form (`开始` / `结束`, each a **dual-month date-range calendar** + hour select, **hour granularity**: the start hour H means `H:00` and the end hour H means `H:59`, so the end hour is **fully included**) with `确定` / `取消`;
  2. `暂停全部任务` — pauses every not-yet-ended task; when all not-yet-ended tasks are already paused the label flips to `恢复全部任务`; disabled when there is no task to act on;
  3. `删除全部任务` — deletes all tasks; disabled when there are no tasks.
- Two icon buttons per task row on the right:
  1. `⏸` / `▶` — pause / resume **that single task** (the icon and tooltip flip with the task's state); disabled for tasks that have already ended;
  2. `×` — delete that task.
- Each row also shows the time range and a status tag: `进行中` / `已暂停` / `待开始` / `已结束`;
- The panel header shows the title, the timezone the times are interpreted in, and a small `×` to close. Clicking outside, or pressing Esc, also closes it.

**The new-task form's dual-month date-range calendar**:

- Opening the date picker shows **two side-by-side months** with `‹‹ ‹  2026年 9月   2026年 10月  › ››` navigation (previous year / previous month / next month / next year), so a range spanning a month boundary can be picked in one glance;
- Weeks start on **Monday** (一 二 三 四 五 六 日), today is outlined, the selected range is **shaded** across all its days and its two endpoints are **filled**; padding cells from adjacent months are dimmed;
- The **first click picks the start, the second the end**; if the end lands before the start the two are **swapped** (picking in reverse works), and the calendar **closes as soon as the range is complete**; the trigger shows `from → to` (with placeholder text until both ends are chosen);
- Opening the panel seeds the range with **the current time** (start = the current hour `H:00`, end = **the next hour** `H+1:59` — two clock hours, rolling into the next day if needed) — "create a free-run task" almost always means "start now"; the hour selects stay alongside the calendar for hour precision, and the form's `现在` button re-seeds from the current time at any moment.

Semantics, stated precisely:

- **Per-session**: only the session whose button was used is exempt; every other session is paused during peak as usual;
- **Pausing is per task**, not per session: there is no longer a session-level enable/disable switch. Pausing one task leaves the others working normally;
- **When free-run is in effect**: exactly when **at least one not-paused task covers the current moment**. A paused task simply does not participate;
- Tasks are **absolute start/end instants**, half-open `[from, to)`, with **hour precision and an inclusive end hour**: the start hour H is `H:00` and the end hour H is `H:59`, so "开始 12 时 → 结束 14 时" = `12:00 → 14:59` (hours 12, 13 and 14) and "开始 12 时 → 结束 12 时" covers just that one hour; "结束 23 时" = `23:59`, making the last hour of the day (23:00–24:00) selectable; the host's window stays half-open `[from, to)` — the picker simply hands it the `:59`; the form's values are interpreted in the configured `timezone` (the panel labels it — the same zone used for `peakWindows` and the weekend rule);
- `from` may be **soon or far in the future**; a `from` earlier than now is clamped to now, so "start right away" works;
- **One-shot**: each task ends automatically at `to` and stops matching — that is its normal lifecycle, **not a configuration error**, so it is **not reported as an error** (and there is no "expiring soon" warning); the user can add new tasks any time;
- **Automatic merging only happens between windows with the same paused state**: overlapping or adjacent windows (adjacent = "run straight through") with the **same paused state** are merged; a paused window and an enabled window that overlap are both kept (the enabled one still takes effect over the time it covers); up to **8** tasks after merging, beyond which adding fails with a clear error;
- A paused task produces **no automatic transition** (it will not start by itself); it only takes effect again when the user presses `▶` / `恢复全部任务`;
- Tasks are **persisted** (a per-session JSON file in the plugin's own state directory), because `from` may be in the future and a dsh restart must not lose the schedule;
- While free-run is in effect the session is not held anywhere: the automatic turn-level/step-gate pause skips it, and a request that would otherwise be held at `agent/request` is let through (the plugin added a per-session `release` to let an already-held request proceed) — i.e. the exemption applies at peak entry, at the step gate and at `agent/request`;
- When free-run stops applying (all covering tasks paused, or a task's window ends while still in peak), the session is **suspended again** and resumes automatically at the next off-peak — i.e. exactly "the session is suspended automatically and continues automatically in the valley";
- It does not affect `providerGuard`, the manual `/pause` command, the weekend rule, or the global peak state machine (`GET /session-guard/status` stays global — free-run is a per-session concept and does not change the global badge).

#### Pause / resume semantics

- `pause` reuses the existing session gate: it saves the pause snapshot, waits for a safe boundary, and also records `pausedReason` — peak-policy pauses use `"peak_window"`, an explicit `/pause` uses `"manual"`;
- Automatic release (peak exit, weekend, target switching away from an official provider) passes `auto: true`, so it **only resumes sessions this plugin paused**: **a session the user paused manually is left alone**. A manual `/resume` **always works**;
- Resume happens when the mode is no longer PEAK — covering both OFF_PEAK (weekend) and NORMAL (weekday valley);
- `GET /session-guard/state` now returns `paused.reason`.

#### Route deltas

- `GET /session-guard/peak` — **new**: live mode (PEAK/OFF_PEAK/NORMAL), active window name, minutes until peak, next peak, ms until off-peak, the normalized policy;
- `GET /session-guard/status` — adds `mode` / `reason` / `windowName` / `minutesUntilPeak` / `peakTimezone` / `weekendDays` / the resolved `configFile` path, and **no longer reports `billingTimezone`**;
- `GET /session-guard/settings` — adds `configFile: {path, candidates, errors}`;
- `GET /session-guard/diag` — adds `configFile` and a `freeRun` block (`{tracked, active, persisted, root}`);
- `GET /session-guard/events` (SSE) — only `step` events (step-gate state changes pushed immediately);
- `GET /session-guard/state?session=<id>` — adds a `freeRun` object: `{ state, active, available, timezone, windows: [{id, from, to, fromInput, toInput, fromDisplay, toDisplay, paused, status}], activeId, msRemaining, nextStartMs, nextStartDisplay }` — note the new `active` boolean (replacing the removed `enabled` boolean), and that each window now carries `paused` while its `status` can be `active` / `paused` / `scheduled` / `ended`;
- `POST /session-guard/rpc` — adds the plugin-level action `reloadConfig` (which **does not need a `sessionId`**) and the session-level free-run actions `freeRunAdd {sessionId, from, to}` (create a task; merges with same-state overlapping/adjacent tasks), `freeRunRemove {sessionId, id}` (delete one task), `freeRunPause {sessionId, id}` / `freeRunResume {sessionId, id}` (pause / resume **one** task), `freeRunPauseAll {sessionId}` / `freeRunResumeAll {sessionId}` (pause / resume every not-yet-ended task — the toolbar's second button) and `freeRunClear {sessionId}` (delete all tasks — the toolbar's third button). The old session-level `freeRunSuspend` / `freeRunResume` actions (which took no `id`) are **removed**. Invalid input (and an unknown task `id`) returns `{ok:false, error}` explaining why (e.g. `to` must be later than `from`).

#### The default peak definition, and "Chinese statutory holidays are NOT recognised" (important limitation)

**The shipped default peak definition**, in one sentence: timezone `Asia/Shanghai` (Beijing time); **peak** = Monday–Friday
`09:00–12:00` and `14:00–18:00` (scoped by `peakWindows[].days: [mon…fri]`); **everything else is idle** (including weekends
— but **not** statutory holidays, see the next paragraph). Changing hours, timezone or the weekend rule is a config-file edit
only — see the tables above.

**The plugin does not recognise Chinese statutory holidays.** There is no holiday calendar: a statutory holiday that falls
on a weekday is treated as an **ordinary weekday**, so if it lands inside a peak window it **is** peak and the guard **will
pause** the session (e.g. 10:00 on a weekday inside the National Day, Dragon Boat, Mid-Autumn or Spring Festival holiday is
PEAK). This is a **deliberate scope decision** — holiday calendars, like 调休 (make-up workdays), task scheduling and
multi-session management, are explicitly out of scope.

**Weekends, by contrast, are unconditionally idle — including 调休 make-up workdays**: a Saturday designated a working day
is still `OFF_PEAK` and is never treated as peak.

**"Idle" means "not paused"**, and it covers two internal modes: `OFF_PEAK` (weekend, all day) and `NORMAL` (weekdays
outside the peak windows). Only `PEAK` triggers pausing — stated once so the three-mode vocabulary is not confusing.

**There is currently no per-date configuration** — `peakWindows[].days` is day-of-week granularity only, so a single
specific date **cannot** be excluded by editing the config file (a value like `"2026-10-01"` is not recognised). The
practical options today are to turn the guard off for that day (`enabled` in `config/session-guard.json`, or the settings
form) or accept that the session will be paused during that day's peak windows.

> If holiday support is ever wanted, the natural shape given the existing architecture would be a
> `holidays: ["YYYY-MM-DD", …]` list in `config/session-guard.json` evaluated in the configured timezone — **not implemented today**.

#### Behaviour changes and limitations (stated honestly)

- **Default peak windows now carry `days: ["mon"…"fri"]`**: combined with the default weekend rule the effective behaviour is unchanged, but if you disable the weekend rule **and** keep the shipped default windows, Saturday/Sunday are no longer peaks — widen `days` (or omit it) if you want weekend peaks;
- **Peak windows are now evaluated in the configured timezone**: a user who explicitly sets `timezone` to a non-Beijing zone will see peaks move (that is the point of the feature); pin `peakPolicy.timezone: "Asia/Shanghai"` to keep billing-aligned peaks. With the default `timezone` this is a no-op;
- **Automatic off-peak release no longer overrides a manual `/pause`**;
- **Explicitly NOT implemented**: holiday calendars (see "Chinese statutory holidays are NOT recognised" above), make-up workdays, task scheduling, multi-session management.

### Session locking (freeze)

- **Redundant port**: `ctx.provide('sessionGuard', service)` — `stopNextTurn(sessionId)` / `resume(sessionId)` / `lockQueue(sessionId)` / `unlockQueue(sessionId)` / `state(sessionId)`;
- **RPC bridge**: `POST /session-guard/rpc { action, sessionId }` — input-traffic freeze button calls `stopNextTurn` / `resume` per `sessionId`; silently skipped when session-guard is not installed (fail-open);
- **Manual commands**: `/pause [force|safe] [stop|wait]`, `/resume [confirm] [rerun|skip]`, `/cancel` —作用于调用它的会话.

### Backend auto-retry (D9)

Listens to `turn/end`, classifies failures:

- **Transient** (error/429/max-tokens) → adaptive backoff auto `followup(retryText)` resume;
- **Permanent** (auth/balance/model/context limit) → stop;
- **Yields during freeze/gate**: `isFrozen(sessionId)` true (queueLocked / paused / taskControl paused) → no retry;
- User intervention or successful turn resets consecutive failure count.

### Status badge (frontend display)

A **read-only** status badge is rendered on the right side of the composer input area, reflecting the current phase in real time:

| Phase | Label | CSS class | Meaning |
|---|---|---|---|
| `peak` (guard on) | 高峰·拦官方 | `sg-peak` | Peak hours; only DeepSeek official-source requests are blocked |
| `peak` (guard off) | 高峰·全部暂停 | `sg-peak` | Peak hours; every session is paused |
| `off-peak` | 谷时 | `sg-off` | Off-peak hours, sessions running normally |
| `weekend` | 周末 | `sg-weekend` | Weekend (when weekend mode is on), ignore peak/off-peak |

- **Polling**: requests `GET /session-guard/status` every 15 seconds for `phase`, `providerGuard`, `held`, `deferred`, `stepHeld` (`/status` also reports `mode` / `reason` / `windowName` / `minutesUntilPeak` / `peakTimezone` / `weekendDays` / `configFile`; `phase` is kept for compatibility);
- **Fail-open**: route unreachable, network error, or `enabled` off → badge silently hidden, no session affected;
- **Independent of input-traffic**: the badge is rendered by session-guard's client code alone — **input-traffic is not required**. input-traffic only provides the freeze button, which is unrelated to the badge;
- **Unrelated to free-run**: the badge is the **global** peak state while free-run is a **per-session** exemption, so an active free-run never changes the badge;
- **Tooltip**: hovering shows `phase · timezone · weekend mode · verdict scope · held/deferred counts`.

### Official-source detection (`providerGuard`)

During peak hours the plugin does not blanket-pause sessions: it first decides whether **the route this request will actually use** is a DeepSeek official source.

| Priority | Basis | `matchedBy` | Example |
|---|---|---|---|
| 1 | `officialProviders` explicit id list | `explicit` | user declares a self-hosted gateway as official |
| 2 | live `baseURL` normalized to a host | `endpoint` | `deepseek-official` pointed at a relay → **not blocked** |
| 3 | catalog builtin default endpoint | `endpoint-default` | pi-ai's `deepseek` route defaults to the official API → **blocked** |
| 4 | builtin id list (`deepseek-official`) | `route-id` | fallback when no endpoint is readable |
| 5 | anything else | `unknown` | not official, pass |

- **Endpoint beats id**: a route named `deepseek-official` whose `baseURL` points at a relay is **not** mis-blocked; conversely pi-ai's builtin `deepseek` route is **not** missed.
- **Endpoint source**: `ctx.get('llm').listConfigurableProviders()` → directory entry → `ctx.settings.get(settingsNs)` → `baseURL` via `settingsPath` (non-secret fields only; `apiKeyEnv` values are never read). Recomputed per request, never cached → provider config edits apply immediately.
- **Switching away auto-resumes**: if a session paused at peak entry is switched to a local/third-party provider (the `model/selection` event on 0.1.2+), it is resumed automatically (subject to `deferredResume`); only sessions this plugin paused at peak entry are touched — a manual `/pause` is never overridden. On 0.1.1 there is no such event, so this degrades to "next request or manual `/resume`".
- **When the endpoint is unreadable**: missing `llm` service, changed namespace shape, non-string field — degrade to id / builtin-endpoint verdict, record `matchedBy`, **never throw**.
- **Troubleshooting a wrong verdict**: `GET /session-guard/provider?provider=<id>` returns `{ official, matchedBy, endpoint }`.

### Request-level guard and the deferral queue

- **Why request level**: the 30s tick only handles sessions that were `running` at the `NORMAL → PAUSED_PEAK` transition; sessions started after peak entry, or switched to an official source mid-session, slip through. The `agent/request` waterfall runs on **every request**.
- **Verdict uses `next()`'s return value**: the model-selection middleware overrides provider/model inside the waterfall, so we must `await next()` before deciding.
- **`hold` mode (default)**: the request is suspended — **not sent, no error** — and released at the exact off-peak instant (`msUntilOffPeak` timer, 30s tick as backstop); abort cancels it normally.
- **`error` mode**: throws a recognizable `PEAK_DEFERRED` error + records a deferral, then resumes off-peak with `deferredResumeText` (or stays parked when `deferredResume` is off).
- **Cap**: `deferredMaxHoldMs` (default 6h) converts a still-held request into an error instead of hanging forever.
- **Mutual exclusion**: while a request is held the plugin **never** also asks the session gate to pause (a pause waits for a safe boundary that a held request can never reach). Sessions already held are skipped on peak entry.
- **No persistence**: the deferral queue is an in-process promise; a restart drops it.

### Boundaries (explicitly out of scope)

- **No provider rerouting**: this plugin blocks, it does not switch models.
- **Compaction does not go through `agent/request`**: it cannot happen while a session is paused; a manually triggered compaction during peak may still hit the official source (we do not intercept `ctx.llm.stream`).
- **0.1.1 has no `model/selection` event**: auto-recovery after switching to a non-official source degrades to "next request or manual `/resume`" (immediate on 0.1.2+).
- **No new npm dependencies**, no credential reads, and `dsh-llm-retry`'s 429 / transport retry behavior is untouched.

### Timezone handling

- Timezone decisions are based on **IANA timezone names** (e.g. `Asia/Shanghai`, `Asia/Tokyo`, `Asia/Seoul`), projected to the configured zone's wall clock through `Intl.DateTimeFormat` — **never a bare `getUTCDay()`**, avoiding the classic 8-hour Beijing-boundary bug (00:30 Saturday in Beijing is still Friday in UTC);
- `timezone` (default `Asia/Shanghai`) drives **every** decision: weekday, weekend and peak-window matching (the peak windows used to be pinned to Beijing time; that is no longer hardcoded);
- `peakTimezone` is optional and overrides **only** the peak-window evaluation — it lets peaks stay pinned to DeepSeek's billing timezone while the weekend rule follows the local `timezone`; when omitted it follows `timezone`;
- **Timezone strings are validated against the IANA database**: an invalid or misspelled zone in the config file (e.g. `Asia/Shangai`) is **rejected and the default kept**, with the reason recorded in `configFile.errors` — it cannot slip through to the wall-clock projection, throw a `RangeError` there and get swallowed, silently disabling the guard;
- `Intl.DateTimeFormat` remains the final validation layer: an invalid zone name (e.g. `Foo/Bar`) throws `RangeError`, caught by fail-open and falling back to `Asia/Shanghai`;
- Peak windows are **left-closed, right-open** `[start, end)`, supporting cross-midnight windows (e.g. `22:00–06:00`, attributed to the **start day**);
- Free-run task instants are likewise interpreted in `timezone` (hour precision, absolute instants; the start hour is `H:00` and the end hour is `H:59`, so the end hour is fully included — "结束 23 时" = `23:59`);
- The `timezone` setting works identically across all UI languages (zh/en/ja/ko) — IANA timezone names are locale-independent.

### Division of labour with input-traffic: one "stops", one "orders"

They act on **different links of the same chain**, and the boundary is set by DSH's own inbox model:

```
user input ──(input-traffic picks the tier)──▶ next-step / next-turn pending queues
                                        │
                          agent/pre-step ──(this plugin's step gate)──▶ pass / hold
                                        │
                            agent/request ──(this plugin's request hold)──▶ pass / hold
                                        │
                                     model call
```

**DSH queue semantics (two queues — don't mix them up)**

| Queue | Meaning | Consumed when |
|---|---|---|
| `next-step` | "Input awaiting the next step boundary" | The next `agent/pre-step`: **same level as a tool result**, another step inside the same turn |
| `next-turn` | "Prompts awaiting individual turns" | After the current turn closes, as a **new turn** |

`Inbox.claim()` **always drains `next-step` first**, and only additionally takes **one** `next-turn` when that boundary opens a new turn; a turn's first step reads next-turn, every later step reads next-step.

**Ownership**

- **session-guard = stop**: decides *when progress may happen*, and **never touches queue content or order**.
  - step gate (`agent/pre-step`): holds **before** the next step's model request;
  - turn-level pause (`agent.cancel({keepInbox:true})` + `goals.pause` + safe boundary): stops the turn, **queue preserved as-is**;
  - request-level guard (`agent/request` hold): holds **this one model request**.
- **input-traffic = order**: decides *which queue user input goes to, at what tier, and when it is consumed*.
  - three tiers = which queue: red "interrupt" calls `cancel()` then `steer`; yellow "steer" calls `steer` (→ `next-step`, the same turn's next step); green "queue" stays in `next-turn`;
  - freeze = detach all `queued` + `steering` rows (tiers preserved) + composer block + call `sessionGuard.stopNextTurn`; resume = clear the block → `sessionGuard.resume` first → re-submit by tier.

**Two invariants at the meeting point**

1. **Freeze must let this plugin release the step gate first**: the step gate sits at `agent/pre-step` while a turn-level pause waits for a safe-boundary event — they would wait on each other (`pauseTask` / `cancelTask` release it first);
2. **While the step gate is held, messages are already claimed**: `preStep()` calls `inbox.claim()` *before* dispatching the waterfall, so new input queues behind the claimed batch; `keepInbox` only applies to turn-level pauses.

**No crossing over**: input-traffic does not listen to `agent/pre-step` / `agent/request` (the only exception is the "interrupt" tier's explicit `cancel()`, which the user asked for); this plugin never rewrites `next-step` / `next-turn` content or order.

Buttons: this plugin's "畅跑" (order 20) and input-traffic's "❄ Freeze & append / Resume & append" (order 30) sit side by side and replace neither — the former schedules a time-boxed peak exemption for one session, the latter owns queue detach + turn-level freeze.

## Redundant port `sessionGuard`

```js
{
  stopNextTurn(sessionId, opts),
  resume(sessionId, opts),
  lockQueue(sessionId, reason),
  unlockQueue(sessionId),
  stepPause(sessionId),           // request a manual step-level pause (held at the next pre-step)
  stepResume(sessionId, opts),    // release the step gate (v0.2.0); opts.bypass=false keeps gating this peak
  state(sessionId),               // { queueLocked, lockReason, paused, pausedStep, pausedReason, stepHeldSince, stepBypass, ... }
}
```

## HTTP routes

- `GET /session-guard/state?session=<id>` — session state (`paused: { step, turn, manual, reason }` / `stepGate` / `freeRun` / last target / held / deferred)
- `GET /session-guard/peak` — **live peak policy** (`mode` / `windowName` / `minutesUntilPeak` / next peak / `msUntilOffPeak` / the normalized policy)
- `GET /session-guard/events?session=<id>` — **SSE**: only `step` events, step-gate state changes pushed immediately
- `GET /session-guard/settings` — settings + taskControl availability + `configFile: {path, candidates, errors}`
- `GET /session-guard/status` — global current phase (status badge polling; includes `mode` / `reason` / `windowName` / `minutesUntilPeak` / `peakTimezone` / `weekendDays` / `stepHeld` / `configFile`)
- `GET /session-guard/provider?provider=<id>` — official-source verdict diagnostics (`official` / `matchedBy` / `endpoint`)
- `GET /session-guard/diag` — runtime diagnostics (includes `stepGate` / `configFile` / `freeRun`)
- `POST /session-guard/rpc` — `{ action: stopNextTurn|resume|lockQueue|unlockQueue|stepPause|stepResume|state|reloadConfig|freeRunAdd|freeRunRemove|freeRunPause|freeRunResume|freeRunPauseAll|freeRunResumeAll|freeRunClear, sessionId }` (`reloadConfig` needs no `sessionId`; `freeRunRemove` / `freeRunPause` / `freeRunResume` also take the task `id`)

## State storage

Per-session JSON: `$DSH_HOME/.dsh/session-guard/<sessionId>.json` (atomic write; `DSH_SESSION_GUARD_STATE_DIR` override).

Free-run schedules are stored in their own per-session JSON: `$DSH_HOME/.dsh/session-guard/free-run/<sessionId>.json` (atomic write; `DSH_SESSION_GUARD_FREE_RUN_DIR` override) — `from` may be in the future, so a restart must not lose the schedule.

## Tests

```bash
npm test   # node --test "tests/*.test.mjs" (397 passing: timezone/peak policy/config file/state machine/session gate/free-run/bridge/retry)
```

## Modules

| File | Responsibility |
|---|---|
| `src/time.js` | Peak/weekend detection (timezone-correct) + `msUntilOffPeak` (exact release timing) |
| `src/time-policy.js` | **`TimePolicyResolver`**: three-mode verdict (OFF_PEAK / PEAK / NORMAL) + config parsing/normalization (`peakPolicy` / `weekendPolicy`) + IANA timezone validation |
| `src/config-file.js` | **`config/session-guard.json` loading**: four-level search order, normalization, bad values collected in `errors` (never throws, fail-open) |
| `src/scheduler.js` | Pure state machine NORMAL ↔ PAUSED_PEAK |
| `src/provider.js` | Official-source verdict (pure: endpoint normalization + decision matrix) |
| `src/provider-directory.js` | Endpoint directory (`llm.listConfigurableProviders` + `settings.get`, full degradation) |
| `src/deferrals.js` | Deferral registry (hold / release / cap / `PeakDeferredError`) |
| `src/request-guard.js` | `agent/request` request-level guard (hold / error modes) |
| `src/step-gate.js` | **`agent/pre-step` step-level gate** (v0.2.0: hold / release / timeout escalation / bypass; pure `decideStepHold`) |
| `src/targets.js` | Per-session "last real target" tracking (`request/header` + `model/selection`) |
| `src/wiring.js` | Wiring/orchestration (peak-entry filter / step-gate wiring / off-peak release / exact timer / dispose) |
| `src/pause-gate.js` | Custom session gate engine (releases the step gate before pausing) |
| `src/pause-store.js` | Custom pause state persistence |
| `src/free-run.js` | **Free-run state and store**: window normalization / overlapping-and-adjacent merging / cap 8 / derived state / per-session persistence |
| `src/gate.js` | Session gate driver (custom true pause / fallback lock queue, fail-open) |
| `src/bridge.js` | `sessionGuard` redundant port |
| `src/retry.js` | Backend auto-retry (classification/backoff/freeze yield; short-circuits only the exact `PEAK_DEFERRED` code) |
| `src/detect.js` | Auto-detection (host taskControl / client input-traffic bridge) |
| `src/store.js` | Per-session persistent state |
| `src/settings.js` | **Declarative settings schema** (schemastery `Config`; every field `.default()` + `.volatile()`; bad values fall back to the built-in defaults) |
| `src/index.js` | Host apply (`Config` export / routes / tick / provide service / retry + request guard wiring / free-run timers) |
| `src/client/` | Browser half (**free-run button** `free-run-button.tsx` + text projection `free-run-button-text.ts` + **dual-month date-range picker** `date-range-picker.tsx` / `date-range.ts` + status badge) |

## License

MIT — see [LICENSE](LICENSE).
