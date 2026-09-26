# Installation Guide (Official DSH CLI)

This guide uses only the official DSH `dsh plugin` command.

- [English installation guide](./INSTALL.md)
- [中文安装指南](./INSTALL.zh.md)
- [日本語インストールガイド](./INSTALL.ja.md)
- [한국어 설치 안내](./INSTALL.ko.md)
- [English README](./README.en.md)
- [中文 README](./README.md)
- [日本語 README](./README.ja.md)
- [한국어 README](./README.ko.md)
- [Changelog](./CHANGELOG.md)
- [日本語 changelog](./CHANGELOG.ja.md)
- [한국어 changelog](./CHANGELOG.ko.md)

## 0. Prerequisites

```bash
echo "DSH_HOME=${DSH_HOME:-$HOME/.dsh}"
dsh --version
```

## 1. Install

```bash
dsh plugin --profile web add dsh-session-guard@dsh-0.1.7

# or straight from the git branch
dsh plugin --profile web add github:drscrewdriver/dsh-session-guard#compat/0.1.7
```

`compat/0.1.7` is the DSH `0.1.7-rc.x` line: npm package version **`3.1.1`**, dist-tag
**`dsh-0.1.7`**, with `engines.dsh = >=0.1.7-rc.1 <0.1.8-0` in **both** `package.json` and
`dsh.plugin.json`.

DSH `0.1.5-rc.x` hosts should use the **`compat/0.1.5`** branch (npm dist-tag `dsh-0.1.5`,
version `3.0.0`). DSH `0.1.2-rc.x` hosts should use the **`legacy/0.1.2`** branch (npm dist-tag
`dsh-0.1.2`, version `0.3.1`). **`main` is frozen at `0.2.0-beta.1` and is no longer the 0.1.2
line's release branch.**

> ⚠️ Do not rely on the bare package name `dsh-session-guard`: npm's `latest` tag cannot
> serve two mutually exclusive version lines (their `engines.dsh` ranges are exclusive under
> semver prerelease matching) — always pin the dist-tag explicitly.

Restart dsh web and refresh the page.

## 2. Verify

Open **Settings → Plugins → session-guard**. The plugin registers no namespace and ships no custom
card: it exports `Config = SettingsSchema` with every field marked `.volatile()`, so dsh
**auto-generates this form**. Toggles: `enabled`, `providerGuard`, `guardSubagents`,
`offPeakAutoResume`, `weekendMode`, `deferredResume`, `queueFallback`, `retryEnabled`; text/list
fields: `officialProviders`, `officialBaseURLs`, `deferredResumeText`.

The peak/weekend policy can also be configured with a JSON file (resolution order:
`$DSH_SESSION_GUARD_CONFIG` → `$DSH_HOME/config/session-guard.json` → `<cwd>/config/session-guard.json`
→ `<plugin>/config/session-guard.json`). It is the default layer; values set in the auto-generated
form still win. Reload without a restart via `POST /session-guard/rpc {"action":"reloadConfig"}`.
See "Configurable peak policy" in [README.en.md](./README.en.md).

Check the status badge in the session UI — it shows the current phase (`高峰·拦官方` / `高峰·全部暂停`
/ `谷时` / `周末`). Next to it (order 20, left of input-traffic's freeze button) is the **free-run**
button: its label is fixed to `畅跑` (or `畅跑 ×N` with more than one task) and clicking it **always
opens the free-run task-management panel**, where you create, pause/resume or delete per-session,
time-boxed exemptions from peak pausing (pausing is per task, not per session — see "Free-run" in
[README.en.md](./README.en.md)).

Check the official-source verdict for one route (host route, no restart needed):

```bash
curl -s 'http://127.0.0.1:3080/session-guard/provider?provider=deepseek-official'
# {"ok":true,"verdict":{"provider":"deepseek-official","official":true,"matchedBy":"endpoint","endpoint":"https://api.deepseek.com"}}
```

Run the test suite (no network, no credentials):

```bash
npm test
```

## 3. Upgrade

```bash
dsh plugin --profile web remove dsh-session-guard
dsh plugin --profile web add dsh-session-guard@dsh-0.1.7
```

Restart dsh web and refresh the page. Settings live in the apply composition entry (edited through
the auto-generated form) and survive the upgrade; new keys (`providerGuard`, `deferredMode`, …)
fall back to their defaults until you touch them. The peak/weekend policy is read from
`config/session-guard.json`, so it survives too.

From **plugin** `0.1.3` / `0.1.4-beta.1` to **plugin** `0.1.5-beta.1` the only behavior change is that peak hours now
block **only** official-source targets by default. To restore the old blanket behavior set
`providerGuard: false` (or `officialProviders` / `officialBaseURLs` to narrow the verdict).
(Those are plugin versions, not DSH versions — do not confuse them with the host ranges above.)

### Upgrading from a version with the pause button

The old composer "pause session / resume session" button has been **removed**; the **free-run**
button (slot `session-guard-free-run`, order 20) takes that position. The `/pause`, `/resume` and
`/cancel` commands and the `sessionGuard` port (including `stepPause` / `stepResume`) are unchanged.
Free-run windows are now edited at hour precision in the task panel (the start hour is `H:00` and
the end hour is `H:59`, so the end hour is fully included — "结束 23 时" = `23:59`); any peak-window
special-casing you had in mind is done by the config file instead.

## 4. Troubleshooting

| Symptom | Check |
|---|---|
| Sessions still run during peak | `GET /session-guard/status` → `phase` must be `peak`; `GET /session-guard/settings` → `enabled: true` |
| A local provider is blocked during peak | `GET /session-guard/provider?provider=<id>` → `matchedBy` should be `endpoint`/`unknown` with `official: false`. If it says `explicit`, remove the id from `officialProviders` |
| An official request is NOT blocked | `matchedBy: 'endpoint'` with `official: false` means the route's `baseURL` is not in `officialBaseURLs`; add the host there, or add the route id to `officialProviders` |
| Requests hang instead of failing | That is `hold` mode by design. Set `deferredMode: 'error'` for an explicit error, or lower `deferredMaxHoldMs` |
| Nothing resumes after peak | `deferredResume` must be on (or run `/resume`); `offPeakAutoResume` controls session-level resume |
| Verdict diagnostics unavailable | `GET /session-guard/diag` → `providerGuard`, `configurableProviders`, `held`, `deferred` |

## 5. Uninstall

```bash
dsh plugin --profile web remove dsh-session-guard
```

Restart dsh web. Held requests are released (rejected) on unload — no promise leaks.
