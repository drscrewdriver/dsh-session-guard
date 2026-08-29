# インストールガイド（公式 DSH CLI）

- [日本語インストールガイド](./INSTALL.ja.md)
- [English installation guide](./INSTALL.md)
- [中文安装指南](./INSTALL.zh.md)
- [한국어 설치 안내](./INSTALL.ko.md)
- [日本語 README](./README.ja.md)
- [English README](./README.en.md)
- [中文 README](./README.md)
- [한국어 README](./README.ko.md)
- [Changelog](./CHANGELOG.md)
- [日本語 changelog](./CHANGELOG.ja.md)
- [한국어 changelog](./CHANGELOG.ko.md)

## 0. 前提条件

```bash
echo "DSH_HOME=${DSH_HOME:-$HOME/.dsh}"
dsh --version
```

## 1. インストール

```bash
dsh plugin --profile web add github:drscrewdriver/dsh-session-guard
```

dsh web を再起動し、ページをリフレッシュ。

## 2. 検証

「設定 → プラグイン → session-guard」を開く。スイッチ：`enabled`、`offPeakAutoResume`、`weekendMode`、`queueFallback`、`retryEnabled`。

セッション UI のステータスバッジを確認——現在のフェーズ（NORMAL / PAUSED_PEAK）を表示。

## 3. アンインストール

```bash
dsh plugin --profile web remove dsh-session-guard
```

dsh web を再起動。
