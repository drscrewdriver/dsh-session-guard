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
> | 0.1.2-rc.1 ~ 0.1.4-beta.1 | ✅ this line | `ctx.settings.register(ns, schema, { base })` | ✅ same shape | ✅ no platform value imports |
> | 0.1.2-alpha.2+ / 0.1.2-rc.1 | ✅ this line | `register` still present (`installSection` added) | ✅ same shape | ✅ no platform value imports |
> | 0.1.5-rc.2 | ➖ **not this line** | see the dedicated line | see the dedicated line | see the dedicated line |
>
> **This line's identity**: branch `legacy/0.1.2`, npm version `0.3.x`, dist-tag
> **`dsh-0.1.2`**, host range `engines.dsh = >=0.1.2-rc.1 <0.2.0-0`.
> **0.1.0-rc.7 ~ 0.1.1-rc.x are NOT in this line's range** — both `engines.dsh` and the
> `@deepseek-ai/dsh-client-*` peer floors are pinned to `>=0.1.2-rc.1` in `package.json`
> *and* `dsh.plugin.json`; those older hosts should use a historical version ≤ `0.1.2`.
> The canonical definition of these field sources lives in
> `mine-dsh-plugins/improve-dsh-plugins/DSH-PLUGIN-VERSION-DISTRIBUTION-STRATEGY.md` §2.2.
>
> **0.1.5-rc.2 is now a dedicated line.** DSH 0.1.5 removed the `session.events` array
> accessor (events must be read through `snapshotEvents()`), and its `engines.dsh` is
> mutually exclusive with `>=0.1.2-rc.1` under semver prerelease matching.
> **0.1.5-rc.x hosts must use the `compat/0.1.5` branch** (npm dist-tag
> **`dsh-0.1.5`**, version `3.0.0`):
> `dsh plugin --profile web add github:drscrewdriver/dsh-session-guard#compat/0.1.5`.
> **"One artifact covers both" has been false since the 0.1.5 split.**
>
> `session/event`, `agent.cancel`, `goals.pause`,
> `agent.followup`, `commands.register`, `timer.interval`, `webServer.register`,
> `agent/request`, `llm.listConfigurableProviders` and `settings.register/get`
> are signature-identical between `dsh-v0.1.1-rc.2` and `dsh-v0.1.2-rc.1`.
> The one
> seam that needs a dual read is the `tool/result` call id (`content[].toolCallId`
> first, `source.callId` as fallback) — both forms appear in replay logs of both
> versions. It now lives in `src/tool-call-id.js` with unit tests.
> The `model/selection` event exists **only on 0.1.2+** and is feature-probed; the
> settings surface uses only the `register` + `get` intersection (never
> `installSection`, never the removed `installSettingsSection`). Drift guard:
> `tools/check-api-drift.ps1` (this line asserts against four tags by default).

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
# DSH 0.1.2-rc.x hosts (this line, dist-tag dsh-0.1.2)
dsh plugin --profile web add dsh-session-guard@dsh-0.1.2

# or straight from the git branch
dsh plugin --profile web add github:drscrewdriver/dsh-session-guard#legacy/0.1.2

# DSH 0.1.5-rc.x hosts must use the dedicated line (dist-tag dsh-0.1.5)
dsh plugin --profile web add dsh-session-guard@dsh-0.1.5
```

> ⚠️ **Do not rely on the bare package name `dsh-session-guard`**: npm's `latest`
> tag cannot serve two mutually exclusive version lines (their `engines.dsh` ranges
> are exclusive under semver prerelease matching) — always pin the dist-tag explicitly.

Restart dsh web and refresh the page after installation.

## Settings (Settings → Plugins → session-guard, simple toggles)

| Toggle | Default | Description |
|---|---|---|
| `enabled` | on | **Peak auto-pause**: auto-pause running sessions during peak hours |
| `stepLevelPause` | on | **Step-level gate**: during peak, hold *before* the next step's model request (earlier and cheaper than turn-level); off = fall back to turn-level pause |
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
- `stepGateTimeoutMs` (default 300000) — step-gate hold timeout; on expiry the gate is released and the session **escalates to a turn-level pause** (anti-deadlock, and no "one step per 5 minutes" token drip);
- Official-source guard: `officialProviders` (extra official provider ids, comma separated, highest priority), `officialBaseURLs` (official endpoint hosts, default `api.deepseek.com`);
- Deferral queue: `deferredMode` (`hold` / `error`), `deferredResumeText`, `deferredMaxHoldMs` (hold cap, default 6h, then converts to an error);
- Retry parameters: `retryText`, `retryGraceMs`, `retryCooldownMs`, `retryBackoffFactor`, `retryBackoffMaxMs`, `retryMaxConsecutive`.

## Behavior

### Peak auto-gate (global)

- **Peak entry** (and not weekend): with `stepLevelPause` on, the running turn is **no longer interrupted** — the session runs to the next `agent/pre-step` boundary where the step gate holds it (see below); with it off, calls `gate.stopNextTurn` on all running root sessions (custom session gate truly pauses, or falls back to lock-wait queue per `queueFallback`);
- **Off-peak / weekend**: first `releaseAll` the held steps (the turn just continues in place), then `gate.resume` **all** sessions — controlled by `offPeakAutoResume`;
- **Peak timezone**: hardcoded to Beijing time (`Asia/Shanghai`), matching DeepSeek's official billing basis — not affected by the `timezone` setting;
- State machine: single-instance `NORMAL ↔ PAUSED_PEAK` (`scheduler.js`), driven by a single 30s tick.

### Step-level gate (v0.2.0, the token saver)

Hooks the `agent/pre-step` waterfall and holds the turn **before the next step's model request happens**.

- **Hold conditions** (all required): `enabled` + `stepLevelPause` + `step > 1` + peak (Beijing time, not weekend) + official target provider (`providerGuard`; all providers when off) + the session is not request-held + not manually bypassed this peak window;
- **Why `step > 1`**: the first step of a turn is covered by the request-level guard, so the two gates never overlap;
- **Release paths**: ① the "⏸ paused (resume)" button / `POST /session-guard/rpc {action:'stepResume'}` / `/resume` → lets the current step through and **stops gating this session for the rest of the peak window**; ② off-peak → release all, the turn continues in place (**no followup needed**); ③ freeze button / `/pause` / `/cancel` → release the gate and move to a turn-level pause; ④ `signal` abort → release;
- **Timeout escalation**: holding longer than `stepGateTimeoutMs` (default 5 min) releases the gate and **escalates to a turn-level force pause**, resumed off-peak (no deadlock, no token drip);
- **State**: `GET /session-guard/state?session=<id>` returns `paused: { step, turn }` and `stepGate: { held, since, bypass }`; the service port's `paused` **stays boolean** for compatibility, with `pausedStep` for the step gate;
- **Not persisted**: the hold is an in-process promise; a restart drops it (no ghost state).

#### Pause / resume session button (provided by session-guard)

The "Pause session" button in the composer's right row (slot `conversation.input.right`, id `session-guard-pause`, order 20, left of input-traffic's "❄ Freeze & append"):

- not paused → "Pause session", **clickable**: calls `stepPause` and pauses the session **before the next step's model request** (the current step is not interrupted; step 1 is held too, regardless of peak/provider);
- paused → "Resume session", calls `stepResume`: lets the current step through and stops gating this session for the rest of the peak window;
- **push updates**: `GET /session-guard/events?session=<id>` (SSE) pushes step-gate state changes **immediately** — when peak auto-holds, the button flips to "Resume session" without waiting for a poll; a 10s `/session-guard/state` poll remains as a fallback (SSE down → still converges);
- styled to match input-traffic's button in the same row (24px height / 6px radius / 12px font / same CSS tokens), with hover and paused states.

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

Buttons: this plugin's "Pause session / Resume session" (order 20) and input-traffic's "❄ Freeze & append / Resume & append" (order 30) sit side by side and replace neither — the former owns the step gate, the latter owns queue detach + turn-level freeze.

## Redundant port `sessionGuard`

```js
{
  stopNextTurn(sessionId, opts),
  resume(sessionId, opts),
  lockQueue(sessionId, reason),
  unlockQueue(sessionId),
  stepPause(sessionId),           // request a manual step-level pause (held at the next pre-step)
  stepResume(sessionId, opts),    // release the step gate (v0.2.0); opts.bypass=false keeps gating this peak
  state(sessionId),               // { queueLocked, lockReason, paused, pausedStep, stepHeldSince, stepBypass, ... }
}
```

## HTTP routes

- `GET /session-guard/state?session=<id>` — session state (`paused: { step, turn, manual }` / `stepGate` / last target / held / deferred)
- `GET /session-guard/events?session=<id>` — **SSE**: pushes step-gate state changes immediately (drives the button)
- `GET /session-guard/settings` — settings + taskControl availability
- `GET /session-guard/status` — global current phase (status badge polling; includes `stepHeld`)
- `GET /session-guard/provider?provider=<id>` — official-source verdict diagnostics (`official` / `matchedBy` / `endpoint`)
- `GET /session-guard/diag` — runtime diagnostics (includes `stepGate`)
- `POST /session-guard/rpc` — `{ action: stopNextTurn|resume|lockQueue|unlockQueue|stepPause|stepResume|state, sessionId }`

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
| `src/step-gate.js` | **`agent/pre-step` step-level gate** (v0.2.0: hold / release / timeout escalation / bypass; pure `decideStepHold`) |
| `src/targets.js` | Per-session "last real target" tracking (`request/header` + `model/selection`) |
| `src/wiring.js` | Wiring/orchestration (peak-entry filter / step-gate wiring / off-peak release / exact timer / dispose) |
| `src/pause-gate.js` | Custom session gate engine (releases the step gate before pausing) |
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
