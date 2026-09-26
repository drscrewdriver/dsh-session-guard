# Changelog

All notable changes to `dsh-session-guard` are recorded here. Versions follow semver.

- [English changelog](./CHANGELOG.md)
- [日本語 changelog](./CHANGELOG.ja.md)
- [한국어 changelog](./CHANGELOG.ko.md)

## Unreleased — `compat/0.1.7` line: configurable peak policy + free-run

### Added

- **Configurable peak policy (`config/session-guard.json`).** The peak/weekend policy is no longer
  hardcoded: peak windows, their timezone, per-window weekday limits and the weekend rule all come
  from one JSON file. Resolution order (first hit wins): `$DSH_SESSION_GUARD_CONFIG` →
  `$DSH_HOME/config/session-guard.json` (user level — the one to edit day to day) →
  `<cwd>/config/session-guard.json` (project level) → `<plugin>/config/session-guard.json`
  (bundled default). The file is the **default layer**; values set in the auto-generated settings
  form still win. A malformed file never blocks startup: errors are collected, logged as warnings,
  and the affected keys keep their built-in defaults (fail-open) — `configFile.errors` on
  `GET /session-guard/settings` and `GET /session-guard/diag` names the exact reason.
  `POST /session-guard/rpc {"action":"reloadConfig"}` reloads without a restart; it re-reads the
  default layer only, so keys you typed into the form still win.
- **The guard can no longer be silently disabled by a bad config.** A missing/unreadable file,
  invalid JSON, a non-array or fully invalid `peakWindows`, out-of-range scalars and invalid
  timezones are all recorded and the affected key keeps its default — never a hushed "no peak
  windows" or a never-pausing guard. An explicit `"peakWindows": []` is still respected as a
  deliberate "no peak windows", and a file value that fails the settings schema still yields a form
  built from the built-in defaults (the panel never silently disappears).
- **`TimePolicyResolver`, three modes**: ① the day is a weekend day (per `weekendPolicy`) →
  **OFF_PEAK** (all day, peak windows ignored); ② otherwise a peak window matches → **PEAK**;
  ③ otherwise → **NORMAL** (workday off-peak). The v0.2.0 two-value verdict is kept for
  compatibility (`pause === (mode === PEAK)`, `reason` still `'disabled' | 'weekend' | 'peak' |
  'off-peak'`). The old settings shape (`peakWindows: [{start,end}]` + `weekendMode: true/false`)
  keeps working (no `days` = every day).
- **Free-run (畅跑)**: one "畅跑" button in the composer (slot `conversation.input.right`, id
  `session-guard-free-run`, order 20 — left of input-traffic's freeze button) schedules a
  time-boxed peak exemption for **one session**. Its label is fixed to `畅跑` (`畅跑 ×N` with more
  than one task) and **clicking it always opens the free-run task-management panel**; whether it is
  currently in effect is shown by the button highlight and by the tooltip, which also lists every
  task with its time range and status.
- **Free-run panel**: the only new UI surface. Toolbar text buttons `新建畅跑任务` (inline
  `开始` / `结束` form with `确定` / `取消`), `暂停全部任务` (flips to `恢复全部任务` once every live
  task is paused; disabled when there is none) and `删除全部任务` (disabled when there is no task).
  Each task row carries two icon buttons: `⏸` / `▶` (pause/resume **that one task**; disabled once
  it has ended) and `×` (delete it), plus its time range and a status label
  (`进行中` / `已暂停` / `待开始` / `已结束`). The header shows the title, the timezone the times are
  interpreted in, and a `×`; clicking outside or pressing Esc closes it.
- **Free-run new-task form uses a dual-month date-range calendar**: two side-by-side months with
  `‹‹ ‹ … › ››` month/year navigation, weeks starting on Monday, today outlined, the selected range
  shaded and its endpoints filled; the first click picks the start, the second the end, reversed
  clicks swap, and the calendar closes once the range is complete. Opening the panel seeds the range
  with **the current time** (start = the current hour `H:00`, end = the next hour `H+1:59` — two
  clock hours); hour selects stay alongside for hour precision and a `现在` button re-seeds from the
  current time.
- **Free-run semantics**: absolute half-open `[from, to)` instants at **hour precision** in the
  configured `timezone`; `from` in the past is clamped to now (so "start immediately" works);
  one-shot — a task simply stops matching at `to`, which is its normal lifecycle and therefore
  **not an error** (and there is no expiry warning); auto-merge happens **only between windows in
  the same paused state** (overlapping or adjacent, i.e. back-to-back), a paused window overlapping
  an enabled one keeps both, and the merged set is capped at **8** tasks (a further add fails with a
  clear error); **pausing is per task**, not per session (the session-level switch is gone), the
  exemption holds while **at least one unpaused task covers the current instant**, and a paused task
  never transitions on its own. Schedules are persisted per session as JSON, so a dsh restart does
  not lose a future `from`.
- **Free-run hours are inclusive per hour**: the start hour H means `H:00` and the end hour H means
  `H:59`, so the end hour is covered in full — "开始 12 时 → 结束 14 时" is `12:00 → 14:59` (hours
  12, 13 and 14), "开始 12 时 → 结束 12 时" covers exactly that one hour, and "结束 23 时" is
  `23:59`, so the last hour of the day (23:00–24:00) can be selected (it used to be `23:00`, which
  left that hour unreachable). The host window stays half-open `[from, to)`; the picker simply hands
  it the `:59`. The default seed changed to match: start = the current hour (`H:00`), end = the
  **next hour** (`H+1:59`) — two clock hours, rolling to the next day at 23 (previously `+2h`).
- **Per-session exemption at all three gates**: while free-run is in effect the session is not held
  anywhere — automatic turn-level / step-gate pausing skips it, and requests that would be
  suspended by `agent/request` are released (a new **per-session `release`** lets an already-held
  request continue). When free-run stops applying (every task covering now is paused, or a task's
  window ends inside the peak), the session is suspended again and resumes at the next off-peak.
  It does not affect `providerGuard`, manual `/pause`, the weekend rule or the global peak state
  machine (`GET /session-guard/status` stays global — free-run is per session and never changes the
  status badge).
- **New route** `GET /session-guard/peak`: live mode (PEAK/OFF_PEAK/NORMAL), matched window name,
  minutes until peak, next peak, milliseconds until off-peak, and the normalized policy.
- **New fields and RPC actions**: `GET /session-guard/state` gains a `freeRun` object
  (`state` / `active` / `available` / `timezone` / `windows[]` with `id` / `from` / `to` /
  `fromInput` / `toInput` / `fromDisplay` / `toDisplay` / `paused` / `status` / `activeId` /
  `msRemaining` / `nextStartMs` / `nextStartDisplay`) where `active` replaces the removed `enabled`
  and each window's `status` is `active` / `paused` / `scheduled` / `ended`;
  `GET /session-guard/diag` gains `freeRun` (`{tracked, active, persisted, root}`);
  `POST /session-guard/rpc` gains the plugin-level `reloadConfig` (no `sessionId` needed) and the
  session-level `freeRunAdd` / `freeRunRemove` / `freeRunPause` / `freeRunResume` /
  `freeRunPauseAll` / `freeRunResumeAll` / `freeRunClear` (invalid input and unknown task ids return
  `{ok:false, error}`, e.g. `to` must be later than `from`).
- **New modules**: `src/time-policy.js` (`TimePolicyResolver`), `src/config-file.js`,
  `src/free-run.js`, `src/client/free-run-button.tsx`, `src/client/free-run-button-text.ts`,
  `src/client/date-range-picker.tsx`, `src/client/date-range.ts`. New tests:
  `tests/time-policy.test.mjs`, `tests/config-file.test.mjs`, `tests/free-run.test.mjs`,
  `tests/free-run-isolation.test.mjs`, `tests/free-run-button-text.test.mjs`,
  `tests/date-range.test.mjs`. The suite is **397 passing** (`node --test "tests/*.test.mjs"`).

### Changed

- **Settings model on this line is declarative.** On this line the `settings` service **still exists**
  (class `SettingsForms`, with `describe()`), but `dsh-settings` no longer offers `register()` (nor
  `get()`): only `describe()` and `configure()`. The plugin now `export const Config = SettingsSchema`
  with every field marked `.volatile()`, so dsh **auto-generates the settings form**; runtime values
  come from the apply composition entry merged over the `config/session-guard.json` default layer. The
  plugin registers no namespace, ships no custom settings card, and does **not** inject `settings` —
  not because the service is absent, but because it consumes nothing from it (there is no `register`
  to call and no `get` to read). The client half is a separate case: the **client-side** service
  `settingsScope` really is not provided on this line, and declaring it in the client's static
  `inject` left the entry pending forever (`waiting for service: settingsScope`) and fatally broke
  web boot — hence the client uses `inject = ['slots', 'locale']` and no settings card. Documentation
  is updated accordingly.
- **The composer button was replaced.** The old "pause session / resume session" button (slot
  `session-guard-pause`, `src/client/pause-button.tsx` / `pause-button-text.ts`) and its four states
  are gone; the free-run button (slot `session-guard-free-run`, order 20) takes that position. The
  `/pause`, `/resume` and `/cancel` slash commands and the `sessionGuard` redundant port (including
  `stepPause` / `stepResume`) are **unchanged**.
- **Peak windows are judged in the configured timezone** instead of a hardcoded Beijing time:
  `timezone` (IANA name) now drives **all** decisions (weekday, weekend and window matching) and
  defaults to `Asia/Shanghai`; `peakPolicy.timezone` (the flat `peakTimezone` setting) optionally
  overrides peak-window judgement only, so peak can stay pinned to DeepSeek's billing timezone while
  the weekend rule follows the local `timezone`. With the default configuration both are
  `Asia/Shanghai`, i.e. the previous behaviour is unchanged. Timezones are validated against the IANA
  database, so a typo such as `"Asia/Shangai"` is rejected and the default kept.
- **The default peak windows carry `days: ["mon"…"fri"]`.** Combined with the default weekend rule
  the effective behaviour is unchanged, but turning the weekend rule off while keeping the shipped
  default windows makes Saturday/Sunday off-peak — widen or omit `days` to get weekend peaks.
- **Automatic off-peak release only restores sessions this plugin paused.** Automatic release
  (off-peak, weekend, target switched to a non-official provider) is called with `auto: true`, so a
  manual `/pause` is never overridden (a manual `/resume` still always works). `pause` now records
  `pausedReason` (`"peak_window"` for a policy pause, `"manual"` for an explicit `/pause`), and
  `GET /session-guard/state` returns `paused.reason`.
- **`GET /session-guard/status`** now reports `mode`, `reason`, `windowName`, `minutesUntilPeak`,
  `peakTimezone`, `weekendDays` and the resolved `configFile` path, and **no longer reports
  `billingTimezone`**; the legacy `phase` field (`weekend` / `peak` / `off-peak`) is kept for
  existing client badges. `GET /session-guard/settings` gains
  `configFile: {path, candidates, errors}`; `GET /session-guard/diag` gains `configFile` and
  `freeRun`; `GET /session-guard/events` (SSE) now pushes only `step` events. The status badge
  itself is global and unchanged by free-run.
- **No more hardcoding**: changing peak hours, timezone, weekday limits or the weekend rule is just
  editing the config file (or the auto-generated form).

### Notes

- **Chinese statutory holidays are intentionally not recognised.** The shipped peak definition is
  "`Asia/Shanghai`, Monday–Friday `09:00–12:00` / `14:00–18:00` are peak, everything else is idle".
  There is no holiday calendar: a statutory holiday falling on a workday is treated as an ordinary
  workday and **does** count as peak inside a peak window (10:00 on a workday of the National Day,
  Dragon Boat, Mid-Autumn or Spring Festival break is PEAK). Weekends are unconditionally idle,
  **including make-up workdays** (a Saturday designated as a workday stays `OFF_PEAK`). "Idle" means
  "not paused" and covers `OFF_PEAK` (whole weekend) and `NORMAL` (outside peak windows on a
  workday); only `PEAK` triggers a pause. There is currently **no per-date exclusion** —
  `peakWindows[].days` only goes down to the weekday — so the options are turning `enabled` off for
  the day or accepting the pause.
- **Explicitly out of scope**: holiday calendars, make-up workdays, task scheduling, multi-session
  management.
- **The pre-peak prompt was removed in review**: it had no real use case — the actual need is "let
  this one session keep running now", which free-run satisfies in a simpler, more predictable shape;
  the pre-peak warning, countdown and continue pass are all gone.
- **This line's identity is unchanged**: branch `compat/0.1.7`, npm version `3.1.1`, dist-tag
  `dsh-0.1.7`, with `engines.dsh = >=0.1.7-rc.1 <0.1.8-0` in both `package.json` and
  `dsh.plugin.json`.

## 0.4.0 — 2026-09-18 (mis-versioned; superseded by 3.0.0)

### Fixed

- **Version identity.** This line was published as `0.4.0` while `dsh.plugin.json` and this
  changelog already said `3.0.0` — one artifact with two version numbers. `package.json` is now
  `3.0.0`, so the package version, the manifest version and the changelog agree. `0.4.0` is kept
  here as a historical record because npm versions are immutable; `dist-tag dsh-0.1.5` should be
  repointed to `3.0.0` once it is published.
- **Docs.** README/INSTALL (zh/en/ja/ko) no longer describe the sibling line as living on `main`.
  The 0.1.2 line's release branch is **`legacy/0.1.2`** (npm dist-tag `dsh-0.1.2`, version `0.3.1`);
  `main` is frozen at `0.2.0-beta.1`. The duplicated branch fragment in the INSTALL.zh/ja/ko install
  command is fixed, explicit dist-tag install commands are documented, and "2.x / 3.x" is
  now marked as a **line nickname** rather than a version number.

### Notes

- **No source changes** relative to `3.0.0`; `0.4.0` is a packaging-only publish of the same tree.

## 3.0.0 — 2026-09-14

### Changed

- **DSH v0.1.5-rc.2 dedicated line (`compat/0.1.5`).** `engines.dsh` and the `dsh-client-*`
  peer ranges narrow to `>=0.1.5-rc.2 <0.2.0-0` (strict-semver prerelease matching means the
  old `>=0.1.0-rc.7` range never matches `0.1.5-rc.2`); `dsh.plugin.json` gains `engines.dsh`.
  The 2.x / 0.2.x line on `main` keeps serving DSH 0.1.0-rc.7 … 0.1.2-rc.1.
- **`session.events` → `snapshotEvents()`.** DSH 0.1.5 removed the `session.events` array
  accessor (compatibility-guide §20.3). `pause-gate.js` now reads session events through a
  dual-path helper: `snapshotEvents()` first, the legacy `events` array as a defensive
  fallback, `null` (fail-open) when neither exists. Affects `findToolOutcome` and
  `lastUserPrompt` only; event-type matching is unchanged.

### Unchanged

- Zero changes on every other integration seam: the self-held webServer prefix route
  (`/session-guard/rpc`), `settings.register`, the `settings.plugin.item` card slot,
  client injections, and `llm.listConfigurableProviders()` are all verified intact against
  the published 0.1.5-rc.2 bundle (`tools/check-api-drift.ps1`, 12/12 required assertions).

### Pending

- Live smoke on a real DSH 0.1.5-rc.2 host (same status as the perm-gate 0.1.5 line).

## 0.2.0-beta.2 — 2026-09-13

### Fixed (DSH 0.1.5 compat — `compat/0.1.5` branch)

- **Dual-path resume enqueue.** DSH 0.1.5 turns the Inbox into an agent-loop read-only
  projection, so `agent.followup` may no longer exist. The resume flow now tries
  `agent.followup` first, falls back to `agent.send`, and degrades to a warn (never throws)
  when neither is available — a failed enqueue can no longer break resume.
- **Resume messages carry `source.form: 'instructions'`** per the 0.1.5 `ContextFormed`
  message-source contract (`kind: 'plugin'` is a built-in kind; older DSH versions ignore
  the extra field).
- **`webServer.register` is wrapped in try/catch**: a failed route registration now logs an
  error instead of throwing out of `apply` and breaking host plugin loading.
- Verified against the 0.1.5-rc.2 source: the `WebRoute` contract (exact/prefix + SSE) is
  unchanged, so client `fetch('/session-guard/...')` paths need no `/api` prefix.

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
