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
dsh plugin --profile web add dsh-session-guard@dsh-0.1.5

# or straight from the git branch
dsh plugin --profile web add github:drscrewdriver/dsh-session-guard#compat/0.1.5
```

`compat/0.1.5` is the DSH `0.1.5-rc.x` line: npm package version **`3.0.0`**, dist-tag
**`dsh-0.1.5`**, with `engines.dsh = >=0.1.5-rc.2 <0.2.0-0` in **both** `package.json` and
`dsh.plugin.json`.

DSH `0.1.2-rc.x` hosts should use the **`legacy/0.1.2`** branch (npm dist-tag `dsh-0.1.2`,
version `0.3.1`). **`main` is frozen at `0.2.0-beta.1` and is no longer the 0.1.2 line's
release branch.**

> ⚠️ Do not rely on the bare package name `dsh-session-guard`: npm's `latest` tag cannot
> serve two mutually exclusive version lines (their `engines.dsh` ranges are exclusive under
> semver prerelease matching) — always pin the dist-tag explicitly.

Restart dsh web and refresh the page.

## 2. Verify

Open **Settings → Plugins → session-guard**. Toggles: `enabled`, `providerGuard`, `guardSubagents`,
`offPeakAutoResume`, `weekendMode`, `deferredResume`, `queueFallback`, `retryEnabled`; text/list
fields: `officialProviders`, `officialBaseURLs`, `deferredResumeText`.

Check the status badge in the session UI — it shows the current phase (`高峰·拦官方` / `高峰·全部暂停`
/ `谷时` / `周末`).

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
dsh plugin --profile web add dsh-session-guard@dsh-0.1.5
```

Restart dsh web and refresh the page. Settings live in `$DSH_HOME/settings.yaml` under the
`session-guard` namespace and survive the upgrade; new keys (`providerGuard`, `deferredMode`, …)
fall back to their defaults until you touch them.

From **plugin** `0.1.3` / `0.1.4-beta.1` to **plugin** `0.1.5-beta.1` the only behavior change is that peak hours now
block **only** official-source targets by default. To restore the old blanket behavior set
`providerGuard: false` (or `officialProviders` / `officialBaseURLs` to narrow the verdict).
(Those are plugin versions, not DSH versions — do not confuse them with the host ranges above.)

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
