# Changelog

All notable changes to `dsh-session-guard` are recorded here. Versions follow semver.

- [English changelog](./CHANGELOG.md)
- [日本語 changelog](./CHANGELOG.ja.md)
- [한국어 changelog](./CHANGELOG.ko.md)

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
