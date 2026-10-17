# Changelog

All notable changes to `dsh-session-guard` are recorded here. Versions follow semver.

- [English changelog](./CHANGELOG.md)
- [日本語 changelog](./CHANGELOG.ja.md)
- [한국어 changelog](./CHANGELOG.ko.md)
- [Changelog en français](./CHANGELOG.fr.md)
- [Changelog auf Deutsch](./CHANGELOG.de.md)
- [Changelog in italiano](./CHANGELOG.it.md)
- [Changelog на русском](./CHANGELOG.ru.md)
- [Changelog en español](./CHANGELOG.es.md)

## 4.2.1 — 2026-10-17 (host enumeration: +0.2.1-rc.1)

### Fixed
- `engines.dsh` and the four `@deepseek-ai/dsh-client-*` peers append `|| 0.2.1-rc.1` (16-host exact enumeration),
  so the host compatibility gate accepts DSH `0.2.1-rc.1`.
- `dsh.plugin.json` `engines.dsh` aligned to the same 16-host enumeration (was the range `>=0.2.0-rc.1 <0.2.1-0`);
  the gate only reads `package.json`, but the two lists must not diverge.
- README compatibility statements (zh/de/es/fr/it/ru) synced to the enumeration. No behaviour change in this release.

## 4.2.0 — 2026-10-17

### Added
- Statutory-holiday awareness (src/holidays.js + src/holiday-store.js). Builtin 2026 finalized snapshot: 39 rows = 33 rest days + 6 make-up workdays (source: holiday-cn, State Council notices). Strict parse (zero-padded dates, boolean isOffDay, cross-year rows rejected); sha256 fingerprint over the decision fields only — upstream copy/reorder edits cause no false churn. The cache file $DSH_HOME/.dsh/session-guard/holidays/<year>.json self-verifies its fingerprint at load: mismatch discards the cache (builtin fallback) and triggers a re-fetch. Auto refresh: startup check + hourly ensureFresh; relevant years = Beijing current year, Nov/Dec also add next year (the State Council publishes next year in late December, so it lands without a release); jsDelivr primary, raw.githubusercontent fallback, 10 s timeout; refetch only on fingerprint change, then atomic tmp+rename write; 24 h no-refetch budget; consistent hits only bump the check timestamp; fail-open end to end. DSH_SESSION_GUARD_HOLIDAY_FETCH=0 pins offline/builtin mode (tests ride it).
- Declarative settings switches holidayMode and holidayAutoFetch (both default on; auto-form on 0.1.7+). /session-guard/status now exposes holidayMode + holidays[] per year (source / fingerprint / fetchedAt / entry count).

### Changed
- weekendMode upgraded to rest-day semantics: statutory holidays (including ones landing on workdays) are off-peak all day; make-up-workday weekends enter peak gating normally; nextOffPeakInstant lookahead widened 7 -> 14 days and is table-aware. holidayMap rides cfg via readCfg, so shouldPause consumers (scheduler tick / request-guard / step-gate / wiring release timers) pick it up with zero signature churn.

### Fixed
- Family claim rank 1 -> 2, aligned with the frozen weighted rank ladder (single source _tools/family-rank.mjs).

## 4.1.16 — 2026-10-14 (metadata alignment; backfill the missing 4.1.15 entry)

### Fixed

- `dsh.plugin.json` now carries the same version as `package.json`. The published 4.1.15 tarball
  still said 4.1.14 (verified by downloading it from the registry), so the two manifests disagreed in a released artifact.
- No behaviour change in this release.
- Test suite repaired: the structural pin in `tests/settings-bridge.test.mjs` still demanded the
  retired gear entry, so the suite had been red since 4.1.15; it now asserts the opposite (absence).

## 4.1.15 — 2026-10-08 (backfilled: this entry was never written at release time)

### Removed

- The shell-level `shell.overlay` slot injection: the fixed bottom-right gear button and its
  positioned floating layer are gone (`src/client/shell-overlay.tsx` deleted). The settings entry
  now relies on the host settings page alone.

## 4.1.14 — 2026-10-08

### Removed

## 4.1.13 — 2026-10-08

### Fixed — bridge descriptor skeleton on ≤0.1.5 (five-cell gate catch, 2026-10-08)

- **Host describe `value` is a field skeleton on ≤0.1.5** (0.1.0/0.1.5 empirical):
  the old host generations serialize `descriptor.value` as `{enabled:{},…,officialProviders:{}}`
  (one empty object per schema field) while the real merged config lives in
  `descriptor.base` (combined defaults) + `descriptor.user` (user layer).
  `BridgeDocHandle` consumed `value` verbatim, so `officialProviders` arrived as
  `{}` — truthy non-array, invisible to `?? []` — and `ListRow`'s
  `values.join` threw, crashing the whole `dsh-family.tab` slot (guard card +
  IT card + TL nav all died together). `descriptorPlainValue()` now detects the
  skeleton (object whose every own value is an empty plain object — impossible
  for guard's scalar/array config) and rebuilds the effective value as
  `{...base, ...user}` (shallow merge is exact for guard's flat config).
- **Card-field sanitization (defense in depth)**: any card render error kills
  the entire family tab slot on these hosts, so `ListRow` inputs are now
  sanitized at the call sites (`toList()` — non-arrays become `[]`) and the
  `拦截方式` select falls back to `hold` for any non-`error` value. A malformed
  descriptor may degrade one field, never the tab.
- Verified on the five-cell farm gate: describe replays on 0.1.0/0.1.5 now
  yield plain merged values; the seeded `stepGateTimeoutMs: 321123` reads back
  through the bridge on ≤0.1.5 and natively (configForms) on 0.1.7.

## 4.1.12 — 2026-10-08

### Added — settings webServer bridge (M4/T20-b): dual-track card data plane

- **Top-level card registration refactor (prerequisite)**: the three settings
  faces (`dsh-family.tab`, `plugins.bundle.config`, `settings.plugin.item`,
  `shell.overlay`) were registered inside the `onScope` callback of the dual
  scoped-inject waist — on ≤0.1.5 that callback never fires (settingsScope fiber
  never resolves; 0.1.0/0.1.1 lack both services), so the cards never registered
  and a bridge would have had no consumer. All registrations now run at apply
  top level with a `scopeRef` live reference; the callback degrades to a pure
  data arm (perm-gate `client/index.ts` L166-257 shape).
- **Server bridge** (`src/settings-bridge.js`): `describe`/`mutate` endpoints at
  `/api/session-guard/settings/*` (POST-only, `{ok,value|error}` envelope,
  redacted describe filtered to the plugin ns, ops forwarded to the host
  settings service with `expectedRevision` optimistic concurrency, 256 KB cap).
  Registration is fail-open (error log, never blocks plugin load).
- **Client bridge handle** (`src/client/settings-bridge.ts`): `BridgeDocHandle`
  implements the same `SettingsScope` face as the native handles
  (getSnapshot/subscribe/set/unset); describe misses retry within a bounded
  budget (settings service resolving later than card mount) before landing on
  `unavailable`. Card faces read `scopeRef.scope ?? bridgeScope()` — native
  first, bridge fallback (perm-gate T13b dual-track). **Generation split in the
  data arm (five-cell empirical, 2026-10-08 night)**: on 0.1.2/0.1.5 the
  `settingsScope` handle is write-alive but read-dead — `set()` persists to
  settings.yaml while `getSnapshot().value` stays `undefined`, so that arm
  deliberately leaves `scopeRef` empty and the card falls to the bridge (bridge
  mutate lands in the same host service; describe heals the read path).

### Corrected — 4.1.11 publication note

- The 4.1.11 entry said "none of 4.1.5-4.1.10 was published to npm"; **4.1.5
  was published** (npm registry confirms `4.1.5` in versions, and `latest`
  pointed at it until this release line). 4.1.6-4.1.10 indeed never shipped.
  The earlier claim came from reading the npmmirror mirror instead of the
  authoritative registry (registry-pin discipline, B2+).

## 4.1.11 — 2026-10-08

### Fixed — family-section takeover rebuilt (4.1.5 → 4.1.11 arc; none of 4.1.5-4.1.10 was published to npm)

- **4.1.5 "half backfill" root cause**: the takeover body read `props.hooks.tabs`,
  but the host's `bindInjectHooks` strips an inject face's `hooks` key into
  `use<Tab>` props on every generation — the component threw, the slot abdicated,
  and the takeover body never rendered anywhere. It now reads the `useTabs`
  compartment first, with a raw-hooks `useState`/`useEffect` fallback.
- **Apply-time inject registration (4.1.10)**: the slots core fires inject
  factories only on declaration events (= the settings panel opening), so the
  grace-delayed registration of 4.1.7/4.1.8 waited for a declaration that never
  came. The `settings.section` inject now registers at apply time.
- **Deferred yield-election (4.1.11)**: ≤0.1.7 shells give every same-id section
  entry its own nav row — the old "priority-10 shadow stays invisible" assumption
  produced a double 起子插件设置 row on all five farm cells. The factory now waits
  500 ms after the declaration batch and stands down when a `dsh-family` entry is
  already seated (thinking-levels head); it takes over only when TL is absent.
  Verified single-row on all five farm cells (0.1.0 → 0.1.7), pairing with
  dsh-thinking-levels 4.2.0-beta.26's symmetric stand-down.

## 4.0.0 — 2026-09-29

### Changed
- **DSH 0.2.0 line adaptation**: `engines.dsh` and the four `@deepseek-ai/dsh-client-*` peers move to `>=0.2.0-rc.1 <0.2.1-0` (replacing the 0.1.7 ranges); npm dist-tag `dsh-0.2.0`; manifest version aligned to `4.0.0`. The plugin-facing API surface (manifest / settings / HMR / slots / session v4) is unchanged from 0.1.7 — no runtime code changes.
- `@deepseek-ai/cordis` peer floor aligned to `^4.0.4` (the 0.2.0-rc.1 host UI packages declare `~4.0.4`; the previous `^4.0.1` accepted it but understated the floor).

### Fixed
- `src/client/family-section.tsx` landed in version control (it had existed only in the working tree since 3.2.x, so a clean checkout could not build).
- eslint flat config: dropped the core `no-unused-vars` rule — it mis-flags TS type-signature parameters; the typescript-eslint variant is kept, and the lint baseline is green again.
- v4 source-kind static gates (`tests/source-kind.test.mjs`) are now tracked and run in `npm test` (248 tests).

## 3.2.4 — 2026-09-27

### Fixed
- **Session format v4 adaptation (host >= 0.1.7-rc.1)**: the three session-writing paths no longer use the retired `source: { kind: 'plugin', plugin: 'session-guard' }` signature, which the v4 host rejects with `SessionFormatError` (whole round fails). All three now use the producer-owned kind:
  - delayed-resume notice injection (`src/wiring.js`);
  - auto-retry notice injection (`src/retry.js`);
  - pause-resume followup (`src/pause-gate.js`, ```kind: `plugin:${pluginId}````).
  - **tool-result v4 native adaptation (N1)**: `findToolOutcome` in `src/pause-gate.js` now reads the v4 first-class `role:'tool'` message (`toolCallId`/`isError` at message top level) first; the v3 `tool-result` block path is kept as historical fallback. Without this, a failed tool at pause time was reported as completed on resume ("do not re-run") — a silent wrong decision. `src/tool-call-id.js` reads the native top-level id first; stale 0.1.1/0.1.2-era header notes corrected to the three-shape generation table.
  `form` and all other fields are unchanged; the host's own v3-to-v4 migration lifts existing legacy rows, so no historical data is rewritten. Evidence: `@deepseek-ai/dsh-session-format-v3-to-v4@0.1.7-rc.2` validates only that `source.kind` is non-empty and not `'plugin'`.

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
