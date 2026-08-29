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
dsh plugin --profile web add github:drscrewdriver/dsh-session-guard
```

Restart dsh web and refresh the page.

## 2. Verify

Open **Settings → Plugins → session-guard**. Toggles: `enabled`, `offPeakAutoResume`, `weekendMode`, `queueFallback`, `retryEnabled`.

Check status badge in the session UI — it shows the current phase (NORMAL / PAUSED_PEAK).

## 3. Uninstall

```bash
dsh plugin --profile web remove dsh-session-guard
```

Restart dsh web.
