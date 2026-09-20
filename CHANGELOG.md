# Changelog

All notable changes to `dsh-session-guard` are recorded here. Versions follow semver.

- [English changelog](./CHANGELOG.md)
- [日本語 changelog](./CHANGELOG.ja.md)
- [한국어 changelog](./CHANGELOG.ko.md)

## 0.3.1 — 2026-09-18

### Fixed

- **Repository metadata.** `repository.url` / `homepage` now point at the real repo
  (`drscrewdriver/dsh-session-guard`, previously the non-existent `drscrewdriver/session-guard`).
- **Host range declared at its source.** The `@deepseek-ai/dsh-client-*` peer floors are narrowed
  from `>=0.1.0-rc.7` to `>=0.1.2-rc.1` so they match `engines.dsh`; `dsh.plugin.json` gains the
  matching `engines.dsh` (`>=0.1.2-rc.1 <0.2.0-0`) and its `version` is re-synced to the package
  version. Previously the manifest version lagged at `0.2.0-beta.1` and declared no host range.
- **Docs.** README/INSTALL (zh/en/ja/ko) now state this line's identity (branch `legacy/0.1.2`,
  dist-tag `dsh-0.1.2`) and stop claiming "one artifact covers both versions"; the `0.1.5-rc.2`
  row is replaced by a pointer to the dedicated line. The unfilled owner placeholder in the
  install command is gone.

### Notes

- **No source changes.** `src/`, `lib/` and `tests/` are byte-identical to `0.2.0-beta.1`;
  `0.3.0` and `0.3.1` are packaging-only re-releases of the same tree.

## 0.3.0 — 2026-09-18

### Changed

- **Packaging re-release of the 0.2.0-beta.1 tree.** Adds `publishConfig`
  (`registry: https://registry.npmjs.org`, `access: public`, `tag: dsh-0.1.2`) and narrows
  `engines.dsh` to `>=0.1.2-rc.1 <0.2.0-0` (the old `>=0.1.0-rc.7` range never matched a
  `0.1.2-rc.x` prerelease under strict-semver matching).

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
