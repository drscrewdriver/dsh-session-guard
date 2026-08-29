# Changelog

All notable changes to `dsh-session-guard` are recorded here. Versions follow semver.

- [English changelog](./CHANGELOG.md)
- [日本語 changelog](./CHANGELOG.ja.md)
- [한국어 changelog](./CHANGELOG.ko.md)

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
