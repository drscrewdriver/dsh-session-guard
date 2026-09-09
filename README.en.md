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
> | 0.1.0-rc.7 ~ 0.1.1-rc.x | ✅ | `ctx.settings.register(ns, schema, { base })` | ✅ same shape | ✅ no platform value imports |
> | 0.1.2-alpha.2+ / 0.1.2-rc.1 | ✅ | `register` still present (`installSection` added) | ✅ same shape | ✅ no platform value imports |
> | 0.1.3+ / 0.1.5-alpha.1 | APIs still present (unverified) | `register` unchanged | ✅ | ✅ |
>
> One artifact covers both. `session/event`, `agent.cancel`, `goals.pause`,
> `agent.followup`, `commands.register`, `timer.interval`, `webServer.register`,
> `agent/request`, `llm.listConfigurableProviders` and `settings.register/get`
> are signature-identical between `dsh-v0.1.1-rc.2` and `dsh-v0.1.2-rc.1`
> (verified through `0.1.5-alpha.1`). The one
> seam that needs a dual read is the `tool/result` call id (`content[].toolCallId`
> first, `source.callId` as fallback) — both forms appear in replay logs of both
> versions. It now lives in `src/tool-call-id.js` with unit tests.
> The `model/selection` event exists **only on 0.1.2+** and is feature-probed; the
> settings surface uses only the `register` + `get` intersection (never
> `installSection`, never the removed `installSettingsSection`). Drift guard:
> `tools/check-api-drift.ps1`.

> Automatically pause running sessions during peak pricing hours and resume during off-peak/weekend; pair with input-traffic's freeze button for **per-session** locking; backend **auto-retry** yields during freeze/gate. Core based on a custom session gate (`agent.cancel keepInbox + goals.pause + session/event safe boundary + followup resume`), no longer depending on dsh-task-control.

A cordis plugin assembled via the `dsh plugin` command and a bundle patch — no dsh source changes, no PR required.

> 💡 **Why recommended**: DeepSeek moved to **peak/off-peak billing** on 2026-08-17 — the peak window (Beijing time 09:00-12:00, 14:00-18:00) costs **2×** the off-peak rate. This plugin auto-pauses running sessions during peak and auto-resumes off-peak, saving up to **50%** on long-running sessions; manual freeze (via input-traffic button) provides per-session precision.

## Features

- **Weekend mode**: detects weekends (timezone-correct via `Intl.DateTimeFormat`, no裸 `getUTCDay()` Beijing-boundary 8-hour bug) → weekends ignore peak/off-peak, run freely.
- **Peak auto-pause (global)**: on peak entry (and not weekend), auto-pauses all running root sessions; off-peak auto-resumes all — **global switch, no manual action needed**.
- **Official-source guard (`providerGuard`)**: during peak hours only requests whose target is a DeepSeek official source are blocked; local/third-party providers (e.g. `local-35b`) keep running. Verdict order = explicit id list → `baseURL` endpoint → catalog default endpoint → builtin id.
- **Request-level backstop + deferral queue**: sessions started after peak entry, or switched to an official source mid-session, are caught by the `agent/request` guard (default `hold`: the request is suspended without an error and released off-peak).
- **Per-session freeze / resume**: `sessionGuard` redundant port + `POST /session-guard/rpc`, input-traffic freeze button per-session passthrough; also provides `/pause /resume /cancel` manual commands.
- **Backend auto-retry (D9)**: turn/end transient failures (error/429/max-tokens) auto-retry with adaptive backoff; permanent failures stop; **yields during freeze/gate**, never bypasses the session gate.
- **Fail-open**: custom session gate unavailable, session-guard not installed, settings service missing — all silently degrade, never crash on dependencies.

## Installation

```bash
dsh plugin --profile web add github:<owner>/dsh-session-guard
```

Restart dsh web and refresh the page after installation.

## Settings (Settings → Plugins → session-guard, simple toggles)

| Toggle | Default | Description |
|---|---|---|
| `enabled` | on | **Peak auto-pause**: auto-pause running sessions during peak hours |
| `providerGuard` | on | **Official-source guard**: block only DeepSeek official sources during peak; local/third-party providers keep running |
| `guardSubagents` | on | **Guard subagent requests**: subagent requests are billed too, guarded by default |
| `offPeakAutoResume` | on | **Off-peak auto-resume**: auto-resume paused sessions off-peak; off = no auto-resume (manual required) |
| `weekendMode` | on | **Weekend mode**: detect weekends → no auto-pause on weekends (no peak, run freely) |
| `deferredResume` | on | **Auto-resume after peak**: off = deferred requests/sessions stay parked until a manual `/resume` |
| `queueFallback` | on | Fallback to lock-wait queue when custom session gate is unavailable (fail-open) |
| `retryEnabled` | off | **Auto-retry (backend)**: transient failure auto-resume (off by default, conservative) |

Additional configuration:

- `timezone` (default Asia/Shanghai) — used for **weekend detection** and badge display; **does not affect peak/off-peak detection** (always Beijing time);
- `peakWindows` (default 09:00–12:00 / 14:00–18:00) — peak windows in Beijing time (UTC+8), matching DeepSeek's official billing;
- `pauseMode` (`safe`/`force`), `pauseReason` (`wait`/`stop`);
- Official-source guard: `officialProviders` (extra official provider ids, comma separated, highest priority), `officialBaseURLs` (official endpoint hosts, default `api.deepseek.com`);
- Deferral queue: `deferredMode` (`hold` / `error`), `deferredResumeText`, `deferredMaxHoldMs` (hold cap, default 6h, then converts to an error);
- Retry parameters: `retryText`, `retryGraceMs`, `retryCooldownMs`, `retryBackoffFactor`, `retryBackoffMaxMs`, `retryMaxConsecutive`.

## Behavior

### Peak auto-gate (global)

- **Peak entry** (and not weekend): calls `gate.stopNextTurn` on all running root sessions — custom session gate truly pauses (doesn't interrupt reasoning, pauses at safe boundary before next tool dispatch), or falls back to lock-wait queue per `queueFallback`;
- **Off-peak / weekend**: `gate.resume` **all** sessions (auto-resume, no manual action) — controlled by `offPeakAutoResume` toggle;
- **Peak timezone**: hardcoded to Beijing time (`Asia/Shanghai`), matching DeepSeek's official billing basis — not affected by the `timezone` setting;
- State machine: single-instance `NORMAL ↔ PAUSED_PEAK` (`scheduler.js`), driven by a single 30s tick.

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

- **Polling**: requests `GET /session-guard/status` every 15 seconds for `phase`, `providerGuard`, `held`, `deferred`;
- **Fail-open**: route unreachable, network error, or `enabled` off → badge silently hidden, no session affected;
- **Independent of input-traffic**: the badge is rendered by session-guard's client code alone — **input-traffic is not required**. input-traffic only provides the freeze button, which is unrelated to the badge;
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

- **Peak/off-peak detection**: always uses **Beijing time (UTC+8)** via `BILLING_TIMEZONE = 'Asia/Shanghai'`, matching DeepSeek's official billing basis. This is **hardcoded** and not affected by the `timezone` setting;
- **Weekend detection**: uses the user-configured `timezone` (e.g. `Asia/Tokyo`, `Asia/Seoul`), because "weekend" is a local concept;
- `Intl.DateTimeFormat` is used for timezone projection — invalid IANA timezone names throw `RangeError`, caught by fail-open and falling back to `Asia/Shanghai`;
- Peak windows are **left-closed, right-open** `[start, end)`, supporting cross-midnight windows (e.g. `22:00–06:00`);
- The `timezone` setting works identically across all UI languages (zh/en/ja/ko) — IANA timezone names are locale-independent.

### Coordination with input-traffic

- input-traffic's **freeze button** triggers via `sessionGuard.stopNextTurn` (RPC, per-session) on the server side;
- input-traffic **only does freeze enhancement** (queue freeze/unfreeze + composer block), retry is handled by this plugin's backend;
- Both share "session isolation" semantics: input-traffic freeze queue keyed by sessionId, session-guard RPC also keyed by sessionId.

## Redundant port `sessionGuard`

```js
{
  stopNextTurn(sessionId, opts),
  resume(sessionId, opts),
  lockQueue(sessionId, reason),
  unlockQueue(sessionId),
  state(sessionId),
}
```

## HTTP routes

- `GET /session-guard/state?session=<id>` — session state (last target / held / deferred)
- `GET /session-guard/settings` — settings + taskControl availability
- `GET /session-guard/status` — global current phase (status badge polling)
- `GET /session-guard/provider?provider=<id>` — official-source verdict diagnostics (`official` / `matchedBy` / `endpoint`)
- `GET /session-guard/diag` — runtime diagnostics
- `POST /session-guard/rpc` — `{ action: stopNextTurn|resume|lockQueue|unlockQueue|state, sessionId }`

## State storage

Per-session JSON: `$DSH_HOME/.dsh/session-guard/<sessionId>.json` (atomic write; `DSH_SESSION_GUARD_STATE_DIR` override).

## Tests

```bash
npm test   # node --test tests/*.test.mjs (timezone/weekend/state-machine/session-gate/bridge/retry)
```

## Modules

| File | Responsibility |
|---|---|
| `src/time.js` | Peak/weekend detection (timezone-correct) + `msUntilOffPeak` (exact release timing) |
| `src/scheduler.js` | Pure state machine NORMAL ↔ PAUSED_PEAK |
| `src/provider.js` | Official-source verdict (pure: endpoint normalization + decision matrix) |
| `src/provider-directory.js` | Endpoint directory (`llm.listConfigurableProviders` + `settings.get`, full degradation) |
| `src/deferrals.js` | Deferral registry (hold / release / cap / `PeakDeferredError`) |
| `src/request-guard.js` | `agent/request` request-level guard (hold / error modes) |
| `src/targets.js` | Per-session "last real target" tracking (`request/header` + `model/selection`) |
| `src/wiring.js` | Wiring/orchestration (peak-entry filter / off-peak release / exact timer / dispose) |
| `src/pause-gate.js` | Custom session gate engine |
| `src/pause-store.js` | Custom pause state persistence |
| `src/gate.js` | Session gate driver (custom true pause / fallback lock queue, fail-open) |
| `src/bridge.js` | `sessionGuard` redundant port |
| `src/retry.js` | Backend auto-retry (classification/backoff/freeze yield; short-circuits only the exact `PEAK_DEFERRED` code) |
| `src/detect.js` | Auto-detection (host taskControl / client input-traffic bridge) |
| `src/store.js` | Per-session persistent state |
| `src/settings.js` | Settings sub-panel (schemastery schema + fail-open registration) |
| `src/index.js` | Host apply (settings/routes/tick/provide service/retry + request guard wiring) |
| `src/client/` | Browser half (status badge + settings card + four-language dictionaries) |

## License

MIT — see [LICENSE](LICENSE).
